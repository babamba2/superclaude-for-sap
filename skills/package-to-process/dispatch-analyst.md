# Dispatch — Steps 4 & 5 (sap-analyst)

Referenced by `workflow-render.md` §§ Step 4, Step 5. Both dispatches use the agent's frontmatter model (Opus). The analyst has **no Write tool**: it returns JSON as text, and the main thread writes it ONCE to `<STATE_DIR>` (see [`paths-and-state.md`](paths-and-state.md)). Every path below is substituted as an absolute path before dispatch.

## State variables
- `<PACKAGE>`, `<MODULE>`, `<SAPV>` (`S4`/`ECC`)
- `<INDUSTRY>`, `<COUNTRY>`, `<ACTIVE_MODULES>` — from `<CONFIG_JSON>` + the profile `sap.env`
- `<ENTRY_POINTS_PATH>` — `<STATE_DIR>/entry_points.json` (confirmed list from Step 3)
- `<INVENTORY_PATH>` — resolved per `paths-and-state.md` § Inventory resolution
- `<STEP4_PATH>` — `<STATE_DIR>/step4.json` (user-approved, consumed by Step 5)
- `<PART_SCOPE>` — Step 5 only: `all processes` (single dispatch) or `processes #<i>, #<j>, #<k> of step4.json → processes[] (part <k>/<n>)` (split mode)
- `<PLUGIN_ROOT>` — absolute plugin root

---

## Step 4 — Auto Process Grouping

