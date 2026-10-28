# module-to-process — Workflow (Steps 5–9)

Continues [`workflow.md`](workflow.md). Path variables, checkpoints and escalation: [`paths-and-state.md`](paths-and-state.md).

## Step 5 — Task sheets (sap-analyst, Opus)

1. Print the Step 5 line. Tasks = L4 rows of `step4.json` (approved) with kind `cbo`, `enh` or `ext`. None → skip with `(skipped — no CBO / enhancement / external tasks)`.
2. Write `<STATE_DIR>/step5-brief.md` from the template in [`dispatch-analyst.md`](dispatch-analyst.md) § Step 5.
3. Split into parts of ≤ 8 tasks in document order; dispatch ALL parts in ONE message (two-line prompts pointing at the brief). Print `↳ 5 task sheets <k>/<n> parts` as parts return — relay each part's one-line summary, not its findings in full.
4. Check each part file, retry rules per the dispatch file.
5. Write `<STATE_DIR>/step5.json` = `{parts: [...], failed_tasks: [...]}`.

## Step 6 — Consultant review (optional)

1. Print the Step 6 line. Ask the review question of [`dispatch-review.md`](dispatch-review.md) § Step 6. Skip → print `(skipped — user choice)` and go to Step 7.
2. Dispatch one consultant per module in scope in ONE message. Each writes `<STATE_DIR>/step6.<M>.json` and returns one line; print `↳ 6 review <M> done`.
3. Handle `objections` per the dispatch file.

## Step 7 — Assemble the model (main thread)

1. Print the Step 7 line. Run `assemble-model.mjs`, then `build-process-doc.mjs --check`, per [`dispatch-review.md`](dispatch-review.md) § Step 7.

## Step 8 — Build HTML (main thread)

0. **Korean polish (8a)** — `<lang>` is `ko` (the comma fix always; the model rewrite when humanize-korean is installed): follow [`common/humanize-korean.md`](../../common/humanize-korean.md) with `<dir>` = `<STATE_DIR>/humanize`. Texts = `node "<PLUGIN_ROOT>/scripts/process/companion.mjs" texts "<STATE_DIR>/process-model.json" --out "<STATE_DIR>/humanize/texts.json"`; apply = `node "<PLUGIN_ROOT>/scripts/process/companion.mjs" apply "<STATE_DIR>/process-model.json" "<STATE_DIR>/humanize/humanized.json" --lang ko --partial --out "<STATE_DIR>/process-model.json"` (`fixed.json` instead when the model step did not run) (copy the model to `process-model.json.bak-humanize` first; do not edit the model between texts and apply — the ids are positional). Integration pages (`build-integration-doc.mjs`) are not polished: their prose is the scenario file the analyst wrote, read as is.
1. Print the Step 8 line.
2. `node "<PLUGIN_ROOT>/scripts/process/build-process-doc.mjs" "<STATE_DIR>/process-model.json" --out-dir "<PROC_DIR>"` (`--same-version` to rebuild the current version, `--major` for a new major version; a review run after a skipped one is a new minor version).
3. Relay the builder's warnings grouped by kind (≤ 10 lines), then the JSON result (`html`, `version`, `warnings`). Errors → fix and rebuild once; still failing → STOP and report.

### Step 8b — English companion (unless `<lang>` is `en` or the user opts out)

1. `node "<PLUGIN_ROOT>/scripts/process/companion.mjs" texts "<STATE_DIR>/process-model.json" --out "<STATE_DIR>/texts-en.json" --chunks <n>` — `n` = ceil(items / 750). Prose only, de-duplicated; codes and SAP identifiers are never extracted.
2. Write `<STATE_DIR>/translate-brief.md` from the template in [`dispatch-review.md`](dispatch-review.md) § Step 8b; dispatch `n` `sap-writer` (`model: "sonnet"`) in ONE message, each with a two-line prompt (`Translate chunk <file>. Follow the brief exactly: <brief>`). Each writes `<chunk>.en.json` and returns one line.
3. `node "<PLUGIN_ROOT>/scripts/process/companion.mjs" apply "<STATE_DIR>/process-model.json" <every .en.json> --lang en --out "<STATE_DIR>/process-model.en.json"` — exit code 3 = untranslated items: re-dispatch the chunk(s) holding them once.
4. Build it like Step 8 with `--as-version <primary version>` (`… build-process-doc.mjs "<STATE_DIR>/process-model.en.json" --out-dir "<PROC_DIR>" --as-version <ver>`) → `<MODULE>-process-v<ver>-en.html`.

## Step 9 — Validation + handoff

1. Print the Step 9 line.
2. Check (read the model, not the HTML):
   - every confirmed entry point of `attach.json` (minus `excluded`) appears in some row's `tcodes` / variant, or in `step4.json → unplaced` — list the missing ones
   - every L4 has `kind`; every `cbo` / `enh` / `ext` L4 has a task sheet with ≥ 1 rule and ≥ 2 steps (or a `Task sheet not generated` tbd)
   - no `GetTableContents` / `GetSqlQuery` was called in this run
3. Print the summary:
   ```
   Done [████████████████████] 100%
   Process map: <MODULE> v<ver> · <lang> · review <done|skipped>
   Scope: <used>/<inScope> TCodes used (<coverage> months on <SID>) · <programs> programs
   BPH: L1 <n> · L2 <n> · L3 <n> · L4 <n> (std <n> · cbo <n> · enh <n> · manual <n> · ext <n>) · variants <n>
   Task sheets: <n> · Rules with source: <n> / <n> · Open questions: <n>
   File: <html path> · English: <en html path>   (edit in the browser: Edit → Save → import with build-process-doc.mjs --import)
   Next: "review the process map", "drill into <task> with program-to-spec", "add package <X>"
   ```
4. Point open questions that need a module answer to `/sc4sap:ask-consultant`.

## Edited page → next version

When the user hands back a page saved from the edit mode (`…-edited.html`):

1. `node "<PLUGIN_ROOT>/scripts/process/build-process-doc.mjs" --import "<edited.html>" "<STATE_DIR>/process-model.json" "<PROC_DIR>/<MODULE>-process-<lang>.history.json"` — writes the edited model (old one kept as `.bak`) and adds the page's new revision entries (`source: "edit"`, author and note as typed in the page).
2. Rebuild with `--same-version` so the imported version is published with that author and note; rows added in the BPH table get their task sheet header now — run Step 5 for them (one part) when the user wants full sheets.
3. Never re-run Steps 4–7 over an imported model without asking: that would overwrite the user's edits.
