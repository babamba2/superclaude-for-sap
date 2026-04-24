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

1. Generate `team_name` = `analyze-code-<OBJECT>-<YYYYMMDD-HHMMSS>`.
2. `TeamCreate`; write `00-charter.md` with:
   - invoked_by: `/sc4sap:analyze-code`
   - members: `sap-code-reviewer`, `sap-<module>-consultant` × N
   - environment (omit null fields)
   - object: `<type>/<name>`
   - reviewer's Step 2 findings (inline summary of § 1/2/13 findings, NOT full report)
3. Emit phase banner:
   ```
   ▶ phase=2.R0 (draft) · agent=sap-code-reviewer · model=Opus 4.7
   ```
4. Spawn reviewer with `team_name`, `name=sap-code-reviewer-tm`. Prompt asks for `10-sap-code-reviewer-tm-draft.md` with:
   - `intent`: what the business-alignment findings claim
   - `content`: finding text + relevant code excerpt (≤ 30 lines)
   - `concern-axes`: specific business rules or side-effects peers should verify
   - `open-questions`: explicit asks to peers

### R1 — Peer review (parallel)

1. Spawn all N consultants with `team_name`, `name=sap-<module>-consultant`, peer context inline (R0 DRAFT inline in prompt).
2. Each consultant writes `20-<peer>-challenge-sap-code-reviewer-tm.md` (if disagreement) OR `20-<peer>-concur-sap-code-reviewer-tm.md` (if accept).
3. Phase banner:
   ```
   ▶ phase=2.R1 (review-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
   ```

### Convergence check

- All CONCUR → skip R2/R3, proceed to Step 3 with original reviewer finding (possibly annotated "peer-validated").
- Any CHALLENGE → proceed to R2.

### R2 — WORKER_REFINEMENT (conditional)

Re-spawn reviewer with `name=sap-code-reviewer-tm-r2`, peer CHALLENGEs inline. Reviewer writes `30-sap-code-reviewer-tm-refinement.md` with updated finding interpretation and `addresses` list.

### R3 — Peer final

Re-spawn consultants with `-r2` suffix names. Each writes `40-<peer>-final-sap-code-reviewer-tm.md` with CONCUR or ESCALATE.

### Lead arbitration (ESCALATE only)

Lead writes `99-lead-arbitration.md` — for analyze-code, arbitration usually means: record both the reviewer's interpretation and the dissenting consultant's interpretation in the final report under "residual-divergence" so the user sees both sides.

## Report composition — Step 3 variant

Replaces `workflow.md` Step 3 when teamMode ran:

1. Emit banner:
   ```
   ▶ phase=3 (team-report) · agent=sap-writer · model=Haiku 4.5
   ```
2. Spawn `sap-writer` **WITHOUT `team_name`** (single-shot Agent, not a team member) with task file paths.
3. Writer composes the findings report. Team-derived findings are marked:
   - "peer-validated" — consultants concurred at R1 or R3
   - "peer-refined" — reviewer's R2 refinement adopted after R1 challenges
   - "residual-divergence" — ESCALATE case; both interpretations recorded

## Response prefix — teamMode variant

```
[Model: <main> · Dispatched: Opus×1 (sap-code-reviewer) + Opus×N (consultants), Haiku×1 (sap-writer) · Team: <N+1> members × <rounds> rounds]
```

## Cleanup

1. `SendMessage(to=<name>, message={type:"shutdown_request", reason:"analyze-code teamMode complete"})` to reviewer-tm + all consultants (as **structured JSON object**, not string — see protocol.md § Cleanup guidance in ask-consultant/team-mode.md for the subtle bug).
2. Keep task directory (audit trail).

## Prototype notes

- **Scope guardrail**: Type B on analyze-code is for business-alignment dimensions only (§ 1/2/13). Technical dimensions (§ 3-12 Clean ABAP, performance, security) do NOT activate teamMode — they're reviewer's solo judgment domain.
- **Token cost concern**: reviewer-tm re-spawn duplicates the object's full context. Consider whether R0 DRAFT can reuse the Step 2 reviewer return instead of a fresh re-spawn if experiment shows redundancy.

## Related

- [`SKILL.md`](SKILL.md), [`workflow.md`](workflow.md) — main skill spec (workflow.md Step 2/3 is the integration point)
- [`analysis-dimensions.md`](analysis-dimensions.md) — 14 dimensions; teamMode applies only to § 1/2/13
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — shared protocol (§ Type B)
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc
- [`../ask-consultant/team-mode.md`](../ask-consultant/team-mode.md) — Type A prototype template (reference for round mechanics)
