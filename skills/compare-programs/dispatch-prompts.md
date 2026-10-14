# Dispatch Prompts

Full `Agent(...)` prompt bodies for the compare-programs skill. Referenced from `workflow.md` and `render-steps.md` to keep those files under the 200-line cap.

## Step 3 — sap-checker (facts scout, Haiku)

Dispatched N times in parallel (one per program, or one per include batch after a split). Each checker reads ONE scope and returns `FACT` lines only — no scoring, no comparison, no narrative. The Opus analyst in Step 4 does all interpretation.

```
MODE: scout
Scope: <PROG> (type: <TYPE>)  [includes: <list> — only after a split]
Active dimensions: <active_dimensions>

Read: GetProgFullCode (REPS, FUGR) / GetClass (CLAS) with output: "file" — you get file paths plus an
outline (FORM / METHOD / MODULE with line ranges). Grep the files for SELECT, AUTHORITY-CHECK,
PARAMETERS, SELECT-OPTIONS, SELECTION-SCREEN, COLLECT, CALL FUNCTION, fieldcat … instead of reading every line.
After a split: GetInclude per listed include. CDS: GetView + GetMetadataExtension.
GetObjectInfo for package and transports.
UI (dims 3, 6): GetScreensList + GetScreen, GetGuiStatusList + GetGuiStatus, ReadTextElementsBulk
(selection texts + text symbols, logon language first, then English).
Enhancements (dim 8 only): GetEnhancements, GetEnhancementImpl, GetEnhancementSpot.
Callers (only when the prompt says caller frequency is in scope): GetWhereUsed.

Return one FACT line per item (obj=<PROG>, kind=PROG|CLAS|FUGR|DDLS); value = verbatim source where it exists:
- key="package" / "title" / "transport"         — GetObjectInfo (transport: trkorr + description, newest 5)
  (after a split: package / title / transport / screen / gui_status / text_counts only in the batch marked "first")
- key="selection_field"   value="<name> TYPE <type> [OBLIGATORY] label=<selection text>"
- key="selection_def"     value="<one SELECTION-SCREEN / PARAMETERS / SELECT-OPTIONS statement, verbatim, in source order>"
                          (dims 3 / 6 only; also INITIALIZATION defaults and sscrfields-functxt_nn assignments)
- key="db_access"          value="<SELECT|INSERT|UPDATE|MODIFY|DELETE> <table> WHERE <fields only>"
- key="org_filter"         value="<statement restricting BUKRS / WERKS / VKORG / LAND1 …>"
- key="authority_check"    value="AUTHORITY-CHECK OBJECT '<obj>' ID … FIELD …"
- key="computation"        value="<COLLECT / AT END OF / SUM / conversion FM / BAPI call statement>"
- key="output_column"      value="<fieldname> title=<text> [key] [edit] [hotspot] [no_out]"   (field catalog / WRITE)
- key="gui_button"         value="<status> <fcode> <text> icon=<ICON_*> key=<F-key>"   (dims 3 / 6 only)
- key="screen" / "gui_status" / "text_counts"   — number + title / code + function count / symbols + messages
- key="message_class"      value="<REPORT … MESSAGE-ID xxx>"   (the default class of bare `MESSAGE E019`)
- key="message"            value="<active MESSAGE statement, verbatim> (FORM, line)"   — skip commented ones, but
                          list a commented MESSAGE that the comparison hinges on with "(commented)"
- key="text_symbol"        value="<KEY> <lang> <text>"   for every TEXT-xxx a MESSAGE or a message field uses
                          (GetTextElement type I, logon language first, then E; say "no <lang> pool" when it fails)
- key="enhancement"        value="<name> <type> <status>"   (dim 8 only)
- key="callers"            value="<count> top=<up to 10>"   (only when asked)

Rules:
- Never call GetTableContents or GetSqlQuery.
- Facts only — no "this is bad", no cross-program remarks, no summary paragraph.
- Values over 160 chars: cut and end with "…" (selection_def: never cut — split a long statement over two lines).
- Over ~100K tokens of source → status=BLOCKED reason="scope too large — split by include".
```

## Step 4 — sap-analyst (consolidated analysis + narrative)

One dispatch. Consumes facts from every checker + active dimensions and returns everything below in one response (text, no files).

