# CBO Stocking — Walk, Haiku Scout Fan-out, Finalize

Shared by [`workflow-steps.md`](workflow-steps.md) (analyze-cbo-obj Step 3–7) and [`../package-to-process/dispatch-stocker.md`](../package-to-process/dispatch-stocker.md). The per-object `GetWhereUsed` graph — one call per package object — moves from one Sonnet stocker working serially to Haiku `sap-checker` workers running in parallel. The stocker keeps every judgment: tiering, business purpose, cross-module gaps, sensitive names, persistence. Model rationale: [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Tier 3 and § Checker fan-out in other skills.

`<DIR>` = the **absolute** directory of the `path=` in the stocker's `WALKED` line. The stocker resolves it per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md), so it may be under `.sc4sap/work/<alias>/cbo/…` rather than `.sc4sap/cbo/…` — never rebuild it by hand.

`<SAPV>` = `sapVersion` from the active profile's `config.json` (`~/.sc4sap/profiles/<alias>/config.json`, legacy `.sc4sap/config.json`), read by the main thread before Step A. **ECC mode** (`<SAPV>` = `ECC`): `GetWhereUsed` returns ADT 404 for programs and tables on ECC, so no dispatch in this flow calls it — scouts write `callers` as `n/a (ECC — where-used unavailable)` and finalize scores from the source / DDIC reference graph built in Step G.

## Step A — Walk (`sc4sap:sap-stocker`, `MODE: walk`)

Banner: `▶ phase=walk (stocker) · agent=sap-stocker · model=Sonnet`. The `MODE:` line must be the prompt's first line; caller-specific text goes after it.

```
MODE: walk
Package <PACKAGE> (module <MODULE>, SAP version <SAPV>). Flagship programs: <KEY_PROGRAMS or "none">.
Run Investigation_Protocol steps 1–2 only, write walk.json, return the WALKED line.
```

The stocker returns one line: `WALKED objects=<n> batches=<b> path=<absolute path of walk.json>`. `BLOCKED: <reason>` → re-dispatch once with `model: "opus"` and the blocker context ([`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Escalation pattern); still blocked → surface and stop.

**Walk reuse (optional, caller-enabled):** when the active-profile inventory directory already holds a `walk.json` for the same package that is ≤ 7 days old, the caller may skip this dispatch and take `objects` / `batches` from that file (`<DIR>` = its directory). A `scout-facts.md` there with one `CHECKER … END` block per batch also skips Step C; a partial one → run Step C for the missing batches only and append.

## Step B — Gate

- `objects < 30` → skip Step C. Dispatch Step D without a facts file; the stocker runs step 3 (graph) itself as before (ECC mode: no graph — see Step D).
- `objects ≥ 30` → main reads `walk.json → batches[]` (`NAME:TYPE` strings only) and runs Step C.

## Step C — Scout fan-out (`sc4sap:sap-checker` × `batches`, `MODE: scout`)

One checker per batch (20 objects each; the stocker widens batches so there are at most 16). **At most 8 checkers per message** (one ADT session serves them all): batches 1–8 in the first message, the rest in a second message after the first returns. Banner per message: `▶ phase=scout · agent=sap-checker×<n> · model=Haiku`.

```
MODE: scout
Objects (your whole scope): <NAME:TYPE, NAME:TYPE, …>          ← main inlines the batch
Package member list: <DIR>/walk.json → objects[]  (Read it; use it ONLY to filter callers — every object
  in your scope is a package member: fetch all of them, never drop one as "not in package")
Flagship programs: <KEY_PROGRAMS or "none">
For each object return:
- key="callers" value="in_pkg=<n> names=<up to 10 in-package caller names> flagship=<flagship names or ->"
  — GetWhereUsed once. Compute flagship= from the full caller list FIRST, then keep only callers whose
    name is in objects[] for in_pkg / names.
  — DTEL / DOMA: no callers line and no GetWhereUsed (their where-used lists are huge and add no signal).
  — ECC mode: the main thread replaces this whole bullet with:
    key="callers" value="n/a (ECC — where-used unavailable)" for every object — do NOT call GetWhereUsed.
- key="ddic" value="<short text + key fields (TABL / VIEW) | component count (STRU / TTYP) |
  domain + length (DTEL / DOMA) | FM list (FUGR) | first method or signature head (CLAS / INTF / FUNC) | title (PROG)>"
  — the matching Get* tool; object types you have no tool for (DDLS, BDEF, SRVD, SRVB, …) → value="-".
  — INCL / TRAN / PARA (and any other type not listed above) → value="-" without a fetch; never read include source.
- key="lines" value="<n>" — flagship PROG only: GetProgFullCode with output: "file", count from the outline.
  No lines fact for any other object.
```

Main writes every `CHECKER … END` block unchanged to `<DIR>/scout-facts.md`. A `BLOCKED` batch → split its inline list in two and re-dispatch once; still blocked → list those names under `## Unscanned` at the end of the file.

## Step G — Reference graph + usage

Runs on every package after Step C (or after the gate when Step C is skipped). It fetches the sources, then collects TCode mapping, DDIC typing and, on ECC, TCode / job usage, and builds `<DIR>/graph.json` (+ `usage-result.json`). Spec: [`graph-usage.md`](graph-usage.md). A failure in any sub-step degrades to fewer edges, never a stop.

## Step D — Finalize (`sc4sap:sap-stocker`, `MODE: finalize`)

Banner: `▶ phase=finalize (stocker) · agent=sap-stocker · model=Sonnet`.

```
MODE: finalize
Package <PACKAGE> (module <MODULE>, SAP version <SAPV>). Flagship programs: <KEY_PROGRAMS or "none">.
Plugin root: <PLUGIN_ROOT>
Inputs: <DIR>/walk.json, <DIR>/scout-facts.md (absent when the gate skipped Step C),
  <DIR>/graph.json and <DIR>/usage-result.json (each absent when Step G could not build it).
Run Investigation_Protocol steps 3–8.
```

How the stocker uses the facts is defined in [`../../agents/sap-stocker.md`](../../agents/sap-stocker.md) § Dispatch_Modes: the graph (step 3) comes from the `callers` facts; step 5 still reads DDIC itself for the pinned and frequently-used objects (keys, check tables for `fk_to_standard`); Logic-heavy PROG sizes come from `lines` facts or its own read. Objects that have no `callers` fact by design (DTEL / DOMA) or carry `n/a (ECC …)` are NOT re-queried with `GetWhereUsed` — only names under `## Unscanned` are. In ECC mode finalize never calls `GetWhereUsed` (also when the gate skipped Step C): it ranks from `graph.json` (in-package incoming edges) + flagship pins, or — without a graph — by flagship pins + DDIC signals, and states which at the top of `index.md`.

`BLOCKED` from finalize → same one-time Opus re-dispatch as Step A.

The success block (with `Logic-heavy:`) is unchanged, so the hand-off steps of both callers work as before. `walk.json`, `scout-facts.md` and the Step G files stay in `<DIR>` as raw artifacts.

## walk.json shape

```json
{
  "package": "ZSD_MAIN",
  "module": "SD",
  "key_programs": ["ZSDR_ORDER_ALV"],
  "objects": [{ "name": "ZSD_ORDER_LOG", "type": "TABL" }],
  "batches": [["ZSD_ORDER_LOG:TABL", "ZSD_ORDER_S01:STRU"]]
}
```
