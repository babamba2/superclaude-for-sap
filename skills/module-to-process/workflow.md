# module-to-process — Workflow (Steps 0–4)

Referenced by `SKILL.md`. Steps 5–9 continue in [`workflow-build.md`](workflow-build.md). Path variables, checkpoints, resume and escalation: [`paths-and-state.md`](paths-and-state.md).

## Progress Reporting

| Step | Label | Bar | % |
|---|---|---|---|
| 0 | `trust-session bootstrap` | `[░░░░░░░░░░░░░░░░░░░░]` | 0% |
| 1 | `Intake (module + packages + lanes)` | `[██░░░░░░░░░░░░░░░░░░]` | 11% |
| 2 | `Usage scope + graph (used TCodes only)` | `[████░░░░░░░░░░░░░░░░]` | 22% |
| 3 | `Backbone attach` | `[██████░░░░░░░░░░░░░░]` | 33% |
| 4 | `Process hierarchy (sap-analyst, Opus)` | `[████████░░░░░░░░░░░░]` | 44% |
| 5 | `Task sheets (sap-analyst, Opus)` | `[███████████░░░░░░░░░]` | 55% |
| 6 | `Consultant review (optional)` | `[█████████████░░░░░░░]` | 66% |
| 7 | `Assemble model` | `[███████████████░░░░░]` | 77% |
| 8 | `Build HTML` | `[█████████████████░░░]` | 88% |
| 9 | `Validation + handoff` | `[████████████████████]` | 100% |

Sub-progress lines (indented, no bar): `↳ 2 scope …`, `↳ 2.G1 sources <done>/<b>`, `↳ 2.G graph <nodes> nodes · <edges> edges`, `↳ 5 task sheets <k>/<n> parts`, `↳ 6 review <MODULE> done`.

## Step 0 — trust-session

Per `SKILL.md` § Session_Trust_Bootstrap. Resolve `<PLUGIN_ROOT>`, `<PROJECT>`, `<ACTIVE_ALIAS>`, `<CONFIG_JSON>`, `<ARTIFACT_BASE>` once.

## Step 1 — Intake

`AskUserQuestion` takes 2–4 options per question (Other is added automatically) — never a longer list.

1. **Module / area** — from `ARGUMENTS` or ask. One module key validated against the `<PLUGIN_ROOT>/configs/` folder list, or several (`SD,MM,LE`) plus an area name for `<MODULE>` (ask once: `Use "<M1>-<M2>" (Recommended)` / free name). A module without `configs/<M>/process-backbone.json` → say so once: its tasks are built from the CBO objects only (no standard backbone).
2. **Packages** — from `ARGUMENTS` or ask: "Which packages carry this module's custom development? Names or prefixes (`ZMM*`), comma-separated." Prefix → `SearchObject(objectType='DEVC', query=<prefix>)` → numbered table (`# · Package · Description`) → the user answers with numbers / names / `all`. Verify each with `GetPackage`; a miss → report it and re-ask once. At least one package or one Z TCode is required.
3. **Loose Z TCodes** (optional, when the user names them): Z TCodes outside the packages. Step 2 appends them to `tcodes-all.json` with `packageName: "_LOOSE"` and adds `_LOOSE` to `--packages`; they pass the same usage check as every other TCode.
4. **Lanes / owners** (optional) — ONE question (2 options): `Estimate from the programs (Recommended)` / `I will give the organisations` — the second takes free text such as `Requester; Buyer = ME51N, ZXX001; Finance = MIRO`. Parse into `lanes[]` (`id` = short ASCII slug, `label` as typed) and `ownerMap[]` (`{lane, objects[]}`).
5. **Existing BPH / BPML** (optional) — ONE question (2 options): `No BPH — build from the system (Recommended)` / `I have a BPH workbook` (path to an .xlsx). Given → `node "<PLUGIN_ROOT>/scripts/process/bph-import.mjs" read "<file>" --out "<STATE_DIR>/bph-skeleton.json"` and relay its sheet / L4 counts; several sheets → ask which one is this module (default: the sheet named like `<MODULE>`). Store `intake.json → bph = {file, sheet}`. The workbook is the customer's: its IDs may appear in this customer's page, never in plugin files.
6. **Language** — ONE question: `Korean (ko)` / `English (en)` / `Japanese (ja)`, conversation language first and `(Recommended)`. Other → only ko / en / ja are supported, re-ask once.
7. Load context (no dispatch): `<CONFIG_JSON>` → `sapVersion`, `abapRelease`, `industry`, `country`; `sap.env` → `SAP_ACTIVE_MODULES`. Industry / country unset → ask once.
8. Resume check per `paths-and-state.md` § Resume.
9. Write `<STATE_DIR>/intake.json`.

## Step 2 — Usage scope + graph (used TCodes only)

**Only TCodes users actually run are analysed.** Unused TCodes and their programs are never fetched; the page lists them only as a count per package. `<SCOPE_DIR>` = `<ARTIFACT_BASE>/cbo/<MODULE>/_USED`.