```
Compare <N> programs across dimensions <active_dimensions>. Report language: <lang>.

Facts (one block per program):
<CHECKER blocks per program — program_facts>

The facts are verbatim source lines from Haiku scouts. Write the business-logic narrative
(dimension 5) yourself from the computation / db_access lines; mark ❓ where facts are missing.

A. Module classification — primary module per program from package prefix, table families, TITLE.
B. Dimension matrix — per active dimension × program: a short value per program + one verdict
   ✅ Same / 🔷 Variant / ⚠️ Divergent / ❓ Unclear (rubric: skills/compare-programs/comparison-scope.md).
   For every non-✅ row, give per program the evidence: the FACT value it rests on (statement +
   FORM / line, ≤ 120 chars) — the report shows it as the cell's tooltip.
C. Executive Summary — 3 sentences, headline = the biggest divergence; plus ONE "must not get wrong"
   decision for a consultant.
D. Decision guide — 3–6 rows "situation → program → why", and a decision tree of at most 7
   yes/no or choice questions whose leaves are program names (Mermaid flowchart TD source).
E. Field presence (dims 3 / 6) — every selection field and every visible output column of any
   program: name, business meaning, ● / ○ per program. Same field under another name in another
   program → one row, note the names.
F. Per program: package, T-Code, persona + timing, core data, logic summary, authorizations.
   Messages: one row per message either program shows — code with class, the T100 / text-symbol
   text, when it appears, ● / ○ per program; flag MESSAGE … WITH x whose text has no & (x never shows).
   Then consolidation opportunities and risks / open questions (hard-coded values, missing checks).
G. module_set: [MM, CO, ...] when the programs span 2+ modules (drives Step 4b).

All narrative in <lang>. Business terms first; FORM / line anchors only as secondary references.
```

## Step 4b — sap-{module}-consultant (conditional, per distinct module)

Dispatched only when the analyst's `module_set` has ≥ 2 modules. Parallel across modules.

```
From a <MODULE> consultant's view, briefly explain (2–3 sentences each) which of these
programs a <MODULE> user would reach for — and why. Facts:
<subset of program_facts relevant to this module>

Answer in <lang>.
```

## Step 5 — sap-writer (screens + report, Sonnet override)

One dispatch, `model: "sonnet"`. No MCP reads — work only from the inputs.

```
Write the program comparison report for <compared_objects>, language <lang>, version <ver>.

Read first:
- skills/compare-programs/report-template.md   (skeleton + comparison markup + rendering rules)
- skills/program-to-spec/html-markup.md         (page markup the converter reads)
- when screens are in scope: skills/program-to-spec/selection-schema.md and
  skills/program-to-spec/alv-buttons-schema.md §2, and spec-templates.md § image-spec.json schema

Inputs:
- active_dimensions: <list>
- program_facts: <CHECKER blocks per program>
- analyst_outputs: <A–G verbatim>
- module_consultant_outputs (optional): <per-module blobs>
- paths: base=<base>/comparisons  name=<NAME>  plugin_root=<PLUGIN_ROOT>

Do, in order:
1. Screens (dims 3 / 6 only) — per program with a selection screen or list output, write
   <base>/_img/<NAME>/<PROG>.image-spec.json (lang, selection and/or alv only; transcribe the
   selection_def lines 1:1; columns from output_column; buttons from gui_button, each with its
   icon=ICON_* (quickinfo-only cancel buttons too — never drop an icon the fact names); 2–3 invented
   sample rows, never business data). Then run
   node "<plugin_root>/scripts/spec/render-md-images.mjs" <that json> <base>/_assets/<NAME>-<lang>/<PROG>/
   Fix and re-render on a selection ⚠ line; ignore "has no usable buttonFlows entry".
2. Write <base>/<NAME>-v<ver>-<lang>.md with the Write tool (one call, never Bash), following the
   template: fact list, §1–§9, verdict cells starting with the mark, presence cells ● / ○ only,
   §5 pictures after <!-- layout: side-by-side --> using paths relative to the .md.

Return: file path, pictures per program (or why missing), verdict counts, headline divergence.
```

## Step 5.3 — sap-writer (English companion, Sonnet override)

```
Translate <base>/<NAME>-v<ver>-<lang>.md into <base>/<NAME>-v<ver>-en.md (one Write call).
Read skills/compare-programs/report-template.md § Rendering rules first.
- English for every heading, paragraph, table header and cell text, legend, verdict word, callout,
  Mermaid label, fact label and value.
- Unchanged: program / table / field / authorization object names, T-Codes, ●, ○, ✅ 🔷 ⚠️ ❓,
  numbering, table shape, the <!-- … --> lines.
- Screens: for each _img/<NAME>/<PROG>.image-spec.json write <PROG>-en.image-spec.json with
  "lang": "en" and labels / headers / titles translated (names unchanged), render it into
  _assets/<NAME>-en/<PROG>/, and point the English .md at those files.
Return the path and any string you were unsure about.
```
