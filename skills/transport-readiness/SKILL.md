---
name: transport-readiness
description: Check transport requests before they move to QA or production — open tasks, inactive objects, objects in a local package, objects that also sit in other open requests (import order), and code that needs a DDIC object of another unreleased request — with a verdict per request (ready / check / blocked) in one HTML report. Read-only; for the PMO's release gate and SM operations' import planning. Korean requests too — 이관 전 점검, 전송 요청 점검, 릴리스 전 확인, 이관 가능 여부.
model: inherit
---

# SC4SAP Transport Readiness

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): blocked — reply with the stop line there and stop.

Reads the requests to be moved and everything that decides whether they can go: their tasks, their objects, the other open requests holding the same objects, the objects' packages and activation, and the DDIC objects of other unreleased requests that their code uses. Writes **one HTML report** with a verdict per request and what to fix first.

<Purpose>
Imports fail, or break QA, for a handful of repeat reasons: a task still open, an object not activated, a structure the program needs still sitting in a colleague's request. The PMO asks "can these go tonight?", SM operations asks "in which order?" — this skill answers both before anyone opens STMS.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. This skill dispatches no agents (`Dispatched: none`).</Response_Prefix>

<Team_Mode>**No teamMode integration.** Collecting and drawing are scripted.</Team_Mode>

<Use_When>
- "Are these requests ready for QA?", "check K900123 before import", "my open requests", "release check for project [SD]", "이관 전 점검", "운영 이관 가능 여부", "릴리스 전에 확인해줘"
- Before a release window; before a hand-over to the basis team
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
| Verdict | blocked (any block) · check (warnings only) · ready (nothing) |
| Output | `<artifact-base>/transport/<date>/tr-check-<lang>.{html,md}` + `collect.json` + `model.json` (artifact base per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)) |
</Decisions_Fixed>

<Workflow>
`<B>` = `node "<PLUGIN_ROOT>/scripts/transport/build-tr-check.mjs"`, `<out>` = `<base>/transport/<today>`.

**Step 1 — Which requests.** From ARGUMENTS: request numbers, "my requests" (owner = the profile's user), or a project tag / text pattern. Target system (QAS / PRD) if named. Missing → ask once.

**Step 2 — Collect** (read-only, one call):
```
<B> collect --requests K1,K2 | --owner <USER> | --text "<pattern>"  --out-dir "<out>" --system <SID> --target <QAS|PRD>
```
Prints the counts (requests, objects, objects in other requests, inactive with its scope, dependencies). `ok:false` → show the error and stop.

**Step 3 — Build** (offline):
```
<B> build --in "<out>/collect.json" --out-dir "<out>" --lang <lang>
```

**Step 4 — Report.** Relay the summary in the user's language (one line per request: verdict and reasons) and give the HTML path. For blocked requests name the first fix (release task X / activate Y / move Z out of `$TMP` / import request W first). Do not release or import anything.
</Workflow>

<Data_Rules>
Only transport and repository metadata is read: request headers and texts, object lists, packages, activation state, where-used lists. No table contents of any application object.
</Data_Rules>

<MCP_Tools_Used>
Through `build-tr-check.mjs collect` only (its own MCP client): `GetSqlQuery` (E070, E07T, E071, TADIR, DWINACTV), `GetInactiveObjects`, `GetWhereUsed`.
</MCP_Tools_Used>

<Files>
- `scripts/transport/build-tr-check.mjs` — `collect`, `build`
- `scripts/transport/tr-model.mjs` — findings and verdict per request
- `scripts/transport/tr-page.mjs` — the page (ko / en / ja) and the summary
</Files>

<Related_Skills>
- `/sc4sap:project-dashboard` — transport throughput per workstream
- `/sc4sap:ops-health-check` — dumps after an import, with the requests that changed the program
</Related_Skills>

Task: $ARGUMENTS
