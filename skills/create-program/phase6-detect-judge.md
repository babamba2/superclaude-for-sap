# Phase 6 — `detect-judge` Strategy (Haiku detectors × N → Opus judge)

Alternative to the 4-bucket Sonnet strategy in [`phase6-buckets.md`](./phase6-buckets.md). Same checklist ([`phase6-review.md`](./phase6-review.md) §1–§12), same output ([`phase6-output-format.md`](./phase6-output-format.md)), different distribution: **cheap Haiku workers find candidates, one Opus agent decides**. Model rationale: [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Tier 3.

## Selection

Read once per run: `~/.sc4sap/preferences.json` → `phase6Strategy` = `buckets` (default) | `detect-judge`. Missing / unknown → `buckets`. Record the choice in `state.json` → `6_review.strategy`. `detect-judge` stays opt-in until the golden-set comparison below shows recall ≥ `buckets`.

## Step 1 — Detector fan-out (Haiku, `sc4sap:sap-checker`, `MODE: detect`)

Detector groups cover the **mechanical** checklist items — the ones answerable by pattern + count:

| Group | Checklist items | Rule file passed | Typical patterns |
|---|---|---|---|
| **D1 UI** | §1 | `alv-rules.md`, `ok-code-pattern.md`, `screen-tabstrip.md` | tabstrip screen without `CALL SUBSCREEN` in PBO or PAI / tab PUSH without `PUSH_FCODE` or `REF_FIELD`, repeated `APPEND … TO …fcat`, `CASE sy-ucomm` (or a copy of `sy-ucomm`) in a PAI module / user-command FORM / user-command method, Custom Control container, commented `MODULE`, OKCODE without `NAME` or with a `NAME` that is not the TOP OK_CODE variable, empty GUI status (a global `OK_CODE` / `GV_OKCODE` dispatched directly in the PAI module or an `LCL_ALV` method is allowed — not a candidate) |
| **D2 Text** | §2 | `text-element-rule.md` | literal in `MESSAGE` / screen label, `TEXT-xxx` count vs `counts.I`, selection fields vs `counts.S`, E-language key set |
| **D3 Hygiene** | §3, §8 core list | `constant-rule.md`, `clean-code.md` | magic literals in branches, `'X'`/`' '` for booleans, `SELECT *`, `SELECT` in `LOOP`, unchecked `sy-subrc`, `BREAK-POINT`, commented-out code, `DEFAULT KEY` |
| **D4 Structure** | §4, §6, §7 | `include-structure.md`, `naming-conventions.md` | missing `INCLUDE` line per planned suffix, Procedural `{PROG}E`, program-level `DATA` outside TOP (not inside FORM / METHOD / MODULE; OOP `GO_DATA` / `GO_ALV` after `DEFERRED` in `{PROG}c` are allowed), FORM `_{screen}` suffix, Z/Y + module prefix, FM placeholder signature |
| **D5 Platform** | §9, §10, §12 | `abap-release-reference.md`, `sap-version-reference.md` | syntax newer than `abapRelease`, S/4-only tables on ECC (and the reverse), inactive objects |

Dispatch rules (main thread, ONE message):
- One checker per **(group × object batch)**. Batch objects so one checker sees ≤ ~3,000 source lines; never mix groups in one checker. Cap: 16 checkers per fan-out — above that, widen the batches.
- Each prompt: `MODE: detect`, the group id, the object list, the rule file path(s) as absolute paths (resolved from the plugin root), and the checklist item text copied from `phase6-review.md` for those items (so the checker does not open the checklist). Add `paradigm` and `abapRelease` / `sapVersion` from `interview.md` / `config.json`.
- Main concatenates every `CHECKER … END` block into `.sc4sap/program/{PROG}/review-candidates.md`, unchanged. `status=BLOCKED` on a scope → split it and re-dispatch once; still blocked → give that scope to the judge as "unscanned".
- Banner: `▶ phase=6.detect · agent=sap-checker×N · model=Haiku`.

## Step 2 — Opus judge (`sc4sap:sap-code-reviewer`, `model: "opus"`)

One dispatch. The judge receives `review-candidates.md`, the object list, `spec.md`, `interview.md`, and `consult-{module}.md` paths. It:

1. **Adjudicates every `CAND` line** — confirm or reject with a one-line reason. Opens source only around the cited line (`GetInclude` / `GetProgram`), not whole programs. Merges duplicates across groups.
2. **Runs the judgment items itself** (no detector can decide these): §5 OOP two-class separation, §8 paradigm-specific design (method size / responsibility, template conformance of Main), §11 SPRO consistency against `consult-{module}.md`. Reads only the files those sections name.
3. **Reviews every "unscanned" scope** from Step 1 directly.
4. Classifies each confirmed finding `MINOR` / `MAJOR` per `phase6-buckets.md` § Finding Classification, and returns the full `review.md` body (per-item verdict table) plus a machine-readable fix list: `FIX obj=<name> item=<§n> severity=<MINOR|MAJOR> line=<n> change="<what to change>"`.

The reviewer agent is read-only (`disallowedTools: [Write, Edit]`, no `Update*` tools) — it **returns** text; main writes `review.md`. Banner: `▶ phase=6.judge · agent=sap-code-reviewer · model=Opus`.

## Step 3 — Fix loop

- Fix list empty → `review.md` verdict `✅ ALL PASS` → Phase 8.
- Otherwise main dispatches `sc4sap:sap-executor` with `model: "opus"` and the `FIX` lines (one dispatch; split per object only when > 10 fixes). Executor applies `Update*` + re-activates.
- Re-run Step 1 **only for the fixed objects and only the groups that produced the findings**, then the judge **scoped to those findings**. Max 3 iterations; afterwards residual MAJOR → `❌ BLOCKED` per `phase6-output-format.md`.
- In `manual` / `hybrid` mode, prompt before the first fix dispatch.

## Golden-set gate (before making `detect-judge` the default)

Build `tests/golden/phase6/` from past incidents, one program each: manual `LVC_T_FCAT` build, empty GUI status, missing `S` texts, include left inactive after activation, Procedural `{PROG}E` include, everything inlined into Main, `CASE sy-ucomm`, FM placeholder signature, tabstrip PAI without `CALL SUBSCREEN`. Run both strategies on each and record per strategy: **defects caught / planted (recall)**, false MAJORs, total cost, wall-clock. Switch the default only when `detect-judge` recall ≥ `buckets` recall on every case.

## State.json

```json
"6_review": {
  "strategy": "detect-judge",
  "detect": { "checkers": 11, "candidates": 23, "blocked_scopes": 0, "sec": 14 },
  "judge": { "confirmed": 3, "rejected": 20, "major": 1, "sec": 52 },
  "fix_iterations": 1,
  "total_sec": 95
}
```