```
Agent({
  subagent_type: "sc4sap:sap-analyst",
  description: "Process grouping for <PACKAGE>",
  prompt: """
    Group the programs in package <PACKAGE> (module <MODULE>, SAP version <SAPV>)
    into business document flows (e.g., PR→PO→GR→IR).

    ## Inputs you must read (absolute paths)
    1. <INVENTORY_PATH>  — CBO inventory (objects[], crossModuleGaps[])
    2. <ENTRY_POINTS_PATH>  — confirmed entry points (seeds — every cluster must contain
       ≥1 entry point unless it is the 'Misc / utility' residue group)
    3. <PLUGIN_ROOT>/skills/package-to-process/grouping-heuristics.md  — algorithm + module dictionary
    4. <PLUGIN_ROOT>/common/active-modules.md  — cross-module integration matrix
    5. <PLUGIN_ROOT>/configs/<MODULE>/tcodes.md  — TCode reference for label confirmation
    (A later reference-graph facts file will be added here as input 6.)

    ## What to do
    Follow grouping-heuristics.md § Algorithm steps 1–7.
    - Use GetWhereUsed for 1-hop in-package neighborhood per entry point.
    - Use GetAbapSemanticAnalysis (or AST) to extract each program's core DB tables.
    - Apply Jaccard similarity ≥ 0.35 to cluster.
    - Match clusters against the module dictionary; if no match, propose a descriptive auto-label.

    ## What to return
    A fenced ```json block, then a freeform "Rationale" paragraph (≤ 10 lines).
    You cannot write files — the caller persists the JSON block exactly as returned.
    JSON shape:
    {
      "processes": [
        { "label": "PR → PO → GR → IR",
          "members": ["ZMM_PR_CREATE", "ZMM_PO_RELEASE"],
          "shared_tables": ["EBAN","EKKO","EKPO","MSEG"],
          "anchor_dictionary_match": "MM:PR→PO→GR→IR",
          "confidence": 0.82,
          "is_cross_module": false }
      ],
      "residue": ["ZMM_UTIL_LOG_PURGE"],
      "open_questions": ["Is ZMM_PRICE_OVERRIDE still used? No callers detected."]
    }

    Constraints:
    - DO NOT engage the user (caller handles approval).
    - DO NOT call GetTableContents or GetSqlQuery.
    - Confidence ∈ [0.0, 1.0] derived per grouping-heuristics.md § step 6.
  """
})
```

Main thread writes the JSON block to `<STEP4_PATH>` (`"approved": false`), presents the numbered table, applies the user's merge / split / rename edits to the file, and sets `"approved": true` (`workflow-render.md` § Step 4).

---

## Step 5 — Per-Process Narrative

Single dispatch (≤ 6 processes) or one dispatch per part (> 6 processes, ≤ 3 per part, all parts in ONE message — identical prompts except `<PART_SCOPE>`).

```
Agent({
  subagent_type: "sc4sap:sap-analyst",
  description: "Per-process narrative for <PACKAGE> (<PART_SCOPE short>)",
  prompt: """
    Produce per-process narratives for package <PACKAGE> (module <MODULE>,
    industry <INDUSTRY>, country <COUNTRY>, active modules <ACTIVE_MODULES>).

    ## Your scope
    <PART_SCOPE>. Read the approved process list from <STEP4_PATH> → processes[]
    (use ONLY the processes in your scope; keep their labels unchanged).

    ## Inputs to read on demand (absolute paths)
    - <INVENTORY_PATH>, <ENTRY_POINTS_PATH>
    - GetProgFullCode / GetFunctionModule / GetClass for grounded claims. Avoid
      full reads when a semantic summary suffices.
    - GetWhereUsed for 1-hop boundary (in-package AND out-of-package).
    - <PLUGIN_ROOT>/configs/<MODULE>/spro.md, <PLUGIN_ROOT>/configs/<MODULE>/bapi.md
      for boundary classification.
    - <PLUGIN_ROOT>/industry/<INDUSTRY>.md and <PLUGIN_ROOT>/country/<COUNTRY>.md
      for business-context phrasing.
    - <PLUGIN_ROOT>/common/active-modules.md for cross-module notes.

    ## For each process in scope produce
    1. overview — 3–6 sentence business-voice paragraph (NOT technical).
    2. representative_sequence — ONE end-to-end scenario as Mermaid `sequenceDiagram`
       source (text only, valid syntax, escape \\n in JSON strings).
    3. step_table — rows {step, actor, cbo_object, tables, trigger, output}; ≤ 12 rows.
    4. external_boundary — rows {direction, external_object, type, called_from, purpose}.
       Type ∈ {Std BAPI, Std FM, CDS, Other Z package, Enhancement, …}.
    5. cross_module_notes — array of sentences ONLY if the process touches a 2nd
       active module per active-modules.md. Else: [].

    ## Return — single fenced ```json block (the caller writes it to a file verbatim)
    {
      "processes": [
        { "index": <1-based position in step4.json → processes[]>,
          "label": "...",
          "overview": "...",
          "representative_sequence": "sequenceDiagram\\n    actor User as Buyer\\n    ...",
          "step_table": [ { "step": "...", "actor": "...", "cbo_object": "...",
                            "tables": "EBAN, EKKO", "trigger": "TCode ME21N",
                            "output": "..." } ],
          "external_boundary": [ { "direction": "OUT",
                                   "external_object": "BAPI_PO_CREATE1",
                                   "type": "Std BAPI",
                                   "called_from": "ZMM_PO_RELEASE",
                                   "purpose": "Create standard PO" } ],
          "cross_module_notes": ["Posts to FI via BAPI_ACC_DOC_POST on GR."] }
      ],
      "package_level_cross_module": [
        { "pair": "MM↔FI", "where": "Process 3",
          "standard_touchpoint": "BAPI_ACC_DOC_POST", "cbo_override": null }
      ],
      "sensitive_objects": [],
      "open_questions": []
    }

    Constraints:
    - DO NOT call GetTableContents or GetSqlQuery.
    - Boundary depth = 1 hop. Do NOT walk further.
    - Mermaid source must be valid sequenceDiagram syntax.
    - In split mode, package_level_cross_module covers only your processes; the
      writer merges the parts.
  """
})
```

---

## Failure handling

- Step 4 returns `BLOCKED: <reason>` → main thread STOPS, surfaces the reason, and asks the user how to proceed (no escalation — already Opus).
- Step 4 returns 0 processes → ask the user to manually define at least one group (free text), write it to `<STEP4_PATH>` with `"approved": true`, then dispatch Step 5 directly (skip a second Step 4 attempt).
- Step 5 returns JSON that fails schema validation (missing required keys: `processes[].label / overview / representative_sequence / step_table`) → retry that dispatch ONCE with a clarification message; second failure → single mode: STOP and ask; split mode: mark that part's processes failed and continue (`paths-and-state.md` § Escalation + partial failure).
- Step 5 `BLOCKED` → single mode: STOP and ask; split mode: that part's processes → `failed_processes`, continue.
