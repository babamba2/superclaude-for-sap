# sc4sap — Team Consultation Architecture

> Design document for applying Claude Code agent teams to sc4sap's multi-specialist deliberation workflows. Status: **draft**, ask-consultant prototype pending.

## 1. Problem

Current multi-consultant skills (`ask-consultant`, `create-program`, `compare-programs`, `analyze-symptom`, `analyze-code`) all share one pattern:

```
main thread ─┬─> consultant_A (isolated)
             ├─> consultant_B (isolated)
             └─> consultant_C (isolated)
                        │
                        v
                  sap-writer (post-hoc synthesis) ── "A says X; B says Y"
```

- Each consultant answers **without awareness of the others**.
- Synthesis is **post-hoc composition**, not live reconciliation.
- If consultants disagree, the writer can only **report the disagreement**, not resolve it.
- Claude Code platform constraint: sub-agents cannot call `Agent()`, so a consultant cannot ask a peer directly (reverted in 0.6.8, see `CHANGELOG.md`).

Agent teams (Claude Code experimental feature, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) provide the missing channel: **teammates can `SendMessage` each other directly without routing through the lead**.

## 2. Universal flow — Lead ↔ Team

```
                         USER
                          │
                          v
              ┌─────────────────────────┐
              │  Lead (Claude Code      │  ← main session, invoking skill
              │  main session)          │
              └──────────┬──────────────┘
                         │ TeamCreate + Agent(team_name=...) × N
                         v
         ┌───────────────────────────────────────┐
         │     Team /  shared task list          │
         │                                       │
         │   ┌─────────┐   ┌─────────┐   ┌─────┐ │
         │   │Member_A │◄─►│Member_B │◄─►│ ... │ │  ← SendMessage peer↔peer
         │   └─────────┘   └─────────┘   └─────┘ │     (no main relay)
         │        │             │          │     │
         │        └─────────────┼──────────┘     │
         │                      v                │
         │             consensus.md (40-)        │  ← members write here
         └──────────────────────┬────────────────┘
                                │ lead reads final state
                                v
                      ┌─────────────────┐
                      │ Lead: arbitrate │  ← lead extracts consensus,
                      │   + format      │     flags residual disagreement,
                      └─────────────────┘     returns to user
```

- Lead = whatever Claude Code session runs the invoking skill (frontmatter `model:` is declarative; see `skill-model-architecture.md`).
- Members = sc4sap agents spawned via `Agent(..., team_name="...")`.
- Task list under `~/.claude/tasks/<team-name>/` is the shared scratchpad.
- **Members cannot spawn further agents** — same `Agent()` constraint as single-dispatch. Deliberation scope must be bounded.
- **Name addressability is ephemeral** — a teammate is reachable by `name=` only while it's actively running; cross-turn re-address requires UUID from the spawn return.

## 3. Team taxonomy — 4 types

### Type A — Cross-Module Consultant Panel

**Composition**: 2-3 `sap-{module}-consultant` (symmetric peers) + optional `sap-bc-consultant`.

**Purpose**: business-layer consensus on cross-module questions.

**Applies to**:
- `/sc4sap:ask-consultant` — when ≥ 2 modules matched AND (topic crosses boundaries OR answers diverge).
- `/sc4sap:create-program` Phase 1A (module interview) — when active modules ≥ 2.
- `/sc4sap:create-program` Phase 2 (planning) — when spec declares cross-module touchpoints.
- `/sc4sap:compare-programs` Step 4b — when sample set spans 2+ modules.

**Deliberation style**: symmetric. Each consultant posts POSITION → peers CHALLENGE → REFINEMENT → CONCUR / ESCALATE.

```
     [MM]◄─────►[CO]
        \       /
         \     /
          \   /
           [FI]
```

### Type B — Coder ↔ Consultant Pair/Panel

**Composition**: 1 worker (`sap-executor` OR `sap-code-reviewer`) + 1-2 `sap-{module}-consultant`.

**Purpose**: validate code artifacts against module best-practice **during** authoring, not post-hoc.

**Applies to**:
- `/sc4sap:create-program` Phase 4 (implementation) — executor drafts code touching multiple modules.
- `/sc4sap:analyze-code` — reviewer runs the 14-dimension review with live consultant input on business-alignment dimensions (§ 1-2 business relevance, § 13 cross-module side-effects).

**Deliberation style**: worker-centric.
- Worker posts DRAFT (code snippet + intent).
- Consultants post CHALLENGE (flag pattern violations) or CONCUR.
- Worker posts REFINEMENT (revised draft) until CONCUR × all, or ESCALATE to lead.

```
     [executor]
       ↕    ↕
    [MM]   [CO]
```

### Type C — Incident Triage Team

**Composition**: `sap-debugger` (lead-of-team) + `sap-bc-consultant` + 1-2 `sap-{module}-consultant`.

