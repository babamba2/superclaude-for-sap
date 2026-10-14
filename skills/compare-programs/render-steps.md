# Render Steps — Screens, Report, HTML, English Companion

Referenced by `workflow.md` (Steps 5–5.4). `<PLUGIN_ROOT>` = two levels above this skill folder. `<base>` = the artifact base from [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) (`.sc4sap/work/<alias>/` with an active profile, `.sc4sap/` otherwise). Every report lives in `<base>/comparisons/`.

## Names

| Item | Value |
|---|---|
| `<NAME>` | The programs in input order joined by `__vs__` (`/` → `_`). Over 120 characters → `compare-<hash6>`: `node -e "console.log(require('crypto').createHash('sha1').update(process.argv[1]).digest('hex').slice(0,6))" "<names sorted, comma-joined>"`. Sorting keeps the same hash, and so the same history, when the user lists the programs in another order |
| Source / page | `<NAME>-v<ver>-<lang>.md` / `.html` |
| History | `<NAME>-<lang>.history.json` (one per language) |
| Screen specs | `_img/<NAME>/<PROG>[-en].image-spec.json` |
| Screen images | `_assets/<NAME>-<lang>/<PROG>/selection.png`, `alv.png` |

Version before the writer runs: `node "<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs" --next-version --history <base>/comparisons/<NAME>-<lang>.history.json` → `1.0` for a first comparison, +0.1 for a re-run (`--major` when the user asks for a new major version).

## Step 5 — Screens + report (`sap-writer`, Sonnet override)

```
▶ phase=5 (render) · agent=sap-writer · model=Sonnet (override)
```

One dispatch, prompt in [`dispatch-prompts.md`](dispatch-prompts.md) § Step 5. The writer:

1. **Screens** (only when dimension 3 or 6 is active): for each program with a selection screen or an ALV / list output in its facts, writes `_img/<NAME>/<PROG>.image-spec.json` holding only `selection` and / or `alv` — transcribed 1:1 per [`../program-to-spec/selection-schema.md`](../program-to-spec/selection-schema.md) and [`../program-to-spec/alv-buttons-schema.md`](../program-to-spec/alv-buttons-schema.md) §2, with `"lang": "<lang>"` and invented sample rows (never business data). No `processFlow`, no `buttonFlows`, no `screens`.
2. Renders each one: `node "<PLUGIN_ROOT>/scripts/spec/render-md-images.mjs" <image-spec> <base>/comparisons/_assets/<NAME>-<lang>/<PROG>/`. A selection `⚠` line (legacy fields shape, unknown item type, group or frame without items) means the picture is wrong — fix the spec and render again; `⚠ … has no usable buttonFlows entry` is expected here and ignored. A `null` slot in the printed manifest (no headless browser) → that picture is left out and §5 says so in one line.
3. Writes `<NAME>-v<ver>-<lang>.md` with [`report-template.md`](report-template.md), one `Write` call (never through Bash).

It returns the file path, the picture count per program, the verdict counts and the headline divergence.

## Step 5.1 — Build the page (main thread)

```bash
node "<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs" <base>/comparisons/<NAME>-v<ver>-<lang>.md --editable --version <ver> --note "<what this version covers>"
```

Writes `<NAME>-v<ver>-<lang>.html` and the history entry. One self-contained file: the PNGs and the editor are inlined; only Mermaid loads from a CDN (offline it shows its source). The page offers contents, the fact card with the version, cross-links, sortable / filterable tables, coloured verdict and presence cells, **Differences only**, the **All / Functional** view (Functional hides the technical appendix), print, and **Edit** (Save → `…-edited.html`). Keep the `.md` and `_assets/` — they are the page's source for rebuilds and imports. A `⚠` line in the output is a defect: fix the `.md` and rebuild with `--same-version`.

## Step 5.1b — Excel copy (main thread, when `excel` was chosen)

```bash
node "<PLUGIN_ROOT>/scripts/spec/md-to-xlsx.mjs" <base>/comparisons/<NAME>-v<ver>-<lang>.md
```

Writes `<NAME>-v<ver>-<lang>.xlsx` from the same `.md`, with the spec xlsx toolchain (`xlsx-zip.mjs`, the same `_assets/` PNGs): an overview sheet (title, fact card, contents), then one sheet per `##` section — dark table headers, verdict fills, centred ● / ○, evidence as a small grey second line in the cell, the side-by-side screens in one row, Mermaid as a one-line note. The output lists `sheets`, `images` and `missing` (image paths it could not read — fix the `.md` or re-render). Rebuild it after every review change and for the English companion. It is a copy for reading and filtering: edits go through the HTML page, never back from Excel.

## Step 5.2 — Review loop (main thread)

Show the completion block (`workflow.md` Step 5 output) and ask: *"OK to finalize, or change a verdict / section / wording?"* Apply changes to the `.md` with `Edit`, rebuild with `--editable --same-version` (the history keeps one entry per version). On confirm → Step 5.3.

## Step 5.3 — English companion (default when the report language ≠ `en`)

```
▶ phase=5.3 (translate) · agent=sap-writer · model=Sonnet (override)
```

The writer reads the final `.md` and writes `<NAME>-v<ver>-en.md` (one `Write`): prose, headings, table headers, legend and verdict words in English; program / table / field / authorization names, T-Codes, `●` / `○` and the verdict marks unchanged; the Mermaid labels translated. Screen pictures: copy each `<PROG>.image-spec.json` to `<PROG>-en.image-spec.json` with labels and titles translated (names unchanged), render into `_assets/<NAME>-en/<PROG>/`, and point the English `.md` at them. Build with the same `--version <ver>`; the English history is its own file. Skip only when the user says so.

## Step 5.4 — Import an edited page

A reader changes the page in **Edit** mode and sends back `<NAME>-v<x>-<lang>-edited.html`. When the user hands one over (or one is newer than the latest `.md` in `<base>/comparisons/`):

```bash
node "<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs" --import <…-edited.html> <base>/comparisons/<NAME>-v<base-ver>-<lang>.md
```

Then rebuild with the printed `rebuild` command. Versions, `sourceChanged`, replaced images and carrying the edits into the English companion work exactly as for specs — **MUST read [`../program-to-spec/edit-mode.md`](../program-to-spec/edit-mode.md) § Import and § English companion** before importing.

## Finish

Print the absolute paths of every `.html` written. The user opens them in a browser; print / Save as PDF gives an A4 layout with the contents and toolbars removed.
