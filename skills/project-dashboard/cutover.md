# project-dashboard — Cutover readiness

Referenced by [`workflow.md`](workflow.md) § Operations. `<B>` = `node "<PLUGIN_ROOT>/scripts/project/build-project-doc.mjs"`. Logic: `scripts/project/cutover-model.mjs` (no I/O, no SAP); runbook template: `scripts/project/cutover-tasks.json`; page: `scripts/project/cutover-page.mjs`; dashboard tab: `scripts/project/cutover-tab.mjs`; jobs read: `scripts/project/cutover-jobs.mjs`.

The command keeps a cutover runbook in the project model (`cutover`), rebuilds the dashboard (same version; the runbook is edited in its **Cutover** tab) and writes one read-only page `<CODE>-cutover-<lang>.html` (A4 landscape, phone layout): D-day, the go / no-go suggestion with each item's evidence, window fit (window / plan / rehearsal), critical path, T-minus runbook, jobs to suspend, the transport request list, open risks and decisions.

## Never

- Never imports a request, suspends or changes a job, locks a user or opens a period. People run the runbook.
- Never decides go / no-go. The page **suggests**; the people in the meeting decide and set each item's status in the Cutover tab.
- The request list is the **release order, not a verified import order** — the page always says so. Check the order with the transport team (dependencies, overlapping objects).

## Step 1 — Inputs (one question, all optional)

Ask once, together:
- downtime window: start and end (`YYYY-MM-DD HH:MM`). Default from the template: 18:00 two days before go-live → 06:00 on go-live (conversion: three days before).
- code freeze and configuration freeze dates (`YYYY-MM-DD`). Default D-14 / D-10.
- rehearsal actuals (optional): rehearsal id (`R1`, `R2`, or `live` during the real window) and a CSV `task id,start,end` (`YYYY-MM-DD HH:MM`) or JSON `[{ id, start, end }]`.
- evidence files (optional): a CTS check page or `model.json`, a UAT page / set JSON / defect feed, an operations report. UAT sets in `project.uatSets` are read without asking (same as the weekly status).
- read the released and scheduled jobs (SM37 list) from the active profile? Default no. **PRD profile** → ask first with `PRD_CONFIRM` of `cutover-cli.mjs` (ko / en: only the released and scheduled jobs are read, read-only, no job is changed) — only on yes pass `--confirm-prd`.

A dashboard page handed back from the browser goes through `<B> import <file>` first.

## Step 2 — Run

```
<B> cutover --project <CODE> [--seed] [--window "<start>/<end>"] [--freeze-code <date>] [--freeze-config <date>]
           [--rehearsal <id> --actuals <file>] [--evidence <file>]… [--uat <ID>]… [--jobs [--confirm-prd]] [--lang ko|en]
```

Prints one JSON line: `{ html, dashboard, dDay, suggest, open, nogo, fit, criticalH, windowH, jobs: { ok, n, released }, late, seeded, applied, evidence }`.

- First run (no runbook yet) or `--seed`: the generic runbook of the project type is added (implementation, conversion, rollout; AMS / small project get the short set). Tasks already in the model are never changed; seeding twice adds nothing.
- Only `--jobs` reads SAP: TBTCO (`STATUS IN ('S', 'P')`) and the first step of TBTCP. The read is kept in the model (`cutover.jobsRead`) so later runs without `--jobs` still show it with its date. A read that fails is shown as **not read (SM37)**, never as zero.
- `applied.unknown` lists actuals rows whose task id is not in the runbook — tell the user; `applied.errors` lists rows with bad times.
- A dependency loop between window tasks stops the command (`cutover window tasks form a loop: …`).

## How it is computed

- **Window tasks** carry hours and predecessors; the start of each task is computed from its predecessors (earliest start), never typed. The **critical path** is the longest chain; its hours against the window length give the **fit**: fits (≥ 10 % spare), tight (< 10 %), exceeds.
- **Rehearsal**: the latest rehearsal with actuals (or the one named) recomputes the path with measured hours; tasks without a measurement use the plan and are listed as estimated.
- **Before / freeze / after** tasks carry an offset in days from go-live (a freeze task sits on its freeze date). An open task whose day has passed is late.
- **Go / no-go items** end with an optional rule tag. The weekly status tags work here too (`[cts-blocked<=N]`, `[defects-open<=N]`, `[uat-pass:<cycle>>=N]`, `[dumps-day<=N]`, `[tr-open<=N]`, `[wricef>=<stage>:N]`), plus:

| Tag | Value |
|---|---|
| `[jobs-released<=N]` | released jobs in the last jobs read (scheduled ones do not run) |
| `[tasks-open:<phase><=N]` | runbook tasks of the phase not done / skipped (`pre`, `freeze`, `window`, `post`) |
| `[rehearsal-fit>=N]` | spare time of the rehearsal in % of the window (negative = exceeds) |

  No tag → the people judge it. Suggestion: no-go when an item is not met, conditional while one is open, go when all are met or waived. The status people set (go / no-go / waived) wins.
- Task **checks** (`check` on a task, e.g. "No released job left [jobs-released<=0]" on "Suspend background jobs") are evaluated the same way and shown next to the task.

## Step 3 — Report

```
Cutover <CODE> · <D-n> · window <start> → <end> (<windowH> h)
Go / no-go suggestion: <go | conditional | no-go> (no-go <n> · open <n>) — people decide
Fit: <fits | tight | exceeds> — critical path <criticalH> h (<plan | rehearsal R1>)
Late tasks: <n> · Jobs: <n read, released n | not read | not asked>
Page: <html> · Dashboard: <html>
```

Then the one or two items that block (no-go rows, exceeds, late window prerequisites) in one line each.

## Runbook template

`cutover-tasks.json` is generic (no customer, system or object names) and was reviewed by `sap-critic` (`_review`). Korean wording follows the review (separate words for transports, data loads, the technical conversion and the downtime window — see the template's `_doc`); keep it when adding tasks. Project-specific tasks are added in the Cutover tab (`+ Cutover task`, ids `CT.N<n>`) or by `Edit` on the model (`cutover.tasks[]` `{ id, phase, label, ws, owner, durationH, deps, offset, anchor, check, status, note }`), then run the command again (it checks the runbook first: ids, phases, statuses, window and freeze formats, loops).
