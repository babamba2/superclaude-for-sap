# Team Consultation Protocol

Shared protocol for sc4sap multi-specialist agent teams. Loaded as Tier 3 (triggered) when an agent spawn indicates `teamMode=true`. Full architecture: [`../docs/team-consultation-architecture.md`](../docs/team-consultation-architecture.md).

## Message types

Every message written to the shared task list starts with its TYPE on line 1.

| Type | Purpose | Required fields |
|---|---|---|
| `POSITION` | Initial or refined stance | `assumption`, `recommendation`, `confidence` (`high`/`med`/`low`), `rule-cites` |
| `CHALLENGE` | Dispute a peer's POSITION | `target` (peer name), `issue` (one-line), `evidence` (citation or rule) |
| `REFINEMENT` | Update own POSITION in response to CHALLENGE(s) | `addresses` (list of challenge files), updated POSITION fields |
| `CONCUR` | Accept a peer's current POSITION | `target` (peer name), `conditions` (optional) |
| `ESCALATE` | Declare disagreement unresolvable at team tier | `residual-issue`, `own-position`, `peer-positions` |

**CONCUR via withdrawal** — if a member's REFINEMENT explicitly withdraws their prior POSITION (e.g., *"R1 withdrawn: peer's argument is correct"*), the lead treats this as a CONCUR on the peer's POSITION. Valid convergence path (NOT ESCALATE). This is the cleanest outcome from peer deliberation and the primary value of teamMode — observed in prototype test 3c (MM withdrew "FI before CO" stance after CO cited *period closed in target ledger* blocker).

## File layout — shared task list

Under `~/.claude/tasks/<team-name>/`:

```
00-charter.md                          ← lead writes: question, environment, members, round cap
10-<member>-position.md                ← round 1: each member's POSITION
20-<member>-challenge-<target>.md      ← round 2: challenges (one file per target)
30-<member>-refinement.md              ← round 2.5: updated POSITION after challenges
40-consensus.md                        ← round 3: all members append CONCUR or ESCALATE entries
99-lead-arbitration.md                 ← only on ESCALATE: lead's final decision + rationale
```

Filenames are stable so lead and peers can `ls` + `cat` to read.

**Multi-test team reuse** (observed pattern) — when the one-team-per-lead constraint + idle members block `TeamDelete`, a single team may host multiple test cycles. Prefix test-specific files with a test ID: `00-<test-id>-charter.md`, `10-<member>-<test-id>-position.md`, `50-<test-id>-synthesis.md`, etc. Preserves audit trails and avoids collisions with prior tests in the same `~/.claude/tasks/<team-name>/` directory.

## Round structure — lead-orchestrated (prototype v1)

The lead serializes rounds by re-spawning members. Direct peer-to-peer `SendMessage` is optional optimization for later.

### Round 1 — POSITION (parallel spawn)

1. Lead writes `00-charter.md` with the question + environment.
2. Lead spawns N members **in parallel** via `Agent(..., team_name=<name>, name=<member-name>)`.
3. Each member: read `00-charter.md` → think → write `10-<own-name>-position.md` → return.
4. Lead reads all `10-*-position.md` files.

### Divergence check (lead)

Lead compares positions on the core recommendation axis. Rules:

- **Aligned** — all members' `recommendation` converge on the same action / object / precondition set → skip to synthesis.
- **Divergent** — at least one pair of members disagree on action OR preconditions → proceed to Round 2.

### Round 2 — CHALLENGE + REFINEMENT (parallel spawn)

1. Lead spawns same N members in parallel. Spawn prompt includes peer POSITIONs as context.
2. Each member: read own `10-*-position.md` + all peer `10-*-position.md` → for each disagreement, write `20-<own-name>-challenge-<target>.md` → then (optionally, same turn) write `30-<own-name>-refinement.md` addressing challenges received from peers.
3. Lead reads round-2 files.

**R2 spawn mechanics (operational details):**
- **Inline peer POSITIONs** — each R2 spawn prompt MUST embed peer POSITION content as inline text under clearly-delimited sections (e.g., `=== MM POSITION ===`). Freshly-spawned teammates have no memory of R1 file reads; relying on file paths alone is unreliable.
- **Re-spawn naming** — previous R1 teammates may still be idle (shutdown_request format sensitivity leaves them alive). Use a round suffix on the `name` parameter: `sap-<module>-consultant-<test-id>-r2`. File names follow the same suffix: `20-<name>-challenge-<target>.md`, `30-<name>-refinement.md`.

### Divergence check 2 (lead)

- **Converged** — refined positions align → skip to synthesis.
- **Still divergent** — proceed to Round 3.

### Round 3 — CONCUR / ESCALATE (parallel spawn)

