---
name: module-to-process
description: Map how one SAP module (or a process area of several modules) runs in the connected system — one HTML page for a module consultant starting a project (conversion, enhancement, AMS takeover). Walks every CBO package of the module, lays the CBO programs onto the standard process backbone (L1 mega process > L2 process chain > L3 process > L4 task, with variants), and writes a BPH table plus one task sheet per L4 (owner, system, business rules with source lines, steps, related standard / CBO / enhancement objects with usage, interfaces, conversion notes). Replaces package-to-process.
model: inherit
---

# SC4SAP Module → Process Map

Reads the CBO packages of one module via MCP, places every Z entry point on the module's **standard process backbone**, and writes **one HTML page** a module consultant reads on day one of a project: which processes run, who runs each task, in which system, through which standard TCodes and which CBO programs, which variants exist, and what a conversion touches.

<Purpose>
At the start of a conversion or enhancement project the consultant inherits dozens of Z programs spread over several packages and no current process documentation. Package-by-package analysis (`analyze-cbo-obj`) lists objects; it does not say which business task each one serves. This skill answers per module: *"Here is the BPH of this module as the system implements it — standard where the standard is used, CBO where the customer built it — with a task sheet per L4."*
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>
<Target_Object>Packages and TCodes are looked up on the active profile's system only. Not found → stop and ask per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Target object not on the active system — never substitute a similar name, never switch profiles on your own.</Target_Object>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus|Sonnet|Haiku>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention. Resolve the dispatch mode first per [`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md) and the cost mode per [`../../common/cost-mode.md`](../../common/cost-mode.md) (`eco` → pass BOTH `model` and `effort` on every `Agent(...)` call, `Skill("sc4sap:eco", "--attach")` first and on every continuation turn).
</Phase_Banner>

<Progress_Bar>
Every Step entry prints one line: `Step X/9 · <label>   [<20-char bar>]  NN%` — filled cells = `floor(X × 20 / 9)`, `NN` = `floor(X × 100 / 9)`, `█` / `░`, no colors. Table and sub-progress lines: [`workflow.md`](workflow.md) § Progress Reporting. A skipped or resumed Step still prints its line with `(skipped — <reason>)` / `(resumed — <file>)`.
</Progress_Bar>

<Use_When>
- "module to process", "모듈 프로세스", "프로세스 맵", "BPH 만들어줘", "모듈 업무 흐름 파악", "conversion 전에 프로세스 정리", "process map of SD", "業務プロセスマップ"
- Project start (conversion, enhancement, AMS takeover): the consultant needs the module's processes as this system runs them
- Fit/Gap preparation: standard vs CBO per task, used vs unused
- The user names a module and one or more packages / Z TCodes
</Use_When>

