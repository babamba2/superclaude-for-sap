# CBO Relation Map — collecting a graph

Read when Step 1 of [`SKILL.md`](SKILL.md) finds no `graph.json`, the user asks for a refresh, or the user asks for the **used TCodes only** scope. Everything here is read-only on SAP. `<AB>` = the active profile's artifact base, `<MODULE>` = the package's module (ask once if unknown), `<SID>` = the connected system, `<SAPV>` = `ECC` or `S4` from the profile `config.json`.

Before the first dispatch: invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:cbo-relation-map` (skip when `.sc4sap/session-trust.log` has a line from the last 24 h). Resolve the cost mode per [`../../common/cost-mode.md`](../../common/cost-mode.md); in eco invoke `Skill("sc4sap:eco", "--attach")` first and on every continuation turn, and pass both `model` and `effort` on every `Agent(...)` call. One banner per dispatch: `▶ phase=<id> · agent=<name>×<n> · model=<Opus|Sonnet|Haiku>`.

## Which scope — ask once (2 options, one `AskUserQuestion` round together with any other open question)

- **Whole package** — every member of the package: DDIC relations of all tables / structures / data elements, and code relations of every program and function group.
- **Used TCodes only** (Recommended for large packages, > 2,000 objects) — only the TCodes users run (productive ST03N), their programs and SM30 views. Code relations of what is really used; DDIC relations come from the whole-package graph when it exists.

## A. Whole package

| Cost mode | What runs |
|---|---|
| standard | `/sc4sap:analyze-cbo-obj <PACKAGE>` in full (walk, scouts, Step G, finalize). Its `inventory.json` adds descriptions, roles and purpose to the map. Then back to SKILL.md Step 2. |
| eco | **Map-only collection**: the steps below — no Step C scouts, no Step D finalize, so no inventory and no purpose inference. Same graph as standard (same Step G). |

Eco map-only collection:

1. **Walk** — `sap-stocker`, `MODE: walk` as in [`../analyze-cbo-obj/stocker-fanout.md`](../analyze-cbo-obj/stocker-fanout.md) § Step A, dispatched with `model: "haiku"`, `effort: "low"`. A `walk.json` of the same package ≤ 7 days old → reuse it, no dispatch. `BLOCKED` → re-dispatch once on Sonnet (cost-mode § lever A escalation).
2. **Step G** — [`../analyze-cbo-obj/graph-usage.md`](../analyze-cbo-obj/graph-usage.md) G1 → G2 → G3a (G3b for its gaps) → G4 → G5 for `<DIR>` = the walk's folder, unchanged. G3a slices: keep the planned 60 statements per `sap-checker` (smaller slices cost more — note at the end). Sources already in the MCP output folder (`<AB>/mcp-output/src/<name>.prog|.fugr/`) are not fetched again: drop those objects from the G1 scope. G1 scope = `PROG/P` and `FUGR` only (walk `PROG/I` entries are includes, read through their owner); 20 objects per checker (fewer checkers, lower fixed cost). A FUGR whose `GetProgFullCode` answer exceeds the tool-result limit reports `ERROR … exceeds maximum allowed tokens` although the files were written — check the folder before treating it as missing.
3. Print `↳ collected <nodes> nodes · <edges> edges · sources <parsed>/<programs> · DDIC reads <ok>/<n>` and continue with SKILL.md Step 2.

## B. Used TCodes only

`<UDIR>` = `<AB>/cbo/<MODULE>/<PACKAGE>.used`. Rebuilt on request or when its `usage.json → measuredAt` is older than 30 days; otherwise reused (`↳ used scope reused — measured <date>`).

1. **Inputs, reused first** — `<AB>/cbo/<MODULE>/_USED/` of `/sc4sap:module-to-process` holds `tcodes-all.json`, `used-*.txt`, `tran.json` and `usage.json` for the whole module: when it is ≤ 30 days old and its `scope.json → packages` lists `<PACKAGE>`, take those files (no SAP call). A saved usage list `<AB>/usage/tcode-usage-<SID>-<date>.json` covers `used-1.txt` the same way. Otherwise collect them exactly as [`../module-to-process/workflow.md`](../module-to-process/workflow.md) § Step 2 items 1–5 (TCodes in scope, where to measure incl. the G4u question, usage, programs, batch programs), writing into `<UDIR>`.
2. **Scope** (one Bash call):
   `node "<PLUGIN_ROOT>/scripts/process/usage-scope.mjs" --all <tcodes-all.json> --used <used-1.txt> [--used …] --tran <tran.json> [--jobs <jobs.txt>] --packages <PACKAGE> --module <MODULE> --months 12 --coverage <c> --system <measured SID> --destination <RFC> --out-dir "<UDIR>"`
   Then set `<UDIR>/walk.json → package` to `<PACKAGE>` (usage-scope writes `_USED`), so the map labels the objects with their package.
3. **Sources** — G1 of graph-usage.md for the PROG / FUGR of `<UDIR>/walk.json` whose source folder is not yet under `<AB>/mcp-output/src/` (10 per `sap-checker`, ≤ 8 per message; eco: `model: "haiku"`, `effort: "low"` — the checker's own model). All present → no dispatch.
4. **Build** — `node "<PLUGIN_ROOT>/scripts/graph/build-package-graph.mjs" --dir "<UDIR>" --src "<AB>/mcp-output/src" --system <SID> --sap-version <SAPV>`. It writes `graph.json` and `usage-result.json` (used / unused per object).
5. **Map** — SKILL.md Step 3 with `--dir <AB>/cbo/<MODULE>/<PACKAGE>` (when that whole-package graph exists — it brings the DDIC relations) **and** `--dir "<UDIR>"`. The two graphs of one package merge into one; the page counts them as one package.

## Note — measured eco run (2026-11-06, a customer ECC 7.40 package of about 8,000 objects)

Walk on Haiku 58k tokens · G1 358 sources by 18 checkers 1.12M · G3a 205 statements by 4 checkers 535k · G2 345 TCodes on the main thread (4 calls) · usage reused from a saved productive usage list. Result: 7,928 objects, 19,428 relations, 205 / 205 DDIC reads. 13 FUGR answers overflowed the tool-result limit; all folders were on disk.

## Note — G3a slice size (measured 2026-11-06, plan entries 1–120 of a large customer ECC package)

60 statements per checker: 2 checkers, 239k tokens. 30 per checker: 4 checkers, 311k tokens (+30 %). Each checker starts with a fixed context (agent prompt + tool definitions), so more, smaller slices cost more; keep 60. One 30-slice checker ran 2 statements past its range — harmless for DD reads (the collector matches by SQL text), but it is why slices are given as explicit entry ranges.
