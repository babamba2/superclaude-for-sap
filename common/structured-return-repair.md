# Structured Return Repair — fix the block, not the work

Orchestrator rule (skills / main thread). Many dispatches must end in a fixed block that the skill parses: `CHECKER … END` lines, the debugger's report sections, DRAFT / CHALLENGE / WORKER_REFINEMENT, `## Decisions`, `## Verification`, JSON for a builder script. When that block is missing or malformed, the work behind it is usually fine — only the format failed. Re-running the whole dispatch wastes the cost and can change the conclusion; silently using a broken block drops data. This file sets the middle path.

## What counts as malformed

- A required block or section is missing.
- The block does not match the format the skill MD defines (wrong markers, missing required field, JSON that does not parse, a verdict token outside the allowed set, `END count` ≠ number of lines).

Cosmetic drift — every required field present, only the markup differs (numbered TYPE, bold or bulleted field names, extra fencing): normalize it yourself, no repair call.

Not malformed — handle as the skill says, never "repair": `BLOCKED — <reason>` (escalation per `model-routing-rule.md`), an explicit FAIL / NOT RUN, or an answer the orchestrator disagrees with.

## Procedure

1. **Continue the same agent, once.** Load `SendMessage` first if it is deferred (ToolSearch `select:SendMessage`). Emit the banner `▶ phase=<id> (format-repair) · agent=<same agent> · model=<same model>` per `model-routing-rule.md`; in `user-defined` dispatch mode do not ask for a model — it is a continuation. Send: the exact block format from the skill MD, what is wrong, and "rewrite only this block from your own result above; do not call any tool, do not add, drop or change any finding, verdict or count".
2. **No way to continue the agent** (host without `SendMessage`, agent no longer reachable): do not dispatch a new agent — go to step 4. A fresh agent of the same type would carry that type's write tools and its full baseline.
3. **Compare before using the repaired block.** From the raw return, collect every verdict / severity token (`PASS`, `FAIL`, `NOT RUN`, `BLOCKED`, `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `MAJOR`, `MINOR`, `CONFIRMED`, `REFUTED`), every object name (`Z…` / `Y…` and every object named in the dispatch) and every number. The repaired block must carry the same tokens with the same counts, and every item in it must name an identifier that appears in the raw return. CHECKER blocks: `END count` equals the line count. If the block was missing and the raw return has none of these tokens, there is nothing to check against — the repair failed.
4. **Stop after one try.** Still malformed, step 3 failed, or step 2 applied: show the user the raw return under "Format repair failed — raw result" and mark what the skill could not parse (a Done Criteria line becomes NOT RUN, a missing CHECKER scope becomes "unscanned"). Never fill the gap with a guess.
5. **Record it.** Note "format repaired" or "format repair failed" in the skill's run state or report, so a repeated failure can be fixed in the agent's MD.

## Cost

One short continuation per malformed return, no new agent and no tool calls. Nothing runs when the format is right.
