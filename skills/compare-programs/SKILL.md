---
name: compare-programs
description: Business-angle comparison of 2–5 ABAP programs that share the same business scenario but diverge by module (MM vs CO), country (KR vs EU), persona (controller vs warehouse), or time horizon — one editable, versioned HTML report (verdict matrix, field differences, screens side by side, decision guide) plus an English companion. Reader = functional consultant.
model: inherit
---

# SC4SAP Compare Programs

Reads 2–5 ABAP programs that implement the **same business scenario** but in **different variants**, analyzes them across 10 business dimensions, and emits **one editable HTML report** targeted at **functional consultants** (not developers): a coloured verdict matrix with a *Differences only* switch, field-by-field differences of the selection screens and output lists, the screens drawn side by side, and a decision guide — versioned and editable like the `program-to-spec` and `program-to-manual` pages, with an English companion.

<Purpose>
Companies often split one logical business flow (e.g. GR list) into 2–3 programs so the same data answers different questions — MM sees quantity, CO sees value; KR sees e-tax-invoice fields, EU sees VAT codes; month-end controllers see aggregates, warehouse clerks see live transactions.

This skill crystallizes **why each variant exists** so a consultant can:
- pick the right program for a new requirement instead of creating a 4th,
- map fit/gap across localizations,
- brief a handover or knowledge transfer without reading ABAP.
</Purpose>


<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus|Sonnet|Haiku>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention. Resolve the dispatch mode first per [`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md): `auto` (default) uses the model below/in the rule; `user-defined` asks the user Opus / Sonnet / Haiku (recommended one first) before each dispatch group.
</Phase_Banner>

<Team_Mode>
Step 4b is the integration point for Type A teamMode (Cross-Module Consultant Panel). When `module_set ≥ 2` (existing Step 4b gate), Round 1 runs always — positions are parsed for **ownership conflicts** (same program claimed PRIMARY by 2+ modules). On conflict, escalate to Rounds 2-3 per [`team-mode.md`](team-mode.md). No conflict → positions pass directly to Step 5 writer render (legacy path). Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md).
</Team_Mode>

<Use_When>
- User says "compare programs", "what's the difference between A and B", "MM vs CO version", "country-specific programs", or equivalent in the user's language
- Consultant handover / AMS transition — need to document "when to use which"
- Fit/Gap analysis across country rollouts — same flow, different programs
- Rationalization / decommissioning — considering whether to merge duplicates
</Use_When>

<Do_Not_Use_When>
- Only **one** program → use `/sc4sap:program-to-spec` instead
- User wants **code quality** review (not business intent) → `/sc4sap:analyze-code`
- User wants to **build a new** program → `/sc4sap:create-program`
- More than 5 programs — break into multiple comparison sessions
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:compare-programs` to pre-grant MCP tool + file-op permissions (eliminates per-tool prompts during parallel program reads).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Companion_Files>
**MANDATORY**: Read the companion files below before executing. Each covers a self-contained section:

| Companion | Scope |
|-----------|-------|
| [`comparison-scope.md`](comparison-scope.md) | 10 business comparison dimensions + default scope + scope-selection prompt template |
| [`workflow.md`](workflow.md) | 6-step execution flow (Input → Scope → Facts × N → Analyze → Render → Follow-up) |
| [`dispatch-prompts.md`](dispatch-prompts.md) | Full `Agent(...)` prompt bodies for Steps 3, 4, 4b, 5, 5.3 (kept out of workflow.md to honor the 200-line cap) |
| [`render-steps.md`](render-steps.md) | Names and versions, screen drawing, the editable HTML build, review loop, English companion, import of an edited page |
| [`report-template.md`](report-template.md) | Report skeleton (fact card → Summary → Decision guide → Matrix → Field differences → Screens → Per-program → Risks → Appendix) + comparison markup |
</Companion_Files>

<Agent_Composition>
Per-step model allocation. The main thread follows the session model (`model: inherit`); each `Agent(...)` carries its own model (frontmatter or explicit override).

- **Main orchestrator (session model)** — Steps 1, 2, 6: intake, scope confirmation, follow-up menu. Holds NO source code / AST / screens in its own context; all MCP-heavy work runs inside agents.
- **Facts extraction (`sap-checker` × N, Haiku)** — Step 3. Each checker reads ONE program (or one include batch of a large program) itself — source / screens / GUI status / text elements / where-used — and returns verbatim `FACT` lines only: no scoring, no narrative. Read-and-copy work belongs on Haiku per `common/model-routing-rule.md` § Tier 3; the Opus analyst does every interpretation.
- **Analysis + narrative (`sap-analyst` × 1, Opus)** — Step 4: a SINGLE dispatch covering module classification + dimension scoring + executive summary + recommendation. Keeps the analyst's context continuous across reasoning layers instead of fragmenting into 4 chained calls.
- **Module specialists (conditional, `sap-{module}-consultant` × K, Opus)** — Step 4b: when programs span 2+ modules (MM+CO, SD+FI, etc.), each distinct module gets a consultant dispatch to explain "what would a {module} user use this for". The analyst's scoring consumes these in its narrative.
- **Rendering (`sap-writer` × 1, `model: "sonnet"` override)** — Step 5: writes the per-program screen specs (selection / ALV), renders them, and writes the report `.md` from `report-template.md`. Sonnet because the screen specs must be transcribed 1:1 and the decision guide is consultant prose.
- **English companion (`sap-writer` × 1, Sonnet override)** — Step 5.3, when the report language is not English (default on; the user can opt out).
- **Main thread** builds the HTML page with `scripts/spec/md-to-html.mjs --editable` (Step 5.1), the optional Excel copy with `scripts/spec/md-to-xlsx.mjs` (Step 5.1b), and runs the review loop.

SAP MCP permission prompts are auto-approved by the sc4sap permission-approver PreToolUse hook.
</Agent_Composition>

<Language_Policy>
**Report language mirrors the user's current conversation language.**
- User writes in Korean → report in Korean (section headers + body).
- User writes in English → report in English.
- User writes in Japanese → report in Japanese.
- If mixed or unclear, default to the user's last full sentence language.
- Do not ask — detect and proceed. Only ask if the user explicitly requests a specific language.
</Language_Policy>

<Output_Location>
`<base>/comparisons/<NAME>-v<ver>-<lang>.html` (the page), `.xlsx` when `excel` was chosen, and `.md` (its source — kept for rebuilds and imports), `<NAME>-<lang>.history.json`, screen pictures under `_assets/<NAME>-<lang>/<PROG>/`, plus the same with `-en` for the English companion. `<base>` per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md).

