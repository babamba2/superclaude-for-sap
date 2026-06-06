# Dispatch — Steps 4 & 5 (sap-analyst)

Referenced by `workflow.md` §§ Step 4, Step 5. Both dispatches use `mode: "dontAsk"` and the agent's frontmatter model (Opus 4.7).

## State variables
- `<PACKAGE>`, `<MODULE>`, `<SAPV>` (`S4`/`ECC`)
- `<INDUSTRY>`, `<COUNTRY>`, `<ACTIVE_MODULES>` — from `config.json` + `sap.env`
- `<ENTRY_POINTS>` — confirmed list from Step 3
- `<INVENTORY_PATH>` — `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`
- `<STEP4_JSON_PROCESSES>` — user-approved processes JSON from Step 4 (consumed by Step 5)

---

## Step 4 — Auto Process Grouping

```
Agent({
  subagent_type: "sc4sap:sap-analyst",
  description: "Process grouping for <PACKAGE>",
  prompt: """
    Group the programs in package <PACKAGE> (module <MODULE>, SAP version <SAPV>)
    into business document flows (e.g., PR→PO→GR→IR).

    ## Inputs you must read
    1. <INVENTORY_PATH>  — CBO inventory (objects[], crossModuleGaps[])
    2. skills/package-to-process/grouping-heuristics.md  — algorithm + module dictionary
    3. common/active-modules.md  — cross-module integration matrix
    4. configs/<MODULE>/tcodes.md  — TCode reference for label confirmation

    ## Confirmed entry points
    <ENTRY_POINTS>  (seeds — every cluster must contain ≥1 entry point unless it is the 'Misc / utility' residue group)

    ## What to do
    Follow grouping-heuristics.md § Algorithm steps 1–7.
    - Use GetWhereUsed for 1-hop in-package neighborhood per entry point.
    - Use GetAbapSemanticAnalysis (or AST) to extract each program's core DB tables.
    - Apply Jaccard similarity ≥ 0.35 to cluster.
    - Match clusters against the module dictionary; if no match, propose a descriptive auto-label.

    ## What to return
    A fenced ```json block, then a freeform "Rationale" paragraph.
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
  """,
  mode: "dontAsk"
})
```

Main thread then presents `processes[]` + `residue[]` to the user via `AskUserQuestion` for approval / merge / split / rename. Final approved JSON becomes `<STEP4_JSON_PROCESSES>` for Step 5.

---

## Step 5 — Per-Process Narrative

```
Agent({
  subagent_type: "sc4sap:sap-analyst",
  description: "Per-process narrative for <PACKAGE>",
  prompt: """
    Produce per-process narratives for the user-approved process list of package
    <PACKAGE> (module <MODULE>, industry <INDUSTRY>, country <COUNTRY>, active
    modules <ACTIVE_MODULES>).

    ## Approved process list (from Step 4)
    <STEP4_JSON_PROCESSES>

    ## Inputs to read on demand
    - <INVENTORY_PATH>
    - GetProgFullCode / GetFunctionModule / GetClass for grounded claims. Avoid
      full reads when a semantic summary suffices.
    - GetWhereUsed for 1-hop boundary (in-package AND out-of-package).
    - configs/<MODULE>/spro.md, configs/<MODULE>/bapi.md for boundary classification.
    - industry/<INDUSTRY>.md and country/<COUNTRY>.md for business-context phrasing.

    ## For each process produce
    1. overview — 3–6 sentence business-voice paragraph (NOT technical).
    2. representative_sequence — ONE end-to-end scenario as Mermaid `sequenceDiagram`
       source (text only, valid syntax, escape \\n in JSON strings).
    3. step_table — rows {step, actor, cbo_object, tables, trigger, output}; ≤ 12 rows.
    4. external_boundary — rows {direction, external_object, type, called_from, purpose}.
       Type ∈ {Std BAPI, Std FM, CDS, Other Z package, Enhancement, …}.
    5. cross_module_notes — array of sentences ONLY if the process touches a 2nd
       active module per common/active-modules.md. Else: [].

    ## Return — single fenced ```json block
    {
      "processes": [
        { "label": "...",
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
  """,
  mode: "dontAsk"
})
```

---

## Failure handling

- Either dispatch returns `BLOCKED: <reason>` → main thread STOPS, surfaces the reason, and asks the user how to proceed.
- Step 4 returns 0 processes → ask the user to manually define at least one group, then re-dispatch Step 5 directly (skip a second Step 4 attempt).
- Step 5 returns JSON that fails schema validation (missing required keys) → log the failure, retry ONCE with a clarification message; second failure → STOP and ask user.
