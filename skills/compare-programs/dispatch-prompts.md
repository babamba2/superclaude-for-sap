# Dispatch Prompts

Full `Agent(...)` prompt bodies for the compare-programs skill. Referenced from `workflow.md` to keep that file under the 200-line cap.

## Step 3 — sap-code-reviewer (facts extraction, Sonnet 4.6 override)

Dispatched N times in parallel (one per program). Each reviewer reads ONE program and returns structured facts only — no quality scoring.

```
Extract structural facts ONLY from ABAP object <PROG> (type: <TYPE>) — no quality scoring.

Read and return:
- Source: GetProgFullCode (REPS) / ReadClass (CLAS) / ReadFunctionGroup + ReadFunctionModule (FUGR) / ReadView + GetMetadataExtension (CDS)
- Structure: GetAbapAST (selection-screen fields, SELECT targets, AUTHORITY-CHECK calls)
- Object info: GetObjectInfo (package, author, transport history)
- UI surface (if applicable): GetScreensList + per-screen GetScreen, GetGuiStatusList, GetTextElement
- Enhancements (only if dim 8 active): GetEnhancements, GetEnhancementImpl, GetEnhancementSpot
- Where-used (only if caller-frequency in scope): GetWhereUsed

Output format (structured JSON, minimal):
- selection_fields: [{name, type, label}]
- db_tables: [{name, ops: [SELECT|MODIFY|INSERT|DELETE]}]
- authority_checks: [{object, fields}]
- alv_columns: [{position, fieldname, title}]
- computation_narrative: 1 paragraph (what the program computes at a high level)
- package: <name>
- transport_history: [{trkorr, desc, released_at}]
- screens: [{number, title, fields_count}]
- gui_statuses: [{code, functions_count}]
- text_elements: {symbols_count, messages_count}
- enhancements_found: [{name, type, status}]   // only if dim 8
- callers: {count, top_10: [...]}               // only if caller-frequency in scope

Rules:
- Do NOT call GetTableContents or GetSqlQuery under any circumstance.
- No quality scoring, no "this is bad" commentary — pure facts.
- No cross-program comparison — each reviewer handles ONE program.
```

## Step 4 — sap-analyst (consolidated analysis + narrative)

One dispatch. Consumes facts from every reviewer + active dimensions and returns classification + scoring + summary + recommendation in a single continuous response.

```
Compare <N> programs across dimensions <active_dimensions>.

Facts (one block per program):
<JSON dump of program_facts>

Perform in this order, produce all outputs in ONE response:

A. Module classification — for each program, decide primary module based on package prefix,
   table families touched, and TITLE wording. Output: [{prog, module}].

B. Dimension scoring — per active dimension × per program, mark ✅ / 🔷 / ⚠️ / ❓ per the rubric
   in skills/compare-programs/comparison-scope.md. Output: matrix (JSON).

C. Executive Summary — 3 sentences. Headline = the single biggest divergence among the programs.
   Write in the user's current conversation language.

D. Recommendation — "when to use which" matrix (one row per program, one column per likely use-case).

E. If programs span 2+ distinct modules (from step A), list the module set so the skill can fan
   out to module-specialist consultants in Step 4b. Output: module_set: [MM, CO, ...].

All narrative text in the user's current conversation language.
```

## Step 4b — sap-{module}-consultant (conditional, per distinct module)

Dispatched only when the analyst's `module_set` has ≥ 2 modules. Parallel across modules.

```
From a <MODULE> consultant's view, briefly explain (2–3 sentences each) which of these
programs a <MODULE> user would reach for — and why. Facts:
<subset of program_facts relevant to this module>

Answer in the user's current conversation language.
```

## Step 5 — sap-writer (render, Haiku 4.5)

One dispatch. Pure formatting from structured state — no MCP reads.

```
Render the comparison report using skills/compare-programs/report-template.md as the skeleton.
Do NOT re-read any MCP objects — work only from the inputs below.

Inputs:
- compared_objects: <list>
- active_dimensions: <list>
- program_facts: <N facts blobs>
- analyst_outputs: { module_classification, dimension_matrix, exec_summary, recommendation }
- module_consultant_outputs (optional): <per-module blobs>
- user_language: <lang>

Write the Markdown file to .sc4sap/comparisons/<filename>.md (path rule in SKILL.md
<Output_Location>). Return a short confirmation block with file path + dimension counts
+ headline divergence.
```
