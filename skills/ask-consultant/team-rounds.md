# ask-consultant — teamMode Rounds (orchestration detail)

Companion to [`team-mode.md`](team-mode.md). Contains detailed spawn shapes, divergence check rules, and per-round orchestration. Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md).

## Rounds — lead-orchestrated serialization

### Round 1 — POSITION (always runs)

Replaces `SKILL.md` Step 4. The lead:

1. Generate a deterministic `team_name` = `ask-consultant-<YYYYMMDD-HHMMSS>`.
2. Create the shared task directory: `~/.claude/tasks/<team_name>/`.
3. Write `00-charter.md` (OMIT any environment field whose value is null / unset — never write `field: (not set)`; just drop the line):
   ```
   TEAM CHARTER
   team_name: <team_name>
   invoked_by: /sc4sap:ask-consultant
   members: <comma-separated consultant names>
   round_cap: 3
   environment:
     sapVersion: <from config.json>
     abapRelease: <from config.json>
     industry: <from config.json or sap.env>    # omit line if unset
     country: <from config.json or sap.env>     # omit line if unset
     activeModules: <comma-separated>
   question: <verbatim user question>
   ```
4. Emit phase banner per member, then spawn all N consultants **in parallel (single message, N tool calls)**:
   ```
   ▶ phase=4.R1 (position-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
   ```
   Spawn shape:
   ```
   Agent({
     subagent_type: "sc4sap:sap-<module>-consultant",
     team_name: "<team_name>",
     name: "sap-<module>-consultant",
     description: "Round 1 POSITION — <MODULE>",
     prompt: """
       teamMode=true, round=1.
       Charter: ~/.claude/tasks/<team_name>/00-charter.md

       Follow common/team-consultation-protocol.md.

       Produce a POSITION and write it to
       ~/.claude/tasks/<team_name>/10-<your-name>-position.md
       then return.
     """,
     mode: "dontAsk"
   })
   ```
5. Wait for all N members to complete. Read all `10-*-position.md` files.

### Divergence check (between rounds, lead-side, no agent call)

Lead parses each `POSITION`'s `recommendation` + `assumption` fields. Divergence rule:

- **Aligned** — all N members agree on the same core action verb on the same core object AND no member's `assumption` contradicts another's. Example: both MM and FI recommend "MIGO → MIRO with 3-way match". → **exit teamMode**, go to `team-mode.md` § Synthesis.
- **Divergent** — at least one pair disagrees on action, object, or an asserted precondition. Example: MM says "MIGO → MIRO always", FI says "MIRO-only when GR/IR suppressed by industry config". → **continue to Round 2**.
- **Edge case — one `low` confidence + others `high`**: treat as aligned if low-confidence member does not contradict the high-confidence majority.

**Fast-path heuristic** — for SPRO/config questions, extract the primary TCode or IMG node from each member's `recommendation` top sentence. If all members cite the same primary TCode (e.g., all say "OMR6" or all say "OBA4") AND `confidence` is ≥ `med` for every member, mark **aligned** immediately. Use the full assumption/precondition comparison only when TCode-match is inconclusive. Cuts lead judgment cost on straightforward questions.

### Round 2 — CHALLENGE + REFINEMENT

> R2 operational details (inline peer POSITIONs, `-r2` name suffix for re-spawn, withdrawal-as-CONCUR) — see [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § R2 spawn mechanics + § Message types.

1. Emit phase banner per member:
   ```
   ▶ phase=4.R2 (challenge-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
   ```
2. Spawn all N consultants in parallel. Spawn prompt:
   ```
   teamMode=true, round=2.
   Charter: ~/.claude/tasks/<team_name>/00-charter.md
   Round 1 positions:
     <member-1>: <content of 10-<member-1>-position.md>
     <member-2>: <content of 10-<member-2>-position.md>
     ...

   For each peer POSITION you disagree with, write
   20-<your-name>-challenge-<target>.md following common/team-consultation-protocol.md.

   Then write 30-<your-name>-refinement.md with your updated POSITION,
   citing which peer CHALLENGEs it addresses (if any are directed at you —
   peers will not have written theirs yet; address by inference / your own
   reading of round-1 positions).

   Return when both files are written.
   ```
3. Read all `20-*.md` and `30-*.md` after completion.

### Divergence check 2

Same comparator as Divergence check above, applied to `30-*-refinement.md`'s recommendation/assumption. If converged → `team-mode.md` § Synthesis. If not → Round 3. Remember: a REFINEMENT that explicitly withdraws the prior POSITION counts as CONCUR → aligned (see protocol.md § Message types "CONCUR via withdrawal").

### Round 3 — CONCUR / ESCALATE

1. Emit phase banner per member:
   ```
   ▶ phase=4.R3 (consensus-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
   ```
2. Spawn all N consultants in parallel. Spawn prompt includes all round-1+2 content:
   ```
   teamMode=true, round=3.
   Charter + all round-1+2 content attached inline.

   Append ONE entry to 40-consensus.md — either CONCUR (accept a peer's refined POSITION,
   cite which one + optional conditions) or ESCALATE (state residual issue + own stance
   + peer stances).

   Return when appended.
   ```
3. Lead reads `40-consensus.md` after all members complete.

### Lead arbitration (only when ESCALATE entries exist)

If `40-consensus.md` contains any ESCALATE entry:

1. Lead writes `99-lead-arbitration.md`:
   ```
   ARBITRATION
   residual-issues:
     - <issue-1 summarized from ESCALATE entries>
   decision: <lead picks a side OR defers to user>
   rationale: <one paragraph citing rules / environment>
   ```
2. If rationale is purely business-preference (e.g., "KR vs EU industry convention"), lead returns to Step 6 with an `ask-user` prompt instead of auto-deciding.
