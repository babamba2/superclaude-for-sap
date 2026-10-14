# CBO Stocking — Step G: Reference Graph + Usage

Runs between Step C (scouts) and Step D (finalize) of [`stocker-fanout.md`](stocker-fanout.md), for both callers (`analyze-cbo-obj`, `package-to-process`). It builds `graph.json` (who calls / includes / submits / reads / writes / types what, from source and DDIC) and, on ECC, `usage-result.json` (which members are actually used). Finalize then ranks from the graph instead of `GetWhereUsed`, which returns 404 on ECC.

`<DIR>` = the inventory directory from the `WALKED` line. `<PLUGIN_ROOT>` = the folder that holds `skills/`, `scripts/`, `common/` (two levels above this skill's `SKILL.md`, or `$CLAUDE_PLUGIN_ROOT`); quote it in shell commands. `<SAPV>` = `ECC` or `S4` as in `stocker-fanout.md`.

Banner: `▶ phase=graph · agent=main + sap-checker×<n> · model=Haiku`. Every sub-step is mechanical — no judgment, so no Sonnet / Opus dispatch here.

## G1 — Fetch sources (`sc4sap:sap-checker` × n, `MODE: scout`)

Scope = every `PROG` and `FUGR` in `walk.json → objects[]`, 10 per checker, at most 8 checkers per message. Skip the dispatch when there are none.

```
MODE: scout
Objects (your whole scope): <NAME:PROG, NAME:FUGR, …>
For each object return exactly one line:
- key="src" value="<absolute folder path>" — GetProgFullCode once with output: "file" (type "PROG/P" for PROG,
  "FUGR" for FUGR). The folder is the directory of the first code_objects[].path (it ends in .prog or .fugr).
  Never read the source. On error: key="src" value="ERROR <message>".
```

`<SRC>` = the parent directory of the returned folders (they share one MCP output directory). `ERROR` lines are not retried — `build-package-graph` lists those objects under `sourcesMissing`, and finalize names them in `index.md`.

## G2 — TCodes (main thread)

TRAN members → one `GetTransaction` call with `transaction_names: [...]` (batches of 100). Save the JSON result unchanged as `<DIR>/tcodes.json`. It maps report / dialog TCodes to their program and parameter TCodes (SM30) to their view. A failed call → write `[]` and add `TCode mapping unavailable: <message>` to the finalize prompt.

## G3 — DDIC typing (`sc4sap:sap-checker` × n, `MODE: scout`)

DDIC metadata only (`GetTable` / `GetStructure` / `GetDataElement`). This skill never calls `GetSqlQuery` / `GetTableContents`. Scope = every `TABL`, `STRU` and `DTEL` member, 20 per checker, at most 8 checkers per message. It can share a message with G1.

```
MODE: scout
Objects (your whole scope): <NAME:TABL, NAME:STRU, NAME:DTEL, …>
For each object:
- TABL / STRU: GetTable (TABL) or GetStructure (STRU) once. One line per field whose rollname OR domname
  starts with Z or Y (or a /namespace/):  key="types" value="<FIELDNAME>=<ROLLNAME>/<DOMNAME>"
  (no domname → value="<FIELDNAME>=<ROLLNAME>"). No line for other fields. No custom field → no line.
- DTEL: GetDataElement once → key="domain" value="<DOMNAME or ->".
```

Main writes every `CHECKER … END` block unchanged to `<DIR>/ddic-facts.md`. `build-package-graph` turns it into `types` edges: TABL / STRU → DTEL → DOMA. `.INCLUDE` structures carry no name in these reads, so they get no edge. A `BLOCKED` batch is not retried. Its tables then have no typing edges, and their DTEL / DOMA show `no-evidence`.

## G4 — Usage (main thread, ECC only)

`<SAPV>` = `ECC` and the tools exist:

- `GetTcodeUsage` with every TRAN member (months 12) → the result as `tcodes`.
- `GetJobUsage` with every PROG member (months 12) → the result as `jobs`.

Write `<DIR>/usage.json` = `{ "system": <SAP system id>, "measuredAt": <today>, "tcodes": …, "jobs": … }` (results unchanged). Either call fails → leave that key out. S/4 or neither tool available → no `usage.json`. The graph is still built, and finalize skips the usage section.

### G4u — Usage from another system (QA / PRD)

A DEV profile (`config.json → tier` = `DEV`) measures developer tests, not business use. The destination is site-specific: every installation names its own — never assume one. Read `SAP_USAGE_RFCDEST` from the profile `sap.env`.

- **Set** → G4 calls `GetTcodeUsage` with `destination: "<SAP_USAGE_RFCDEST>"` (passed explicitly, so a just-edited `sap.env` works without a restart). The result's `system` is the measured SID → write it as `tcodes.source = { system, destination, kind: "rfc" }`. `GetJobUsage` stays on the connected system — say so in the progress line. A call error (`RFC destination … failed`, missing authorization) → print it and fall through to the question below.
- **Not set** on a DEV profile → ask once (any SAP version — the file path works on S/4 too): `Read QA / PRD over RFC (Recommended)` / `Submit QA / PRD used TCodes (file)` / `Use <SAP system id> statistics` / `Skip usage`.
  - RFC → ask for the SM59 destination name (on the connected system, pointing to QA / PRD); prerequisites: the destination's user needs `S_RFC` for function groups `SWNC_COLLECTOR` + `SRFC` and workload read authorization (`S_TOOLS_EX`). Call once; success → offer to save it as `SAP_USAGE_RFCDEST` via `/sc4sap:sap-option` (one line, no auto-write).
  - File → the export recipe below.

Submitted file: print the export recipe, then take a file path or a pasted list:

```
QA/PRD → ST03N → Expert mode → Workload: Total → Month (pick the months) → Transaction Profile → Standard
→ Transaction tab → List → Export → Spreadsheet (.xlsx) or Local file (unconverted .txt).
Or paste TCode names here (any separator). Jobs (optional): SM37 list of program names, same way.
Window: how many months does the export cover?
```

A pasted list → write it to `<DIR>/usage-input-tcodes.txt` (Write tool) first. Then (main thread, one Bash call per kind):

```bash
node "<PLUGIN_ROOT>/scripts/graph/import-usage.mjs" --dir "<DIR>" --file "<file>" --system <QA SID> --months <n> [--kind jobs]
```

It keeps only package members, sets every member absent from the file to `false`, records `source` (system, file, date), and prints `{ kind, members, used, notInPackage }`. Exit 2 = no package member in the file → show the message, ask once for another file, else continue without usage. `notInPackage` > 0 is normal (other packages' TCodes) — print the count only. Submitted TCodes + live `GetJobUsage` may be combined; the usage result names each source in its caveats. Resume: an imported side (`source.kind` = `user-file`) is reused like a measured one (≤ 7 days).

## G5 — Build (main thread, one Bash call)

```bash
node "<PLUGIN_ROOT>/scripts/graph/build-package-graph.mjs" --dir "<DIR>" --src "<SRC>" --system <SAP system id> --sap-version <SAPV>
```

It prints one JSON line `{ graph, nodes, edges, unresolved, sourcesMissing, usage? }` and writes `<DIR>/graph.json` (+ `usage-result.json`, `usage.md` when `usage.json` exists). Exit code ≠ 0 → print the stderr line and continue to Step D without a graph (finalize falls back to the scout facts). Do not read the JSON files into the main context. Finalize reads them.

Progress line after G5: `↳ G graph <nodes> nodes · <edges> edges · used <direct>+<indirect> · unused <unused>`.

## What finalize does with it

Spec: [`../../agents/sap-stocker.md`](../../agents/sap-stocker.md) § Dispatch_Modes → `MODE: finalize`. In short:

- `ref_count` per member = incoming edges in `graph.json` from other members, excluding `include` (`graph-query.mjs <graph.json> stats` → `degree[].in`). This replaces `n/a (ECC …)`.
- `inventory.json → objects[].usage` = `direct` / `indirect` / `unused` / `no-evidence` from `usage-result.json`. `inventory.json → usage` = `{ window, counts, caveats }`.
- `index.md` gets a **Usage** section: counts, the window caveats verbatim, and direct + unused lists. `no-evidence` is never called unused.

Resume: `tcodes.json` / `ddic-facts.md` / `usage.json` in `<DIR>` that are ≤ 7 days old are reused (skip G2 / G3 / G4). G5 always reruns — it takes seconds.
