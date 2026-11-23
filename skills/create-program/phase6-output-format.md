# Phase 6 — Review Output Format + Failure Handling

Companion file split from [`phase6-review.md`](./phase6-review.md) to keep each MD under the 200-line limit. The convention checklist lives in `phase6-review.md`; this file is the authoritative source for the report artifact format and the violation-fix loop.

## Output File Format

Write to `.sc4sap/program/{PROG}/review.md`:

```markdown
# Phase 6 Review — {PROG}

**Date**: YYYY-MM-DD
**Reviewer Agent**: sap-code-reviewer
**Strategy**: buckets | detect-judge
**Spec ref**: spec.md
**Objects reviewed**: list of N objects

<To do header — common/review-questions.md § 3: to fix / to answer, review load, read, not read, To do list>

## Conventions Checked

| # | Convention | Verdict | Notes |
|---|------------|---------|-------|
| 1 | alv-rules.md           | PASS / FIX-APPLIED / N/A | Screen flow logic, GUI PFKEYS verified |
| 2 | text-element-rule.md   | ... | counts.I / S / R / H verified |
| 3 | constant-rule.md       | ... | ... |
| 4 | procedural-form-naming | ... | ... |
| 5 | oop-pattern.md         | ... | ... |
| 6 | include-structure.md   | ... | Procedural-`E` absence verified |
| 7 | naming-conventions.md  | ... | ... |
| 8 | clean-code.md          | ... | ... |
| 9 | abap-release-reference | ... | ... |
| 10| sap-version-reference  | ... | ... |
| 11| spro-lookup.md         | ... | ... |
| 12| Activation state       | ... | GetInactiveObjects=0 for {PROG}* |

## Violations Fixed In-Phase

For each FIX-APPLIED entry: object name, line excerpt, what was changed, why.

## Questions

| # | Object:line | Question | Answer | Effect |
|---|-------------|----------|--------|--------|
| Q1 | {PROG}F01:120 | Should one failed item stop the whole run? | Intended — keep / Not intended — fix / Open / Auto: keep / Auto: fix (why) | none / FIX-APPLIED / open (if_not fix shown) |

## Final Verdict

✅ ALL PASS — proceed to Phase 8
or
❌ BLOCKED — list residual violations and reason
```

## Business Questions

Runs after the merge (buckets) or the judge (detect-judge) and BEFORE the first fix dispatch. Rules: [`../../common/review-questions.md`](../../common/review-questions.md).

Before anything is asked or decided, main drops every question that `decisions.md` (incl. the Phase 4 live consultant review lines — Phase 3.5 Step 1b) or `plan.md` § *Conflict Resolutions* already answers (`review-questions.md` § 1).

| Mode (`state.json` → `execution_mode`) | What happens |
|---|---|
| `manual` / `hybrid` | Ask with `AskUserQuestion` (≤ 4 per call, `best` option first as *Recommended*). In `hybrid` this is the only stop between Phase 4 and Phase 8. |
| `auto` | Never ask. Apply `best` per `review-questions.md` § 6 and record it as auto-decided. |
| any mode, unattended per `review-questions.md` § 4 | Same as `auto`. |

- *Not intended — fix* or auto `fix` → one `FIX` line with `sev_if_not` and `if_not`; it joins the fix loop below like any finding. *Intended — keep* or auto `keep` → no fix. Each question is one line in `decisions.md` in the format of `review-questions.md` § 5. An auto `fix` that fails or does not converge is reverted and left open — never `❌ BLOCKED` (`review-questions.md` § 6).
- Open and not-asked questions never block the verdict — they are not convention violations, and the Phase 8 gate ignores `review.md` § Questions. They are listed in `review.md` § Questions, in the Phase 8 report (*Decisions & Assumptions* → *Open questions*, with the `if_not` fix) and in `handoff.md` open items. A later answer runs as `--fix` ([`cost-rules.md`](cost-rules.md) § 1c).
- Auto-decided questions go into the Phase 8 report section *Business questions decided automatically* and force the `report.html` copy (`review-questions.md` § 6).

## Failure Handling

- On any violation: the reviewer (read-only) returns a `FIX` line per finding and the fix is applied per [`cost-rules.md`](cost-rules.md) § 1a (small fix: main-thread Edit; larger: a fresh `sap-executor` with the `FIX` lines only; never a resumed agent) via `Update*` and re-activated. Documentation-only flagging is NOT acceptable — every confirmed finding is fixed or the run ends `❌ BLOCKED` (auto-decided fixes excepted: reverted and left open, `review-questions.md` § 6).
- After all fixes, re-verify the diff only (changed lines + enclosing FORM / method, scoped to the fixed findings); skip it when every fixed finding was MINOR (none touched a MAJOR-class item) and syntax check + activation + inactive check pass. Loop until ALL PASS or 3 iterations exhausted.
- If 3 iterations exhausted with residual violations: STOP, write `review.md` with `❌ BLOCKED`, surface to user with the specific violation list. Phase 8 is blocked.

## False-Positive Patterns That Reviewer MUST Reject

These patterns have been observed as "PASS" reports that later turned out to be broken. Reviewer must actively detect them — absence of evidence is a fail, not a pass.

- **Screen created but flow logic commented out** — `flow_logic` contains only `* MODULE STATUS_xxxx.` / `* MODULE USER_COMMAND_xxxx.` (leading `*`). Empty runtime behavior.
- **GUI Status created but empty** — `definition.STA[*].CODE` exists yet no PFKEYS array and no application toolbar codes. Toolbar renders blank.
- **Text pool partial** — `counts.I > 0` but `counts.S == 0` while source declares `SELECT-OPTIONS` / `PARAMETERS`. Selection screen shows technical names.
- **Include created but not activated** — `GetInactiveObjects` shows `{PROG}{SUFFIX}` entries after the main program was reported as activated. Main program runs but throws `LOAD_PROGRAM_LOST` at a PERFORM call.
- **Procedural paradigm with an `{PROG}E` include** — event blocks relocated out of Main body; forbidden per `common/include-structure.md`.
- **Main program with no `INCLUDE` statements while plan says N includes exist** — executor inlined every declaration into Main; violates `main-program.abap` template and the include-structure convention.
- **OK_CODE binding broken** — any of: (a) screen has an OKCODE field with no `NAME` or a `NAME` that is not the TOP OK_CODE variable, (b) TOP include declares no OK_CODE variable (`OK_CODE`, `GV_OKCODE`, …) despite a screen being present, or (c) PAI (module, user-command FORM or method) does `CASE sy-ucomm.`. A missing local copy + `CLEAR` is only MINOR. Runs on the main screen; fails silently on the first popup or ALV toolbar event. See `common/ok-code-pattern.md`.
