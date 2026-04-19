---
name: sc4sap:compare-programs
description: Business-angle comparison of 2–5 ABAP programs that share the same business scenario but diverge by module (MM vs CO), country (KR vs EU), persona (controller vs warehouse), or time horizon. Reader = functional consultant.
level: 2
---

# SC4SAP Compare Programs

Reads 2–5 ABAP programs that implement the **same business scenario** but in **different variants**, analyzes them across 10 business dimensions, and emits a side-by-side Markdown comparison targeted at **functional consultants** (not developers).

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
- More than 5 programs — break into multiple comparison sessions or escalate to `/sc4sap:team`
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:compare-programs` to pre-grant MCP tool + file-op permissions (eliminates per-tool prompts during parallel program reads).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.
- All `Agent` dispatches within this skill MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Companion_Files>
**MANDATORY**: Read the companion files below before executing. Each covers a self-contained section:

| Companion | Scope |
|-----------|-------|
| [`comparison-scope.md`](comparison-scope.md) | 10 business comparison dimensions + default scope + scope-selection prompt template |
| [`workflow.md`](workflow.md) | 6-step execution flow (Input → Scope → Read → Analyze → Render → Follow-up) |
| [`report-template.md`](report-template.md) | Markdown report skeleton (Executive Summary → Matrix → Per-program detail → Recommendation) |
</Companion_Files>

<Agent_Composition>
- **Main**: `sap-analyst` — owns the business narrative, writes the Executive Summary and Recommendation sections, reader = consultant.
- **Module specialists (conditional)**: if programs clearly belong to a single module or pair (MM, CO, SD, FI, …), delegate dimension-specific passes to the matching `sap-{module}-consultant` agent(s) — e.g. an MM-vs-CO comparison pulls both `sap-mm-consultant` and `sap-co-consultant`. The main `sap-analyst` synthesizes.
- **Code structure pass**: `sap-code-reviewer` is used ONLY to extract structural facts (selection-screen fields, main DB tables, authorization objects, ALV columns) — NOT to score quality. Quality review is out of scope for this skill.
- **Rendering**: `sap-writer` renders the final Markdown using `report-template.md`.

All Agent dispatches pass `mode: "dontAsk"` (trust-session already granted in Step 0).
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
`.sc4sap/comparisons/{prog1}__vs__{prog2}[__vs__{prog3}…]-{YYYYMMDD}.md`

- Program names are uppercase, underscore-safe (slashes → `_`).
- If the filename exceeds 120 chars (5-program case), use `.sc4sap/comparisons/compare-{YYYYMMDD}-{hash6}.md` and list the programs inside the front-matter.
</Output_Location>

<Execution_Summary>
1. Load dimension catalog from `comparison-scope.md`.
2. Execute the 6 steps in `workflow.md` in order.
3. Render the artifact using `report-template.md`.

Do not skip the companion-file reads — the dimension list, step order, and report schema all live there.
</Execution_Summary>

<Data_Extraction_Safety>
This skill reads **source code + DDIC metadata + where-used + screen/GUI-status/text-element metadata** only. It does NOT call `GetTableContents` or `GetSqlQuery`. If the user asks for sample row data to illustrate a difference, refuse per `common/data-extraction-policy.md` and document the request in the report's `Risk & Open Questions` section instead.
</Data_Extraction_Safety>

<Related_Skills>
- `/sc4sap:program-to-spec` — single-program reverse-engineering (vertical depth)
- `/sc4sap:analyze-code` — quality review (what's wrong, not what's different)
- `/sc4sap:analyze-cbo-obj` — CBO package inventory (complementary context for dimension 8)
- `/sc4sap:deep-interview` — use before comparison if user is unsure which programs to include
</Related_Skills>

Task: {{ARGUMENTS}}
