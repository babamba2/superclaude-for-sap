# analyze-code — Team Mode orchestration (Type B rollout)

Companion to `SKILL.md` + `workflow.md`. Applies Type B (Coder ↔ Consultant, asymmetric worker-centric) of [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) to **business-alignment review**. Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § Type B.

## Gating — when teamMode activates

teamMode runs AFTER Step 2 (reviewer full review) when ALL:

1. Reviewer's return includes ≥ 1 finding on a **business-alignment dimension** — § 1 (Business Purpose), § 2 (Rule Faithfulness), or § 13 (Cross-Module Side-Effects) per [`analysis-dimensions.md`](analysis-dimensions.md).
2. The analyzed object touches **2+ modules** (imports from FI tables AND MM FM, or similar).

When not satisfied → skip teamMode, proceed to Step 3 legacy report.

## Asymmetric roles

| Role | Agent | Count |
|---|---|---|
| Worker | `sap-code-reviewer` (same instance that ran Step 2, re-spawned for deliberation) | 1 |
| Peers | `sap-<module>-consultant` — one per module the code touches | 1-3 |

## Rounds

### R0 — DRAFT (worker)

Transport is return-based ([`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § Transport): reviewer and consultants are R/O, return blocks, and never write files — the lead writes every task file.

1. Generate a run ID `team_name` = `analyze-code-<OBJECT>-<YYYYMMDD-HHMMSS>` (directory name only — never passed to `Agent(...)`).
2. Create `~/.claude/tasks/<team_name>/`; write `00-charter.md` with:
   - invoked_by: `/sc4sap:analyze-code`
   - members: `sap-code-reviewer`, `sap-<module>-consultant` × N
   - environment (omit null fields)
   - object: `<type>/<name>`
   - reviewer's Step 2 findings (inline summary of § 1/2/13 findings, NOT full report)
3. Emit phase banner:
   ```
   ▶ phase=2.R0 (draft) · agent=sap-code-reviewer · model=Opus
   ```
4. Spawn reviewer (`teamMode=true`, `member=sap-code-reviewer-tm`, charter inline, "return the DRAFT block; do NOT write any file"). The lead writes it to `10-sap-code-reviewer-tm-draft.md`. DRAFT fields:
   - `intent`: what the business-alignment findings claim
   - `content`: finding text + relevant code excerpt (≤ 30 lines)
   - `concern-axes`: specific business rules or side-effects peers should verify
   - `open-questions`: explicit asks to peers

### R1 — Peer review (parallel)

1. Spawn all N consultants (`teamMode=true`, `member=sap-<module>-consultant`) with peer context inline (R0 DRAFT inline in prompt).
2. Each consultant returns a CHALLENGE (disagreement) or CONCUR (accept) block; the lead writes `20-<peer>-challenge-sap-code-reviewer-tm.md` or `20-<peer>-concur-sap-code-reviewer-tm.md`.
3. Phase banner:
   ```
   ▶ phase=2.R1 (review-<MODULE>) · agent=sap-<module>-consultant · model=Opus
   ```

### Convergence check

- All CONCUR → skip R2/R3, proceed to Step 3 with original reviewer finding (possibly annotated "peer-validated").
- Any CHALLENGE → proceed to R2.

### R2 — WORKER_REFINEMENT (conditional)

Re-dispatch reviewer (`member=sap-code-reviewer-tm`, `round=2`) with peer CHALLENGEs inline. Reviewer returns a WORKER_REFINEMENT block (updated finding interpretation + `addresses` list); the lead writes `30-sap-code-reviewer-tm-refinement.md`.

### R3 — Peer final

Re-dispatch consultants (`round=3`) with DRAFT + refinement inline. Each returns CONCUR or ESCALATE; the lead writes `40-<peer>-final-sap-code-reviewer-tm.md`.

### Lead arbitration (ESCALATE only)

Lead writes `99-lead-arbitration.md` — for analyze-code, arbitration usually means: record both the reviewer's interpretation and the dissenting consultant's interpretation in the final report under "residual-divergence" so the user sees both sides.

## Report composition — Step 3 variant

Replaces `workflow.md` Step 3 when teamMode ran:

1. Emit banner:
   ```
   ▶ phase=3 (team-report) · agent=sap-writer · model=Haiku
   ```
2. Spawn `sap-writer` (single-shot Agent, not a deliberation member) with task file paths.
3. Writer composes the findings report. Team-derived findings are marked:
   - "peer-validated" — consultants concurred at R1 or R3
   - "peer-refined" — reviewer's R2 refinement adopted after R1 challenges
   - "residual-divergence" — ESCALATE case; both interpretations recorded

## Response prefix — teamMode variant

```
[Model: <main> · Dispatched: Opus×1 (sap-code-reviewer) + Opus×N (consultants), Haiku×1 (sap-writer) · Team: <N+1> members × <rounds> rounds]
```

## Cleanup

No shutdown step — members are one-shot dispatches that terminate on return. Keep the task directory (audit trail).

## Prototype notes

- **Scope guardrail**: Type B on analyze-code is for business-alignment dimensions only (§ 1/2/13). Technical dimensions (§ 3-12 Clean ABAP, performance, security) do NOT activate teamMode — they're reviewer's solo judgment domain.
- **Token cost concern**: reviewer-tm re-spawn duplicates the object's full context. Consider whether R0 DRAFT can reuse the Step 2 reviewer return instead of a fresh re-spawn if experiment shows redundancy.

## Related

- [`SKILL.md`](SKILL.md), [`workflow.md`](workflow.md) — main skill spec (workflow.md Step 2/3 is the integration point)
- [`analysis-dimensions.md`](analysis-dimensions.md) — 14 dimensions; teamMode applies only to § 1/2/13
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — shared protocol (§ Type B)
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc
- [`../ask-consultant/team-mode.md`](../ask-consultant/team-mode.md) — Type A prototype template (reference for round mechanics)
