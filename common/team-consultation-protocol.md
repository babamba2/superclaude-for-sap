# Team Consultation Protocol

Shared protocol for sc4sap multi-specialist agent teams. Loaded as Tier 3 (triggered) when an agent spawn indicates `teamMode=true`. Full architecture: [`../docs/team-consultation-architecture.md`](../docs/team-consultation-architecture.md).

## Transport — return-based (members return, lead persists)

Members are plain one-shot `Agent(...)` dispatches. Do NOT use `TeamCreate`, `team_name`, `SendMessage` or `shutdown_request` — Claude Code no longer provides a named-team channel (`team_name` is deprecated and ignored), and each member terminates when it returns.

- **Member** — returns its message block(s) as its final reply. Members never write files (most are R/O with `Write`/`Edit` disallowed).
- **Lead** (the orchestrating skill, main thread) — waits for every member's completion notification, extracts each block from the reply, and writes it to the task-list file named below. The lead is the ONLY writer of `~/.claude/tasks/<team-name>/`.
- **Parsing** — a block starts with its bare TYPE on its own line (fenced in ```` ``` ```` is fine). Two failure classes:
  - *Cosmetic drift* (numbered TYPE like `CHALLENGE 1`, bulleted or bold fields like `- **target**:`) with every required field present → do NOT re-dispatch; the lead normalizes to the canonical format when persisting.
  - *Missing TYPE or required field*, or `target` that is not a member name → re-dispatch that member once with the parse error; still malformed → persist what came back, mark `confidence: low`, and note it in the synthesis input.
- **Synthesis review** — the synthesis writer composes from the task files but can misstate them. Before showing its output, the lead checks every concrete identifier and decision (TCodes, condition types, notes, what the consensus dropped or kept) against the task files and corrects mismatches, telling the user what was corrected.

## Message types

Every message block starts with its TYPE on line 1.

| Type | Purpose | Required fields |
|---|---|---|
| `POSITION` | Initial or refined stance | `assumption`, `recommendation`, `confidence` (`high`/`med`/`low`), `rule-cites` |
| `CHALLENGE` | Dispute a peer's POSITION | `target` (peer name), `issue` (one-line), `evidence` (citation or rule) |
| `REFINEMENT` | Update own POSITION in response to CHALLENGE(s) | `addresses` (list of challenge files), updated POSITION fields |
| `CONCUR` | Accept a peer's current POSITION | `target` (peer name), `conditions` (optional) |
| `ESCALATE` | Declare disagreement unresolvable at team tier | `residual-issue`, `own-position`, `peer-positions` |

**CONCUR via withdrawal** — if a member's REFINEMENT explicitly withdraws their prior POSITION (e.g., *"R1 withdrawn: peer's argument is correct"*), the lead treats this as a CONCUR on the peer's POSITION. Valid convergence path (NOT ESCALATE). This is the cleanest outcome from peer deliberation and the primary value of teamMode — observed in prototype test 3c (MM withdrew "FI before CO" stance after CO cited *period closed in target ledger* blocker).

## File layout — shared task list (lead-written audit trail)

Under `~/.claude/tasks/<team-name>/` (`<team-name>` = a lead-generated run ID such as `ask-consultant-<YYYYMMDD-HHMMSS>`; it is only a directory name, not an Agent parameter):

```
00-charter.md                          ← lead: question, environment, members, round cap
10-<member>-position.md                ← round 1: each member's POSITION
20-<member>-challenge-<target>.md      ← round 2: challenges (one file per target)
30-<member>-refinement.md              ← round 2.5: updated POSITION after challenges
40-consensus.md                        ← round 3: one CONCUR or ESCALATE entry per member
99-lead-arbitration.md                 ← only on ESCALATE: lead's final decision + rationale
```

Filenames are stable so the lead and the synthesis writer can `ls` + `cat` them. Because only the lead writes, `40-consensus.md` entries are appended sequentially — no concurrent-append race. Never delete the directory: it is the audit trail.

## Round structure — lead-orchestrated

The lead serializes rounds by re-dispatching members. Every round's peer context travels inline in the prompt.

### Round 1 — POSITION (parallel dispatch)

1. Lead writes `00-charter.md` with the question + environment.
2. Lead dispatches N members **in parallel** (one message, N `Agent(...)` calls). Charter content is inlined in the prompt; the path is given for reference only.
3. Each member returns one `POSITION` block (optionally followed by its full free-form answer, which the lead keeps for per-module subsections).
4. Lead persists each block to `10-<member>-position.md`.

### Divergence check (lead)

Lead compares positions on the core recommendation axis. Rules:

- **Aligned** — all members' `recommendation` converge on the same action / object / precondition set → skip to synthesis.
- **Divergent** — at least one pair of members disagree on action OR preconditions → proceed to Round 2.

### Round 2 — CHALLENGE + REFINEMENT (parallel dispatch)

1. Lead dispatches the same N members in parallel. Each prompt embeds the member's own POSITION and every peer POSITION inline under delimited sections (e.g., `=== MM POSITION ===`) — a fresh dispatch has no memory of Round 1.
2. Each member returns one `CHALLENGE` block per disagreement, then (same reply) an optional `REFINEMENT` block.
3. Lead persists them as `20-<member>-challenge-<target>.md` and `30-<member>-refinement.md`.

### Divergence check 2 (lead)

- **Converged** — refined positions align → skip to synthesis.
- **Still divergent** — proceed to Round 3.

### Round 3 — CONCUR / ESCALATE (parallel dispatch)

1. Lead dispatches the same N members in parallel. Each prompt embeds all Round 1 + 2 content inline.
2. Each member returns exactly ONE block — `CONCUR` (accepting a peer's refined POSITION) or `ESCALATE` (recording the residual disagreement with own stance).
3. Lead appends the blocks to `40-consensus.md`, one after another (each under a `## <member>` heading), then reads it.
4. **Crossed concurrence** — if two members each CONCUR by adopting the OTHER's stance on the same point (A accepts B's wording while B accepts A's), the point is not settled. The lead picks the final wording with a one-line rationale and appends it to `40-consensus.md` as `LEAD RESOLUTION: <point> → <chosen wording> — <why>`; if the choice is a factual question neither side proved, present both and tell the user where to verify in the system. This is not an ESCALATE and needs no `99-lead-arbitration.md`.

### Lead arbitration (only on ESCALATE)

Lead writes `99-lead-arbitration.md`:
- Cite each member's residual position.
- Pick a side with stated rationale (or ask the user to pick, if rationale is purely business-preference).
- This is the final decision; members do not re-run.

## Spawn prompt — required boilerplate

When the lead dispatches a member in team mode, the prompt MUST include:

1. `teamMode=true` flag.
2. `<member-name>` (unique within the run; used for file names and peer `target` fields).
3. `<round>` (1, 2, or 3).
4. The charter content inline (plus `<charter-path>` for reference).
5. All peer blocks this round needs, inline.
6. Explicit instruction: "Follow `common/team-consultation-protocol.md` — return your message block(s) as your final reply; do NOT write any file."

## Member behavior contract

When a member sees `teamMode=true` in its spawn prompt:

1. **Round 1**: read the inlined charter → return a `POSITION` block.
2. **Round 2**: read own + inlined peer positions → return one `CHALLENGE` per disagreement, optionally a `REFINEMENT`.
3. **Round 3**: read the inlined round-1+2 content → return ONE `CONCUR` or `ESCALATE` block.

Members must NOT:
- Call `Agent(...)` — sub-agents cannot spawn further agents.
- Write or edit any file (including `~/.claude/tasks/`) — the lead persists.
- Respond outside the declared round.

## Message block format

Keep blocks scannable. Canonical form — TYPE alone on line 1 (no number), one `field: value` per line (no bullets, no bold), `target` = a member name exactly as in the charter; several blocks of the same TYPE are simply repeated:

```
<TYPE>
<field>: <value>
<field>: <value>
...

<free-text reasoning — HARD max 5 lines; push anything longer into rule-cites>
```

Example block (persisted by the lead as `10-sap-mm-consultant-position.md`):

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
- **Peers** — 1-2 `sap-<module>-consultant`. Validate DRAFT against module best-practice; return CHALLENGE or CONCUR.

### Additional message types (Type A types still apply for CHALLENGE/CONCUR/ESCALATE)

| Type | Sender | Content |
|---|---|---|
| `DRAFT` | worker | `intent` (what the artifact does), `content` (code or finding text), `concern-axes` (what peer should verify), `open-questions` (explicit requests) |
| `WORKER_REFINEMENT` | worker | `addresses` (list of peer challenge files), updated `content`, rationale for each change |

### Round structure (Type B)

Same transport as Type A: every block is returned to the lead, which persists it and inlines it into the next dispatch.

- **R0 DRAFT** — worker returns a `DRAFT` → lead writes `10-<worker>-draft.md`. Only entry point; peers do not post R0.
- **R1 Peer review** (parallel) — each peer returns a `CHALLENGE` or `CONCUR` → `20-<peer>-challenge-<worker>.md` / `20-<peer>-concur-<worker>.md`.
- **R2 WORKER_REFINEMENT** (conditional — only if any R1 CHALLENGE) — worker returns it → `30-<worker>-refinement.md`.
- **R3 Final peer review** — each peer returns CONCUR or ESCALATE → `40-<peer>-final-<worker>.md`.
- **Lead arbitration** on any ESCALATE — same as Type A (§ Round 3 / § Lead arbitration above).

The worker suffix in file names enables parallel Type B deliberations (e.g., 2 executors on 2 distinct drafts concurrently under the same run directory).

## Related

- [`../docs/team-consultation-architecture.md`](../docs/team-consultation-architecture.md) — full architecture, 4 team types (A/B/C/D), rollout plan.
- [`model-routing-rule.md`](model-routing-rule.md) — prefix + banner conventions.
- Per-skill teamMode details: `skills/ask-consultant/team-mode.md` + `team-rounds.md` (Type A), `skills/compare-programs/team-mode.md` (Type A), `skills/create-program/team-mode.md` (Type A — Phase 1A/2) + `team-mode-b.md` (Type B — Phase 4) + `team-mode-d.md` (Type D — Phase 1A↔1B bridge), `skills/analyze-code/team-mode.md` (Type B). Type C (Incident Triage) was removed from `analyze-symptom` on 2026-09-22 — see the architecture doc note.

Type D (Interview Synthesis) reuses the Type A message types (POSITION / CHALLENGE / REFINEMENT / CONCUR / ESCALATE) with role-specific semantics per its per-skill file. It does NOT introduce new message types beyond Type A and Type B.
