# Defects and fixes (uat-scenarios, Step 8)

Companion of [`SKILL.md`](SKILL.md). For each defect of a UAT set: the transport request that fixes it, that request's CTS verdict, the retest cycle and its result — and a KPI feed for the project dashboard. Read-only on SAP; the set changes only through patches the user accepts.

## When

"Which request fixes ISS-0003?", "are the fixes ready for the 2nd cycle?", "what do we retest?", "결함 수정 요청 연결", "재테스트 대상", "수정 이관 준비됐나".

## Inputs

| Input | Use |
|---|---|
| UAT set | `<dir>/<ID>/<ID>-uat.json` (as Step 1 of SKILL.md) |
| Request pattern (optional) | the project's requests, e.g. `[SD]%` or `%ISS-%` — read with the CTS check to get each request's verdict and to find request texts that name an issue |
| Retest cycle per issue (optional) | stated by the user (`ISS-0004 retest 2nd`) — else the cycle after the step's last failure |
| Language | `ko` / `en` |

## Steps

`<B>` = `node "<PLUGIN_ROOT>/scripts/uat/build-uat.mjs"`, `<T>` = `node "<PLUGIN_ROOT>/scripts/transport/build-tr-check.mjs"`.

1. **Links the user states** ("ISS-0003 is fixed by DEVK900123", "retest ISS-0004 in 2nd") → `set-issue` operations (`transports` as a list of request numbers `<SID>K<6>`, `retest` as a cycle of the set), shown and applied as in Step 5 of SKILL.md.
2. **CTS verdicts** (optional, read-only — the transport-readiness collect): with a request pattern or the request numbers the set already names,
   ```
   <T> collect --text "<pattern>" | --requests K1,K2 --out-dir "<base>/transport/<today>-uat" --system <SID>
   <T> build --in "<base>/transport/<today>-uat/collect.json" --out-dir "<base>/transport/<today>-uat" --lang <lang>
   ```
   Skip it when the user only wants the list; every named request is then *not checked*.
3. **Defects**:
   ```
   <B> defects --dir <dir> --id <ID> [--tr "<base>/transport/<today>-uat/model.json"] --lang <lang>
   ```
   Writes `<ID>-defects-<lang>.html`, the feed `<ID>-defects.json` and, when request texts name issues the set does not link yet, `<dir>/_patch/<ID>-links.json`.
4. **Proposed links** (`proposals` > 0): show them as a numbered list (issue → requests), ask which to apply, write the accepted ones to `<dir>/_patch/<ID>-<n>.json`, run `<B> patch`, then `defects` again. Never apply a text-found link unasked.
5. **Report** in the user's language: the KPI line, one line per defect (status, requests with their CTS state), the page path. Say that "ready to move" is the CTS verdict only — whether the request was imported into QA is not read.

## Fixed rules

| Topic | Rule |
|---|---|
| Rows | Issues of type defect (or no type), and any issue logged on a failed step; `n/a` issues left out |
| Request number | `^[A-Z0-9]{3}K[A-Z0-9]{6}$` — any system id; other values are flagged by `check`, never linked |
| Status | retest-pass / retest-fail (a result in the retest cycle wins) · no-fix · fix-unchecked (request not in the CTS check) · fix-in-progress (CTS blocked or check) · fix-ready = **이관 준비됨 / ready to move** (all requests CTS ready or released) · retest-due (ready and a retest cycle without a result) |
| Released requests | A released request whose only CTS finding is *released* counts as ready |
| Text links | `ISS-0003` or `<SET>/ISS-0003` in a request text → proposal only; a text naming another set is skipped |
| Feed | `{ kind: "uat-defect-feed", set, project, at, kpi: { uat-defects-open, uat-defects-no-fix, uat-fix-ready, uat-retest-due, uat-retest-pass-rate }, rows }` — ids are fixed; the project dashboard reads the file as evidence |
| SAP | Read-only through the CTS check; nothing is released, imported or written |
