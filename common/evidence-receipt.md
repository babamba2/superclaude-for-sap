# Evidence Receipt — Done Criteria decided by a script, not by an agent

Companion of [`verification-evidence.md`](verification-evidence.md) (Rule 2). There, the agent writes the Evidence block from the tool results it saw. A receipt takes that job away from the agent: the verdict of each check comes from the MCP responses themselves, recorded by a hook and judged by a script.

Scope today: `create-program` Phase 8. Same cost in `standard` and `eco` — no extra agent; at most one extra `GetInactiveObjects` call.

## How it works

| Part | File | Written by |
|---|---|---|
| Ledger — one line per SAP check or write call. Write lines: time, tool, object names. Check lines add the parsed result and the sha256 of the response | `.sc4sap/evidence/ledger.jsonl` | PostToolUse hook `scripts/evidence/record.mjs` |
| Receipt — PASS / FAIL / NOT RUN per check, overall verdict | `.sc4sap/program/{PROG}/receipt.json` | `scripts/evidence/build-receipt.mjs` |
| Guard — denies Write / Edit / shell writes to both paths | — | PreToolUse hook `scripts/evidence/guard.mjs` |

Calls by sub-agents are recorded too. Reading the ledger or the receipt goes through the Read tool.

## Checks

| Check | PASS | FAIL | NOT RUN |
|---|---|---|---|
| `activation` | every object of the run written via MCP has a successful `ActivateObjects` after its last write | the last activation failed for an object, an object has no activation after its write, or an object changed after its last activation | no activation of the program recorded |
| `inactive` | a `GetInactiveObjects` after the last activation and the last write lists none of the run's objects | own objects still listed | no such call after the last activation / change |
| `unit_test` | the newest ABAP Unit result for the run's containers has > 0 methods and no critical / fatal alert, and no write came after it | a failed method, a failed setup, or code changed after the run | no run, no result, or 0 methods |

"Objects of the run" = names starting with `{PROG}` plus the names passed with `--also` (classes, function groups, tables whose names do not start with `{PROG}`).

Overall verdict: `FAIL` if any check failed; `INCOMPLETE` if any counted check is NOT RUN; else `PASS`. `unit_test` counts only with `--unit-test required` — pass it when spec.md § *9. Done Criteria* lists unit tests.

Syntax: `GetAbapSemanticAnalysis` parses the source text it is given locally. It is not the SAP syntax check, so it is not a receipt check. The SAP syntax check runs inside `ActivateObjects`, so the `activation` check covers it.

## Procedure (main thread)

1. Run `node "<PLUGIN_ROOT>/scripts/evidence/build-receipt.mjs" {PROG} [--also A,B] [--unit-test required]`. It writes the receipt and prints the Evidence lines.
2. Exit code `0` PASS → go on. `1` FAIL → do not report done; go back to the phase that owns the failing check (activation → Phase 4 final step / Phase 7, unit test → Phase 5). `2` INCOMPLETE → if `inactive` is NOT RUN, call `GetInactiveObjects` once and run step 1 again; any check still NOT RUN is reported as NOT RUN.
3. Hand `receipt.json` to the report writer. The writer copies each check's status and result into the Evidence block word for word and may add excerpts. It never upgrades a status. It adds the receipt line `Receipt: <verdict> · .sc4sap/program/{PROG}/receipt.json`.

## What a receipt does not prove

- Business logic, data, or authorization behaviour. Rule 3 of `verification-evidence.md` still applies to each line.
- Writes done outside MCP (SE38 by hand, another tool) are not in the ledger. The ledger only sees this project's MCP calls.
- The guard blocks the easy edit paths, not every path. A script written elsewhere could still change the files. The user's check in the TCode stays the final gate.

Kill switch: `DISABLE_SC4SAP=1` disables the hooks. The receipt then shows NOT RUN, never PASS.
