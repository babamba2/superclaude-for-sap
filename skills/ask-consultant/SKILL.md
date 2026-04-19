---
name: sc4sap:ask-consultant
description: Direct operational Q&A with a SAP module consultant agent. Auto-routes the question to the matching sap-{module}-consultant and answers against the configured SAP environment (version, industry, country, active modules).
level: 2
---

# SC4SAP Ask Consultant

Single entrypoint for asking a SAP module consultant agent an operational question. The skill auto-selects the right consultant(s) from the question text + project config, honors the configured SAP environment, and returns a faithful answer — no code generation, no object creation, just the consultant's judgment.

<Purpose>
`/sc4sap:ask-consultant` is the "ask a human consultant" button inside Claude. Users hit it when they need SPRO guidance, business-process advice, configuration walkthroughs, integration touchpoints, localization rules, or BAdI / CMOD / append decisions — the kind of question normally answered by an SD / MM / FI / CO / PP / PS / PM / QM / TR / HCM / WM / TM / BW / Ariba / Basis consultant. The skill does NOT write code or change the SAP system; it reads config + consults the agent + returns the answer.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Use_When>
- User says "ask consultant", "ask {module}", "consultant", "SD 컨설턴트", "MM 컨설턴트", "물어봐", "자문", "consult", etc.
- User has an operational / configuration question that does NOT require code generation or MCP writes.
- User needs cross-module advice that fans out to 2-3 consultants.
- User wants to sanity-check a config choice before running `/sc4sap:create-program`.
</Use_When>

<Do_Not_Use_When>
- User wants to create code / objects — use `/sc4sap:create-program` or `/sc4sap:create-object`.
- User wants to analyze a runtime error — use `/sc4sap:analyze-symptom`.
- User wants to review existing code quality — use `/sc4sap:analyze-code`.
- User wants IMG customizing table data extraction — refuse per `common/data-extraction-policy.md`.
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before the consultant dispatch.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:ask-consultant` so the consultant agent's read-only MCP calls (`SearchObject`, `GetTable`, `GetPackage`, `GetWhereUsed`, etc.) proceed without prompting.

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- All downstream `Agent` dispatches MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Environment_Context>
**MANDATORY — the consultant answers against the project's configured SAP environment, not generic best-practice.** Before dispatching, load:

- `.sc4sap/config.json` → `sapVersion` (ECC / S4 On-Prem / S4 Cloud Public / S4 Cloud Private), `abapRelease`, `industry`, `country`, `activeModules`
- `.sc4sap/sap.env` → `SAP_URL`, `SAP_CLIENT`, `SAP_LANGUAGE`, `SAP_INDUSTRY`, `SAP_COUNTRY`, `SAP_ACTIVE_MODULES` (as fallback)

Pass these to the consultant via the dispatch prompt so its answer reflects the actual landscape. If any key is missing, ask the user before dispatching — do NOT let the consultant invent assumptions.

The consultant agent's Mandatory_Baseline (Tier 1 + Tier 2 per [`../../common/context-loading-protocol.md`](../../common/context-loading-protocol.md)) ensures it loads `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, and `configs/{MODULE}/*.md` at session start.
</Environment_Context>

<Module_Routing>
Map the user's question to the target module(s). Priority:

1. **Explicit mention**: "MM 물어봐" / "ask SD" / "FI 컨설턴트" → dispatch that consultant directly.
2. **Keyword inference**: map keywords to modules (PO/EKKO/EBELN → MM; invoice/BKPF/BSEG → FI; sales order/VBAK → SD; cost center/KOSTL → CO; MRP/production order/AFKO → PP; WBS/PROJ → PS; maintenance order → PM; inspection lot → QM; cash management/treasury → TR; payroll/infotype → HCM; warehouse/bin → WM; freight order → TM; InfoObject/DataSource → BW; sourcing/Ariba Network → Ariba; dump/transport/kernel → BC).
3. **Multi-module**: if 2-3 modules match with similar signal strength, dispatch all in parallel. Example: "MM PO가 FI에 어떻게 전기되는지" → dispatch MM + FI in parallel; the skill then composes the answer.
4. **Unclear**: ask the user which module first — one question, one round.

Supported consultants (15 total):

- Module: `sap-sd-consultant`, `sap-mm-consultant`, `sap-fi-consultant`, `sap-co-consultant`, `sap-pp-consultant`, `sap-ps-consultant`, `sap-pm-consultant`, `sap-qm-consultant`, `sap-tr-consultant`, `sap-hcm-consultant`, `sap-wm-consultant`, `sap-tm-consultant`, `sap-bw-consultant`, `sap-ariba-consultant`
- Basis: `sap-bc-consultant`
</Module_Routing>

<Workflow_Steps>
1. **Trust bootstrap** (§ `<Session_Trust_Bootstrap>`).
2. **Environment load** — read `config.json` + `sap.env`; surface resolved values to the user on the FIRST turn only (one line: `SAP: <version> · <industry> · <country> · active: <modules>`).
3. **Module routing** — apply § `<Module_Routing>`. If ambiguous, ask one question and stop.
4. **Dispatch** — `Agent(subagent_type="sc4sap:sap-{module}-consultant", model="opus", mode="dontAsk", prompt=<user question + environment context + expected format>)`. For multi-module, dispatch in parallel in a single message.
5. **Aggregate** — if multiple consultants replied, combine into one coherent answer; note any disagreements between modules and flag them.
6. **Return** — present the answer to the user. Offer follow-up paths: `/sc4sap:create-program` (if the answer leads to a new build), `/sc4sap:program-to-spec` (if user wants the existing asset documented), `/sc4sap:analyze-code` (if quality review needed).

**No writes**: this skill never calls `Create*` / `Update*` / `Delete*` / `Activate*` / `CreateTransport`. If the consultant's answer suggests a change, the user must run a separate creation / modification skill.

**No row extraction**: `GetTableContents` and `GetSqlQuery` are NOT used. Schema / DDIC reads are fine (`GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `SearchObject`).
</Workflow_Steps>

<Output_Format>
Return the consultant's answer verbatim, prefixed with the consultant identity and the environment context it used:

```
[Model: <main-model> · Dispatched: Opus×<n> (<consultant names>)]

🧭 Consultant: sap-<module>-consultant
🌐 Environment: <sapVersion> · <industry or "—"> · <country or "—"> · active modules: <list>

<consultant's faithful answer>

---
💡 Next steps (optional):
- /sc4sap:create-program — if this leads to a new build
- /sc4sap:program-to-spec — to document an existing asset
- /sc4sap:analyze-code — to review existing code
```

For multi-module dispatches, the `🧭 Consultant` line lists all names and the body has one subsection per consultant, followed by a `🔗 Cross-module notes` subsection synthesizing the answer.
</Output_Format>

<Related_Skills>
- `/sc4sap:deep-interview` — use before ask-consultant if the question is too vague to route.
- `/sc4sap:compare-programs` — complementary when the consultant's answer references existing variants.
- `/sc4sap:analyze-cbo-obj` — complementary when the consultant's answer depends on knowing what custom assets already exist.
</Related_Skills>

<MCP_Tools_Used>
- `SearchObject`, `GetObjectInfo` — existence checks as the consultant works
- `GetPackage`, `GetPackageContents` — CBO scope confirmation
- `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `GetView` — DDIC metadata
- `GetWhereUsed` — call-graph queries
- NEVER: `GetTableContents`, `GetSqlQuery`, any `Create*` / `Update*` / `Delete*` / `Activate*`
</MCP_Tools_Used>

Task: {{ARGUMENTS}}
