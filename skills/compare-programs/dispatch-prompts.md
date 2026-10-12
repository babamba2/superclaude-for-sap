# Dispatch Prompts

Full `Agent(...)` prompt bodies for the compare-programs skill. Referenced from `workflow.md` to keep that file under the 200-line cap.

## Step 3 — sap-checker (facts scout, Haiku)

Dispatched N times in parallel (one per program, or one per include batch after a split). Each checker reads ONE scope and returns `FACT` lines only — no scoring, no comparison, no narrative. The Opus analyst in Step 4 does all interpretation.

```
MODE: scout
Scope: <PROG> (type: <TYPE>)  [includes: <list> — only after a split]
Active dimensions: <active_dimensions>

Read: GetProgFullCode (REPS, FUGR) / GetClass (CLAS) with output: "file" — you get file paths plus an
outline (FORM / METHOD / MODULE with line ranges). Grep the files for SELECT, AUTHORITY-CHECK,
PARAMETERS, SELECT-OPTIONS, COLLECT, CALL FUNCTION, fieldcat … instead of reading every line.
After a split: GetInclude per listed include. CDS: GetView + GetMetadataExtension.
GetObjectInfo for package and transports.
UI (dims 3, 6): GetScreensList + GetScreen, GetGuiStatusList, ReadTextElementsBulk.
Enhancements (dim 8 only): GetEnhancements, GetEnhancementImpl, GetEnhancementSpot.
Callers (only when the prompt says caller frequency is in scope): GetWhereUsed.

Return one FACT line per item (obj=<PROG>, kind=PROG|CLAS|FUGR|DDLS); value = verbatim source where it exists:
- key="package" / "title" / "transport"         — GetObjectInfo (transport: trkorr + description, newest 5)
  (after a split: package / title / transport / screen / gui_status / text_counts only in the batch marked "first")
- key="selection_field"   value="<name> TYPE <type> [OBLIGATORY] label=<text>"
- key="db_access"          value="<SELECT|INSERT|UPDATE|MODIFY|DELETE> <table> WHERE <fields only>"
- key="org_filter"         value="<statement restricting BUKRS / WERKS / VKORG / LAND1 …>"
- key="authority_check"    value="AUTHORITY-CHECK OBJECT '<obj>' ID … FIELD …"
- key="computation"        value="<COLLECT / AT END OF / SUM / conversion FM / BAPI call statement>"
- key="output_column"      value="<fieldcat or WRITE column name> title=<text>"
- key="screen" / "gui_status" / "text_counts"   — number + title / code + function count / symbols + messages
- key="enhancement"        value="<name> <type> <status>"   (dim 8 only)
- key="callers"            value="<count> top=<up to 10>"   (only when asked)

Rules:
- Never call GetTableContents or GetSqlQuery.
- Facts only — no "this is bad", no cross-program remarks, no summary paragraph.
- Values over 160 chars: cut and end with "…".
- Over ~100K tokens of source → status=BLOCKED reason="scope too large — split by include".
```

## Step 4 — sap-analyst (consolidated analysis + narrative)

One dispatch. Consumes facts from every checker + active dimensions and returns classification + scoring + summary + recommendation in a single continuous response.

```
Compare <N> programs across dimensions <active_dimensions>.

Facts (one block per program):
<CHECKER blocks per program — program_facts>

The facts are verbatim source lines from Haiku scouts. Write the business-logic narrative
(dimension 5) yourself from the computation / db_access lines; mark ❓ where facts are missing.

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

## Step 5 — sap-writer (render, Haiku)

One dispatch. Pure formatting from structured state — no MCP reads.

```
Render the comparison report using skills/compare-programs/report-template.md as the skeleton.
Do NOT re-read any MCP objects — work only from the inputs below.

Inputs:
- compared_objects: <list>
- active_dimensions: <list>
- program_facts: <CHECKER blocks per program>
- analyst_outputs: { module_classification, dimension_matrix, exec_summary, recommendation }
- module_consultant_outputs (optional): <per-module blobs>
- user_language: <lang>

Write the Markdown file to .sc4sap/comparisons/<filename>.md (path rule in SKILL.md
<Output_Location>). Return a short confirmation block with file path + dimension counts
+ headline divergence.
```
