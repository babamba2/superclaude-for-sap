# create-program — Team Mode (Type B, Phase 4 rollout)

Companion to `team-mode.md` (Type A — Phase 1A/2) + `phase4-parallel.md`. Applies Type B (Coder ↔ Consultant) of [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) to **Wave 2 / Wave 3** of Phase 4 — executor's novel code drafts get live business-alignment review from module consultants BEFORE activation. Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § Type B.

## Gating

Activates within Wave 2 (G2 Classes, G3 Function Modules) or Wave 3 (G5 Main + Includes) when ALL:

1. `module_set.length ≥ 2` in `plan.md` (multi-module program).
2. The in-progress code draft references tables/FMs/BAdIs belonging to **≥ 2 distinct modules** (detect via table prefix — `EKKO/EKPO` = MM, `VBAK/VBAP` = SD, `BKPF/BSEG` = FI, `AUFK/CSKS` = CO, etc.).
3. The code is **novel business logic** (not template fill — skip for text elements, boilerplate screens, standard CRUD).

When not satisfied → skip teamMode, proceed to activation as per standard Phase 4. Failed gating is not a finding — it means live review is overkill for that code.

## Asymmetric roles

| Role | Agent | Count |
|---|---|---|
| Worker | `sap-executor` (the one drafting Wave 2/3 code) | 1 |
| Peers | `sap-<module>-consultant` per module the code touches | 2-3 |

## Rounds

### R0 — DRAFT (by executor, pre-activation)

Executor writes code via `CreateClass` / `UpdateClass` / `CreateFunctionModule` etc. as usual, but BEFORE calling `ActivateObjects`:

1. Generate `team_name` = `create-program-p4-<PROG>-<YYYYMMDD-HHMMSS>`.
2. `TeamCreate`; write `00-charter.md` with:
   - invoked_by: `/sc4sap:create-program Phase 4 Wave <N>`
   - members: `sap-executor-tm`, `sap-<module>-consultant` × N
   - environment (omit null fields)
   - program: `<PROG>` from Phase 1B
   - spec.md + plan.md excerpts (relevant sections only, not full files)
3. Emit phase banner:
   ```
   ▶ phase=4.W<N>.R0 (draft) · agent=sap-executor · model=Opus 4.7
   ```
4. Spawn executor with `team_name`, `name=sap-executor-tm`. Prompt asks for `10-sap-executor-tm-draft.md` with:
   - `intent`: what the code does in business terms
   - `content`: code snippet (≤ 80 lines — just the novel business logic, NOT boilerplate)
   - `concern-axes`: module-level concerns (e.g., "does this FM use correct SD output determination?")
   - `open-questions`: specific questions for consultants

### R1 — Peer review (parallel)

Spawn all N consultants with inline DRAFT. Each consultant writes:
- `20-<peer>-challenge-sap-executor-tm.md` (CHALLENGE) if pattern violates module best-practice or misses standard FM/BAdI
- `20-<peer>-concur-sap-executor-tm.md` (CONCUR) if the code is acceptable from the module's view

Phase banner per consultant:
```
▶ phase=4.W<N>.R1 (review-<MODULE>) · agent=sap-<module>-consultant · model=Opus 4.7
```

### Convergence check

- All CONCUR → proceed directly to `ActivateObjects` (label finding as "peer-validated" in phase6 metadata).
- Any CHALLENGE → R2.

### R2 — WORKER_REFINEMENT

Re-spawn executor with `name=sap-executor-tm-r2`, peer CHALLENGEs inline. Executor writes `30-sap-executor-tm-refinement.md` + actually performs the `UpdateClass` / `UpdateFunctionModule` / `UpdateInclude` MCP calls to revise the code. The refinement file documents WHICH peer challenges drove WHICH code changes.

### R3 — Peer final

Re-spawn consultants with `-r2` suffix. Each writes `40-<peer>-final-sap-executor-tm.md` with CONCUR or ESCALATE.

### Lead arbitration (ESCALATE only)

Lead writes `99-lead-arbitration.md`. For Phase 4, ESCALATE typically means "module consultants can't agree on approach" — lead picks one side, documents in `plan.md` § *Conflict Resolutions* as "Phase 4 arbitration: <decision>", and executor proceeds with that choice. Never block Phase 4 on an ESCALATE — always decide and continue, record for Phase 6 review visibility.

## Integration with existing Phase 4 flow

- teamMode B runs **inside** a Wave, **before** activation.
- Does NOT replace Phase 6 review — Phase 6 still runs, but with `peer-validated` annotations on the relevant dimensions.
- If teamMode B activates in Wave 2 AND Wave 3, they run as **separate team cycles** (different `team_name`) — avoids mixing G2 class draft with G5 include draft.
- Transport shared across waves as usual.

## Response prefix — teamMode-B variant

Overrides standard Phase 4 prefix:

```
[Model: <main> · Dispatched: Opus×1 (sap-executor-tm) + Opus×N (consultants) · Team: <N+1> members × <rounds> rounds · Wave <N>]
```

## Cleanup

1. Shutdown all team members via `SendMessage({type:"shutdown_request", reason:"Wave <N> teamMode complete"})` (structured JSON object, per protocol).
2. Keep task directories (audit trail cross-referenced from `.sc4sap/program/<PROG>/phase4-team-audit/`).

## Prototype notes

- **Cost warning**: Type B on Phase 4 is expensive — novel code snippets + N consultants × full context = significant tokens. Use gating conservatively; prefer single-module or CBO-reuse paths when possible.
- **Interaction with multi-executor split**: when Phase 4 splits executors (`multi-executor-split.md`), each split executor runs its own Type B cycle if its code subset touches 2+ modules.
- **Phase 6 implication**: `peer-validated` annotations from teamMode B should make Phase 6 reviewer drop § 1-2 / § 13 findings for the same code — avoids double-review.

## Related

- [`SKILL.md`](SKILL.md), [`phase4-parallel.md`](phase4-parallel.md) — main Phase 4 flow
- [`team-mode.md`](team-mode.md) — Type A for Phase 1A/2 (complementary, not competing)
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § Type B — shared protocol
- [`../analyze-code/team-mode.md`](../analyze-code/team-mode.md) — Type B second application (reviewer-centric; this doc is executor-centric)
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc
