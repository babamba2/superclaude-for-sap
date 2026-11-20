---
name: transport-readiness
description: Check transport requests before they move to QA or production — open tasks, inactive objects, objects in a local package, objects that also sit in other open requests (import order), code that needs a DDIC object of another unreleased request, and (when a target system is named) whether the requests merge cleanly into it — target-only changes that the import would overwrite, used DDIC objects missing there, roll-backs — with a verdict per request (ready / check / blocked) in one HTML report. Read-only; for the PMO's release gate and SM operations' import planning. Korean requests too — CTS 점검, 이관 전 점검, 전송 요청 점검, 릴리스 전 확인, 이관 가능 여부, QAS에 들어가도 되나, 운영 반영 가능 여부.
model: inherit
---

# SC4SAP Transport Check (CTS)

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): blocked — reply with the stop line there and stop.

Reads the requests to be moved and everything that decides whether they can go: their tasks, their objects, the other open requests holding the same objects, the objects' packages and activation, and the DDIC objects of other unreleased requests that their code uses. With a target destination it also reads the target system (TADIR, VRSD) to tell whether the import merges cleanly. Writes **one HTML report** with a verdict per request and what to fix first.

<Purpose>
Imports fail, or break QA, for a handful of repeat reasons: a task still open, an object not activated, a structure the program needs still sitting in a colleague's request. The PMO asks "can these go tonight?", SM operations asks "in which order?" — this skill answers both before anyone opens STMS.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. This skill dispatches no agents (`Dispatched: none`).</Response_Prefix>

<Team_Mode>**No teamMode integration.** Collecting and drawing are scripted.</Team_Mode>

<Use_When>
- "Are these requests ready for QA?", "check K900123 before import", "my open requests", "release check for project [SD]", "CTS 점검", "이관 전 점검", "운영 이관 가능 여부", "릴리스 전에 확인해줘"
- "Can it go into QAS / PRD without breaking anything?", "QAS에 들어가도 되나", "운영에 병합돼도 되나" — add the target merge check
- Before a release window; before a hand-over to the basis team; tonight's import list for SM operations ("오늘 밤 이관 목록")
- Change notes for the CAB before a PRD import ("CAB", "change notes", "변경 노트", "변경 승인 회의") → follow [`cab-notes.md`](cab-notes.md)
</Use_When>

<Do_Not_Use_When>
- Releasing or importing — this skill reads only (SE09 / STMS stay with people)
- Project-level transport throughput over time → `/sc4sap:project-dashboard`
- What went wrong after an import → `/sc4sap:ops-health-check`, `/sc4sap:analyze-symptom`
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Selection | Request numbers, or an owner's open requests, or a request-text pattern (`[SD]%`) |
| Blocks | Open task · inactive object · object in a local package (`$…`) · code that uses a customer DDIC object (table, structure, data element, domain, table type, view) sitting in another unreleased request of the last 90 days (`GetWhereUsed`, ≤ 40 objects) |
| Warnings | Object also in another open request (import order) · already released · inactive list partial or not read · dependencies not checked |
| Inactive objects | DWINACTV for every user where the system reads it; otherwise ADT's inactive list, which covers only the connection user — the report says *partial*, never "none" (measured 2026-11-16: neither ECC's dispatcher nor the S/4HANA data preview reads DWINACTV) |
| Target merge (optional) | Only with `--target-dest <SM59 destination>`. Reads the target through `GetRemoteTableContents` (RFC_READ_TABLE over an ABAP destination of the connected system), ≤ 200 objects. **Block** `target-diverged`: the target's last change to a part (VRSD) came from a request the source does not know — repaired in the target or brought by another route; the import would overwrite it. Transports of copies made in the target only export and are passed over. **Block** `missing-in-target`: a customer DDIC object the code uses (dependency rows + D010TAB) is not in target TADIR, not in the request (warn instead when a released request carries it — import that first). **Warn** `older-than-target`: the target's last change came from a later source request — the import rolls it back. **Warn** `target-unread` / `target-partial`: the destination did not answer or a read failed — never "fine". |
| Verdict | blocked (any block) · check (warnings only) · ready (nothing) |
| Output | `<artifact-base>/transport/<date>/tr-check-<lang>.{html,md}` + `collect.json` + `model.json` (artifact base per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)) |
</Decisions_Fixed>

<Workflow>
`<B>` = `node "<PLUGIN_ROOT>/scripts/transport/build-tr-check.mjs"`, `<out>` = `<base>/transport/<today>`.

