---
name: uat-scenarios
description: UAT and integration test (SIT) scenarios for a module, a process area or an end-to-end flow across modules, built and kept as an editable scenario set — scenarios (process chain / process / task) with STEP rows (activity, system, T-code, check points, input data, expected output, test user, result per test cycle, follow-up, issue). The module consultant proposes scenarios and steps as a patch the user accepts or rejects item by item; T-codes are checked in the system; progress per cycle is tracked; exported to Excel in the integrated-test layout or the flat scenario-list layout. Korean requests too — UAT 시나리오, 통합 테스트(통테) 시나리오, SIT, 테스트 케이스, 테스트 결과 정리.
model: inherit
---

# SC4SAP UAT Scenarios

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): full — the consultant's proposals work without a connection; T-codes are marked *unchecked*.

Builds and maintains one **UAT scenario set** per module or process area as JSON (`scripts/uat/build-uat.mjs`). The set is a working document: the consultant drafts it, the user edits it, test results are recorded per cycle, and every change the AI suggests arrives as a list of operations the user accepts or rejects one by one — never as a rewrite of the whole set.

<Purpose>
Test teams keep UAT scenarios in large workbooks that drift: steps without T-codes, checks without expected results, failed steps without a follow-up. This skill keeps the scenarios in one model, proposes what is missing from the module's standard process and the system's own T-codes, flags gaps, and exports the workbook layouts the team already uses.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Team_Mode>**No teamMode integration.** One module consultant dispatch per proposal round.</Team_Mode>

<Use_When>
- "UAT scenarios for MM purchasing", "integration test scenarios", "test cases for order to cash", "UAT 시나리오 만들어줘", "통합 테스트 시나리오", "테스트 결과 정리", "2차 테스트 결과 반영"
- Before a test cycle (draft), during it (results, follow-ups), after it (export, open items)
- Defects and their fixes: which request fixes ISS-0003, is the fix CTS-ready, what to retest ("결함 수정 요청 연결", "재테스트 대상") → [`defects.md`](defects.md)
</Use_When>

<Do_Not_Use_When>
- ABAP unit tests for one program → `/sc4sap:create-program` QA phase
- A process map of how the module runs → `/sc4sap:module-to-process`
- Running the test in SAP — this skill documents and tracks; it posts nothing
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Model | set → scenarios → steps, plus an issue list (`scripts/uat/uat-model.mjs`); step IDs `STEP-001…` renumbered after every change (issues follow their step); scenarios carry company / channel / product group / lead module / key check point / earlier scenario ID / planned and actual date / result; steps carry a phase (section) and the cycles they run in |
| Kind | `uat` (user acceptance, one module or process area) or `sit` (integration test: end-to-end across modules — every step carries its module, a scenario must cross modules, and the step where the work changes hands checks what arrived: a document, a posting, a status) |
| Proposals | Patch operations `set-scenario`, `set-step`, `add-step`, `remove-step`, `add-scenario`, `add-issue`, `set-issue`, `remove-issue` ([`proposal-prompt.md`](proposal-prompt.md)); shown as a numbered list, applied only for the numbers the user accepts; an operation that names something missing is skipped with its reason |
| T-codes | Every SAP step's T-code is checked with `GetTransaction`; unknown ones are reported, never replaced on a guess. Customer programs and RFC entry points may stand in a T-code column — checked with `SearchObject` |
| Cycles | Default `1st`, `2nd`, `3rd`; results `pass` / `fail` / `blocked` / `n/a` per cycle; a step may run in some cycles only |
| Issues | `ISS-0001…` per set: scenario, step, module, type, text, raised on / by, follow-up, state `open` / `waiting` / `done` / `n/a`, owner, fixing requests (`transports`, `<SID>K<6>`), retest cycle; a failed step without a follow-up or a logged issue is flagged, a closed defect without a fixing request too |
| Dashboard | Per lead module and per company: planned, due by today, tested, pass, fail; steps per cycle; open issues; module participation matrix — in `show` / `check` and as the first sheet of both exports (plus Scenario List and Issue List sheets) |
| Test data | Inputs name the fields and the kind of value ("a vendor with a release strategy"), not real business partners. Real document or master data numbers only when the user gives them |
| People | Owner and consultant are typed by the user; test users are user IDs — never names |
| Output | `<artifact-base>/uat/<ID>/<ID>-uat.json` (the set), `<ID>-uat.html` (the editable page — the main deliverable; `uat-page.mjs`), exports `<ID>-uat-A.xlsx` (integrated test: schedule, activities, one sheet per scenario) / `<ID>-uat-B.xlsx` (flat list + test-user IDs) |
</Decisions_Fixed>

