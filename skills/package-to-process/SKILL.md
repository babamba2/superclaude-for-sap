---
name: package-to-process
description: Reverse-engineer a CBO package into an End-to-End Business Process document plus BPML (Markdown, HTML, and/or Excel — user picks any combination). Walks the package programs/FMs, infers business-document flow (PR→PO→GR→IR style), and emits a consultant-facing narrative with Mermaid flowchart + sequenceDiagram + per-step tables. CBO inventory auto-chain via sap-stocker if missing.
model: inherit
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
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus|Sonnet|Haiku>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention. Resolve the dispatch mode first per [`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md): `auto` (default) uses the model below/in the rule; `user-defined` asks the user Opus / Sonnet / Haiku (recommended one first) before each dispatch group.
</Phase_Banner>

<Progress_Bar>
Every Step entry MUST print a one-line progress indicator in this exact form (no ANSI colors, 20-char bar, right-aligned percentage):

```
Step X/7 · <label>   [██████░░░░░░░░░░░░░░]  29%
```

- Bar width = 20 chars, filled = `█`, empty = `░`
- Percentage = `floor(step_id × 100 / 7)` at entry (Step 0 = 0%, Done = 100%)
- Authoritative mapping table: [`workflow.md`](workflow.md) § Progress Reporting

The bar is the **only** progress feedback for the user during long Steps 4–6 (multi-minute analyst dispatches), so it MUST be printed before each Step starts. Steps 2, 5 and 6 also print indented sub-progress lines (walk → scout b/b → finalize; narrative part k/n; 6b BPML build) — formats in `workflow.md` § Progress Reporting.
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
| [`paths-and-state.md`](paths-and-state.md) | `<PLUGIN_ROOT>` + multi-profile path resolution, `_state/` checkpoint files, resume, escalation + partial-failure rules |
| [`workflow.md`](workflow.md) | Steps 0–3 + Progress Reporting (bar template + step→% table + sub-progress lines) |
| [`workflow-render.md`](workflow-render.md) | Steps 4–7: grouping, narrative (parallel split > 6 processes), render + BPML, validation |
| [`grouping-heuristics.md`](grouping-heuristics.md) | Auto-grouping algorithm: shared-table clustering + module-specific document-flow dictionary (MM/SD/PP/PM/QM/FI/CO) |
| [`document-template.md`](document-template.md) | Master `.md` skeleton: frontmatter + auto-TOC + per-process section + Mermaid (flowchart + sequenceDiagram) + tables |
| [`dispatch-stocker.md`](dispatch-stocker.md) | Step 2 — `sap-stocker` auto-chain (conditional, inventory missing) |
| [`dispatch-analyst.md`](dispatch-analyst.md) | Steps 4 & 5 — `sap-analyst` grouping + per-process narrative |
| [`dispatch-writer.md`](dispatch-writer.md) | Step 6 + 6b — two parallel `sap-writer` dispatches: master `.md` render and BPML spec JSON |
| [`bpml-render.md`](bpml-render.md) | Step 6b — BPML deliverable: spec-JSON contract (authored by the 6b writer) + `build-bpml.mjs` CLI (xlsx / md / html, one run per format, main thread) + language rules |
</Companion_Files>

<Agent_Composition>
Per-step model allocation. The main thread follows the session model (`model: inherit`); each `Agent(...)` carries its own model (frontmatter or explicit override).

- **Main orchestrator (session model, `model: inherit`)** — Steps 0, 1, 2 (gate), 3, 7 + the `build-bpml.mjs` runs: trust-session, intake, inventory gate, entry-point detection, state checkpoints, validation/handoff. It relays file paths, never large JSON — the only analyst JSON it emits is the one-time write of each analyst return into `_state/`.
- **`sap-stocker` (Sonnet) + `sap-checker` × N (Haiku), conditional** — Step 2, only when the resolved `<INVENTORY_PATH>` is missing or the user asks for a refresh: stocker walk → checker scout fan-out (≥ 30 objects, ≤ 8 per message) → stocker finalize per [`../analyze-cbo-obj/stocker-fanout.md`](../analyze-cbo-obj/stocker-fanout.md). `BLOCKED` → one Opus re-dispatch.
- **`sap-analyst` (Opus, frontmatter)** — Step 4 (auto process grouping w/ rationale) + Step 5 (per-process narrative + 1-hop boundary + sequenceDiagram; > 6 processes → parallel dispatches of ≤ 3 processes). Opus is required: novel cross-program reasoning + business-flow inference, not template-fill. It has no Write tool — it returns JSON as text and the main thread persists it.
- **`sap-writer` × 2 (Sonnet via `model: "sonnet"` override), parallel** — Step 6 master `.md` render and Step 6b BPML spec JSON, both reading the `_state/` files by path. `BLOCKED` → one Opus re-dispatch.
- **Module consultant (not dispatched)** — sub-agents cannot spawn agents, so the analyst cannot call a `sap-{module}-consultant`. When Step 5 finds a strong cross-module integration (e.g., MM ↔ FI through `BAPI_ACC_DOC_POST`) it records it under `open_questions`; the handoff points the user to `/sc4sap:ask-consultant`.

SAP MCP permission prompts are auto-approved by the sc4sap permission-approver PreToolUse hook.
</Agent_Composition>

<Language_Policy>
**Output language is user-selected at Step 1** (bundled `AskUserQuestion`, see `workflow.md` Step 1): `Korean (ko)` / `English (en)` / `Japanese (ja)`. The first option = detected conversation language, labeled `(Recommended)` — so one Enter keeps today's behavior.
- **Supported: ko / en / ja only.** The document template labels and the BPML builder dictionaries exist for these three. A different language typed via Other → reply that only ko / en / ja are supported and re-ask once; never pass another code downstream.
- The selection applies to the process document AND the BPML (labels + row content), in every output format.
- BPML sheet naming: sheet 1 (overview) is localized by the builder; **sheet 2 is always English `BPML`** — never localized.
</Language_Policy>

<Output_Location>
Uses multi-profile artifact resolution per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md): `<PROC_DIR>` = `<ARTIFACT_BASE>/processes/<MODULE>/<PACKAGE>` where `<ARTIFACT_BASE>` is `.sc4sap/work/<alias>` (multi-profile) or `.sc4sap` (legacy) — resolution in [`paths-and-state.md`](paths-and-state.md). Output formats are a Step 1 multi-select (`formats` ⊆ Markdown / HTML / Excel):

`<PROC_DIR>/process-<YYYYMMDD>-<lang>.md` and/or `.html` (the process document has no Excel form — an Excel-only selection keeps its `.md`)
`<PROC_DIR>/bpml-<YYYYMMDD>-<lang>.xlsx` / `.md` / `.html` (one per selected format)
`<PROC_DIR>/_state/` — checkpoint files (resume support), kept after the run

HTML = the matching `.md` converted by `<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs` (images inlined; Mermaid via CDN when opened online).

- `<MODULE>` = uppercase module key (SD, MM, FI, CO, PP, PM, QM, WM, TM, TR, HCM, BW, PS, Ariba)
- `<PACKAGE>` = uppercase package name
- `<YYYYMMDD>` = generation date
- `<lang>` = ISO 639-1 selected at Step 1 (`ko` / `en` / `ja`)
- Existing file at the same path → overwrite WITH a one-line `> Regenerated from <old-date>` note at the top (md, carried into html; xlsx overwrites silently).
</Output_Location>

<MCP_Tools_Used>
- Discovery: `GetPackage`, `GetPackageContents`, `GetPackageTree`, `GetObjectsByType`, `SearchObject`
- Entry-point detection: `SearchObject(objectType='TRAN')`, `GetTransaction`
- Object detail: `GetProgram`, `GetProgFullCode`, `GetFunctionGroup`, `GetFunctionModule`, `GetClass`, `GetInterface`, `GetInclude`
- Structural metadata: `GetIncludesList`, `GetScreensList`, `GetGuiStatusList`
- Reference graph: `GetWhereUsed` (S/4 only — on ECC it returns ADT 404 for programs and tables, so stocking skips it; see `stocker-fanout.md`)
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
1. Load companion files (`paths-and-state.md`, `workflow.md`, `workflow-render.md`, `grouping-heuristics.md`, `document-template.md`, `dispatch-stocker.md`, `dispatch-analyst.md`, `dispatch-writer.md`, `bpml-render.md`).
2. Resolve `<PLUGIN_ROOT>` and `<ARTIFACT_BASE>` once (`paths-and-state.md`), then execute Steps 0–7 (`workflow.md`, `workflow-render.md`) in order — offering resume when `_state/` checkpoints exist; print the progress bar at each Step entry per § Progress Reporting.
3. The writers render the artifacts using `document-template.md` and `bpml-render.md`; the main thread runs `build-bpml.mjs`.

Do not skip the companion-file reads — the step order, grouping dictionary, output skeleton, and dispatch prompts all live there.
</Execution_Summary>

Task: $ARGUMENTS
