---
name: ops-health-check
description: Operations report of the connected SAP system for SM / AMS — short dumps grouped by runtime error and program and compared with the period before, the transport requests that changed a dumping program, aborted background jobs, update errors and IDocs in an error status — as one document-style HTML report to hand to the customer or the PMO (cover, executive summary, KPI tiles with the change, dump trend, sections per area, issues & actions with owner and due, areas not read, appendix; editable and printable). Read-only. Korean requests too — 운영 보고서, 운영 점검, 시스템 점검, 아침 점검, 덤프 현황, 잡 실패, 업데이트 오류, IDoc 오류.
model: inherit
---

# SC4SAP Operations Report

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): blocked — reply with the stop line there and stop.

Reads what the connected system records about its own health for a period (default: since yesterday) and writes **one operations report** (HTML document) that an SM / AMS lead hands to the customer or the PMO: a verdict (stable / attention / action required), an executive summary, key figures against the previous period, and the issues with recommended actions. A dump that started after a transport changed its program is shown next to that request — the first thing an operations team asks after an import.

<Purpose>
SM / AMS operations open ST22, SM37, SM13 and WE02 every morning and compare by memory. This skill reads them in one pass, groups and compares them with the previous period, links dumps to recent changes, and hands each finding to the skill or TCode that resolves it. It never fixes anything.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. This skill dispatches no agents (`Dispatched: none`).</Response_Prefix>

<Team_Mode>**No teamMode integration.** Reading and drawing are scripted; the main thread reads the result and relays it.</Team_Mode>

<Use_When>
- "operations report", "daily check", "system health", "what broke since yesterday", "dumps this week", "failed jobs", "운영 보고서", "운영 보고서 작성", "운영 점검", "아침 점검", "시스템 상태 점검", "덤프 현황", "잡 실패 확인", "運用レポート", "運用チェック"
- Weekly / monthly operations report to the customer or the PMO (period "this week" / "last 30 days"; "주간 운영 보고서", "월간 운영 보고서")
- A fixed window: a month-end close or a hypercare window given as two dates ("2027-03-01 – 2027-03-15")
- After a transport import, to see whether new dumps follow it
- Hypercare after a go-live (use a period of a few days)
</Use_When>

<Do_Not_Use_When>
- One known dump or error to explain → `/sc4sap:analyze-symptom`
- Business documents (open orders, blocked billing, a PO) → `/sc4sap:assist`
- The plugin or MCP connection itself is not working → `/sc4sap:sap-doctor`
- Project transport throughput and Q-gates → `/sc4sap:project-dashboard`
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Period | `--from` / `--to` dates; default yesterday → today; at most 31 days. The previous period of the same length is read for the comparison |
| Dumps | `RuntimeListDumps` (ECC: the ADT feed covers 24 h, older dumps come from the ST22 list) — grouped by runtime error + program; "new" = no dump of that group in the previous period |
| Changes | Requests (E070, not tasks) from 7 days before the period on, their texts (E07T) and code objects (E071: PROG, REPS, FUGR, CLAS, FUNC, METH, LIMU …). A dump group whose program, include, function group (`SAPL<FG>`) or class pool matches an object of a request dated on or before its last dump lists that request |
| Jobs / updates / IDocs | TBTCO status A (+ TBTCP first step), VBHDR return code ≠ 0, EDIDC error statuses (02 04 05 25 26 29 51 56 60 61 63 65) — read for the period and the previous period (`prevRows`) so the key figures show the change |
| Not readable | A table the system refuses is shown as *not readable — check in SM37 / SM13 / WE02*, never as "none". On BASIS < 7.50 the reads go through the `ZMCP_ADT_DISPATCH` action `TABLE_READ`; a dispatcher installed before 2026-11-16 refuses TBTCO / TBTCP / VBHDR / EDIDC — reinstall `abap/zmcp_adt_dispatch_ecc.abap` (`/sc4sap:setup`, DEV helpers) |
| Verdict | red (action required): a new dump group with ≥ 5 dumps, a dump group with a matching request, a job aborted ≥ 3×, or any update error · amber (attention): anything else found, or a section not readable · green (stable): nothing found and everything read |
| Report | Cover (title, system, period, prepared date, author) · 1 executive summary (3–5 sentences from the model) · 2 KPI tiles (dumps, dump groups, new groups, aborted jobs, update errors, IDoc errors, each with the change) · 3 dumps per day (bars, previous and this period) · 4 sections per area · 5 issues & actions (area, finding, impact, recommended action, owner, due) + comments · 6 areas not read with their T-code · 7 appendix (sources, period definitions, verdict rules). Formal report style (Korean: formal declarative and noun endings). A4 portrait print, light / dark with a theme button |
| Editing | Author, owner, due and comments are editable in the page (Edit); Save downloads `<file>-edited.html` with the edits in `<script id="ops-edits">` |
| Output | `<artifact-base>/ops-check/<to>/ops-report-<to>-<lang>.{html,md}` + `collect.json` + `model.json` (artifact base per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)) |
</Decisions_Fixed>