**Purpose**: root-cause analysis mixing technical (BC: kernel/update-task/RFC/transport) + business (module: business flow, TCode purpose, customizing) lenses.

**Applies to**:
- `/sc4sap:analyze-symptom` — when dump/symptom touches a Z/Y object in a module context (not a pure kernel issue).

**Deliberation style**: debugger-centric. Debugger collects evidence (dump, trace, where-used) → BC shares technical lens → module shares business lens → debugger narrows hypothesis → loops until one hypothesis survives both lenses.

```
     [debugger]
      ↕     ↕
    [BC]   [module]
```

### Type D — Interview Synthesis Team

**Composition**: `sap-analyst` + `sap-architect` + 1-2 `sap-{module}-consultant`.

**Purpose**: live cross-check of business requirements against technical feasibility during interview, before spec is frozen.

**Applies to**:
- `/sc4sap:create-program` Phase 1A ↔ 1B bridge — current flow is sequential (1A interviews module, 1B interviews program structure). Teaming lets consultant flag "this requirement implies CDS+Fiori, not ALV" in-turn.

**Deliberation style**: analyst-driven.
- Analyst posts QUESTION (business intent).
- Consultant posts ANSWER (module-correct interpretation).
- Architect posts FEASIBILITY (technical path + cost).
- Loop until all 3 CONCUR on a spec dimension, then move to next.

```
     [analyst]
        │
        v
    [consultant]──►[architect]
        ▲                │
        └────────────────┘
```

## 4. Message protocol

Minimal shared vocabulary across all team types. Members declare the message type as the first line so peers can parse.

| Type | Sender | Content |
|---|---|---|
| `POSITION` | any member | Current stance: `assumption`, `recommendation`, `confidence` (high/med/low), `rule-cites` (e.g. `spro-lookup.md §SD.pricing`) |
| `CHALLENGE` | any member | Points at another's `POSITION` and names the specific disagreement + why (citation preferred) |
| `REFINEMENT` | any member | Updates own `POSITION` in response to challenges; must reference which challenges it addresses |
| `CONCUR` | any member | Accepts a peer's current `POSITION`; optional conditions attached |
| `ESCALATE` | any member | Declares disagreement unresolvable at team tier; lead must arbitrate or widen team |

**Round cap**: **3 rounds** by default (POSITION → CHALLENGE → REFINEMENT/CONCUR). After round 3 without CONCUR × all, auto-ESCALATE.

**Example exchange (Type A, ask-consultant)**:

```
Round 1 (POSITION):
  MM:  assumption=EKKO-based PO flow; recommendation=use MIGO for GR;
       confidence=high; rule-cites=configs/MM/tcodes.md §2
  FI:  assumption=3-way match enforced; recommendation=MIRO after MIGO;
       confidence=high; rule-cites=configs/FI/tcodes.md §1

Round 2 (CHALLENGE):
  FI → MM: "MIGO before MIRO requires GR/IR clearing; does the industry
          config in .sc4sap/config.json allow it?" rule-cites=industry/kr.md

Round 2.5 (REFINEMENT):
  MM: assumption updated — check industry flag first;
      recommendation conditional on industry.kr_strict_gr=false

Round 3 (CONCUR):
  FI: CONCUR on conditional recommendation
  MM: CONCUR

→ lead extracts: "Use MIGO → MIRO when industry.kr_strict_gr=false; else use MIRO-only with manual GR reversal"
```

## 5. Shared task list schema

Under `~/.claude/tasks/<team-name>/`, flat files for inspectability:

```
00-charter.md         ← lead posts: question, environment, members, constraints, round cap
10-<member>-position.md   ← round 1: each member's POSITION
20-<member>-challenge-<target>.md  ← round 2: challenges (named by target)
30-<member>-refinement.md ← round 2.5: updated positions
40-consensus.md       ← round 3: CONCUR summary OR ESCALATE with residuals
99-lead-arbitration.md    ← only when ESCALATE — lead's final decision
```

**Benefits**:
- Each file is one atomic message; easy to grep/audit.
- Lead can read `40-consensus.md` as single result artifact.
- Replayable: a later session can reconstruct the deliberation.

## 6. Gating logic — when to form a team

Forming a team is **expensive** (N × context windows + multi-round messaging). Default is still single-dispatch. Escalate to team only when:

```
form_team = (member_count ≥ 2)
            AND (
                 topic_crosses_module_boundaries
              OR first_pass_answers_diverge
              OR user_explicitly_requested
              OR cost_of_being_wrong > cost_of_deliberation
            )
```

Concrete triggers per skill:

