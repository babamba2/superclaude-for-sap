# Verification Evidence — decisions, done criteria, limits of a check

Rules for how a skill reports finished work, so the user can stand behind it. Most agent output is well written and mostly right. That makes it easy to accept without a second look. These rules put three things in front of the user that a summary hides: what the agent decided on its own, what was actually run to prove the result, and what that proof does not cover.

Scope: a skill applies this file when its MD links here (today `create-program` Phase 8 and `analyze-symptom`). Rule 2's fixed-up-front Done Criteria apply to skills that build something (`create-program`); an analysis skill (`analyze-symptom`) has no pass target, so its Evidence lines say `supports` / `contradicts` / `not run` relative to the stated root cause instead of PASS / FAIL / NOT RUN. It changes the report only — no extra MCP calls, no extra agents, same cost in `standard` and `eco`.

## Rule 1 — Decisions & Assumptions section

Every final deliverable carries a section **Decisions & Assumptions** listing the choices the agent made that the user did not state explicitly. One line each:

`- <decision> — why: <reason> · to change: <what the user would do>`

What belongs here:

| Kind | Example |
|---|---|
| Default chosen | ALV layout save allowed for all users; date range defaults to current month |
| Out of scope | No authorization check on plant (not in the spec); no batch variant |
| Conflict resolved | Spec said "show all items", interview said "open items only" → open items only |
| Unverified assumption | Assumed `ZMMT0012-STATUS` values are `A`/`I` only (domain has no fixed values) |
| Scope narrowing | Read the failing include only, not the whole program; transports of the last 7 days only |

What does not belong: choices the user made in the interview (a default the agent proposed and the user only acknowledged with ok / yes does belong — the user did not choose it), choices fixed by a `common/` rule (naming, field typing), and restating the spec. If there is nothing to list, write the heading with "None — every choice came from the spec or the user." Never drop the section.

Order: most consequential first. Cap at 10 lines; past 10, group the rest by kind ("+ 6 text-element defaults").

## Rule 2 — Done criteria fixed up front, evidence shown first

A skill states what "verified" means **before** the work starts, as a short list of factual checks — a tool call and the result that counts as pass. Example for a program:

| Check | Pass |
|---|---|
| `ActivateObjects` on every created object | no error messages |
| `GetInactiveObjects` | none of this run's objects listed |
| `GetAbapSemanticAnalysis(<main program>)` — includes are not checked standalone | no errors |
| `RunUnitTest` (when Phase 5 ran) | all tests green, count > 0 |

Do not redefine "done" after the result is in. If a check could not run (tool missing, ECC limit, user skipped Phase 5), the result is **not run** — never pass.

In the report, the **Evidence** block comes before the summary. One line per check:

`- <tool> <target> → <result as returned, short excerpt> — PASS | FAIL | NOT RUN`

Quote the returned value (message text, count, object list); do not paraphrase it into "looks fine". The summary may only claim what an evidence line shows.

## Rule 3 — What the check does not prove

Each PASS line, or the Evidence block as a whole, carries the limits of that check:

`  ↳ does not prove: <property the check cannot see>`

Typical limits:

| Check | Does not prove |
|---|---|
| Activation / syntax check | business logic is right; runtime behavior with real data |
| `GetInactiveObjects` empty | objects are on the right transport |
| Unit tests green | cases the tests do not cover; tests written with the same mistake as the code pass too |
| Code review PASS | only the conventions reviewed; not the requirement itself |
| Dump explained by the source | that this is the only path to the dump; that the fix has no side effects |
| A tool's success message | that the target screen (SE80, Form Painter, SM30) shows it the same way |

End the report with one line that names the one thing a person should still check by hand before relying on the result (for example "Run the program once in DEV with a real plant and compare the totals with MB52").

## Placement in a report

```
## Evidence            ← Rule 2 (+ Rule 3 lines)
## Summary             ← claims backed by Evidence only
## Decisions & Assumptions   ← Rule 1
## Still check by hand ← Rule 3 closing line
```

A skill whose output format already has its own sections keeps them and inserts these where its MD says.

## Language

Localize the section headings to the report language. The verdict tokens (PASS / FAIL / NOT RUN, supports / contradicts / not run) stay in English.
