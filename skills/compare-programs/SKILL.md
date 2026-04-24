---
name: sc4sap:compare-programs
description: Business-angle comparison of 2–5 ABAP programs that share the same business scenario but diverge by module (MM vs CO), country (KR vs EU), persona (controller vs warehouse), or time horizon. Reader = functional consultant.
level: 2
model: sonnet
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

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus 4.7|Sonnet 4.6|Haiku 4.5>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention.
</Phase_Banner>

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
| [`workflow.md`](workflow.md) | 6-step execution flow (Input → Scope → Facts × N → Analyze → Render → Follow-up) |
| [`dispatch-prompts.md`](dispatch-prompts.md) | Full `Agent(...)` prompt bodies for Steps 3, 4, 4b, 5 (kept out of workflow.md to honor the 200-line cap) |
| [`report-template.md`](report-template.md) | Markdown report skeleton (Executive Summary → Matrix → Per-program detail → Recommendation) |
</Companion_Files>

<Agent_Composition>
Per-step model allocation. Skill frontmatter pins the main thread to Haiku; each `Agent(...)` carries its own model (frontmatter or explicit override).

- **Main orchestrator (Haiku 4.5)** — Steps 1, 2, 6: intake, scope confirmation, follow-up menu. Holds NO source code / AST / screens in its own context; all MCP-heavy work runs inside agents.
- **Facts extraction (`sap-code-reviewer` × N, Sonnet 4.6 via `model: "sonnet"` override)** — Step 3 (absorbs the old "Read Phase"). Each reviewer reads ONE program itself (`GetProgFullCode` / `GetAbapAST` / screens / GUI status / text elements / where-used) and returns structural facts only — no quality scoring. Sonnet is sufficient because this pass is rule-based extraction, not novel code generation; matches the base tier of `common/model-routing-rule.md` § Tier 1.
- **Analysis + narrative (`sap-analyst` × 1, Opus 4.7)** — Step 4: a SINGLE dispatch covering module classification + dimension scoring + executive summary + recommendation. Keeps the analyst's context continuous across reasoning layers instead of fragmenting into 4 chained calls.
- **Module specialists (conditional, `sap-{module}-consultant` × K, Opus 4.7)** — Step 4b: when programs span 2+ modules (MM+CO, SD+FI, etc.), each distinct module gets a consultant dispatch to explain "what would a {module} user use this for". The analyst's scoring consumes these in its narrative.
- **Rendering (`sap-writer` × 1, Haiku 4.5)** — Step 5: renders the final Markdown using `report-template.md`. Pure formatting from structured state.

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
