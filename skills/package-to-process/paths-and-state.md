# package-to-process — Paths, State Checkpoints, Recovery

Referenced by `SKILL.md`, `workflow.md`, `workflow-render.md` and every `dispatch-*.md`. Resolve the values below **once on the main thread** (Step 0 / Step 1) and substitute them as **absolute paths** into every command and every agent prompt. Sub-agents run with the user's project as working directory, so a relative `skills/…`, `common/…`, `configs/…`, `industry/…`, `country/…` or `scripts/…` path breaks there.

## Path variables

| Variable | Resolution |
|---|---|
| `<PLUGIN_ROOT>` | The directory two levels above this skill's `SKILL.md` — take the skill base directory shown when the skill loads (or `$CLAUDE_PLUGIN_ROOT` when set) and go up to the folder that holds `skills/`, `common/`, `configs/`, `scripts/`. Verify once that `<PLUGIN_ROOT>/scripts/spec/build-bpml.mjs` exists; missing → STOP and report the path tried. Use forward slashes; quote it in shell commands. |
| `<PROJECT>` | The workspace root that contains the effective `.sc4sap/` (same walk-up as `scripts/lib/profile-resolve.mjs` → `resolveWorkspaceRoot`). |
| `<ACTIVE_ALIAS>` | Trimmed content of `<PROJECT>/.sc4sap/active-profile.txt`; absent / empty → legacy mode (no alias). |
| `<CONFIG_JSON>` | Multi-profile: `~/.sc4sap/profiles/<ACTIVE_ALIAS>/config.json` (`$SC4SAP_HOME_DIR` overrides `~/.sc4sap`). Legacy: `<PROJECT>/.sc4sap/config.json`. Same rule for `sap.env`. |
| `<ARTIFACT_BASE>` | Multi-profile: `<PROJECT>/.sc4sap/work/<ACTIVE_ALIAS>`. Legacy: `<PROJECT>/.sc4sap` (= `resolveArtifactBase`). |
| `<PROC_DIR>` | `<ARTIFACT_BASE>/processes/<MODULE>/<PACKAGE>` — write path, always the active profile. |
| `<STATE_DIR>` | `<PROC_DIR>/_state` |
| `<INVENTORY_PATH>` | Read path for `cbo/<MODULE>/<PACKAGE>/inventory.json`, resolved below. |
| `<CBO_WRITE_DIR>` | `<ARTIFACT_BASE>/cbo/<MODULE>/<PACKAGE>` — where a (re-)stock writes. |

Rule files named in agent prompts are always written as `<PLUGIN_ROOT>/skills/package-to-process/…`, `<PLUGIN_ROOT>/common/…`, `<PLUGIN_ROOT>/configs/<MODULE>/…`, `<PLUGIN_ROOT>/industry/<INDUSTRY>.md`, `<PLUGIN_ROOT>/country/<COUNTRY>.md` — substituted, never left as placeholders.

## Inventory resolution (multi-profile read path)

Per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Read path, relative path `cbo/<MODULE>/<PACKAGE>/inventory.json`:

