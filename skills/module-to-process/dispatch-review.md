# Dispatch — Step 6 (module consultant review, optional) & Step 7 (assemble)

Referenced by `workflow-build.md`. Substitute every `<…>` as an absolute path / value before dispatch. Common variables as in [`dispatch-analyst.md`](dispatch-analyst.md).

## Step 6 — Consultant review (optional, one per module in scope, parallel)

**Ask first** (one question, 2 options): `Review with the module consultant (Recommended)` / `Skip — build now`. Skip → no `step6.*.json`; the page is built from Steps 4–5 only (standard tasks keep a header-only sheet) and the review can run later on the same state (`review the process map` → Step 6 → Steps 7–8 with a new minor version). Record the choice in `intake.json → review` (`"done"` / `"skipped"`).

`<M>` = each module of `intake.json → modules` that has a consultant agent (`sap-<m>-consultant`, lowercase; LE → `sap-sd-consultant`). ALL in ONE message; banner per module `▶ phase=6.review[<M>] · agent=sap-<m>-consultant · model=<frontmatter>`.

```
Agent({
  subagent_type: "sc4sap:sap-<m>-consultant",
  description: "Process map review <M>",
  prompt: """
    Review the draft process map of <MODULE> for the <M> part, as the consultant who hands it to a project team
    (conversion / enhancement). Language: <LANG>. SAP <SAPV>, industry <INDUSTRY>, country <COUNTRY>.

    Read: <STATE_DIR>/step4.json (hierarchy, lanes, systems), every file listed in <STATE_DIR>/step5.json → parts
    (task sheets — the analyst read the source; where a sheet and a step4 description disagree, the sheet is right),
    <PLUGIN_ROOT>/configs/<M>/process-backbone.json, <PLUGIN_ROOT>/common/sap-version-reference.md,
    <PLUGIN_ROOT>/industry/<INDUSTRY>.md, <PLUGIN_ROOT>/country/<COUNTRY>.md.

    Write ONE JSON file <STATE_DIR>/step6.<M>.json (UTF-8, node or Bash) with patches only (no full copies):
    { "schema": 1, "module": "<M>",
      "labels": [{ "code", "label"?, "desc"? }],          // business wording consultants use; no people's names
      "owners": [{ "code", "owner", "ownerEstimated" }],  // lane ids from step4.json, or new lanes in lanes_added
      "lanes_added": [{ "id", "label", "estimated": true }],
      "conversion": [{ "code", "notes": ["…"] }],         // S/4HANA impact per task (only for SAPV = ECC), new notes only
      "std_sheets": [{ "code", "definition", "output"?, "timing"? }],  // short sheets for every std / manual L4 of <M>
      "glossary": [{ "term", "description" }],            // 10–25 terms a new consultant needs
      "open_questions": ["…"],
      "objections": [{ "code", "issue", "fix" }] }       // placement or kind you disagree with
    Check the file parses. Mark anything you inferred rather than read with "(estimated)".
    Return ONLY: REVIEW <M> OK labels=<n> owners=<n> conversion=<n> std_sheets=<n> glossary=<n> objections=<n> file=<path>
    plus at most 5 lines of the most important objections.

    Constraints: DO NOT call GetTableContents or GetSqlQuery. DO NOT engage the user. Patch only codes in step4.json.
  """
})
```

Large scopes (more than 300 used entries): review slices per [`workflow-scale.md`](workflow-scale.md) § Step 6.

Main thread: verify each file parses. Non-empty `objections` → print them as a table (`Code · Issue · Fix`) and ask (2 options): `Apply the fixes (Recommended)` / `Keep as is`. Apply = Edit `step4.json` / the part files (no re-dispatch).

## Step 8b — Translate brief (template of `<STATE_DIR>/translate-brief.md`)

```
# Translate brief — process map companion (<lang> → en)
Input: the chunk file named in your prompt: { "from": "<lang>", "items": [{ "i", "text" }] }.
Output: write <chunk path with .json → .en.json>: { "items": [{ "i", "text" }] } — every item exactly once, same i.
Check it parses and the counts match. Return ONLY: TRANSLATED <in> items=<n> file=<out>.
Rules: plain short consultant English, same meaning, no added or dropped facts; SAP identifiers, programs, tables,
fields, TCodes, BAPIs, codes, numbers literal; standard SAP terms in their usual English (purchase requisition,
goods receipt, info record, vendor, intercompany, netting, stock transfer, to be confirmed, (estimated) …);
keep **bold**, backticks, line breaks, arrows, region tags like [KR]; no people's names.
```

## Step 7 — Assemble the model (main thread, deterministic)

No agent. One Bash call:

```
node "<PLUGIN_ROOT>/scripts/process/assemble-model.mjs" --state "<STATE_DIR>" --scope "<SCOPE_DIR>/scope.json" --system <ACTIVE_ALIAS> --title "<MODULE> <doc label>"
```

Add `--bph "<STATE_DIR>/bph-skeleton.json" --bph-sheet "<sheet>"` when `intake.json → bph` is set: the model then carries `reconcile` (proposed BPH ↔ L4 matches, BPH-only rows = no usage evidence in this system, document-only tasks), shown in the appendix.

It merges `intake.json`, `step4.json`, every `step5.part-<k>.json` (sheets, `row_patch` incl. `desc`, added lanes / systems) and every `step6.<M>.json` (consultant wording wins, conversion notes appended, std sheets, glossary), adds `scope.packages[{name, tcodes, used}]` and `overview.scopeNote` from `scope.json`, flags CBO tasks without a sheet, and writes `<STATE_DIR>/process-model.json`. Relay its one-line summary. `intake.json → changeNote` becomes the revision note (`First version` / what changed).

Then `node "<PLUGIN_ROOT>/scripts/process/build-process-doc.mjs" "<STATE_DIR>/process-model.json" --check`: errors → fix the state file they point at (Edit) and re-run (max 3); warnings `L4 without task sheet` are expected for std tasks when the review was skipped.
