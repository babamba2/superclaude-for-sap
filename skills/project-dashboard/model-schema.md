# project-dashboard — Model schema

Referenced by `SKILL.md` and `workflow.md`. Source of truth: `scripts/project/project-model.mjs` (`normalizeModel`, `checkModel`). Read before editing a `<CODE>-project.json` by hand; run `build-project-doc.mjs check --project <CODE>` after.

## Top level

| Field | Meaning |
|---|---|
| `lang` | `ko` / `en` — page language |
| `project` | `code`, `name`, `type` (`implementation` · `conversion` · `rollout` · `ams` · `task`), `start`, `goLive`, `end`, `modules[]`, `packages[]`, `system`, `sponsor`, `pm`, `pmo`, `trPattern` |
| `team[]` | `id`, `name`, `role`, `module`, `sapUser`, `from`, `to`, `note` |
| `workstreams[]` | `code`, `label`, `kind` (`module` · `cross`) — modules plus PMO, DM, INT, BAS, SEC, TST, OCM, CUT |
| `wbs[]` | rows, see below — tree by `parent`, model order = order under a parent |
| `milestones[]` | `id`, `label`, `kind` (`qgate` · `golive` · `cutover` · `signoff` · `other`), `phase`, `base`, `forecast`, `actual`, `status` (`planned` · `passed` · `conditional` · `failed`), `approver`, `criteria[]` |
| `kpis[]` | manual KPIs: `id`, `label`, `group` (`quality` · `data` · `ocm` · `cost` · `other`), `unit`, `target`, `actual`, `dir` (`up` · `down`), `history[{ date, value }]` |
| `actuals` | written by `refresh` only — do not edit |
| `snapshots[]` | one per build day: planned / actual % and auto KPI values (the trends) — do not edit |

## WBS row

| Field | Meaning |
|---|---|
| `id` | stable, unique (`REA.DEV.SD`, `REA.DEV.SD.C001`, `X.N3`) |
| `parent` | id of the parent row; phases have none |
| `type` | `phase` · `deliverable` · `task` · `wricef` |
| `ws` | workstream code |
| `owner` / `fnOwner` / `devOwner` | team ids — `fnOwner` module consultant, `devOwner` development consultant |
| `start`, `finish` | plan dates (leaf rows; parents roll up) |
| `baseStart`, `baseFinish` | baseline (set by the template; change only on a re-baseline the PM asks for) |
| `pct`, `status` | leaf progress 0–100 and `notstarted` · `inprogress` · `done` · `blocked` · `onhold` |
| `deps[]` | finish-to-start predecessors (ids) |
| `wricefContainer` | `true` on the development deliverable new WRICEF items go under |
| `wricef` | `kind` (R · I · C · E · F · W), `stage` (`req` · `fs` · `ts` · `build` · `ut` · `fut` · `sit` · `done`), `stageDates{ stage: date }`, `objects[]` (Z names for the evidence), `trs[]` |
| `note` | free text; `reassign` appends `<date> <old> → <new>` |

A WRICEF item's `pct` and `status` follow its `stage` (0 / 15 / 25 / 50 / 65 / 80 / 90 / 100); change the stage, not the %. Set `stageDates[<stage>]` to the day the stage was finished — the hand-off queue counts waiting days from it.

## Computed (never stored)

Roll-ups (parent dates, duration-weighted %), RAG per row (red: finish passed / blocked; amber: started with nothing done, or ≥ 20 points behind plan), milestone slip and RAG, hand-off queue, items needing a new owner (open items whose owner left or is unknown), auto KPIs (`spi`, `ms-ontime`, `late`, `wricef-done`, `wait-dev`, `wait-fut`, `tr-week-F`, `tr-week-D`, `tr-open`, `orphans`, `load-max`, `dumps-day`), overall RAG.