<Do_Not_Use_When>
- Reusable-object catalog of one package → `/sc4sap:analyze-cbo-obj`
- One program in depth → `/sc4sap:program-to-spec` · end-user steps → `/sc4sap:program-to-manual`
- Configuration (IMG) of a module → `/sc4sap:config-to-document`
- Code quality → `/sc4sap:analyze-code`
- No Z package and no Z TCode at all (nothing to place; the standard backbone alone is SAP documentation)
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — Step 0, before any MCP call or user interaction.** Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:module-to-process`. Skip silently if `.sc4sap/session-trust.log` has a line within the last 24h. Full spec: [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Decisions_Fixed>
Settled at design time (2026-10-27) — do not ask the user again:

| Topic | Decision |
|---|---|
| Scope | One module, or one process area of several modules (e.g. SD + MM + LE); one or more CBO packages, plus loose Z TCodes |
| Usage source | Measured usage is saved under `<SCOPE_DIR>` and can be reused as a submitted file (no live productive-system access needed on later runs) |
| Usage-first | **Only TCodes users actually run** (ST03N of the productive system via `SAP_USAGE_RFCDEST`, or a submitted export) are analysed; unused ones are counted per package, never fetched. Batch programs join only from a job list |
| Hierarchy | BPH form: L1 mega process > L2 process chain > L3 process > L4 task; variants under L4 (org unit / document type / scenario) |
| Backbone | Standard SAP tree from `configs/<MODULE>/process-backbone.json`; CBO objects attach to L4 tasks; CBO-only tasks are added where no standard task fits |
| Output | ONE self-contained HTML page (no PPT, no xlsx export) with a built-in edit mode (texts, BPH rows, list items, undo, autosave, Save embeds the model; `build-process-doc.mjs --import` reads it back) |
| Pictures | Per L3 a scenario swimlane (lanes = owners, fill = system, border = type, double border = interface) + variant matrix; per L4 a step swimlane next to the decision flow |
| Existing BPH | Optional: a customer BPH / BPML workbook is read (`bph-import.mjs`) for wording and reconciled with the result (proposed matches, BPH-only, document-only) |
| Per L4 | Task sheet in PDD form: header (owner, system, type, output, timing), definition, variants, business rules with source lines, steps, related objects with usage, interfaces, related tasks, conversion notes, to-be-confirmed items |
| Owners | Organisations / roles as lanes; user-supplied when given, else estimated and marked `(estimated)` |
| Reference material | Customer decks or BPH workbooks the user shows are structure references only — none of their names, numbers or labels go into any artifact of the plugin |
| Location | `<ARTIFACT_BASE>/processes/<MODULE>/<MODULE>-process-v<ver>-<lang>.html` + `_src/` + history (paths in [`paths-and-state.md`](paths-and-state.md)) |
</Decisions_Fixed>

<Companion_Files>
**MANDATORY**: read before executing.

| Companion | Scope |
|---|---|
| [`paths-and-state.md`](paths-and-state.md) | Path variables, `_state/` checkpoints, resume, escalation |
| [`workflow.md`](workflow.md) | Progress table + Steps 0–4 (trust, intake, inventory per package, merge + attach, hierarchy) |
| [`workflow-build.md`](workflow-build.md) | Steps 5–9 (task sheets, consultant review, model, build, validation + handoff) |
| [`dispatch-analyst.md`](dispatch-analyst.md) | Step 4 hierarchy + Step 5 task-sheet prompts (`sap-analyst`) |
| [`dispatch-review.md`](dispatch-review.md) | Step 6 optional consultant review prompt + Step 7 assemble command |
| [`model-schema.md`](model-schema.md) | `process-model.json` shape, values, checks |
</Companion_Files>

<Agent_Composition>
The main thread follows the session model; every `subagent_type` uses the plugin prefix `sc4sap:`.

- **Main thread** — Steps 0–3, 8, 9: intake, usage calls (`GetTcodeUsage`, `GetTransaction`), gates, `usage-scope.mjs` / `backbone.mjs` / `build-process-doc.mjs` runs, state checkpoints, user approvals.
- **`sap-checker` × N (Haiku)** — Step 2: sources of the used programs only (graph-usage G1 / G3), 10 per checker; then `usage-scope.mjs` + `build-package-graph.mjs` on the main thread.
- **`sap-analyst` (Opus)** — Step 4 hierarchy (backbone + attach proposals → L1–L4 rows, variants, lanes) and Step 5 task sheets (parallel parts of ≤ 8 tasks). Returns JSON as text; the main thread writes it once.
- **`sap-<module>-consultant` (frontmatter model)** — Step 6, **optional** (the user chooses), one per module in scope, in parallel: wording, owners, std-task sheets, conversion notes, glossary, open questions. Writes its own patch file.
- **No writer agent** — Step 7 assembles `process-model.json` with `scripts/process/assemble-model.mjs` (deterministic).
</Agent_Composition>

<Language_Policy>
Output language chosen at Step 1: `ko` / `en` / `ja` only (page labels and backbone labels exist for these three). SAP identifiers stay literal. One language per page; an English companion page is built as well (Step 8b, `companion.mjs` + parallel Sonnet translators) unless the language is English or the user opts out.
</Language_Policy>

<MCP_Tools_Used>
- Discovery: `SearchObject` (DEVC, TRAN), `GetPackage`, `GetPackageContents`, `GetObjectInfo`, `GetTransaction`
- Usage scope: `GetTcodeUsage` (with `destination` = `SAP_USAGE_RFCDEST`), `GetJobUsage` (connected system only), `GetTransaction` (≤ 100 per call)
- Through graph-usage G1 / G3: `GetProgFullCode` (sources to files), `GetTable` / `GetStructure` / `GetDataElement` (DDIC)
- Step 5 on demand: `GetProgram`, `GetInclude`, `GetFunctionModule`, `GetClass`, `GetAbapSemanticAnalysis`
- **NEVER**: `GetTableContents`, `GetSqlQuery`
</MCP_Tools_Used>

<Data_Extraction_Safety>
Source, DDIC metadata, TCode metadata and usage statistics only. No row data — if the user asks for sample rows to illustrate a flow, refuse per [`../../common/data-extraction-policy.md`](../../common/data-extraction-policy.md) and record the request under open questions.
</Data_Extraction_Safety>

<Related_Skills>
- `/sc4sap:analyze-cbo-obj` — inventory + `graph.json` per package (reused or produced in Step 2)
- `/sc4sap:program-to-spec` / `/sc4sap:program-to-manual` — drill into one program of a task
- `/sc4sap:config-to-document` — the module's configuration behind the business rules
- `/sc4sap:ask-consultant` — follow-ups from the open questions
- `/sc4sap:package-to-process` — previous single-package skill; redirects here for one release
</Related_Skills>

Task: $ARGUMENTS