<Data_Rules>
Only operations metadata is read: dump headers (error, program, include, time), request headers / texts / object names, job names and step programs, update request headers, IDoc control records (message type, status, partner number). **No business document contents, no job logs, no IDoc data records.** User names are counted (dumps: number of users) and never listed — the dump id carries the user, so it is not kept in the model or the page. Never `acknowledge_risk`; a table the blocklist or the system refuses stays unread.
</Data_Rules>

<Workflow>
Paths: `<base>` = artifact base, `<out>` = `<base>/ops-check/<to>`. Read `<base>`'s `config.json` for `sapVersion`, the SID and the language (`language`, default `ko`).

**Step 1 — Period and language.** From ARGUMENTS: "today" (today → today), "since yesterday" (default), "this week" (Monday → today), "last 7 days", "last 30 days" / "last N days", or two dates (`2027-03-01 – 2027-03-15`, `from … to …`, `--from` / `--to`). **Given dates override the period choice**: a `Dates: <from> – <to>` line (en dash or hyphen) wins over a `Period:` line sent with it and maps to `--from` / `--to`. Dates as `YYYY-MM-DD`; a reversed pair is swapped. More than 31 days → ask once to narrow it. Language named in ARGUMENTS (Korean / English / Japanese → `ko` / `en` / `ja`) overrides the profile's.

**Step 2 — Collect** (read-only; one call, through the plugin's MCP server):
```
node "<PLUGIN_ROOT>/scripts/ops/build-ops-check.mjs" collect --from <from> --to <to> --out-dir "<out>" --system <SID> --sap-version <sapVersion>
```
It prints one JSON line with the count per section, or `not readable`. An error (`ok:false`) → show it and stop; a connection error → `/sc4sap:sap-doctor`.

**Step 3 — Build** (offline):
```
node "<PLUGIN_ROOT>/scripts/ops/build-ops-check.mjs" build --in "<out>/collect.json" --out-dir "<out>" --lang <lang>
```
It prints the verdict and a short summary (the same text as the `.md` file); the report is `ops-report-<to>-<lang>.html`.

**Step 4 — Report.** Relay the summary in the user's language and give the report path; say that author, owners, due dates and comments can be filled in the page (Edit → Save) before it is sent. Then offer the next steps the report lists, one line each — for a dump group: run `/sc4sap:analyze-symptom` with its error, program and time (Recommended for red); for jobs / updates / IDocs: the TCode. Do not start them unasked.
</Workflow>

<Output_Format>
```
Operations report · <SID> · 2026-11-15 – 2026-11-16 · Action required
- Short dumps: 12 (4 groups, 2 new, previous 7)
- Aborted jobs: 3 (previous 1) · Update errors: 0 · IDocs in error: 5
- Transports in the period: 8
1. MESSAGE_TYPE_X in ZSDR_EXAMPLE — changed by <request> on 2026-11-15 → /sc4sap:analyze-symptom …
2. ZJOB_EXAMPLE aborted 3× → SM37 → job log
Report: .sc4sap/work/<alias>/ops-check/2026-11-16/ops-report-2026-11-16-ko.html
```
Reply in the user's language. Name a matching request as a lead to check, not as the proven cause.
</Output_Format>

<Limits>
- Counts are capped by the read limit (5,000 rows per table, 1,000 dumps per period).
- On ECC the dump feed covers 24 hours; older dumps need the ST22 list action of the `ZMCP_ADT_DISPATCH` dispatcher (installed by `/sc4sap:setup`). Without it the older part of the period reads as fewer dumps — the summary says what was read.
- A request matches by object name only; a change in a called function module or class outside the dumping program is not linked.
- System log (SM21), lock entries (SM12), work process and memory figures are not read.
</Limits>

<MCP_Tools_Used>
Through `scripts/ops/build-ops-check.mjs collect` only (its own MCP client): `RuntimeListDumps`, `GetSqlQuery` (E070, E07T, E071, TBTCO, TBTCP, VBHDR, EDIDC).
</MCP_Tools_Used>

<Files>
- `scripts/ops/build-ops-check.mjs` — `collect` (SAP → `collect.json`) and `build` (report HTML, Markdown summary, `model.json`)
- `scripts/ops/ops-model.mjs` — grouping, previous-period comparison, per-day dumps, KPIs, dump ↔ request matching, verdict, issues, next steps
- `scripts/ops/ops-page.mjs` — the report (ko / en / ja, light and dark with a theme button, edit + save, A4 portrait print)
</Files>

<Related_Skills>
- `/sc4sap:analyze-symptom` — root cause of one dump group from this report
- `/sc4sap:assist` — business documents behind an IDoc or update error
- `/sc4sap:sap-doctor` — the connection itself
</Related_Skills>

Task: $ARGUMENTS
