# Program → Spec — Editable HTML, Versions and Import

Referenced by `SKILL.md` and `workflow-steps.md`. The spec HTML is an editable page, versioned like the `program-to-manual` output. The `.md` stays the source of truth: the reader edits the page, Saves a copy, and the import turns that copy back into Markdown, so every later rebuild and the English companion keep the reader's edits.

Scripts: `scripts/spec/md-to-html.mjs` (CLI), `spec-version.mjs` (versions, build, import), `spec-editor.mjs` (the page's edit mode), `html-to-md.mjs` (page → Markdown).

## Files

| File | Holds |
|---|---|
| `.sc4sap/specs/{OBJECT}-v{ver}-{lang}.md` | The source of version `{ver}` (one file per version) |
| `.sc4sap/specs/{OBJECT}-v{ver}-{lang}.html` | The editable page built from it |
| `.sc4sap/specs/{OBJECT}-{lang}.history.json` | `{ object, lang, versions: [{ version, date, author, note, source? }] }` — one history per language |
| `.sc4sap/specs/_assets/…`, `_img/…`, `_tr/…` | Unchanged (images, image-spec, Excel TR map) |

Versions are `<major>.<minor>`; the first one is `1.0`.

| Situation | Command | Version |
|---|---|---|
| Which version comes next? | `node scripts/spec/md-to-html.mjs --next-version --history .sc4sap/specs/{OBJECT}-{lang}.history.json [--major]` | prints it |
| First build / new analysis | `node scripts/spec/md-to-html.mjs .sc4sap/specs/{OBJECT}-v{ver}-{lang}.md --editable --version {ver} --note "<what changed>"` | `{ver}` |
| Review loop (Step 5) | `… {OBJECT}-v{ver}-{lang}.md --editable --same-version` | unchanged, rebuilt in place |
| Rebuild as a new version | `… {OBJECT}-v{ver}-{lang}.md --editable [--major]` | +0.1 (or +1.0); the `.md` is copied to the new version's name first |
| English companion | `… {OBJECT}-v{ver}-en.md --editable --version {ver}` | mirrors the first language |

Other flags: `--history <json>` (another history file), `--no-history`, `--author <name>` (default: the profile's `manual.author`), `--out-dir <dir>`, or an explicit `[out.html]` after the `.md` (no copy, no renaming). Every build prints `{ html, md, version, history, warnings }`; a `⚠` line means the note repeats the previous version's.

Rebuilding a version that came from a page edit keeps that entry's author, date and note.

## What the page offers

Plain viewing is unchanged (contents, fact card, cross-references, sort / filter, Functional view). The cover card adds the version, and a **Revision History** section closes the page (from history.json, labels ko / en / ja).

**Edit** in the toolbar switches the edit mode on:

- Click a heading, paragraph, list item, table cell (header too), callout line, figure caption or fact value to change it. Selecting text shows Bold · Italic · Code · Strike · Link · **T** (technical detail — hidden in the Functional view). A field holding markup the toolbar cannot keep (`<sub>`, an `<a id>`, an inline image) is edited as plain text instead.
- Tables: ＋ / ✕ at the end of each row, **＋ Add row** under the table.
- Lists: ▲ ▼ ＋ ✕ after each item.
- Images: **Replace image** on a figure, or click it and press Ctrl+V with a screenshot on the clipboard.
- Flows: the flow editor (drag shapes, draw arrows, add / delete steps, double-click text) — same Save as the rest.
- Undo: Ctrl+Z or the Undo button. Edits autosave in the browser (when it allows storage) and are offered back as **Continue editing** on reopen.
- **Done** leaves the mode: SAP names and `§n` in the changed text link again (tooltips as before), tables sort and filter again.
- **Save** asks for the revision — version (first save of the session +0.1, later saves update the same revision), author, changes — and downloads `{OBJECT}-v{new}-{lang}-edited.html`. The reader sends that file back.

A reader can reopen the `-edited.html` and keep editing; each further session adds another +0.1.

## Import

```bash
node scripts/spec/md-to-html.mjs --import <…-edited.html> .sc4sap/specs/{OBJECT}-v{base}-{lang}.md [--image-spec <json>] [--history <json>]
```

`{base}` is the newest `.md` of that language. The page carries its own source, so the base only gives the folder, the names, the line endings, and the `sourceChanged` check. The import:

1. Converts the page back to Markdown. Blocks the reader did not touch keep their source lines byte for byte; a changed block (paragraph, table, list, callout, figure, heading, fact line) is rewritten from the page, so the `.md` diff shows exactly the edits. Line endings and BOM follow the file on disk.
2. Writes `{OBJECT}-v{new}-{lang}.md` (`{new}` = the page's newest revision; an existing file is kept as `.bak`). A page with no revision is written back to the given `.md`.
3. Writes each replaced image next to the one it replaces (`<name>-edited.png`, `-edited-2.png`, …) and links it.
4. Writes the changed flows into the image-spec (`processFlow` / `buttonFlows[].flow`, old file as `.bak`). Found automatically as the newest `_img/{OBJECT}-{YYYYMMDD}[-en].image-spec.json`, or pass `--image-spec`.
5. Adds the page's revisions to history.json with `source: "edit"`.

It prints `{ md, backup, version, changed, missing, assets, flows, revisions, sourceChanged, rebuild }`. Then:

- `flows.written` not empty → re-run Step 3.5 (`render-md-images.mjs`) so the PNGs match the edited flows.
- Rebuild the page with the printed `rebuild` command (`--editable --same-version`), and the Excel file if it was requested.
- `sourceChanged: true` → the `.md` on disk differs from the one the page was built from (someone changed it after the build). The import is based on the page's source; review the diff against the `.bak` before going on.
- `missing` lists blocks the page no longer had; they were kept as they were.
- `flows.imageSpec: null` → no image-spec found; re-run with `--image-spec`.

## English companion

The English page has its own history, `{OBJECT}-en.history.json`, with the same version numbers. When the first language gets a page edit (version `{new}`), carry the same edits into `{OBJECT}-v{new}-en.md` — copy the previous English `.md` to that name, translate only the changed text, link the same replaced images, and apply flow position changes to the `-en` image-spec — then build it with `--version {new} --note "<the revision note in English>"`. An edit made on the English page goes the other way round.

## What survives the round trip

See [`html-markup.md`](html-markup.md) § Editing in the page. In short: everything the writer is allowed to put in the `.md` survives; what the page generates (cross-reference links and tooltips, contents, chips, the version row, the Revision History section) is rebuilt, never written into the `.md`.
