# Program test — verification loop and verdicts

Companion to [`SKILL.md`](SKILL.md) → Steps 8–10.

## What the verdict checks (`pt.mjs verdict`)

The verdict is computed from files no agent writes: the evidence ledger (`.sc4sap/evidence/ledger.jsonl`, PostToolUse hook), the captured rows and source, and `state.json`. The evidence guard denies agent writes to all of them.

| Check | Fails as |
|---|---|
| `expected.json` hash = the frozen hash (or every change recorded with reason + user yes) | `INVALID` |
| No write to the program under test or its includes since `init` | `INVALID` |
| Every planned table has captured rows, all from the run's source | `INCOMPLETE` (empty) / `INVALID` (foreign source) |
| Harness lint clean | `INCOMPLETE` |
| Harness: uploaded source = generated file, activated after the upload, ABAP Unit result after the activation (a run in between used the old version) | `INCOMPLETE` |
| Each testable case's method is in the result | `NOT_RUN` per case → `INCOMPLETE` |
| A testable case failed on the real harness, everything above clean | `PROGRAM_DEFECT` |
| Each mutant ran and a method that is green on the real harness failed (killed) | `TEST_WEAK` when one survived |
| The tamper copy ran and the tampered case's method failed (caught) | `TEST_WEAK` when missed |

Verdicts, strongest first: `INVALID` → `NOT_TESTABLE` (no testable case at all) → `INCOMPLETE` → `PROGRAM_DEFECT` → `INCOMPLETE` (mutants / tamper not run) → `TEST_WEAK` → `PARTIAL` (all testable green, some `NOT_TESTABLE`) → `PASS` (all cases testable and green). Mutants and the tamper copy guard against a false green, so they decide only when every testable case is green; a red case is confirmed by the fresh critic instead. Exit codes: 0 PASS, 1 PROGRAM_DEFECT / TEST_WEAK / INVALID, 2 INCOMPLETE, 4 PARTIAL / NOT_TESTABLE.

The `NOT_TESTABLE` count and share are printed in the second line of the report and must appear in the first lines of the user report. Programs built from FORMs with direct SELECTs on a release without the OSQL test environment often reach a high share — say so plainly and name the refactoring that would make them testable (data access in an overridable method or a FORM with table parameters); never present `PARTIAL` as "passed".

## The loop (≤ 5 rounds)

Each `pt.mjs verdict` call is one round (`round n/5` printed).

| Verdict | Next |
|---|---|
| `INCOMPLETE` — lint, activation, upload hash, missing run | Fix the harness side only (Step 6 agent with the problem lines; re-upload the regenerated file; run again) |
| `INCOMPLETE` — empty rows | Widen the WHERE in `plan.json` to hit the case (same source), read again; or mark the case `NOT_TESTABLE` with the reason (critic confirms in Step 10) |
| `TEST_WEAK` — mutant survived | The cases around that line do not pin the rule: add a boundary / negative case or a sharper value to the case (new case → Steps 2–5 for it, expected frozen again as an addition, not a change) |
| `TEST_WEAK` — tamper missed | The method does not compare against the literal (assert on the wrong field, conditional assert): Step 6 fix |
| `PROGRAM_DEFECT` | Re-check the case: the critic (fresh) recomputes the expected value from the spec and rows. Confirmed → **stop the loop** and report the defect with case, rule, rows (masked), expected, actual (ABAP Unit alert). Expected wrong → the user decides (spec citation + yes → `freeze --reason … --user-approved`), never silently |
| `INVALID` | Stop. Report what broke the run (changed expected, changed program, foreign rows); a new run starts from `init` |
| `PASS` / `PARTIAL` | Step 10 independent check |

Never in the loop: editing the program under test or its includes (only when the user asks, outside this skill), editing `expected.json` to match the actual result, deleting a failing case, lowering the row cap below what a case needs, re-running until a flaky result turns green. Round 5 without `PASS` / `PARTIAL` → stop and report the last receipt as it is.

## Independent check (Step 10)

A fresh `"sc4sap:sap-critic"` dispatch with no earlier findings and only these inputs: spec, source paths, `cases.json`, `expected.json`, `<run>/rows/*.json`, `test-class.abap`, `pt-receipt.json`. Return block:

```
VERIFY_RESULT: OK | FINDINGS
- <case id> | expected | <why the value does not follow from spec + rows>
- <case id> | assertion | <what the method really checks>
- <case id> | not-testable | <the double that would work>
- coverage | <spec rule without a case>
```

`FINDINGS` → the loop continues (counts as a round). The final report may say *passed* only with `VERIFY_RESULT: OK` and a `PASS` receipt; `PARTIAL` + OK is reported as "passed for N of M cases; K cases not testable (x%)".

## Self-check of the skill (known-bad program)

Before a release of this skill, and after changes to `pt-lib.mjs`, run it once on a known-bad sample in `$TMP` (`ZSC4SAP_PT_*` names): a program whose open-item condition is wrong (`>=` instead of `>`) with a spec that says `>`. Expected outcome: `PROGRAM_DEFECT` on the boundary case, mutants killed, tamper caught. A `PASS` there means the skill is broken. The unit tests (`tests/validation/program-test.test.ts`) cover the same logic offline.

## Report (user's language)

```
Program test ZMMR0010 · data QA (QASCLNT100) · verdict PARTIAL · round 2/5 · independent check OK
Cases 9 · pass 7 · fail 0 · not run 0 · NOT TESTABLE 2 (22%) — C07 authority check, C09 CALL TRANSACTION
Mutants 3/3 killed · tamper caught
Read: EKKO 12 rows, EKPO 31 rows (QA, masked: ERNAM) · DEV writes: $TMP ZMMR0010_PT, _M1.._M3, _TX
- C01 | spec 4.2 | lines( lt_out )=2 | PASS | qa
…
Delete the 5 $TMP test programs? (each delete is confirmed separately)
```
