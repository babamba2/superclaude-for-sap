# module-to-process — Large scopes (scale mode)

Referenced by `workflow.md` § Step 2 / Step 4 and `dispatch-review.md` § Step 6. Path variables: [`paths-and-state.md`](paths-and-state.md).

**Scale mode applies when the scope has more than 300 used entry points** (`scope.json → tcodes.used`). One analyst cannot read, place and return that many entries in one reply, and one consultant cannot read every task sheet. The deliverable, the state files and Steps 5, 7, 8, 9 stay the same; only the work is split. Below 300 the normal path runs unchanged.

## Step 2 — sources

- **G1 batches.** Write the program list of `walk.json` (PROG members not already on disk under `<SRC>`) to `<SCOPE_DIR>/g1/c<kk>.txt`, ≤ 40 programs per file. One `sap-checker` per file, ≤ 8 per message, prompt: read the file; `GetProgFullCode` once per object with `name`, `type` (`PROG/P` / `FUGR`), `output: "file"`; return ONLY `ok=<n>` plus `ERROR <name> <message>` lines. A large outline can come back as "exceeded token limit" although the file was written: **verify on disk** (`<SRC>/<name lowercase>.prog|.fugr`) after each round, never from the checker's lines.
- **Called customer FMs (round 2).** Custom FUNC leaves of the graph → `SearchObject(object_name=<FM>, object_type="FUNC", maxResults=1, include_raw_xml=true)`; the function group is the URI segment after `/functions/groups/`. Checkers return `<FM>=<FUGR>` lines (40 per checker). Fetch the distinct FUGRs plus the custom PROG leaves (SUBMIT targets) the same way, append them to `walk.json` (`round: 2`) and run G5 again.
- **GetTransaction** in batches of ≤ 100 can be delegated; the result must be saved from the tool response by a script, not retyped. Spot-check 20 entries yourself (include the ones whose program name differs from the TCode).

## Step 4 — placement parts + consolidation + merge

1. **Parts.** Split the confirmed entries of `attach.json` into parts of ≤ 300 by package (a large package in halves, small packages together). Write `<STATE_DIR>/step4-parts/p<k>.txt` (space-separated names).
2. **Brief.** Write `<STATE_DIR>/step4-brief.md`: goal (place every entry of the part on ONE L4), language, SAP version, usage window; inputs (absolute paths: the part file, `attach.json` filtered to the part, backbone(s), `tcodes-all.json` descriptions, graph queries, sources with a budget of ~40 entries read); rules (prefer a backbone L4, else `new:<slug>` under the closest backbone L3, `new3:<slug>` / `new2:<slug>` only for missing areas; report-only programs that read VBAK / EKKO are placed by purpose, not by the tables they read; SM30 parameter TCodes on the task their table serves or `new:cbo-master`; a shared slug list so parts reuse the same keys; variants only for separate programs per org unit or a source branch; owner labels free text, estimated; systems `sap` + non-SAP with evidence); output file `<STATE_DIR>/step4.part-<k>.json`:
   ```json
   { "part": 1, "placements": [{ "entry", "task", "kind", "owner", "system", "variant"?, "ext"?: ["<system id>"], "note"? }],
     "new_tasks": [{ "key", "parent", "label", "desc" }], "new_l3": [{ "key", "parent", "label" }], "new_l2": [{ "key", "label" }],
     "systems": [{ "id", "kind", "label", "evidence" }], "cross_module": [], "unplaced": [{ "entry", "reason" }], "open_questions": [] }
   ```
   Every entry of the part appears exactly once in `placements` or `unplaced` (the analyst validates with node). Scratch scripts go to a sub-folder of the scratchpad named after the part — parallel agents overwrite each other's files in the shared root.
3. **Dispatch** all parts in ONE message: `sap-analyst` (Opus), banner `▶ phase=4.hierarchy[<k>/<n>]`, two-line prompt (part number + brief path).
4. **Summary.** `node "<PLUGIN_ROOT>/scripts/process/merge-placements.mjs" summary --state "<STATE_DIR>" --plugin-root "<PLUGIN_ROOT>" --modules <M1,M2>` → `step4-merge-input.json` (new keys per part with their parents, owner labels, systems per part, variant labels with counts). Check that placed + unplaced = entries.
5. **Consolidation** (one `sap-analyst`, Opus): read `step4-merge-input.json` and write `<STATE_DIR>/step4-consolidate.json`:
   `{ taskMap (merge synonyms; a key may map to a backbone L4), l3Map, tasks {key: {parent, label, desc}}, l3 {key: {parent, label}}, l2 {key: {label}}, lanes (5–8), ownerMap (every owner label → lane id), systems, systemMap ("<part>:<id>" → id), variantMap ("<task> | <label>" → label, or "" to drop a label that only repeats the entity of every entry of the task) }`. It validates parents, owners and system ids with node.
6. **Build.** `node "<PLUGIN_ROOT>/scripts/process/merge-placements.mjs" build --state "<STATE_DIR>" --plugin-root "<PLUGIN_ROOT>" --modules <M1,M2> [--std-usage <usage list of the standard TCodes>]` → `step4.json` (`approved: false`) and `step4-ext.json` ({code: {systems, entries}} — the non-SAP systems per L4 for the Step 5 interfaces). `lost` must be 0.
7. Continue with the Step 4 gate in `workflow.md` (L2 table, new / variant L4 list, Accept / Edit).

## Step 5 — task sheets

Unchanged (parts of ≤ 8 L4). Add to the brief: tasks with 20+ TCodes → read the 3–6 most distinct programs and describe the rest as a group; `step4-ext.json` lists the external systems per task; customer FUGR sources are on disk. Row moves between tasks: `row_patch` with `tcodes_add` / `tcodes_remove` / `objects_add` / `objects_remove` (assemble applies them to the row and its variants).

## Step 6 — review slices

One consultant per **slice of L2 codes** (3–5 slices, ≤ ~200 KB of task sheets each), ALL in ONE message, from a shared `<STATE_DIR>/step6-brief.md` (the Step 6 prompt of `dispatch-review.md` plus: read only the rows and sheets of your slice, list the part files). Output `<STATE_DIR>/step6.<M>-<slice>.json` — assemble reads every `step6.*.json`. Before asking about the objections, print one table of all slices and settle conflicts (two slices moving the same TCode) with a stated rule. Applying many objections: back up `step4.json` and the part files (`*.bak-step6`), apply with a script, then check: no used TCode lost (only moved, unplaced or in a not_evidenced row), variant TCodes ⊂ row TCodes, codes unique and parent first, every cbo / enh / ext L4 has a sheet; then Step 7 and `--check`.

## Step 8b — companion after edits

`companion.mjs apply` matches each `<texts>.<k>.en.json` to its source `<texts>.<k>.json` by text, so chunks translated before a later model edit still apply. Extract the new texts again, translate only the items reported missing (one more chunk pair), and pass every pair to `apply`.
