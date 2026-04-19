# Phase 6 — Review Output Format + Failure Handling

Companion file split from [`phase6-review.md`](./phase6-review.md) to keep each MD under the 200-line limit. The convention checklist lives in `phase6-review.md`; this file is the authoritative source for the report artifact format and the violation-fix loop.

## Output File Format

Write to `.sc4sap/program/{PROG}/review.md`:

```markdown
# Phase 6 Review — {PROG}

**Date**: YYYY-MM-DD
**Reviewer Agent**: sap-code-reviewer
**Spec ref**: spec.md
**Objects reviewed**: list of N objects

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

## Final Verdict

✅ ALL PASS — proceed to Phase 8
or
❌ BLOCKED — list residual violations and reason
```

## Failure Handling

- On any violation: the reviewer **fixes the violation directly** via `Update*` MCP tools and re-activates. Documentation-only flagging is NOT acceptable.
- After all fixes, re-fetch sources and re-verify. Loop until ALL PASS or 3 iterations exhausted.
- If 3 iterations exhausted with residual violations: STOP, write `review.md` with `❌ BLOCKED`, surface to user with the specific violation list. Phase 8 is blocked.

## False-Positive Patterns That Reviewer MUST Reject

These patterns have been observed as "PASS" reports that later turned out to be broken. Reviewer must actively detect them — absence of evidence is a fail, not a pass.

- **Screen created but flow logic commented out** — `flow_logic` contains only `* MODULE STATUS_xxxx.` / `* MODULE USER_COMMAND_xxxx.` (leading `*`). Empty runtime behavior.
- **GUI Status created but empty** — `definition.STA[*].CODE` exists yet no PFKEYS array and no application toolbar codes. Toolbar renders blank.
- **Text pool partial** — `counts.I > 0` but `counts.S == 0` while source declares `SELECT-OPTIONS` / `PARAMETERS`. Selection screen shows technical names.
- **Include created but not activated** — `GetInactiveObjects` shows `{PROG}{SUFFIX}` entries after the main program was reported as activated. Main program runs but throws `LOAD_PROGRAM_LOST` at a PERFORM call.
- **Procedural paradigm with an `{PROG}E` include** — event blocks relocated out of Main body; forbidden per `common/include-structure.md`.
- **Main program with no `INCLUDE` statements while plan says N includes exist** — executor inlined every declaration into Main; violates `main-program.abap` template and the include-structure convention.
- **OK_CODE binding broken** — any of: (a) screen has an OKCODE field but no `NAME=GV_OKCODE`, (b) TOP include is missing `DATA: gv_okcode TYPE sy-ucomm.` despite a screen being present, or (c) a PAI `user_command_xxxx` FORM does `CASE sy-ucomm.` instead of copying `gv_okcode` to a local. Runs on the main screen; fails silently on the first popup or ALV toolbar event. See `common/ok-code-pattern.md`.
