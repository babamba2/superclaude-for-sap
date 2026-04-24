# analyze-symptom — Team Mode (Type C Incident Triage)

Companion to `SKILL.md` + `workflow-steps.md`. Applies Type C (Incident Triage Team) of [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) to dump / symptom analysis that mixes technical (BC) and business (module) lenses. Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — reuses Type A message types (POSITION/CHALLENGE/REFINEMENT/CONCUR/ESCALATE) with role-specific semantics.

## Gating

teamMode activates AFTER Step 2 (sap-debugger's first round of investigation) when ALL:

1. Debugger's return includes a hypothesis citing code in a **Z/Y object** (customer development, not pure kernel) OR a **customized SAP include** (e.g., `MV45AFZZ`, form-based exit).
2. The affected program / FM / include belongs to a specific **functional module** (prefix-based detection — `MV45AF*` = SD, `LMIGO*` = MM, `RFFO*` = FI, etc.).
3. Debugger's confidence on the hypothesis is `med` or lower (if `high`, no triage needed — debugger's lens is sufficient).

When not satisfied → no teamMode; proceed to Step 3 (user confirmation) with debugger's hypothesis as-is. Pure-kernel / pure-Basis issues go through BC consultant Solo path, not Type C.

## Team composition

| Role | Agent | Count |
|---|---|---|
| Investigator (team lead inside team, but reports to skill main) | `sap-debugger` (re-spawned with `-tm` suffix) | 1 |
| Technical lens | `sap-bc-consultant` | 1 |
| Business lens | `sap-<module>-consultant` (from prefix detection) | 1-2 |

## Rounds

### R1 — POSITION (parallel spawn)

Each member writes `10-<name>-position.md` — following protocol.md § Message file format.

- **Debugger POSITION** — `recommendation` = primary hypothesis + code path where failure originated; `rule-cites` = dump fields / where-used chain.
- **BC POSITION** — technical lens on the same evidence: kernel state, update-task / RFC / transport / lock angle.
- **Module POSITION** — business lens: what the TCode does, what customizing could cause this, what standard vs customer expectation is.

Spawn prompt includes charter with debugger's Step 2 findings inline.

Phase banner per member:
```
▶ phase=2.tm.R1 (triage-<ROLE>) · agent=<name> · model=Opus 4.7
```

### Divergence check

- **Aligned** — all members point to the same root-cause axis (e.g., all agree "customer BAdI in MM misreads inventory flag"). → synthesis.
- **Divergent** — BC says "kernel issue", module says "business rule gap", debugger hasn't narrowed → R2.

### R2 — CHALLENGE + REFINEMENT

Same shape as Type A Round 2 (see [`../ask-consultant/team-rounds.md`](../ask-consultant/team-rounds.md) § Round 2). Members challenge each other's POSITION by pointing at specific evidence gaps; REFINEMENT narrows hypothesis space.

Re-spawn names use `-tm-r2` suffix per [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § R2 spawn mechanics.

### R3 — CONCUR / ESCALATE

Same as Type A. If convergent → synthesis. On ESCALATE → lead arbitration.

### Lead arbitration (ESCALATE only)

For analyze-symptom, arbitration is unusual — typically one hypothesis wins on evidence. If genuinely unresolvable (e.g., both "kernel" and "application" equally plausible), lead records both in synthesis as "dual-root hypotheses requiring user-side reproduction".

## Synthesis — Step 3 variant

Replaces the Step 3 legacy "present hypotheses" flow.

1. Emit banner:
   ```
   ▶ phase=3.tm (triage-synthesis) · agent=sap-writer · model=Haiku 4.5
   ```
2. Spawn `sap-writer` **WITHOUT `team_name`** with task file paths. Prompt asks for a Korean/English user-facing report:
   - **Root-cause hypothesis** (converged position OR dual-root)
   - **Evidence trail** across all 3 lenses (debugger / BC / module)
   - **Confirmation path** — what the user should run (TCode / log / test) to verify
   - **Why single-agent analysis would have missed this** (teamMode value)

## Response prefix — teamMode variant

```
[Model: <main> · Dispatched: Opus×1 (sap-debugger) + Opus×1 (sap-bc-consultant) + Opus×N (module consultants), Haiku×1 (sap-writer) · Team: <N+2> members × <rounds> rounds]
```

## Cleanup

1. Shutdown all team members via `SendMessage({type:"shutdown_request", reason:"triage complete"})` (structured JSON object per protocol). Agents with `<Team_Shutdown_Handler>` (all 26 sc4sap agents, added 2026-04-24) auto-terminate.
2. Keep task directory — incident triage records are valuable for Phase-6-like retrospective and future dump pattern matching.

## Prototype notes (Phase 6 scaffolding)

- **Runtime validation pending**: docs scaffolded; first live test should exercise a real dump that spans BC + module (e.g., MB_MIGO_BADI customer code dump in MM context).
- **Interaction with bc-diagnostic-flows**: `agents/agent_details/bc/diagnostic-flows.md` Flow 1 (ABAP Dump) is debugger's baseline. teamMode layers on top — doesn't replace the flow, just adds BC + module cross-check.
- **When NOT to use**: pure kernel issues (Flow 8) and pure transport/STMS issues (Flow 3) are BC-solo domain. Don't trigger teamMode for them.

## Related

- [`SKILL.md`](SKILL.md), [`workflow-steps.md`](workflow-steps.md) — main skill spec
- [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) — shared protocol (reuse Type A message types)
- [`../../docs/team-consultation-architecture.md`](../../docs/team-consultation-architecture.md) — architecture doc (Type C definition)
- [`../../agents/agent_details/bc/diagnostic-flows.md`](../../agents/agent_details/bc/diagnostic-flows.md) — BC diagnostic flows (baseline for debugger)
- [`../ask-consultant/team-rounds.md`](../ask-consultant/team-rounds.md) — round mechanics template
