# Dispatch — Step 2 (sap-stocker + sap-checker)

Referenced by `workflow.md` § Step 2. Fires **conditionally** — only when no usable inventory exists for the active profile (missing, cross-view refused / declined, or the user chose Refresh for a stale one). The pass is the shared walk → scout fan-out → finalize flow in [`../analyze-cbo-obj/stocker-fanout.md`](../analyze-cbo-obj/stocker-fanout.md) (Steps A–D); this file only lists what differs for this caller.

## State variables
- `<PACKAGE>` — uppercase Z-package name (e.g., `ZMM_MAIN`)
- `<MODULE>` — module key (`MM`, `SD`, …)
- `<SAPV>` — `sapVersion` from `<CONFIG_JSON>` (drives the ECC branch of the fan-out)
- `<CBO_WRITE_DIR>` — `<ARTIFACT_BASE>/cbo/<MODULE>/<PACKAGE>` (absolute; active profile, never a cross-view directory) — see [`paths-and-state.md`](paths-and-state.md)
- `<STOCK_REASON>` — `missing` / `other-profile inventory not used` / `refresh (scanned <N> days ago)`

## Caller-specific prompt additions

Append to both stocker prompts (`MODE: walk` and `MODE: finalize`) **after the `MODE:` line** — the stocker reads the mode only from the first line:

```
You are invoked by /sc4sap:package-to-process (reason: <STOCK_REASON>).
Treat this as a normal inventory run. Write into <CBO_WRITE_DIR> (active profile).

Constraints (caller-enforced):
- DO NOT call GetTableContents or GetSqlQuery (read-only).
- DO NOT engage the user (caller owns the conversation).
```

Pass `<KEY_PROGRAMS>` = `none` in every prompt (the caller derives entry points in Step 3); checker scouts therefore get `Flagship programs: none` — their `flagship=` value is always `-`.

## Walk reuse (resume support)

Before Step A: `<CBO_WRITE_DIR>/walk.json` exists, its `package` matches, and it is ≤ 7 days old → skip the walk dispatch, print `↳ 2.A walk reused — walk.json <age>`, and take `objects` / `batches` from the file. `scout-facts.md` in the same directory with one `CHECKER … END` block per batch → skip Step C too; partial → re-run Step C for the missing batches only. Details: `stocker-fanout.md` § Step A.

## Sub-progress

Print `↳ 2.A walk`, `↳ 2.C scout <done>/<b> batches` (after each checker message; at most 8 checkers per message), `↳ 2.G graph …` (line format in [`../analyze-cbo-obj/graph-usage.md`](../analyze-cbo-obj/graph-usage.md) § G5), `↳ 2.D finalize` as each sub-phase starts — format in `workflow.md` § Progress Reporting.

## Failure handling

- `BLOCKED: <reason>` from either stocker dispatch → ONE re-dispatch of the same mode with `model: "opus"` and the blocker context (`paths-and-state.md` § Escalation). Still `BLOCKED` → STOP, surface the reason verbatim, ask the user how to proceed. No Step 3 attempted.
- Finalize reports success but `inventory.json` is missing in `<CBO_WRITE_DIR>` → STOP and surface `Stocker reported success but inventory.json not found at <path>`; do not retry silently.
