---
name: sc4sap:package-to-process
description: Reverse-engineer a CBO package into an End-to-End Business Process document (Markdown). Walks the package programs/FMs, infers business-document flow (PR→PO→GR→IR style), and emits a consultant-facing narrative with Mermaid flowchart + sequenceDiagram + per-step tables. CBO inventory auto-chain via sap-stocker if missing.
level: 2
model: sonnet
---

# SC4SAP Package → End-to-End Business Process

Reads ONE CBO package via MCP, classifies its programs/FMs into **business document flows** (`PR → PO → GR → IR`, `SO → DN → Billing`, etc.), and renders a Markdown narrative for **functional consultants**. Unlike `analyze-cbo-obj` (static inventory of reusable elements) or `program-to-spec` (single-object spec), this skill produces a **process-level story** spanning multiple programs with Mermaid diagrams + per-step tables.

<Purpose>
After a project accumulates dozens of CBO programs, no single document explains how they cooperate to implement the end-to-end business flow. AMS engineers, consultants taking over a module, and Fit/Gap reviewers all need a process-level map: *"Which programs form the PR→PO→GR→IR backbone? Which one fires which? Where does it cross into FI/CO?"* This skill answers that — once per package — and writes a reviewable Markdown artifact.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus 4.7|Sonnet 4.6|Haiku 4.5>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention.
</Phase_Banner>

<Progress_Bar>
Every Step entry MUST print a one-line progress indicator in this exact form (no ANSI colors, 20-char bar, right-aligned percentage):

```
Step X/7 · <label>   [██████░░░░░░░░░░░░░░]  29%
```

- Bar width = 20 chars, filled = `█`, empty = `░`
- Percentage = `floor(step_id × 100 / 7)` at entry (Step 0 = 0%, Done = 100%)
- Authoritative mapping table: [`workflow.md`](workflow.md) § Progress Reporting

The bar is the **only** progress feedback for the user during long Steps 4–6 (multi-minute analyst dispatches), so it MUST be printed before each Step starts.
</Progress_Bar>

<Use_When>
- User says: "package to process", "패키지 프로세스 분석", "E2E 비즈니스 흐름 문서화", "패키지 분석해서 process flow", "reverse-engineer process from package"
- AMS / handover preparation: need a process-level map of an unfamiliar Z-package
- Fit/Gap review: need to see how the customer's CBO implements a business process before judging gaps
- Onboarding new consultants/developers onto an existing module
</Use_When>

