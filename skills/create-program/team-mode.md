# create-program — Team Mode orchestration (Type A rollout)

Companion to `SKILL.md` + `agent-pipeline.md`. Applies Type A (Cross-Module Consultant Panel) of [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) to Phase 1A (multi-module interview reconciliation) and Phase 2 (planning conflict resolution). Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md).

## Two integration points

| Integration | When it activates | Team role |
|---|---|---|
| **Phase 1A** — post-interview reconciliation | ≥ 2 consultants summoned AND interview outputs cite cross-module touchpoints (e.g., MM mentions FI auto-posting, FI mentions MM reference data) | Check business-rule consistency across modules before `module-interview.md` is finalized |
| **Phase 2** — planner conflict resolution | Planner detects conflict between Phase 1A business rule and Phase 1B technical choice, OR plan spans 2+ modules with contested ownership | Reconcile resolution (e.g., "Z-table vs CDS", "Z BAdI vs append structure") |

Both use the same rounds protocol; only the charter content and synthesis feed differ.

## Gating — Phase 1A

Run after all per-consultant interview dimensions (1-6) complete but BEFORE writing `module-interview.md`. Activate when:

1. `module_set.length ≥ 2` (multi-module interview path).
2. Any consultant's answer references another module's data (cross-module touchpoint detected in answers to dim 3, 4, or 5).

If `module_set.length == 1` OR no cross-module touchpoints in answers → skip teamMode, write `module-interview.md` from individual answers as legacy.

## Gating — Phase 2

Run after planner's initial spec draft but BEFORE `plan.md` finalization. Activate when:

1. Planner's reconciliation (per `agent-pipeline.md` Phase 2 "Inputs") identifies a contradiction between `module-interview.md` (Phase 1A) and `interview.md` (Phase 1B), OR
2. Plan touches 2+ modules AND the CBO reuse gate / customization reuse gate flags a candidate that is owned by a different module than the plan's primary module.

If solo-module plan OR no conflict → skip teamMode, planner proceeds to `plan.md` directly.

## Round 1 — POSITION (both phases)

Lead:

1. Generate `team_name`:
   - Phase 1A: `create-program-p1a-<PROG>-<YYYYMMDD-HHMMSS>`
   - Phase 2: `create-program-p2-<PROG>-<YYYYMMDD-HHMMSS>`
2. `TeamCreate`; shared task dir auto-created.
3. Write `00-charter.md` (omit null env fields):
   ```
   TEAM CHARTER
   team_name: <team_name>
   invoked_by: /sc4sap:create-program · Phase <1A|2>
   members: <sap-<module>-consultant × N for each module in module_set>
   round_cap: 3
   environment:
     sapVersion: <from config.json>
     abapRelease: <from config.json>
     industry: <from config.json>               # omit if unset
     country: <from config.json>                # omit if unset
     activeModules: <comma-separated>
   program: <PROG name from Phase 1B>
   inputs:
     # Phase 1A:
     - per-consultant interview answers (dim 1-6 each)
     - .sc4sap/program/<PROG>/module-interview.md.DRAFT (pre-finalization)
     # Phase 2:
     - .sc4sap/program/<PROG>/module-interview.md
     - .sc4sap/program/<PROG>/interview.md
     - planner's detected conflict summary (inline in charter)
   question: |
     # Phase 1A: "Are your module's interview answers consistent with the others' visible here? List any cross-module rule contradictions."
     # Phase 2: "Resolve this conflict: <planner's conflict summary>. Which side wins per your module's standard, and why?"
   ```
4. Spawn all consultants **in parallel**:
   ```
   ▶ phase=1A.R1.reconcile (position-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
     # OR
   ▶ phase=2.R1.resolve (position-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
   ```
   Spawn shape (same skeleton as `ask-consultant/team-mode.md` § Round 1, with `team_name`, `name`, `teamMode=true`, `round=1`, pointer to charter). Consultants write `10-<name>-position.md`.
5. Read all POSITION files.

### POSITION field expectations

