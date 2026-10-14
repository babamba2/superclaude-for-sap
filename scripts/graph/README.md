# CBO reference graph (P1)

Turns ABAP source already saved on disk into `graph.json`: objects as nodes, typed edges with the source line that proves each one. Deterministic Node script — no LLM, no SAP call, so it gives the same answer on ECC (where `GetWhereUsed` returns 404) and on S/4.

| File | Role |
|---|---|
| `abap-lexer.mjs` | statements, not a parser: drops `*` / `"` comments, lifts literals (`'…'`, `` `…` ``, `|…|`) into placeholders, joins lines up to the period, splits `A: b, c.` chains, keeps each statement's unit-relative start line |
| `extract-edges.mjs` | units → nodes + edges + unresolved + coverage |
| `ddic-edges.mjs` | repository facts as edges: TCodes (GetTransaction / TSTC·TSTCP → TRAN launches PROG or SM30 view), DDIC typing (DD03L / DD04L rows or Step G3 checker FACT lines → TABL/STRU types DTEL types DOMA, customer objects only) |
| `build-package-graph.mjs` | one call for the stocker flow's Step G: member PROG / FUGR folders from the MCP output dir + tcodes / DDIC / usage files in the inventory dir → `graph.json`, `usage-result.json`, `usage.md` |
| `graph-query.mjs` | callers / reach / impact / flow / components / stats / usage over a graph.json |
| `import-usage.mjs` | user-submitted usage from another system (ST03N / SM37 export as .xlsx or text, or a pasted list) → the `tcodes` / `jobs` side of `usage.json`, members only, with `source` |

## graph.json

```json
{ "package": "ZSD_MAIN", "module": "SD", "system": "DEV", "sapVersion": "ECC",
  "builtAt": "…", "extractor": "extract-edges@1",
  "nodes": [{ "id": "PROG:ZX", "type": "PROG", "name": "ZX", "scope": "member", "lines": 812, "srcHash": "…", "units": ["ZX", "ZXTOP"] }],
  "edges": [{ "from": "PROG:ZX", "to": "FUNC:BAPI_X", "kind": "calls", "bapi": true, "count": 2,
              "evidence": [{ "unit": "ZXF01", "line": 120, "text": "CALL FUNCTION 'BAPI_X' …" }] }],
  "unresolved": [{ "from": "PROG:ZX", "kind": "dynamic", "via": "calls", "token": "LV_FM", "count": 1, "evidence": [] }],
  "coverage": { "members": 214, "parsed": 61, "units": 300, "statements": 41000, "skipped": ["PROG:ZY"], "whereUsed": "unavailable (ECC 404)" } }
```