**Step 1 — Which requests.** From ARGUMENTS: request numbers, "my requests" (owner = the profile's user), or a project tag / text pattern. Requests missing → ask in plain text with the three forms as examples ("DEVK900123, DEVK900124 · my requests · text [SD]%"). Target system (QAS / PRD) if named. Target destination if named ("destination QASCLNT100", "대상 RFC QASCLNT100", `--target-dest <DEST>`) → pass it as `--target-dest`. Report language if named (Korean / English / Japanese → `ko` / `en` / `ja`), else the profile `config.json` `language`, else `ko`. Web form lines: § Web intake.
Then ask only what is still open, each question at most once:
- *Target* not named and CAB notes asked for → PRD, no question. Not named otherwise → `AskUserQuestion`: `QAS` · `PRD` · `Not decided` (CTS check without a target).
- *CAB change notes*: the user asked for them (Use_When) → Yes, no question. Otherwise ask only when the target is PRD (named, or just answered — then as a second question): `No (Recommended)`: CTS check only · `Yes`: also the board's notes from the same check (one card per request: what changed in business words as an AI draft, impact up to the TCodes and jobs, test evidence, risk, rollback facts).
CAB notes chosen → follow [`cab-notes.md`](cab-notes.md): its collect (`--cab`) replaces Step 2, then Step 3 builds the CTS report from that same collect, then cab-notes.md Steps 2–7 — **one run gives both pages**, as on the web.

**Step 1b — Target destination** (when a target system is named or the user asks whether the requests can go into it, e.g. "QAS에 들어가도 되나"; skip when ARGUMENTS already name the destination). Ask for it clearly in one line — the SM59 destination of the target, so the run also finds changes made only there that the import would overwrite. Call `GetRemoteTableContents` with `table_name: "TADIR"` and **no** destination: the error lists the SM59 destinations saved for the profile. Show them and let the user pick one or name another; never guess. Nothing saved and none given → run without the merge check and say so.

**Step 2 — Collect** (read-only, one call):
```
<B> collect --requests K1,K2 | --owner <USER> | --text "<pattern>"  --out-dir "<out>" --system <SID> --target <QAS|PRD> [--target-dest <DEST>]
```
Prints the counts (requests, objects, objects in other requests, inactive with its scope, dependencies, and with a destination the target counts or `target.ok:false` with the error). `ok:false` → show the error and stop. `target.ok:false` → continue; the report marks the target as not read.

**Step 3 — Build** (offline):
```
<B> build --in "<out>/collect.json" --out-dir "<out>" --lang <lang>
```

**Step 4 — Report.** Relay the summary in the user's language (one line per request: verdict and reasons) and give the HTML path. For blocked requests name the first fix (release task X / activate Y / move Z out of `$TMP` / import request W first / retrofit the target-only change of request V into the source first). Do not release or import anything. Then offer, one line each and only when they apply: the target merge check when it was skipped ("name the SM59 destination of <target> and I re-run with the merge check") · CAB change notes when the target is PRD and they were not made · a re-run after the fixes.
</Workflow>

<Web_Intake>
The web form sends lines: `Requests:`, `Target: QAS|PRD`, `Target destination: <DEST>` (blank = not named), `Language:`, `CAB notes: Yes|No` with `CAB date:`, `Packages:`, `Evidence and note:`. They answer Step 1's questions — do not ask them again; `CAB notes: Yes` = the CAB path of Step 1.
</Web_Intake>

<Data_Rules>
Only transport and repository metadata is read, on the source and (with a destination) the target: request headers and texts, object lists, packages, version directory, table usage of programs, activation state, where-used lists. No table contents of any application object.
</Data_Rules>

<MCP_Tools_Used>
Through `build-tr-check.mjs collect` only (its own MCP client): `GetSqlQuery` (E070, E07T, E071, TADIR, DWINACTV, D010TAB), `GetInactiveObjects`, `GetWhereUsed`; with `--cab` `GetSqlQuery` on TBTCO / TBTCP (scheduled jobs and their step programs); with `--target-dest` `GetRemoteTableContents` on the target (TADIR, VRSD, E070, E07T).
</MCP_Tools_Used>

<Files>
- `scripts/transport/build-tr-check.mjs` — `collect`, `build`
- `scripts/transport/tr-target.mjs` — target merge reads (TADIR, VRSD, used DDIC)
- `scripts/transport/tr-model.mjs` — findings and verdict per request, target merge per request
- `scripts/transport/tr-page.mjs` — the page (ko / en / ja) and the summary
- `scripts/transport/build-cab-notes.mjs` — CAB notes `prepare`, `save`, `build`, `import` ([`cab-notes.md`](cab-notes.md)); `cab-model.mjs` (impact, jobs, risk, rollback), `cab-evidence.mjs` (evidence, writer lint), `cab-page.mjs`
</Files>

<Related_Skills>
- `/sc4sap:project-dashboard` — transport throughput per workstream
- `/sc4sap:ops-health-check` — dumps after an import, with the requests that changed the program
</Related_Skills>

Task: $ARGUMENTS