- **Phase 1A**: `recommendation` = "consistent with peers" OR "conflict with <peer>: <one-line issue>"
- **Phase 2**: `recommendation` = "adopt <X> because <reason>" where X is one side of the conflict OR a third-option synthesis

## Divergence check

- **Phase 1A**: aligned = all positions say "consistent" with no flagged conflicts. Divergent = any position flags a conflict.
- **Phase 2**: aligned = all positions recommend the same resolution. Divergent = 2+ recommendations differ.

**Fast-path**: if fewer than 2 conflict flags (Phase 1A) OR identical recommendation strings across all members (Phase 2), skip Rounds 2-3.

## Rounds 2 & 3 — CHALLENGE / REFINEMENT / CONCUR / ESCALATE

Same pattern as ask-consultant/team-mode.md. Lead re-spawns members in parallel each round with accumulated context. Round 3 produces `40-consensus.md`. On ESCALATE, lead writes `99-lead-arbitration.md` picking a side with rationale cited from rules or escalating to the user when the choice is business-preference (e.g., "KR industry convention vs corporate global standard").

> R2 operational details (inline peer POSITIONs, `-r2` name suffix for re-spawn, withdrawal-as-CONCUR) — see [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § R2 spawn mechanics + § Message types.

## Synthesis — phase-specific feed

### Phase 1A synthesis

**Target**: finalize `.sc4sap/program/<PROG>/module-interview.md` with a reconciled cross-module section.

Spawn `sap-writer` (Sonnet override, **NOT team member**):
```
▶ phase=1A.R3.synthesis · agent=sap-writer · model=Sonnet 4.6
```
Prompt: read task files + per-consultant interview answers → compose final `module-interview.md` including a new `## Cross-Module Consistency` section with reconciled rules (or flagged residuals from ESCALATE).

Return to Phase 1B gating as usual. Phase 1B does not re-run — it starts fresh with the reconciled file.

### Phase 2 synthesis

**Target**: feed resolution into `plan.md` as a section. Planner resumes normally.

Spawn `sap-writer` (Sonnet override, NOT team member):
```
▶ phase=2.R3.synthesis · agent=sap-writer · model=Sonnet 4.6
```
Prompt: compose a resolution paragraph from `40-consensus.md` / `99-lead-arbitration.md`. Planner inserts the output into `plan.md` § *Conflict Resolutions* before the standard plan body.

## Response prefix — teamMode variant

Overrides standard prefix for the relevant phase turn:

```
[Model: <main> · Dispatched: Opus×N (consultants), Sonnet×1 (sap-writer synthesis) · Team: <N> members × <rounds> rounds]
```

## Cleanup

1. **Shutdown teammates** — parallel `SendMessage(to=<name>, {type:"shutdown_request", reason:"teamMode complete"})` per member.
2. **Keep directories** — NOT `TeamDelete`; Phase 6 review may cite team records; prototype audit trail retained.

Writer is regular Agent (no team_name) — no shutdown_request.

## Prototype notes

- **Phase 1A benefit vs cost**: multi-module interviews are already expensive (3+ consultant dispatches). Adding 1-2 more rounds only when cross-module touchpoints are detected keeps amortized cost reasonable.
- **Phase 2 benefit**: highest ROI integration — conflicts caught here avoid Phase 4 rework. Worth aggressive teamMode gating even at small token overhead.
- **Interaction with `multi-executor-split.md`**: teamMode runs BEFORE Phase 4 executor split. Plan.md conflict-resolution section informs executor group assignments.

## Related

- [`SKILL.md`](SKILL.md), [`agent-pipeline.md`](agent-pipeline.md) (Phase 1A lines 16-47, Phase 2 lines 65-78), [`interview-gating.md`](interview-gating.md)
- [`../ask-consultant/team-mode.md`](../ask-consultant/team-mode.md) — Type A prototype template
- [`../compare-programs/team-mode.md`](../compare-programs/team-mode.md) — Type A second application (ownership conflict variant)
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — shared protocol
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc
