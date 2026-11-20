---
name: program-test
description: Test an existing ABAP program on DEV without moving it to QA — test cases and expected results are fixed from the spec and the source first, then real rows are read (DEV by default; QA or production through the user's SM59 destinations when chosen), masked by the MCP server before they reach the model, and the rows injected as test doubles into a $TMP harness that runs the program's own code with ABAP Unit. Verdict per case from the ABAP Unit result, never from an agent; a strict loop fixes only the test (never the program), and the test itself is checked — planted mutants must be caught, a tampered expected value must fail. Reports the share of cases that cannot be tested. Korean requests too — 프로그램 테스트, 가상 테스트, QA 데이터로 테스트, 운영 데이터로 테스트, 이관 전 테스트, 단위 테스트 돌려줘.
model: inherit
---

# SC4SAP Program Test

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): blocked — reply with the stop line there and stop.

Runs the program's real code on DEV against realistic rows, so the developer knows whether it does what the spec says **before** the transport goes to QA. Nothing runs on QA or production, nothing is written there, and the program under test is never changed.

<Purpose>
"It worked with my test data" is the usual reason a program fails in QA. This skill tests with the data the program will meet — DEV's own by default, or a sample of QA / production rows on request — while keeping the run honest: expected results are frozen before the code runs, verdicts come from SAP's ABAP Unit result, and the tests must prove they can fail.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Phase_Banner>Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus|Sonnet|Haiku>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention. Resolve the dispatch mode ([`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md)) and the cost mode ([`../../common/cost-mode.md`](../../common/cost-mode.md); eco → pass both `model` and `effort` per the table below, `Skill("sc4sap:eco", "--attach")` first and on every continuation turn).</Phase_Banner>

<Team_Mode>**No teamMode integration.** One agent per phase; the independent check is a fresh `sap-critic`.</Team_Mode>

<Use_When>
- "Test ZMMR0010 before it goes to QA", "run the program with QA data", "프로그램 테스트", "QA 데이터로 테스트해줘", "이관 전에 테스트"
- Right after `/sc4sap:create-program` finished (its report offers this skill with the program name and spec)
- A changed program whose behaviour must be shown against real data patterns
</Use_When>

<Do_Not_Use_When>
- Writing the program → `/sc4sap:create-program` (it writes its own unit tests in Phase 5)
- Static review → `/sc4sap:analyze-code` · a dump in a run → `/sc4sap:analyze-symptom`
- Business UAT scenarios with users → `/sc4sap:uat-scenarios`
- Connected profile is QA / PRD (the harness is written to `$TMP` on DEV) → stop with the tier message from `pt.mjs init`
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Data source | `dev` (default, the connected DEV system, no destination) · `qa` · `prd` — chosen per run. QA / PRD rows come only through `GetRemoteTableContents` with the destination in the profile `config.json` → `testDataSources` ([`data-sources.md`](data-sources.md)). Missing destination blocks only that choice; the skill never creates SM59 entries |
| Where code runs | DEV only, in `$TMP` harness programs (`<PROG>_PT`, mutants `_M1…_M3`, tamper `_TX`). No transport, no SAP standard object, the program under test untouched |
| Order | cases → expected → data plan → reads → freeze → harness → run → mutants + tamper → verdict. Expected values are written **before** any code runs and frozen by hash |
| Personal data | Every read during a run carries `mask` (the run's salt): the MCP server masks personal fields default-deny before the answer leaves it, and the read gate (`pt-gate.mjs`) denies a read without it. Personal / credential tables refused; tokens are HMAC under a key only the MCP server holds; the capture hook saves only server-masked rows ([`data-sources.md`](data-sources.md) § Masking) |
| Row caps | Default 20 per table, max 200; only the fields the logic reads; QA needs a WHERE on key / indexed fields |
| Production | The user's choice per run (`MASKING_RELEASE_PINNED` is true since the MCP masking release, sc4sap 0.6.70). Guards: `testDataSources.prd` must be set (else exit 5); the gate lets PRD reads through only after one masked probe read in the same run proved the server masks (an older server ignores `mask`), and only through the run's own destination; unmasked answers are never saved; the plan rules apply (fields, WHERE, ≤ 200 rows, refused tables). Every PRD table read is its own confirmation (dest, table, fields, WHERE, cap shown); the `GetRemoteTableContents` permission prompt is never pre-approved |
| Test doubles | S/4 (≥ 7.51): `CL_OSQL_TEST_ENVIRONMENT`. ECC / < 7.51: override of the data-access method or the routine fed with internal tables. A case whose DB access cannot be doubled = `NOT_TESTABLE`, never PASS ([`harness.md`](harness.md)) |
| Verdict | From the evidence ledger (ABAP Unit result per method) by `pt.mjs verdict`: `PASS` · `PARTIAL` (all testable green, some not testable) · `PROGRAM_DEFECT` · `TEST_WEAK` · `INCOMPLETE` · `INVALID` · `NOT_TESTABLE` ([`verification-loop.md`](verification-loop.md)) |
| Loop | ≤ 5 rounds; only the test class changes; expected values change only with a spec citation and the user's yes |
| Systems | Same flow on ECC and S/4; S/4 runs program containers with MCP ≥ the version that adds `RunUnitTest` PROG on S/4 (older MCP → `INCOMPLETE` with the tool error) |
| Output | `<base>/program/<PROG>/test/<run>/` (artifact base per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)): `cases.json`, `expected.json`, `plan.json`, `test-class.abap` (agents) · `state.json`, `rows/` (masked), `src/`, `ddic/`, `harness/`, `pt-receipt.json`, `report.md` (scripts / hook only — the evidence guard blocks agent writes) |
</Decisions_Fixed>

<Workflow>
`<PT>` = `node "<PLUGIN_ROOT>/scripts/program-test/pt.mjs"`, `<run>` = the folder `init` prints. Agents get SAP text in `<sap-data>` blocks ([`../../common/sap-content-as-data.md`](../../common/sap-content-as-data.md)).

**Progress.** Before each step print one line `Step <n> of 0–11 — <label>` (user's language) next to the phase banner, so a long run never looks stuck.

**Step 0 — Scope.** From ARGUMENTS / the create-program hand-off: program name, spec path (`spec=` argument, else `spec.md` in `<base>/program/<PROG>/` or `.sc4sap/program/<PROG>/`), data source (default `dev`). Program name missing → ask in plain text with an example ("Which program? e.g. ZMMR0010"). Then **one `AskUserQuestion`** with only the questions still open (skip one the arguments answer):
- *Data source* — `DEV (Recommended)`: the connected DEV system's rows, nothing to set up · `QA`: a masked sample of QA rows over `testDataSources.qa`, nothing written to QA (offered only when it is set or the user asked for QA) · `PRD`: only when the user asked for production — masked, each table asked one by one (then `init --source prd`). Not offered = not listed; when DEV is the only choice, skip the question.
- *Cost mode* — only when [`../../common/cost-mode.md`](../../common/cost-mode.md) leaves it open (no `--eco` / `--standard`, no `costModeBySkill` / `costMode` preference, not started through `/sc4sap:eco`): `Standard (Recommended)` (the skill as written) · `Economy` (cheaper sub-agent models, the same checks: planted bugs, tamper copy, independent review). Economy = this run is `--eco`: `Skill("sc4sap:eco", "--attach")` before the first dispatch, as in § Eco.
- *Spec* (only when no spec file was found) — `Source only` (the report says the source is the only rule basis) · `I'll give a path or paste it`.
Then print the **run plan** in three lines before anything runs: (1) Steps 0–11, about 3–4 agent dispatches per round, up to 5 rounds; (2) what you will be asked: the data plan (once), `CreateProgram` / `UpdateProgram` / `ActivateObjects` / `RunUnitTest` for up to five `$TMP` programs (`<PROG>_PT`, `_M1`–`_M3`, `_TX`), each production table; (3) nothing on QA / production is written and the program under test is never changed. Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:program-test`.

**Step 1 — Init.** `<PT> init --program <PROG> --source <dev|qa|prd>` (`--base` per § Web intake). Exit 5 → the destination is not set: show the printed SM59 how-to and say it is saved with `/sc4sap:sap-option` → *Test data sources*; offer `dev` instead (`AskUserQuestion`: `Use DEV rows (Recommended)` · `Stop and set the destination first`). Exit 6 → not a DEV profile, stop. Then read the program's source with `GetProgram` (and `GetIncludesList` + `GetInclude` for each include) — the capture hook saves it under `<run>/src/`.

**Step 2 — Cases** (`▶ phase=2 (cases) · agent=sap-analyst · model=Opus`). Dispatch `"sc4sap:sap-analyst"` with the spec, the source path list and [`harness.md`](harness.md) § Cases. It returns `cases.json`: every rule of the spec and every branch of the source gets a case (positive, negative, empty input, boundary), each citing the spec section and the condition line(s) it exercises (`INCLUDE:line`), the tables it needs, the double kind, or `testable: false` with the reason. Write the file to `<run>/`.

**Step 3 — Coverage review** (`▶ phase=3 (coverage) · agent=sap-critic · model=Opus`). Dispatch `"sc4sap:sap-critic"` with spec + source paths + `cases.json`: missing rules, missing negative / empty cases, wrong `NOT_TESTABLE` claims. Apply its findings (one round), then `<PT> check --run <run>` until only the data-plan and expected items remain.

**Step 4 — Data plan + reads.** Write `<run>/plan.json` (per table: fields, WHERE, `max_rows`, cases; `personal_reason` when a personal field is needed). `<PT> check`. Show the plan as one table and get the user's go (QA: once for the plan). Optionally `GetTable` for a planned table to spot custom personal fields for `mask-extra` (the capture keeps its field list under `<run>/ddic/`); the server reads the DDIC itself for masking. Then read, one table per call; a `GetSqlQuery` must fit the strict grammar of [`data-sources.md`](data-sources.md) § Masking (plain fields, one table, simple WHERE) or its rows are not saved:
- Every read passes `mask: { salt: <state.json salt>, extra_fields: <state.json mask_extra> }` — the gate denies it otherwise.
- `dev` → `GetSqlQuery` (`sql_query` = `SELECT <fields> FROM <table> WHERE …`, `row_number` = `max_rows`) — per-call consent applies.
- `qa` / `prd` → `GetRemoteTableContents` with `destination` = the run's destination, `fields`, `where`, `max_rows`. `prd`: first one masked probe on DEV (`GetSqlQuery` `SELECT mandt FROM t000 UP TO 1 ROWS` with the mask); a denied probe means the MCP server cannot mask — stop and say so.
Blocklist denials are final — drop the table and mark its cases `NOT_TESTABLE`. Extra personal fields found in DDIC (custom `ZZ*` names, addresses in text fields) → `<PT> mask-extra --run <run> --fields …` **before** the read. The server's name / data-element shapes are generic; customer-specific personal fields always need `mask-extra` — above all one typed with a clear-list data element (e.g. a person's ID in a Z field typed `KUNNR`).

**Step 5 — Expected** (`▶ phase=5 (expected) · agent=sap-analyst · model=Opus`). Dispatch `"sc4sap:sap-analyst"` with the spec, `cases.json` and the masked rows (`<run>/rows/*.json`, never the raw response). It derives each case's expected values from the spec rules and the rows — not from running or reading the program's output logic line by line — and states the basis. Write `expected.json`, then `<PT> check` → `<PT> freeze --run <run>`.

**Step 6 — Harness** (`▶ phase=6 (harness) · agent=sap-qa-tester · model=Sonnet`). Dispatch `"sc4sap:sap-qa-tester"` with [`harness.md`](harness.md), `cases.json`, `expected.json`, the double kind per case, the release (`config.json`), and the VALUE rows from `<PT> abap-rows --run <run> --table <T>`. It returns `test-class.abap` only (no SAP writes). Write it to `<run>/`, then `<PT> harness --run <run>` (lint: every case method, value assertions with the frozen expected literals, HARMLESS, no DB writes, no unmasked values). Lint problems → back to the same agent with the list.

**Step 7 — Run.** Main thread, once per run first: `SearchObject` for each of the five names (`init` printed them) — any hit means the name is taken: stop and report, never update or activate a program this run did not create (on the web the server enforces it). Then: `CreateProgram` (`$TMP`) + `UpdateProgram` with the **exact** text of `<run>/harness/<PROG>_PT.abap` → `ActivateObjects` → `RunUnitTest` (`container_type: PROG`; S/4 then `GetUnitTestStatus` / `GetUnitTestResult`). Activation error → the error goes back to Step 6 (test class only).

**Step 8 — Test the test.** `<PT> mutants --run <run>` writes up to 3 mutants (a flipped condition on a cited line) and one tamper copy (one expected literal changed). Upload, activate and run each exactly like Step 7. Exit 1 (no condition line cited, no literal found) → back to Step 2 for the cited lines.

**Step 9 — Verdict + loop.** `<PT> verdict --run <run>` → `pt-receipt.json`, `report.md`, exit code. Then follow [`verification-loop.md`](verification-loop.md): fix the test and repeat Steps 6–9, or stop. ≤ 5 rounds.

**Step 10 — Independent check** (`▶ phase=10 (verify) · agent=sap-critic · model=Opus`, fresh dispatch, no earlier findings). Inputs: spec, source paths, `cases.json`, `expected.json`, `test-class.abap`, `pt-receipt.json`. It answers: does each expected value follow from the spec and the masked rows; does each assertion test the case's rule; is any `NOT_TESTABLE` avoidable. A finding → back to the loop (counts as a round).

**Step 11 — Report + close.** `<PT> close --run <run>`. Report (user's language): verdict line, the evidence lines from `report.md` (copied, never upgraded), the **NOT_TESTABLE share in the first lines**, data source and tables read with row counts, what was written on DEV (`$TMP` program names), the report path. Offer to delete the `$TMP` programs — each `DeleteProgram` needs the user's yes per call. Then one **Next** line by verdict (offer, never start): `PASS` / `PARTIAL` → `/sc4sap:transport-readiness <request>` before the move · `PROGRAM_DEFECT` → the failing cases with their spec section, and `/sc4sap:analyze-code <PROG>` · `TEST_WEAK` / `INCOMPLETE` → what blocked the loop and a re-run once it is fixed.
</Workflow>

<Web_Intake>
A web run sends the form values as lines (`Program name:`, `Data source: DEV|QA|PRD`, `Mode: Economy|Standard`, `Spec:`); they answer Step 0's questions — do not ask them again. The web names an output folder: `init --base <folder>` (the run folder becomes `<folder>/program/<PROG>/test/<stamp>/`).
</Web_Intake>

<Eco>
| Phase | standard | eco |
|---|---|---|
| 2, 5 analyst | Opus | Sonnet, effort medium |
| 3, 10 critic | Opus | Sonnet, effort medium |
| 6 qa-tester | Sonnet | Sonnet (first round), Haiku, effort low for lint-only repair rounds |

Never skipped in eco: coverage review, freeze, mutants, tamper, the independent check, masking (server-side, every read), the production probe and per-table confirmation.
</Eco>

<MCP_Tools_Used>
`GetProgram`, `GetIncludesList`, `GetInclude`, `GetTable` / `GetStructure` / `GetDataElement` (field meaning, personal fields), `GetSqlQuery` (DEV rows), `GetRemoteTableContents` (QA rows), `CreateProgram`, `UpdateProgram`, `ActivateObjects`, `GetInactiveObjects`, `RunUnitTest`, `GetUnitTestStatus`, `GetUnitTestResult`; `DeleteProgram` only on the user's per-call yes.
</MCP_Tools_Used>

<Files>
- `scripts/program-test/pt.mjs` — `init`, `mask-extra`, `check`, `freeze`, `abap-rows`, `harness`, `mutants`, `verdict`, `close`
- `scripts/program-test/pt-lib.mjs` — masking, plan / case / expected checks, harness build + lint, mutants, tamper, verdict
- `scripts/program-test/pt-capture.mjs` — capture side of the PostToolUse recorder (`scripts/evidence/record.mjs`): masked rows, source as read
- `scripts/evidence/guard.mjs` — denies agent writes to the run's state, rows, source, harness and receipt
</Files>

<Related_Skills>
- `/sc4sap:create-program` — builds the program; its Phase 8 report hands over to this skill
- `/sc4sap:transport-readiness` — after a green test, whether the request can move
- `/sc4sap:sap-option` — `testDataSources` (QA / PRD destinations)
</Related_Skills>

Task: $ARGUMENTS
