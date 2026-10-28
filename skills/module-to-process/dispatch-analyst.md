# Dispatch — Steps 4 & 5 (sap-analyst, Opus)

Referenced by `workflow.md` § Step 4 and `workflow-build.md` § Step 5. Frontmatter model (Opus). Step 4 returns one fenced JSON block (plus ≤ 10 lines of rationale) that the main thread writes once to `<STATE_DIR>/step4.json`; Step 5 parts write their own files (the analyst has Bash) and return a one-line summary. Substitute every `<…>` as an absolute path / value before dispatch.

Common variables: `<SCOPE_DIR>` (paths-and-state.md), `<MODULE>`, `<MODULES>` (comma list), `<SAPV>` (`ECC` / `S4`), `<LANG>`, `<INDUSTRY>`, `<COUNTRY>`, `<STATE_DIR>`, `<PLUGIN_ROOT>`, `<GRAPH_QUERY>` = `node "<PLUGIN_ROOT>/scripts/graph/graph-query.mjs" "<SCOPE_DIR>/graph.json"`.

## Step 4 — Process hierarchy

```
Agent({
  subagent_type: "sc4sap:sap-analyst",
  description: "Process hierarchy for <MODULE>",
  prompt: """
    Build the business process hierarchy (BPH) of module scope <MODULES> as THIS system runs it.
    Readers: module consultants starting a project. Language of every label: <LANG>.

    Inputs (absolute paths):
    1. <STATE_DIR>/intake.json        — scope, lanes / ownerMap given by the user (may be empty)
    2. <STATE_DIR>/attach.json        — entry points, their features and ranked backbone tasks (proposals, not decisions)
    3. <SCOPE_DIR>/graph.json  — merged reference graph; query it, do not read it whole:
       <GRAPH_QUERY> reach <id> --depth 3 · <GRAPH_QUERY> flow <TABLE> · <GRAPH_QUERY> components --md
    4. <PLUGIN_ROOT>/configs/<M>/process-backbone.json for each module — the standard tree (L1–L4, anchors, s4 notes)
    5. <STATE_DIR>/packages.json      — scope.json (used / unused per package), usage-result.json, optional package inventories
    6. <PLUGIN_ROOT>/common/active-modules.md, <PLUGIN_ROOT>/industry/<INDUSTRY>.md, <PLUGIN_ROOT>/country/<COUNTRY>.md
    7. (only when intake.json → bph is set) <STATE_DIR>/bph-skeleton.json, sheet <BPH_SHEET> — the customer's existing BPH:
       reuse its business wording for labels where a task clearly matches; keep this document's own numbering
    8. Sources on disk: <SRC>/<program lowercase>.prog/ (main program, TOP / selection include) — purpose of each entry

    What to do
    - Start from the backbone tree. Place every confirmed entry point on ONE L4 task (the analyst decides;
      attach.json scores are hints). An entry whose purpose fits no standard L4 → a new L4 (no `backbone`)
      under the closest L3, or a new L3 / L2 when the business area is missing from the backbone.
    - Keep a standard L3 when any of its L4 tasks has a CBO object, a usage hit, or an anchor table the
      CBO code writes. Drop the other standard L3s and list them in `not_evidenced` (backbone id + reason).
      Keep at least the backbone L4s of a kept L3 (kind `std`) — the consultant must see the whole process.
    - kind per L4: std / cbo / enh / manual / ext (rules in <PLUGIN_ROOT>/skills/module-to-process/model-schema.md § Rows).
    - Variants: only where the source branches by org unit / document type (CASE / IF on BUKRS, VKORG, WERKS,
      AUART, BSART, LFART, FKART, constant tables) or separate programs per org unit do the same task.
      Use `GetProgram` / `GetInclude` / `GetAbapSemanticAnalysis` on the entry programs to confirm.
    - Lanes: use intake lanes / ownerMap first. Otherwise propose 3–8 organisation / role lanes from the
      programs (screen titles, authorization objects, BAPI types, batch jobs) with `estimated: true`.
    - Systems: `sap` plus every non-SAP system the code talks to (RFC destination, IDoc, proxy, file I/O)
      with kind legacy / external; `manual` for offline steps.
    - Codes: renumber in document order 1, 1.1, 1.1.1, 1.1.1.1 — never reuse customer numbering.

    Return ONE fenced ```json block:
    { "lanes": [{ "id", "label", "estimated" }],
      "systems": [{ "id", "kind", "label" }],
      "rows": [ { "code", "level", "label", "desc"?, "backbone"?, "kind"?, "system"?, "tcodes"?, "objects"?,
                  "owner"?, "ownerEstimated"?, "usage"?, "variants"? } ],
      "not_evidenced": [{ "backbone", "label", "reason" }],
      "unplaced": [{ "entry", "reason" }],
      "cross_module": [{ "from", "to", "object", "desc" }],
      "open_questions": ["…"] }
    Then ≤ 10 lines of rationale.

    Constraints: DO NOT call GetTableContents or GetSqlQuery. DO NOT engage the user.
    No customer names, numbering or labels from outside this system in any label.
  """
})
```

## Step 5 — Task sheets (parallel parts)

Tasks to sheet = L4 rows of the approved `step4.json` with kind `cbo`, `enh` or `ext`, in document order. Std-only and manual tasks get their short sheet from the Step 6 review (or stay header-only when the review is skipped). Parts of **≤ 8 tasks**, ALL dispatched in ONE message; banner per part `▶ phase=5.tasks[k/n] · agent=sap-analyst · model=Opus`.

**Brief file.** The main thread first writes `<STATE_DIR>/step5-brief.md` from the template below (placeholders substituted, absolute paths). Every part prompt is then two lines, so eight parallel prompts cost almost nothing:

```
Write task sheets (PDD form) for part <k> of <n>: L4 tasks <codes>.
Follow the brief exactly: <STATE_DIR>/step5-brief.md (read it first). k = <k>.
```

Template of `step5-brief.md`:

```
# Step 5 brief — task sheets (PDD form), module <MODULE>
Language of every text: <LANG> (plain declarative sentences; SAP identifiers literal). SAP <SAPV>, industry <INDUSTRY>, country <COUNTRY>.
Only used TCodes are in scope (<SID>, last <coverage> months).
## Inputs
- Approved hierarchy (rows, lanes, systems): <STATE_DIR>/step4.json
- Reference graph — query, never read whole: <GRAPH_QUERY> reach PROG:<NAME> --depth 2 (also callers, flow <TABLE>)
- Sources on disk: <SRC>/<program lowercase>.prog/ (Grep / Read). Customer FMs not on disk → GetFunctionModule only when a rule depends on it.
- Task sheet shape: <PLUGIN_ROOT>/skills/module-to-process/model-schema.md § Task sheet
- S/4 notes: <PLUGIN_ROOT>/common/sap-version-reference.md + the `s4` fields of <PLUGIN_ROOT>/configs/<M>/process-backbone.json
## Per task
Read the entry program(s) of the row and what they reach — not the whole package. Write definition, output, timing;
2–6 rules each with source {object, unit, line} or estimated: true; 2–8 steps (owner = lane id, system = system id;
name = the business action in consultant / operator words, where = the TCode / program / RFC FM / job / external screen
it runs in, method = how in one phrase; several programs for one step → `alts[{when, where, label}]`, one per program
with the business case that selects it, never a joined list in `where`; `action` = the user action in that program that triggers the step: F8, a named
button with its function code, a row selection + button, batch, automatic exit); flow only with a real decision (≤ 12 nodes, labels in business words, `where` on
process / io nodes; never a node that is only an FM, table or job name); objects / exits / interfaces; links;
conversion (S/4 impact of this task only); tbd. Readers are module consultants and operators, not developers.
row_patch when the source contradicts the row — any of kind, owner, ownerEstimated, usage, tcodes, objects, variants, desc.
## Output — write a FILE, return a SHORT summary
Write <STATE_DIR>/step5.part-<k>.json (UTF-8, node or Bash):
{ "schema": 1, "part": <k>, "codes": [...], "tasks": [{ "code", "task": {…}, "row_patch"?: {…} }],
  "lanes_added": [], "systems_added": [], "cross_module": [{ "from": "<MODULE>", "to": "<other module>", "object": "<program → FM / table>", "desc": "…" }], "open_questions": [] }
Check it parses and every code of the part appears once; every rule has source or estimated; owner / system ids exist.
Return ONLY: PART <k> OK tasks=<n> rules=<n> (sourced <n>) steps=<n> flows=<n> file=<path> + at most 5 lines of findings.
## Constraints
DO NOT call GetTableContents or GetSqlQuery. DO NOT engage the user. Codes only from step4.json. No people's names.
```

`<SRC>` = the MCP output folder the G1 checkers returned (parent of the `.prog` folders). Main-thread check per part: the file exists and parses, every code present once, every rule has `source` or `estimated`. Missing / broken → retry that part ONCE with the list of problems; second failure → `failed_tasks` (`paths-and-state.md` § Escalation). The analyst's own sheet wins over the Step 4 row: `row_patch.desc` replaces the description when the source contradicts it.