- **id** = `TYPE:NAME`. Types: PROG INCL FUGR FUNC CLAS INTF TABL VIEW STRU DTEL TTYP TRAN DYN.
- **scope**: `member` (in the walk.json member list; parsed units inherit their owner's scope unless the list names includes), `custom` (Z*/Y*/customer namespace), `standard`, `dynamic` (DYN placeholders). Only parsed members have outgoing edges; the rest are leaves.
- **FUNC inside a FUGR**: statements between `FUNCTION` and `ENDFUNCTION` belong to `FUNC:<name>` (`parent` = the FUGR); FORMs and TOP code belong to the FUGR. `reach` follows a FUNC's parent edges and adds the parent node.
- **DDIC node type** is inferred: name in SQL → TABL; `x-comp`, `TABLE OF x`, `INCLUDE STRUCTURE/TYPE x`, `TABLES x` → STRU; plain `TYPE x` → DTEL with `guess: true`. A type given in the member list wins. P2 enrich corrects TABL/VIEW/DDLS and STRU/TTYP/DTEL.
- **Edges** merge per `(from, kind, to)`: `count` = all hits, `evidence` ≤ 5. `confidence: "low"` marks guesses (see below); absent = high. `srcHash` (sha1/16) per unit and owner allows incremental rebuilds.

## Edge kinds and their regex limits

| kind | from statement | notes / limits |
|---|---|---|
| include | `INCLUDE x [IF FOUND]` | from the unit holding it; `INCLUDE <icon>` and commented lines ignored |
| calls | `CALL FUNCTION 'X'` · `PERFORM f IN PROGRAM p` · `PERFORM f(p)` | `bapi`, `destination[]`, `update`, `async`, `background`, `form[]`; local PERFORM → no edge |
| submits | `SUBMIT p` · `SUBMIT (c)` | `andReturn`, `viaSelectionScreen`, `job` |
| starts | `CALL TRANSACTION 'T'` · `LEAVE TO TRANSACTION 'T'` | `skipFirstScreen`, `bdc` (USING) |
| launches | `--tcodes` file (TSTC / GetTransaction) | TRAN → PROG; parameter TCode → VIEW (`VIEWNAME`) or TRAN, with `via` (e.g. SM30), evidence unit `TSTCP` |
| reads | every `FROM` / `JOIN` after `SELECT` (also subqueries, `OPEN CURSOR`, `WITH`) · `IMPORT … FROM DATABASE x(…)` | `FROM @itab` skipped; `FROM (lv)` → dynamic |
| writes | `INSERT x FROM` · `INSERT INTO x VALUES` · `UPDATE x` · `MODIFY x FROM` · `DELETE FROM x` · `DELETE x FROM` · `EXPORT … TO DATABASE` | `ops[]`. Internal tables excluded by: `TABLE` keyword, `INDEX` / `TRANSPORTING` / `WHERE` without FROM, declared data objects (DATA, inline `DATA(x)`, signatures), `->` / `-` / `<fs>`, and LT_/GT_/MT_-style prefixes. A target neither declared nor seen in SQL / TABLES → `confidence: "low"` |
| uses | `TYPE REF TO c` · `NEW c( )` · `c=>` · `CREATE OBJECT … TYPE c` · `INHERITING FROM` · `INTERFACES` · `CATCH cx` · `RAISING cx` | local classes and self skipped; `REF TO` a non-class-looking name → low; `NEW x( )` only for class-looking names |
| types | `TYPE` / `LIKE` / `TABLE OF` / `RANGE OF` / `INCLUDE STRUCTURE` / `TABLES` / `SELECT-OPTIONS … FOR` in declarations only | local TYPES, built-ins, `ABAP_*`, SY/SYST skipped; `LIKE x` only for TABLES names or `x-comp` |
| types (DDIC) | `--ddic` (DD03L / DD04L rows) or `ddic-facts.md` (Step G3) | TABL/STRU → DTEL, DTEL → DOMA; customer names only; evidence unit `DD03L` / `DD04L` |
| dynamic | `CALL FUNCTION lv` · `SUBMIT (lv)` · `CALL TRANSACTION lv` · `FROM (lv)` · `INSERT/UPDATE/MODIFY/DELETE (lv)` · `PERFORM … IN PROGRAM (lv)` · `CREATE OBJECT … TYPE (lv)` | → `DYN:<VIA>:<TOKEN>` node + `unresolved[]`. A token that is a `CONSTANTS … VALUE 'X'` of the same object resolves to X with `confidence: "low"`, `constant: <name>` |

Not caught (by design or regex limit): calls inside macros (`DEFINE`), SQL assembled in strings / `EXEC SQL`, `CALL METHOD (lv)`, `CALL CUSTOMER-FUNCTION`, BAdI / enhancement calls, workflow / RFC metadata, CDS sources, string templates spanning lines, `NEW x( )` for data types, type-pool types (typed as DTEL guesses). Incoming edges from other packages are invisible to source parsing — `coverage.whereUsed` states it.

## CLI

```bash
# from GetProgFullCode output:"file" folders (<prog>.prog/, <grp>.fugr/, loose <x>.clas.abap …)
node scripts/graph/extract-edges.mjs --prog-dir <dir> [--prog-dir <dir2>] --out graph.json \
     --members walk.json --tcodes tcodes.json --system DEV --sap-version ECC
# from an explicit list: [{ "file": "…", "unit": "ZXF01", "object": "PROG:ZX" }] (paths relative to units.json)
node scripts/graph/extract-edges.mjs --units units.json --members "ZX:PROG,ZTAB:TABL" --out graph.json

node scripts/graph/import-usage.mjs --dir <inventory dir> --file st03n-qas.xlsx --system QAS --months 3
node scripts/graph/build-package-graph.mjs --dir <inventory dir> --src <MCP output src> --system DEV --sap-version ECC
node scripts/graph/graph-query.mjs graph.json callers ZSD_LOG --kinds writes
node scripts/graph/graph-query.mjs graph.json reach TRAN:ZSD01 --kinds launches,calls,submits --depth 3
node scripts/graph/graph-query.mjs graph.json impact FUNC:Z_SD_POST
node scripts/graph/graph-query.mjs graph.json flow ZSD_LOG --md
node scripts/graph/graph-query.mjs graph.json components [--entries PROG:ZA,PROG:ZB] --md
node scripts/graph/graph-query.mjs graph.json stats --md
node scripts/graph/graph-query.mjs graph.json usage usage.json --md
```

`--members` takes walk.json (`objects[{name,type}]`, also supplies `package` / `module`), a JSON list, or `NAME:TYPE,…`. Every listed member becomes a node (`unreferenced: true` when no parsed source mentions it). A TCode or parameter ID sharing its name with a program / view does not hide the object. Ids may be bare names (a member wins). JSON on stdout by default; `--md` gives a short table.

- **flow** — writers (with `ops`, confidence) and readers of a table, each with the PROG / TRAN nodes that reach it through launches / include / calls / submits / starts; `sequence` = writer → reader pairs.
- **components** — entry points = TRAN nodes with `launches`, else `--entries`, else root member programs. Two entries join when one reaches the other or one writes a table the other reads / writes. Each component lists entries, members touched, written tables and `sharedTables` (writers → readers); `unreached` = source members no entry reaches.
- **usage** — used-object list from `usage.json` = `{ "tcodes": <GetTcodeUsage result>, "jobs": <GetJobUsage result> }`. `direct` = TCode used in the window (and the program it launches) or program run as a job step; `indirect` = reached from a direct object through launches / include / calls / submits / starts / uses / reads / writes / types, with the shortest path in `via`; `unused` = measured false and not reached; `no-evidence` = neither (FMs, classes, DDIC). TRAN without a program mapping carries `unmapped`. `caveats` states the measured window (ST03N months kept, oldest kept job). Dynamic calls (`CALL TRANSACTION sy-ucomm` menus) are not followed, so opening a menu does not mark every target used.
- **stats** — edges by kind, nodes by scope:type, member in/out degree (`inByKind`), isolated members, unresolved and low-confidence counts, coverage.

## How P2 / P3 consume it

- **P2 — stocker.** Walk stays as is (`walk.json`). Fetch: Haiku checkers save every source member with `GetProgFullCode output:"file"` and return paths only. Extract: this script writes `graph.json` next to `inventory.json` (profile-resolved `cbo/<MODULE>/<PACKAGE>/`). Enrich: TCodes → `--tcodes`, DDIC type fixes for `guess` nodes, S/4 only: `GetWhereUsed` for incoming external edges. Finalize: `ref_count` = `stats.degree[].in` (per kind), flagship boost = `reach` from key programs, role hints from read/write patterns (log table = written only, config = read only). Incremental: re-extract only owners whose `srcHash` changed.
- **P3 — package-to-process.** Entry points = `launches`; process candidates = `components`; step order = `flow` per shared written table (writer → reader = document hand-off, e.g. order → delivery → billing); the analyst receives the component sub-graph plus evidence lines and only names and narrates the process.
- **Later (P4)** — analyze-code §14 = `impact`; create-program reuse = `callers <table> --kinds writes`; compare-programs = reads / writes / calls set differences.

Tests: `tests/validation/graph.test.ts` (synthetic fixtures in `tests/fixtures/graph/`, invented ZGT names; a golden test reads a real program from the local work folder only when it exists and never copies it).