1. `<PROJECT>/.sc4sap/work/<ACTIVE_ALIAS>/cbo/…` → own profile, use it.
2. Else the first hit under another `<PROJECT>/.sc4sap/work/<alias>/cbo/…` → **cross-view** (another SAP system's inventory).
3. Else legacy `<PROJECT>/.sc4sap/cbo/…` → use it (legacy projects; in multi-profile mode treat it like cross-view with `from=legacy`).
4. Else missing → Step 2 stocking writes to `<CBO_WRITE_DIR>`.

Cross-view handling — never load it silently:
- **Refuse** when its `sap_version` differs from `<CONFIG_JSON>` → `sapVersion`: print `ℹ inventory at <path> belongs to profile <alias> (<its sap_version>) — not usable for <ACTIVE_ALIAS> (<sapVersion>); re-stocking.` and run Step 2 Branch B.
- Otherwise warn `ℹ from=<alias> (readonly cross-view)` and ask (2 options): `Re-stock for <ACTIVE_ALIAS> (Recommended)` / `Use the <alias> inventory read-only`. Read-only use never writes into that directory.

## State checkpoints (`<STATE_DIR>`)

The main thread writes each file right after its step completes (Write tool; create the directory). Every file carries `"schema": 1` and `"saved_at": "<ISO-8601>"`.

| File | Written after | Content |
|---|---|---|
| `intake.json` | Step 1, updated after Step 2 | `{package, module, sapVersion, abapRelease, industry, country, activeModules, language, formats, inventory: {path, from, scanned_at}}` (`inventory` added after Step 2) |
| `entry_points.json` | Step 3 | `{entry_points: [{prog, tcodes[], short_text}]}` |
| `step4.json` | Step 4 | analyst JSON `{processes[], residue[], open_questions[]}` + `"approved": false` → user edits applied with Edit → `"approved": true` |
| `step5.part-<k>.json` | Step 5, per analyst dispatch | that dispatch's JSON, verbatim (schema in `dispatch-analyst.md` § Step 5) |
| `step5.json` | Step 5, after all parts | manifest `{parts: ["step5.part-1.json", …], failed_processes: [{label, reason}]}` |

**Analyst JSON is written exactly once.** The analyst cannot write files (no Write tool), so the main thread copies its fenced JSON block into the state file once and from then on passes only the path. Never re-inline that JSON into another prompt or reprint it to the user — summarize it (labels, counts) instead.

`<PLUGIN_ROOT>` is NOT stored — it is re-resolved on every run (the plugin version may change between runs).

## Resume

Right after the package is verified (Step 1.4), Glob `<ARTIFACT_BASE>/processes/*/<PACKAGE>/_state/intake.json`. When found, read the module from it, find the latest completed checkpoint, and ask once (2 options):

| Last valid checkpoint | Resume from |
|---|---|
| `intake.json` without `inventory` | Step 2 |
| `intake.json` with `inventory` (path still exists) | Step 3 |
| `entry_points.json` | Step 4 |
| `step4.json` with `approved: true` | Step 5 |
| `step5.json` | Step 6 |

Options: `Resume from Step <N> (saved <age>) (Recommended)` / `Start over`. A file is valid only when it parses and every earlier checkpoint is valid. Recommend Start over instead when the inventory's `scanned_at` is newer than `step4.json` → `saved_at` (the groups were built on an older inventory). Start over → delete the four named files and the `step5.part-*.json` files listed in `step5.json` (by explicit name, never a shell glob), then run Step 1 normally. Resume → load `intake.json` into state, print the skipped Steps' progress lines with `(resumed — <file>)`, and continue.

A recent `walk.json` (≤ 7 days, same package) in `<CBO_WRITE_DIR>` also lets Step 2 skip the stocker walk — see [`../analyze-cbo-obj/stocker-fanout.md`](../analyze-cbo-obj/stocker-fanout.md) § Step A.

## Escalation + partial failure

Per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Escalation pattern:

| Source of `BLOCKED` | Action |
|---|---|
| `sap-stocker` (walk or finalize) | Re-dispatch the same `MODE:` prompt ONCE with `model: "opus"`, appending `Previous attempt (Sonnet) returned: BLOCKED — <reason>. Continue from there.` Banner: `▶ phase=<id> (escalated) · agent=sap-stocker · model=Opus`. Still `BLOCKED` → STOP and ask the user. |
| `sap-writer` (6 or 6b) | Same: one re-dispatch with `model: "opus"` + the blocker context; files already written stay and are overwritten. Still `BLOCKED` → STOP and ask. |
| `sap-analyst` (4 or 5) | No escalation (already Opus) — STOP and ask the user. Exception: a Step 5 split dispatch fails alone → partial-failure rule below. |
| `sap-checker` scout batch | `stocker-fanout.md` § Step C (split + retry once, then `## Unscanned`). |

Step 5 partial failure (split mode only): a part that returns `BLOCKED` or fails the schema retry → record its processes in `step5.json → failed_processes` with the reason, continue with the other parts. The writer lists them under Open Questions (`Narrative not generated for "<label>": <reason>`); they get no process section and no BPML rows, and `process_count` counts only narrated processes. All parts failed → STOP and ask.