1. Lead spawns same N members in parallel. Spawn prompt includes all round-1+2 content.
2. Each member: review refined positions → append one entry to `40-consensus.md` — either a `CONCUR` block (accepting a peer's refined POSITION) or an `ESCALATE` block (recording the residual disagreement with own stance).
3. Lead reads `40-consensus.md`.

### Lead arbitration (only on ESCALATE)

Lead writes `99-lead-arbitration.md`:
- Cite each member's residual position.
- Pick a side with stated rationale (or ask the user to pick, if rationale is purely business-preference).
- This is the final decision; members do not re-run.

## Spawn prompt — required boilerplate

When the lead spawns a member in team mode, the prompt MUST include:

1. `teamMode=true` flag.
2. `team_name` (same for all members in the group).
3. `<member-name>` (unique within team).
4. `<round>` (1, 2, or 3).
5. `<charter-path>` = `~/.claude/tasks/<team-name>/00-charter.md`.
6. Explicit instruction: "Follow `common/team-consultation-protocol.md` — write your message as the named file in the task list, then return."

## Member behavior contract

When a member sees `teamMode=true` in its spawn prompt:

1. **Round 1**: read charter → produce `POSITION` → write `10-<own-name>-position.md` → return.
2. **Round 2**: read own + all peer positions → produce one `CHALLENGE` per disagreement (one file per target) → optionally produce a `REFINEMENT` → return.
3. **Round 3**: read all round-1+2 content → append ONE entry (`CONCUR` or `ESCALATE`) to `40-consensus.md` → return.

Members must NOT:
- Call `Agent(...)` — sub-agents cannot spawn further agents.
- Modify files outside `~/.claude/tasks/<team-name>/`.
- Respond outside the declared round.

## Message file format

Keep messages scannable. Each file:

```
<TYPE>
<field>: <value>
<field>: <value>
...

<free-text reasoning — HARD max 5 lines; push anything longer into rule-cites>
```

Example `10-sap-mm-consultant-position.md`:

```
POSITION
assumption: EKKO-based PO flow with standard MIGO GR
recommendation: use MIGO then MIRO (3-way match)
confidence: high
rule-cites: configs/MM/tcodes.md §2, configs/MM/workflows.md §GR

Standard S/4 MM procure-to-pay: PO (EKKO/EKPO) → GR (MIGO posts MKPF/MSEG)
→ invoice receipt (MIRO posts RBKP/RSEG). Three-way match (EKKO / MKPF / RBKP)
is required unless tolerance group suppresses it.
```

## Gating — when does the lead escalate to Round 2/3?

This is a per-skill decision. Each skill using teamMode declares its own divergence criteria (e.g., ask-consultant's team-mode.md § Divergence check). The protocol itself does NOT mandate auto-escalation — it only defines WHAT happens in each round.

## Token cost accounting

Lead MUST surface team cost in the response prefix per [`model-routing-rule.md`](model-routing-rule.md) § Response Prefix Convention:

```
[Model: <main> · Team: <N> members × <rounds> rounds · ~<K>tokens]
```

Where `rounds` is the actual rounds executed (1, 2, or 3) — converged-at-round-1 teams show `× 1 round`.

## Type B — Coder ↔ Consultant (asymmetric, worker-centric)

Used by `create-program` Phase 4 (executor drafts code) and `analyze-code` (reviewer interprets findings). Per-skill integration details live in each skill's team-mode companion (`create-program/team-mode-b.md`, `analyze-code/team-mode.md`).

### Roles (asymmetric)

- **Worker** — `sap-executor` OR `sap-code-reviewer`. Owns the DRAFT; iterates on peer feedback.
- **Peers** — 1-2 `sap-<module>-consultant`. Validate DRAFT against module best-practice; issue CHALLENGE or CONCUR.

### Additional message types (Type A types still apply for CHALLENGE/CONCUR/ESCALATE)

| Type | Sender | Content |
|---|---|---|
| `DRAFT` | worker | `intent` (what the artifact does), `content` (code or finding text), `concern-axes` (what peer should verify), `open-questions` (explicit requests) |
| `WORKER_REFINEMENT` | worker | `addresses` (list of peer challenge files), updated `content`, rationale for each change |

### Round structure (Type B)

- **R0 DRAFT** — worker writes `10-<worker>-draft.md`. Only entry point; peers do not post R0.
- **R1 Peer review** (parallel) — each peer writes `20-<peer>-challenge-<worker>.md` OR `20-<peer>-concur-<worker>.md`.
- **R2 WORKER_REFINEMENT** (conditional — only if any R1 CHALLENGE) — worker writes `30-<worker>-refinement.md` addressing challenges.
- **R3 Final peer review** — each peer writes `40-<peer>-final-<worker>.md` with CONCUR or ESCALATE.
- **Lead arbitration** on any ESCALATE — same as Type A (§ Round 3 / § Lead arbitration above).

### Type B file layout

```
10-<worker>-draft.md
20-<peer>-challenge-<worker>.md       ← one per disagreement
20-<peer>-concur-<worker>.md          ← when peer accepts DRAFT as-is
30-<worker>-refinement.md
40-<peer>-final-<worker>.md
```

Worker suffix enables parallel Type B deliberations (e.g., 2 executors on 2 distinct drafts concurrently under the same team).

## Related

- [`../docs/team-consultation-architecture.md`](../docs/team-consultation-architecture.md) — full architecture, 4 team types (A/B/C/D), rollout plan.
- [`model-routing-rule.md`](model-routing-rule.md) — prefix + banner conventions.
- Per-skill teamMode details: `skills/ask-consultant/team-mode.md` + `team-rounds.md` (Type A), `skills/compare-programs/team-mode.md` (Type A), `skills/create-program/team-mode.md` (Type A — Phase 1A/2) + `team-mode-b.md` (Type B — Phase 4) + `team-mode-d.md` (Type D — Phase 1A↔1B bridge), `skills/analyze-code/team-mode.md` (Type B), `skills/analyze-symptom/team-mode.md` (Type C Incident Triage).

Type C (Incident Triage) and Type D (Interview Synthesis) reuse the Type A message types (POSITION / CHALLENGE / REFINEMENT / CONCUR / ESCALATE) with role-specific semantics per the per-skill files. They do NOT introduce new message types beyond Type A and Type B.