<Workflow>
Paths: `<base>` = artifact base ([`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)), `<dir>` = `<base>/uat`, `<B>` = `node "<PLUGIN_ROOT>/scripts/uat/build-uat.mjs"`.

**Step 1 — Which set.** An existing set named or found under `<dir>` → Step 5. New set: one message asking for what is missing of: kind (UAT or integration test), module (for an integration test the leading module and the modules it crosses), process scope (process chains or processes), set ID (≤ 30 letters, digits, `_` `-`), cycles, language (from `config.json`, default `ko`). If a process map exists (`processes/<MODULE>/`, module-to-process) offer it as the scope.

**Step 2 — Draft.** Dispatch `sc4sap:sap-<module>-consultant` with [`proposal-prompt.md`](proposal-prompt.md) § Draft. It returns the set as JSON (scenarios with steps). Write it to `<dir>/_answers/<ID>.json` and run `<B> init --answers <that file> --dir <dir>` — it writes the set, the editable page `<ID>-uat.html` (dashboard, scenarios by phase, results per cycle, issues, checks — edit mode, Save downloads the edited page) and both workbooks (`<ID>-uat-A.xlsx`, `<ID>-uat-B.xlsx`) next to it; give the page first, then the workbooks, in the first report.

**Step 3 — T-codes.** For each distinct T-code of an SAP step: `GetTransaction`. Unknown → collect. Report the unknown ones in one line and offer: replace (the consultant proposes the system's one), keep (marked), or remove the step. Offline: skip, and say the T-codes are unchecked.

**Step 4 — Review.** `<B> check --dir <dir> --id <ID>` → show the progress line and the issues (≤ 15, grouped by scenario). Offer: fix with a proposal (Step 5), edit by hand, or export (Step 6).

**Step 5 — Proposal round.** The user names what to improve ("suggest the missing steps of MM02", "fill expected outputs", "record 1st cycle results: STEP-003 failed — release strategy not triggered"). Results and edits the user states are written as operations directly; anything to invent goes to the consultant with [`proposal-prompt.md`](proposal-prompt.md) § Patch and `<B> show` as context. Show the operations as a numbered list (one line each: scenario · step · field · new value), ask which to apply, write the accepted ones to `<dir>/_patch/<ID>-<n>.json`, run `<B> patch` (it rewrites the page and both workbooks). Report applied / skipped, the new issue count and that the Excel files are up to date.

**Step 6 — An edited page comes back.** A page saved from its edit mode: `<B> import <edited.html> --dir <dir>` — the set, page and workbooks are rewritten; report the new issue count.

**Step 7 — Export elsewhere.** The workbooks are already next to the set (Step 2 / 5). Into another folder: `<B> export --dir <dir> --id <ID> --layout A|B|both --out-dir <folder>`. Give the paths.

**Step 8 — Defects and fixes** ([`defects.md`](defects.md)): fixing request, its CTS verdict and the retest per defect, plus the dashboard feed.
</Workflow>

<Output_Format>
```
UAT set MM-PTP · 6 scenarios · 41 steps · cycles 1st / 2nd / 3rd
Excel: uat/MM-PTP/MM-PTP-uat-A.xlsx (integrated test) · MM-PTP-uat-B.xlsx (list)
1st: 30 pass · 4 fail · 1 blocked · 6 open
Issues (5): MM02/STEP-004 SAP step without a T-code · MM03/STEP-002 failed without a follow-up · …
Proposal (7): 1. MM02 · after STEP-003 · add "Release purchase order" (ME29N) …
Apply which? (e.g. "1-4, 6" / all / none)
```
Reply in the user's language.
</Output_Format>

<MCP_Tools_Used>
`GetTransaction`, `SearchObject` (T-code and program checks). No table reads, no writes.
</MCP_Tools_Used>

<Files>
- `scripts/uat/uat-model.mjs` — model, `validate`, `progress`, `applyPatch`
- `scripts/uat/uat-xlsx.mjs` — layouts A and B
- `scripts/uat/uat-page.mjs` — the editable page (model inlined, edit mode, Save)
- `scripts/uat/build-uat.mjs` — `init`, `check`, `patch`, `import`, `page`, `export`, `show`, `defects`
- `scripts/uat/uat-defects.mjs`, `uat-defects-page.mjs` — defect ↔ request ↔ retest rows, proposed links, KPI feed, the page
</Files>

<Related_Skills>
- `/sc4sap:module-to-process` — the process map a scenario set can start from
- `/sc4sap:ops-health-check` — dumps during a test cycle
- `/sc4sap:analyze-symptom` — root cause of a failed step's dump
</Related_Skills>

Task: $ARGUMENTS
