# project-dashboard — Workflow

Referenced by `SKILL.md`. `<B>` = `node "<PLUGIN_ROOT>/scripts/project/build-project-doc.mjs"`, every call with `--dir <PRJ>`. Each step prints `Step X/6 · <label>`.

## Step 1 — Which project

1. Confirm the active profile in one line (alias, SID, tier). List the folders under `<PRJ>` (code, name, go-live from each `<CODE>-project.json`).
2. The user names an existing project → go to **Operations** below. A new project → Step 2.

## Step 2 — Interview (new project)

One `AskUserQuestion`: project type — `implementation` (SAP Activate) / `conversion` (S/4 brownfield) / `rollout` / `ams` (release) / `task` (small project). Then one free-text ask for the rest, with an example filled in:

- code (letters, digits, `_` `-`, ≤ 30), name, start date, go-live date, modules (`SD, MM, FI` — one workstream each)
- packages of the project's custom objects (for the SAP actuals; may be empty)
- team: `name · role · module · SAP user · from–to` per line — roles `pm, pmo, lead, module, dev, basis, security, data, test, ocm, business, other`; `module` = module consultant, `dev` = development consultant
- WRICEF list (optional, may come later): `kind (R/I/C/E/F/W) · title · module · stage`, or an xlsx / text the user attaches
- transport naming when it does not start with `[MODULE]` (a regex whose group 1 is the workstream)

`Write` `<PRJ>/<CODE>/_answers.json` (`{ code, name, type, lang, start, goLive, modules, packages, system: <alias>, team: [{ id, name, role, module?, sapUser?, from?, to? }], wricef: [{ label, kind, module, stage? }], trPattern? }` — ids `PM1`, `SD1`, `DEV1` …), then `<B> init --answers <file>`. Report `warnings` (WRICEF without an owner side, unknown workstream) in ≤ 5 lines.

## Step 3 — SAP actuals

When the profile connects: `<B> refresh --project <CODE>` (read-only; a few minutes on a busy system). Print transports / objects / errors. Errors are reported, not retried: on BASIS < 7.50 TADIR / DWINACTV may be refused by the dispatcher — the ADT package listing is used instead (no author / creation date). Skip with `(skipped — no connection)` otherwise.

## Step 4 — Korean polish and English companion

1. `lang` is `ko`: Korean polish per [`../../common/humanize-korean.md`](../../common/humanize-korean.md) on the model — texts = `node "<PLUGIN_ROOT>/scripts/lib/humanize.mjs" texts-json <PRJ>/<CODE>/<CODE>-project.json --skip name,sapUser,approver,label --out <dir>/texts.json` (labels are short and stay; notes and criteria are the prose), apply = `apply-json`, then `<B> build --project <CODE> --same-version`.
2. English companion (default unless the user opts out): `<B> texts --project <CODE>` → when `todo` > 0, dispatch `sc4sap:sap-writer` (`model: "sonnet"`) with the translate brief below to write `outFile`; then `<B> companion --project <CODE>`. `missing` must be empty (re-dispatch once).

   ```
   Translate <PRJ>/<CODE>/_i18n/todo.json (Korean → English) for an SAP project dashboard read by PMs and the PMO.
   Write <outFile>: { "items": [{ "i", "text" }] } — every item once, same i. Plain project-management English; SAP terms as SAP
   writes them (Fit-to-Standard, Q-gate, cutover, hypercare, WRICEF, UAT, SIT, FUT). Keep codes, ids, dates and numbers literal.
   Return only: TRANSLATED <n>.
   ```

## Step 5 — Portfolio

`<B> portfolio --lang <lang>` (and `--lang en` when companions exist). Always after a project changed.

## Step 6 — Report

Print the Output_Format block (SKILL.md). Name what needs attention first: items needing a new owner, hand-offs waiting longer than 5 days, red milestones, red KPIs.

## Operations (existing project)

| Request | Do |
|---|---|
| Edited page handed back (`…-edited.html`) | `<B> import <file>` → new version with the page's revision; then Step 4.2 (only new texts are translated) and Step 5 |
| "실적 갱신" / refresh | Step 3, then Step 5 |
| WRICEF list | `Write` `_wricef.json` (`[{ label, kind, module, stage?, objects?: [Z names] }]`), `<B> add-wricef --project <CODE> --file <it>` |
| A member leaves / is replaced | Edit the model: set the leaver's `to`, add the newcomer (new id, `from`); then `<B> reassign --project <CODE> --from <old> --to <new> [--side F\|D]`; finished items keep the old owner |
| Move dates, milestones, KPI values by chat | `Edit` the model per [`model-schema.md`](model-schema.md), `<B> check`, then `<B> build --project <CODE> --note "<what>"` |
| "포트폴리오" / all projects | Step 5 and print one line per project (RAG, progress, next milestone, needs-owner count) |

## Rules

- Never call a write tool on SAP. Never read business tables; the reads are fixed in `sap-actuals.mjs`.
- Dates `YYYY-MM-DD`. Ids are never reused or renamed (a later sync matches by id).
- Never delete a team member; end them with `to`.
- Customer decks or plans the user shows are structure references only — none of their names or numbers go into templates of the plugin.