1. **TCodes in scope** — `SearchObject(objectType='TRAN', query='<prefix>*', maxResults=5000)` per package prefix (one call when the packages share a prefix). A result too large for the context is saved to a file by the harness — use that file; otherwise Write the `results` array to `<SCOPE_DIR>/tcodes-all.json`.
2. **Where to measure** — a saved usage list from an earlier run (`<ARTIFACT_BASE>/usage/tcode-usage-<SID>-<date>.json`, written by `usage-scope.mjs --save-usage`) → offer it first (`Use the saved usage of <date> (Recommended)` / `Measure again`); its `used[]` becomes `used-1.txt`. Otherwise per [`../analyze-cbo-obj/graph-usage.md`](../analyze-cbo-obj/graph-usage.md) § G4u: `SAP_USAGE_RFCDEST` set → that destination (PRD / QA); DEV profile without it → the G4u question (RFC / submitted ST03N file / this system / skip). Skip is not offered here: without usage the skill cannot scope — say so and stop if the user refuses every source.
3. **Usage** — `GetTcodeUsage` (months 12) in batches of ≤ 320 TCodes of the in-scope packages. After each call Write only its `used[]` to `<SCOPE_DIR>/used-<k>.txt` (space-separated) — never the whole response. Note `coverage` and `system` once. A submitted file instead → `import-usage.mjs` per G4u, then take its used names.
4. **Programs** — `GetTransaction` with `transaction_names` in batches of **≤ 100** (longer lists exceed the URL limit) for the used TCodes only. Write `<SCOPE_DIR>/tran.json` = `[{tcode, kind, program}]` / `[{tcode, kind: "parameter", parameters: {VIEWNAME}}]` (drop `screen` and other fields).
5. **Batch programs** (optional) — ask once (2 options): `Add programs that run as background jobs (Recommended)` / `Dialog TCodes only`. Yes → the user pastes an SM37 program list of the measured system (or `GetJobUsage` on the connected system when it is that system) → `<SCOPE_DIR>/jobs.txt`.
6. **Scope** (one Bash call):
   `node "<PLUGIN_ROOT>/scripts/process/usage-scope.mjs" --all "<SCOPE_DIR>/tcodes-all.json" --used "<SCOPE_DIR>/used-1.txt" … --tran "<SCOPE_DIR>/tran.json" [--jobs "<SCOPE_DIR>/jobs.txt"] --packages <P1,P2,…> --module <MODULE> --months 12 --coverage <c> --system <SID> --destination <RFC> --out-dir "<SCOPE_DIR>"`
   It writes `walk.json` (members = used TRAN + their programs + SM30 views), `tcodes.json`, `usage.json`, `scope.json`. Print `↳ 2 scope <used>/<inScope> TCodes used · <programs> programs · <views> SM30 views · window <coverage>/<months> months on <SID>`.
7. **Graph** — run [`../analyze-cbo-obj/graph-usage.md`](../analyze-cbo-obj/graph-usage.md) G1 (sources, 10 programs per `sap-checker`, ≤ 8 checkers per message), G3 (DDIC of the customer tables the sources name), G5 (build) for `<SCOPE_DIR>`; G2 and G4 are already done by step 6. Then one more round for **called customer FMs / classes**: `graph-query.mjs <graph> stats` → custom FUNC / CLAS leaves → their FUGR / CLAS sources via G1 → add them to `walk.json` → G5 again.
8. Write `<STATE_DIR>/packages.json` = `{scope: "<SCOPE_DIR>", graph: "<SCOPE_DIR>/graph.json", usage: "<SCOPE_DIR>/usage-result.json", scopeSummary: "<SCOPE_DIR>/scope.json"}`. Per-package inventories (`analyze-cbo-obj`) are optional context: when they exist, list their paths under `inventories` for the analyst.

## Step 3 — Backbone attach (main thread)

1. `node "<PLUGIN_ROOT>/scripts/process/backbone.mjs" "<PLUGIN_ROOT>" --modules <M1,M2> --graph "<SCOPE_DIR>/graph.json" --lang <lang> --out "<STATE_DIR>/attach.json"` — entries are the used TCodes only (the graph holds nothing else). Several existing package graphs instead of `_USED` → merge them first with `merge-graphs.mjs` and drop unused TRAN entries with the usage result.
2. Entry-point gate — print counts (`entries · with a backbone proposal · unmatched`) and the 20 entries with the highest score as a table (`# · TCode · Program · Package · Best task (score)`), then ask (2 options): `Continue with all (Recommended)` / `Edit list` — free text `drop ZXX0100 · add ZXX0200`. Dropped entries go to `attach.json → excluded[]`; an added TCode must be used (check it with `GetTcodeUsage`) and goes through step 2.4–2.7. Set `"confirmed": true`.

## Step 4 — Process hierarchy (sap-analyst, Opus)

1. Banner `▶ phase=4.hierarchy · agent=sap-analyst · model=Opus`; dispatch per [`dispatch-analyst.md`](dispatch-analyst.md) § Step 4.
2. Write the returned JSON once to `<STATE_DIR>/step4.json` with `"approved": false`.
3. Present the hierarchy — numbered L2 table (`# · L2 · L3 count · L4 count · CBO · Std · New (not in backbone)`) and, below it, every L4 that is **new** or has **variants** (`Code · Task · Objects · Variants`). Ask (2 options): `Accept (Recommended)` / `Edit` — free text: `rename 1.2.3: <label>`, `move ZXX010 to 1.2.3.1`, `merge 1.3.1+1.3.2`, `drop 1.4.2`, `add variant 1.2.3.1: <label>`.
4. Apply edits to `step4.json` with Edit (no re-dispatch), reprint, ask again; at most 3 rounds, then ask whether to continue with the current hierarchy. On accept set `"approved": true`.

Continue with Step 5 in [`workflow-build.md`](workflow-build.md).