| Skill | Trigger |
|---|---|
| `ask-consultant` | ≥ 2 modules matched by routing AND (cross-module keyword in question OR first-pass POSITION diverges) |
| `create-program` Phase 1A | `config.json.activeModules.length ≥ 2` AND spec mentions cross-module touchpoints |
| `create-program` Phase 2 | Phase 1A flagged unresolved trade-offs |
| `create-program` Phase 4 | executor's drafted code touches tables/FMs in 2+ modules |
| `compare-programs` Step 4b | sample set spans 2+ modules |
| `analyze-code` | reviewer finds ≥ 1 § 1-2 (business) finding that crosses modules |
| `analyze-symptom` | dump/symptom originates in Z/Y object AND affected module ≠ BC-pure |
| `create-program` 1A↔1B | spec has ≥ 1 dimension where analyst/architect/consultant positions conflict in first pass |
| `program-to-spec` | **N/A — not applicable**. Single-object read-only reverse-engineering with no cross-module synthesis, no authoring conflict, no incident triage. Future consideration: Type A could apply if `GetWhereUsed` graph spans ≥ 2 modules AND user picks L3/L4 depth (consultants annotate cross-module concerns in Step 3). Not in current scope. |

## 7. Constraints (Claude Code platform)

Same-as-before hard limits that bound the design:

- **Members cannot spawn sub-agents**: no nested teams; no member-issued `Agent()` call. If deeper reasoning is needed, ESCALATE to lead.
- **Members have independent context windows**: no shared conversation history. Each spawn prompt must include the full charter (question + environment + rules).
- **Name addressability is ephemeral**: a teammate is reachable by `name=` only while running. Cross-turn re-address requires the UUID from the `Agent()` spawn return.
- **No automatic consensus**: lead must read `40-consensus.md` and format the final output. Teams are a deliberation mechanism, not a decision mechanism.
- **One team per lead at a time** (experimental constraint per Claude Code docs).

## 8. Phased rollout

Priority sequenced by ROI × risk. Never attempt all skills at once.

### Phase 0 — Design (this doc)
- Captures taxonomy, protocol, schema, gating, constraints.
- Aligns with platform constraints confirmed in `project_v067_enforcement_broken.md`.

### Phase 1 — `ask-consultant` prototype (Type A only)
- Add optional `teamMode` path: triggered per § 6 gating for ask-consultant.
- Keep legacy isolated-parallel path as fallback.
- Instrument: log token cost, round count, CONCUR-vs-ESCALATE ratio, latency.
- Exit criteria: ≥ 3 real cross-module questions run through both paths; team path produces measurably different (better) answers on ≥ 2 of 3.

### Phase 2 — Prototype evaluation
- Compare team vs legacy on: accuracy (manual grading), token cost, user satisfaction.
- If team path is < 1.5× legacy tokens for measurably better answers → continue.
- Otherwise: tune gating (raise threshold) or refine protocol (reduce rounds).

### Phase 3 — Protocol refinement
- Adjust round cap, message schema, task file layout based on prototype learnings.
- Update this doc.

### Phase 4 — Type A rollout
- `/sc4sap:create-program` Phase 1A / Phase 2.
- `/sc4sap:compare-programs` Step 4b.

### Phase 5 — Type B rollout (Coder ↔ Consultant)
- `/sc4sap:create-program` Phase 4 (in-loop validation).
- `/sc4sap:analyze-code` (§ 1-2 + § 13 dimensions).

### Phase 6 — Type C rollout (Incident Triage)
- `/sc4sap:analyze-symptom`.

### Phase 7 — Type D rollout (Interview Synthesis)
- `/sc4sap:create-program` Phase 1A ↔ 1B bridge.

## 9. Open questions for the ask-consultant prototype

To answer before Phase 4:

1. **Charter size**: how verbose must `00-charter.md` be so teammates have enough context (environment, config, question) without blowing tokens?
2. **Round cap**: is 3 enough, or do cross-module SAP debates often need 4-5?
3. **Escalation path**: when lead arbitrates, does it need to widen the team (add more consultants) or just pick a side?
4. **Legacy fallback**: should teamMode always be opt-in (explicit user keyword) or auto-trigger per § 6 gating?
5. **Cost accounting**: do we surface team token cost in the response prefix (`[Model: ... · Team: 3 members × 3 rounds · 52k tokens]`)?
6. **Response format**: does the user see the raw deliberation (for audit) or only the final consensus?

## 10. Related docs

- [`skill-model-architecture.md`](skill-model-architecture.md) — per-skill / per-phase model allocation (design intent)
- [`../common/model-routing-rule.md`](../common/model-routing-rule.md) — Sonnet / Opus / Haiku routing + Response Prefix + Phase Banner conventions
- [`../CHANGELOG.md`](../CHANGELOG.md) 0.6.8 — platform constraint that motivates the team approach
- [`../skills/ask-consultant/SKILL.md`](../skills/ask-consultant/SKILL.md) — target for Phase 1 prototype