<Do_Not_Use_When>
- User wants only the **reusable-object catalog** → `/sc4sap:analyze-cbo-obj`
- User wants a **single program** spec → `/sc4sap:program-to-spec`
- User wants to **compare 2–5 programs** side-by-side → `/sc4sap:compare-programs`
- User wants **code quality** review → `/sc4sap:analyze-code`
- Package has zero PROG/FUGR (process narrative is meaningless without entry points)
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:package-to-process` to pre-grant MCP tool + file-op permissions (eliminates per-tool prompts during package walk + where-used graph + analyst/writer dispatches).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Companion_Files>
**MANDATORY**: Read the companion files below before executing. Each covers a self-contained section:

| Companion | Scope |
|-----------|-------|
| [`workflow.md`](workflow.md) | 7-step execution flow + Progress Reporting (bar template + step→% table) |
| [`grouping-heuristics.md`](grouping-heuristics.md) | Auto-grouping algorithm: shared-table clustering + module-specific document-flow dictionary (MM/SD/PP/PM/QM/FI/CO) |
| [`document-template.md`](document-template.md) | Master `.md` skeleton: frontmatter + auto-TOC + per-process section + Mermaid (flowchart + sequenceDiagram) + tables |
| [`dispatch-stocker.md`](dispatch-stocker.md) | Step 2 — `sap-stocker` auto-chain (conditional, inventory missing) |
| [`dispatch-analyst.md`](dispatch-analyst.md) | Steps 4 & 5 — `sap-analyst` grouping + per-process narrative |
| [`dispatch-writer.md`](dispatch-writer.md) | Step 6 — `sap-writer` master `.md` render |
| [`bpml-render.md`](bpml-render.md) | Step 6b — BPML deliverable: spec-JSON contract + `build-bpml.mjs` CLI (xlsx/md/both) + language rules |
</Companion_Files>

<Agent_Composition>
Per-step model allocation. Skill frontmatter pins the main thread to Sonnet; each `Agent(...)` carries its own model (frontmatter or explicit override).

- **Main orchestrator (Sonnet 4.6)** — Steps 0, 1, 2 (gate), 3, 7: trust-session, intake, inventory gate, entry-point detection, validation/handoff. Sonnet provides enough headroom for the intake state machine and entry-point matching across PROG × TCode.
- **`sap-stocker` (Sonnet 4.6, conditional)** — Step 2 dispatch only when `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` is missing. Runs the full Investigation_Protocol per [`../../agents/sap-stocker.md`](../../agents/sap-stocker.md).
- **`sap-analyst` (Opus 4.7, frontmatter)** — Step 4 (auto process grouping w/ rationale) + Step 5 (per-process narrative + 1-hop boundary + sequenceDiagram). Opus is required: novel cross-program reasoning + business-flow inference, not template-fill.
- **`sap-writer` (Sonnet 4.6 via `model: "sonnet"` override)** — Step 6 render. Master Markdown is L3-grade depth (TOC + multiple Mermaid blocks + per-process tables + cross-module gap section); Haiku is insufficient.
- **Module consultant (optional, conditional)** — if Step 5 narrative discovers a strong cross-module integration (e.g., MM ↔ FI through `BAPI_ACC_DOC_POST`), the analyst MAY annotate via `sap-{module}-consultant` (Opus 4.7) for the boundary section only. NOT a default dispatch — costs additional context only when warranted.

SAP MCP permission prompts are auto-approved by the sc4sap permission-approver PreToolUse hook.
</Agent_Composition>

<Language_Policy>
**Output language is user-selected at Step 1** (bundled `AskUserQuestion`, see `workflow.md` Step 1-6b): 한국어(ko) / English(en) / 日本語(ja) / Other. The first option = detected conversation language, labeled `(Recommended)` — so one Enter keeps today's behavior.
- The selection applies to the process `.md` AND the BPML (labels + row content).
- BPML sheet naming: sheet 1 (overview) is localized (개요/Overview/概要); **sheet 2 is always English `BPML`** — never localized.
- Languages outside ko/en/ja: builder falls back to en labels unless `meta.labels` overrides are supplied (see `bpml-render.md`).
</Language_Policy>

<Output_Location>
`.sc4sap/processes/<MODULE>/<PACKAGE>/process-<YYYYMMDD>-<lang>.md`
`.sc4sap/processes/<MODULE>/<PACKAGE>/bpml-<YYYYMMDD>-<lang>.xlsx` and/or `.md` (per Step 1 `bpml_format`)

- `<MODULE>` = uppercase module key (SD, MM, FI, CO, PP, PM, QM, WM, TM, TR, HCM, BW, PS, Ariba)
- `<PACKAGE>` = uppercase package name
- `<YYYYMMDD>` = generation date
- `<lang>` = ISO 639-1 selected at Step 1 (`ko` / `en` / `ja` / other)
- Existing file at the same path → overwrite WITH a one-line `> Regenerated from <old-date>` note at the top (md only; xlsx overwrites silently).
</Output_Location>

<MCP_Tools_Used>
- Discovery: `GetPackage`, `GetPackageContents`, `GetPackageTree`, `GetObjectsByType`, `SearchObject`
- Entry-point detection: `SearchObject(objectType='TRAN')`, `GetTransaction`
- Object detail: `GetProgram`, `GetProgFullCode`, `GetFunctionGroup`, `GetFunctionModule`, `GetClass`, `GetInterface`, `GetInclude`
- Structural metadata: `GetIncludesList`, `GetScreensList`, `GetGuiStatusList`
- Reference graph: `GetWhereUsed`
- DDIC (read-only): `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `GetView`
- Semantic / AST: `GetAbapSemanticAnalysis`, `GetAbapAST` (Step 5 only, on demand)
- Object info: `GetObjectInfo`, `GetObjectStructure`
- **NEVER used by this skill**: `GetTableContents`, `GetSqlQuery` (no row data — DDIC + source + relations only)
</MCP_Tools_Used>

<Data_Extraction_Safety>
This skill reads **source code + DDIC metadata + where-used + transaction metadata** only. It MUST NOT call `GetTableContents` or `GetSqlQuery`. If the user asks for sample row data to illustrate a flow, refuse per [`../../common/data-extraction-policy.md`](../../common/data-extraction-policy.md) and document the request in the report's `Open Questions` section instead.
</Data_Extraction_Safety>

<Related_Skills>
- `/sc4sap:analyze-cbo-obj` — produces the `inventory.json` this skill consumes (auto-chained in Step 2 if missing)
- `/sc4sap:program-to-spec` — drill into ONE program inside the process (vertical depth)
- `/sc4sap:compare-programs` — when 2+ programs in the same process look similar, compare side-by-side
- `/sc4sap:ask-consultant` — open follow-ups documented in the `Open Questions` section
</Related_Skills>

<Execution_Summary>
1. Load companion files (`workflow.md`, `grouping-heuristics.md`, `document-template.md`, `dispatch-stocker.md`, `dispatch-analyst.md`, `dispatch-writer.md`).
2. Execute the 7 steps in `workflow.md` in order; print the progress bar at each Step entry per § Progress Reporting.
3. Render the artifact using `document-template.md`.

Do not skip the companion-file reads — the step order, grouping dictionary, output skeleton, and dispatch prompts all live there.
</Execution_Summary>

Task: {{ARGUMENTS}}
