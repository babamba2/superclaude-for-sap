# create-program — Team Mode (Type D Interview Synthesis)

Companion to `team-mode.md` (Type A — Phase 1A/2) + `team-mode-b.md` (Type B — Phase 4). Applies Type D (Interview Synthesis Team) of [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) to the **Phase 1A ↔ Phase 1B bridge** — live cross-check of business requirements against technical feasibility DURING interview, before spec is frozen. Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — reuses Type A message types with role-specific semantics.

## Gating — user choice (MANDATORY prompt at Phase 1A close)

Type D activates **only when the user explicitly chooses it**. Immediately after `module-interview.md` is finalized (Phase 1A business ambiguity ≤ 5%) and before Phase 1B starts, the skill MUST present a binary execution-style prompt and wait for the user's explicit answer.

### Prompt (starter text; localize freely)

> Phase 1B can run in two execution styles:
>
> - **(1) Legacy sequential** — `sap-analyst` + `sap-architect` ask you each of the 7 technical dimensions, one per turn. Slower; full per-dimension user control.
> - **(2) Type D team synthesis** — `sap-analyst` + `sap-architect` + 1-2 consultants compose `interview.md` directly via R1 POSITION (+ optional R2 REFINEMENT) rounds, synthesizing answers from Phase 1A context + domain expertise. You review the composed file before Phase 2. Faster; surfaces cross-role conflicts early.

### Recommendation heuristic (lead uses only when user says "알아서" / "you decide")

- Suggest **Type D** when `module_set.length ≥ 2` AND Phase 1A answers imply non-trivial technical choices (e.g., CDS vs Z-table, Full-ALV vs SALV).
- Suggest **Legacy** otherwise (single-module OR all Phase 1A answers technically trivial).

The user answer is authoritative — the heuristic is guidance, not auto-gating.

### Persistence

Persist the choice to `.sc4sap/program/{PROG}/state.json`:

```
"phase1b": {
  "execution_style": "legacy" | "type-d",
  "chosen_at": "<ISO-8601>",
  "chosen_by": "user" | "lead-default"
}
```

### On "legacy"

Skip the rest of this file. Phase 1B runs per [`agent-pipeline.md`](agent-pipeline.md) § Phase 1B (analyst + architect sequential questioning of the 7 dimensions, one per turn).

### On "type-d"

Continue with the rounds below.

## Team composition

| Role | Agent | Count |
|---|---|---|
| Requirements lead | `sap-analyst` | 1 |
| Technical lead | `sap-architect` | 1 |
| Domain validator | `sap-<module>-consultant` (from Phase 1A active set) | 1-2 |

## Rounds (Type A shape, role-specific POSITION semantics)

### R1 — POSITION (parallel spawn per dimension or bundled)

For each contested dimension (Paradigm, Display mode, Data source, etc.), each member writes `10-<name>-<dimension>-position.md`:

- **Analyst POSITION** — `recommendation` = business-driven functional requirement for this dimension (e.g., "user needs real-time ALV with drill-down to document").
- **Architect POSITION** — `recommendation` = technical implementation path (e.g., "full CL_GUI_ALV_GRID with Docking + Splitter; consider SALV factory fieldcat").
- **Consultant POSITION** — `recommendation` = module-correctness check (e.g., "if touching VBAK, use BAPI_SALESORDER_GETLIST not direct SELECT, per configs/SD/bapi.md").

Spawn prompt embeds `module-interview.md` excerpt + Phase 1B's current dimension question.

Phase banner:
```
▶ phase=1.bridge.R1 (synthesis-<ROLE>) · agent=<name> · model=Opus 4.7
```

### Divergence check (per dimension)

- **Aligned** — all 3 POSITIONs compatible (analyst's requirement achievable via architect's path without violating consultant's module constraint). → record dimension as settled; next dimension.
- **Divergent** — analyst wants X, architect says X costs 3x vs Y, consultant says X violates SPRO constraint. → R2 for this dimension.

### R2 — CHALLENGE + REFINEMENT (per contested dimension)

Same as Type A. E.g., architect challenges analyst's "real-time ALV" on performance grounds → analyst refines with acceptable latency threshold → consultant concurs on feasibility. Converged → mark dimension settled.

### R3 — CONCUR / ESCALATE (per dimension)

Dimensions that still diverge after R2 → ESCALATE → lead either picks a side with rationale (typical) or asks user (only for business-preference trade-offs).

## Synthesis — updates to `interview.md` + `module-interview.md`

Unlike Type A (Phase 1A/2) which feeds synthesis to sap-writer, Type D's output is **direct updates** to the two interview artifacts:

1. `module-interview.md` gets a new `## Cross-Phase Reconciliation` section with settled dimensions + any lead-arbitrated choices.
2. `interview.md` (Phase 1B output) is **composed by the team directly** — the bridge team writes it, not a separate sap-writer dispatch. This saves a round-trip.

Spawn pattern: after R3 (or R1 if all aligned), the analyst posts the final `interview.md` content to `50-interview-md.md` in the task dir. Lead copies it to `.sc4sap/program/<PROG>/interview.md`.

## Response prefix

```
[Model: <main> · Dispatched: Opus×1 (sap-analyst) + Opus×1 (sap-architect) + Opus×N (consultants) · Team: <N+2> members × <rounds> rounds · Phase 1A↔1B bridge]
```

## Cleanup

1. Shutdown all team members (structured `shutdown_request` — all agents now have `<Team_Shutdown_Handler>` per 2026-04-24 platform fix).
2. Keep `~/.claude/tasks/<team>/` audit trail — Phase 2 planner and Phase 6 reviewer may cross-reference reconciled dimensions.

## Prototype notes (Phase 7 scaffolding)

- **Runtime validation pending**.
- **Interaction with Phase 1A Type A**: the existing Phase 1A Type A (`team-mode.md` § Phase 1A) focuses on **cross-module CONSISTENCY** between consultants. Type D here is a **vertical** synthesis — analyst (what) + architect (how) + consultant (module-correct). Both can co-exist: Phase 1A Type A runs first to reconcile multi-module rules, then Phase 1A↔1B Type D runs to map those rules to technical choices.
- **Token cost warning**: Phase 1B currently runs dimension-by-dimension sequentially for cost efficiency. Type D parallelizes the dimension work at the cost of ~2-3× consultant/analyst/architect invocations. Use only when the earlier Type A signalled unresolved trade-offs, or when `plan.md` rework risk is high.

## Related

- [`SKILL.md`](SKILL.md), [`agent-pipeline.md`](agent-pipeline.md) (Phase 1A/1B sections) — main skill
- [`team-mode.md`](team-mode.md) — Type A (Phase 1A/2); complementary
- [`team-mode-b.md`](team-mode-b.md) — Type B (Phase 4); complementary
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — shared protocol
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc (Type D definition)
- [`../ask-consultant/team-rounds.md`](../ask-consultant/team-rounds.md) — round mechanics template
