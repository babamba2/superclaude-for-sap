# module-to-process — Paths, State Checkpoints, Recovery

Referenced by `SKILL.md`, both workflow files and both dispatch files. Resolve the values below **once on the main thread** (Step 0 / Step 1) and substitute them as **absolute paths** into every command and agent prompt — sub-agents run with the user's project as working directory, so a relative `skills/…` or `scripts/…` path breaks there.

## Path variables

| Variable | Resolution |
|---|---|
| `<PLUGIN_ROOT>` | Two levels above this skill's `SKILL.md` (or `$CLAUDE_PLUGIN_ROOT`). Verify once that `<PLUGIN_ROOT>/scripts/process/build-process-doc.mjs` exists; missing → STOP and report the path tried. Forward slashes; quote in shell commands. |
| `<PROJECT>` | Workspace root holding the effective `.sc4sap/` (`scripts/lib/profile-resolve.mjs` → `resolveWorkspaceRoot`). |
| `<ACTIVE_ALIAS>` | Trimmed `<PROJECT>/.sc4sap/active-profile.txt`; absent → legacy mode. |
| `<CONFIG_JSON>` | Multi-profile `~/.sc4sap/profiles/<ACTIVE_ALIAS>/config.json` (`$SC4SAP_HOME_DIR` overrides `~/.sc4sap`); legacy `<PROJECT>/.sc4sap/config.json`. Same rule for `sap.env`. |
| `<ARTIFACT_BASE>` | Multi-profile `<PROJECT>/.sc4sap/work/<ACTIVE_ALIAS>`; legacy `<PROJECT>/.sc4sap`. |
| `<MODULE>` | Uppercase key of the scope: the module (`MM`) or the area name the user chose (`SCM`) when several modules are in scope. |
| `<PROC_DIR>` | `<ARTIFACT_BASE>/processes/<MODULE>` |
| `<STATE_DIR>` | `<PROC_DIR>/_state` |
| `<SCOPE_DIR>` | `<ARTIFACT_BASE>/cbo/<MODULE>/_USED` — usage-first scope + graph (see § Scope directory). |

Rule files named in prompts are always `<PLUGIN_ROOT>/skills/module-to-process/…`, `<PLUGIN_ROOT>/configs/<M>/…`, `<PLUGIN_ROOT>/common/…`, `<PLUGIN_ROOT>/industry/<INDUSTRY>.md`, `<PLUGIN_ROOT>/country/<COUNTRY>.md` — substituted, never left as placeholders.

## Scope directory

`<SCOPE_DIR>` = `<ARTIFACT_BASE>/cbo/<MODULE>/_USED` holds the usage-first scope of Step 2 (`tcodes-all.json`, `used-<k>.txt`, `tran.json`, `jobs.txt`, `walk.json`, `tcodes.json`, `usage.json`, `scope.json`) and the graph built from it (`graph.json`, `usage-result.json`). It is rebuilt when the user asks for a refresh or the usage is older than 30 days (`usage.json → measuredAt`); otherwise reused (`↳ 2 scope reused — measured <date>`). Per-package inventories of `analyze-cbo-obj` are read-only context when they exist (resolution per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Read path); this skill never stocks whole packages.

## State checkpoints (`<STATE_DIR>`)

The main thread writes each file right after its step (Write tool). Every file carries `"schema": 1` and `"saved_at": "<ISO-8601>"`.

| File | After | Content |
|---|---|---|
| `intake.json` | Step 1 | `{module, modules[], packages[], tcodes[], lanes[], ownerMap[], language, sapVersion, abapRelease, industry, country, activeModules}` |
| `packages.json` | Step 2 | `{scope, graph, usage, scopeSummary, inventories?}` (paths in `<SCOPE_DIR>`) |
| `attach.json` | Step 3 | `backbone.mjs` output (entries, candidates, byTask, unmatched) + `"confirmed": true` after the entry-point gate |
| `step4.json` | Step 4 | analyst hierarchy JSON + `"approved": false` → `true` after the user gate |
| `step5.part-<k>.json` | Step 5 | one analyst part, verbatim |
| `step5.json` | Step 5 | manifest `{parts[], failed_tasks: [{code, reason}]}` |
| `step6.<MODULE>.json` | Step 6 | one consultant review per module in scope |
| `step5-brief.md` | Step 5 | shared brief of the task-sheet parts |
| `process-model.json` | Step 7 | the model (`assemble-model.mjs`) |

**Analyst / consultant JSON is written exactly once** — they have no Write tool; the main thread copies the fenced JSON block into the state file and from then on passes only the path. Never re-inline it into another prompt; summarize (labels, counts) for the user.

## Resume

After intake (Step 1), when `<STATE_DIR>/intake.json` exists with the same package set, find the latest valid checkpoint (it parses and every earlier one is valid) and ask once: `Resume from Step <N> (saved <age>) (Recommended)` / `Start over`.

| Last valid | Resume at |
|---|---|
| `intake.json` | Step 2 |
| `packages.json` | Step 3 |
| `attach.json` with `confirmed: true` | Step 4 |
| `step4.json` with `approved: true` | Step 5 |
| `step5.json` | Step 6 |
| every `step6.<M>.json` of the scope, or `intake.json → review = "skipped"` | Step 7 |
| `process-model.json` | Step 8 |

Recommend Start over when `<SCOPE_DIR>/graph.json` is newer than `step4.json` → `saved_at`. Start over deletes the named files above by explicit name (never a shell glob) and the `step5.part-*.json` files listed in `step5.json`.

## Escalation + partial failure

| `BLOCKED` from | Action |
|---|---|
| `sap-checker` source batch | Split + retry once ([`../analyze-cbo-obj/stocker-fanout.md`](../analyze-cbo-obj/stocker-fanout.md) § Step C); objects still missing are listed under open questions (`Source not read: <names>`). |
| `sap-analyst` Step 4 | STOP and ask (already Opus). |
| `sap-analyst` Step 5 part | That part's tasks go to `step5.json → failed_tasks`; continue. All parts failed → STOP and ask. |
| consultant Step 6 | Continue without that module's review; note it under open questions. |

A failed task keeps its BPH row; its task sheet carries only the header and a to-be-confirmed line `Task sheet not generated: <reason>`.
