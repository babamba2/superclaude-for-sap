# ask-consultant — Team Mode orchestration (Phase 1 prototype)

Companion to `SKILL.md`. Invoked when the gating in § Gating evaluates true. Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md). Round orchestration detail: [`team-rounds.md`](team-rounds.md).

## Gating — when teamMode activates

teamMode is **escalation-on-divergence**, not a separate entry mode. Steps 1–4 Round 1 always run. teamMode activates at the end of Round 1 when ALL of the following are true:

1. `member_count ≥ 2` (module routing produced 2+ consultants).
2. Divergence detected in Round 1 POSITIONs (see [`team-rounds.md`](team-rounds.md) § Divergence check).

When teamMode does NOT activate (single consultant, or Round 1 POSITIONs align) → fall through to the legacy synthesis path in `SKILL.md` Step 5.

## Flow summary

Full per-round spawn shapes, divergence rules, and arbitration logic are in [`team-rounds.md`](team-rounds.md). Short summary:

- **Round 1** (always runs) — N consultants spawn in parallel, each writes a POSITION file.
- **Divergence check** — lead parses POSITIONs. Aligned → exit to § Synthesis. Divergent → Round 2.
- **Round 2** — re-spawn with peer POSITIONs inline (`-r2` name suffix); each writes CHALLENGEs + REFINEMENT.
- **Divergence check 2** — refined POSITIONs aligned (incl. via explicit withdrawal) → § Synthesis. Else Round 3.
- **Round 3** — members append CONCUR or ESCALATE to `40-consensus.md`.
- **Lead arbitration** — on any ESCALATE, lead writes `99-lead-arbitration.md` with a decision + rationale.

## Synthesis (Step 5, teamMode variant)

Replaces the Haiku main / Sonnet writer path of `SKILL.md` Step 5.

1. Emit phase banner:
   ```
   ▶ phase=5 (team-synthesis) · agent=sap-writer · model=Sonnet 4.6
   ```
2. Spawn `sap-writer` with `model: "sonnet"` override and **NO `team_name` parameter** (single-shot Agent, NOT a team member — avoids idle-notification overhead and keeps the team scope to deliberation only). Prompt:
   ```
   Team deliberation complete. Files:
     ~/.claude/tasks/<team_name>/00-charter.md
     ~/.claude/tasks/<team_name>/10-*.md         (round 1 positions)
     ~/.claude/tasks/<team_name>/20-*.md         (round 2 challenges, optional)
     ~/.claude/tasks/<team_name>/30-*.md         (round 2 refinements, optional)
     ~/.claude/tasks/<team_name>/40-consensus.md (round 3 consensus)
     ~/.claude/tasks/<team_name>/99-lead-arbitration.md (only on ESCALATE)

   Produce a cross-module answer for the user:
     1. Final recommendation (converged position OR arbitrated decision).
     2. How it was reached (which round converged, or ESCALATE + lead decision).
     3. Per-module rationale (one paragraph each).
     4. Any residual conditions or user-preference points.

   Do NOT re-answer the question — compose from the task files only.
   ```
3. Writer's return is the body of the user-facing response.

## Response prefix — teamMode variant

Override `SKILL.md` § Output_Format's prefix to include team cost:

```
[Model: <main> · Dispatched: Opus×<N> (consultant names), Sonnet×1 (sap-writer synthesis) · Team: <N> members × <rounds> rounds]
```

Where `<rounds>` is the actual rounds executed (1 if aligned in Round 1 and teamMode exited, else 2 or 3).

## Cleanup

After Step 6 completes and the user sees the answer:

1. **Shutdown teammates** — send `SendMessage(to=<name>, message={type:"shutdown_request", reason:"teamMode complete"})` to each team member in parallel (one tool call each, same message). **Pass `message` as a structured JSON object, NOT a JSON string** — the `message` parameter value must be the object `{type: "shutdown_request", reason: "..."}`, NOT a stringified form like `'{"type":"shutdown_request",...}'`. The latter is parsed as plain text and the teammate goes idle without approving. Teammates auto-approve and terminate; no `TeamDelete` needed.
2. **Keep directories** — do NOT call `TeamDelete` (it would wipe `~/.claude/tasks/<team_name>/` which is the audit trail needed for Phase 2 evaluation). Retention policy: last 30 teams kept, older auto-pruned by a separate script (deferred).

Note: Writer is NOT a team member (§ Synthesis) — it terminates on return like any regular Agent, so no shutdown_request.

## Prototype exit criteria (per architecture doc Phase 2)

Before promoting to other skills:

1. Run ≥ 3 real cross-module questions through both legacy and teamMode paths.
2. Manual grading: teamMode answer is measurably better on ≥ 2 of 3 (better = identifies a constraint/conflict that legacy missed).
3. Token cost of teamMode < 1.5× legacy on average.
4. Round distribution: track how many questions converge at R1 vs R2 vs R3 vs ESCALATE. Adjust round cap or gating if R3/ESCALATE dominates (too confrontational) or R1 dominates (teamMode not triggering).

## Related

- [`SKILL.md`](SKILL.md) — main skill spec (has gating entry point)
- [`team-rounds.md`](team-rounds.md) — round orchestration detail (R1/R2/R3 + lead arbitration)
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — shared protocol (message types, file layout)
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc (4 types, rollout plan)