- `<NAME>` = the program names joined by `__vs__` (uppercase, `/` → `_`); over 120 characters → `compare-<hash6>` (rule in [`render-steps.md`](render-steps.md) § Names).
- Versions `1.0`, `1.1`, … as in `program-to-spec`: a re-run of the same programs is the next minor version; a page edit by a reader comes back as its own version.
</Output_Location>

<Execution_Summary>
1. Load dimension catalog from `comparison-scope.md`.
2. Execute the 6 steps in `workflow.md` in order.
3. Render the artifact using `report-template.md`.

Do not skip the companion-file reads — the dimension list, step order, and report schema all live there.
</Execution_Summary>

<Data_Extraction_Safety>
This skill reads **source code + DDIC metadata + where-used + screen/GUI-status/text-element metadata** only. It does NOT call `GetTableContents`; its one `GetSqlQuery` is the T100 lookup of the message texts the programs use (workflow Step 3b: fields `SPRSL, ARBGB, MSGNR, TEXT`, only the classes and numbers in the facts, logon language + `E`). Sample rows in the drawn screens are invented — never business data, never real customer, vendor or company names. If the user asks for sample row data to illustrate a difference, refuse per `common/data-extraction-policy.md` and document the request in the report's `Risk & Open Questions` section instead.
</Data_Extraction_Safety>

<Related_Skills>
- `/sc4sap:program-to-spec` — single-program reverse-engineering (vertical depth)
- `/sc4sap:analyze-code` — quality review (what's wrong, not what's different)
- `/sc4sap:analyze-cbo-obj` — CBO package inventory (complementary context for dimension 8)
</Related_Skills>

Task: $ARGUMENTS
