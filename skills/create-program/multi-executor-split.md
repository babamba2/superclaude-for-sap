# Multi-Executor Split Rule — Phase 4 Bulk-Work Parallelism

Companion file split from [`phase4-parallel.md`](./phase4-parallel.md). Referenced from Wave 3 and Wave 4 when the planned scope exceeds the thresholds below. Observes `../../common/model-routing-rule.md` + `../../common/context-loading-protocol.md`.

## When to split

Phase 4 default is single-executor (one `Agent({subagent_type: "sc4sap:sap-executor", ...})` dispatch per Wave). When the planned scope is large, the skill splits into **up to 3 parallel executors** to stay within model-call budgets and reduce wall-clock time. Planner emits the sizing into `plan.md` (see `agent-pipeline.md` Phase 2); the skill reads it and decides at Wave 3 entry.

## Thresholds — trigger a split when ANY is true

| Metric | Single executor | 2-way split | 3-way split |
|---|---|---|---|
| Programs in scope | ≤ 5 | 6–10 | > 10 |
| Includes to be uploaded | ≤ 15 | 16–30 | > 30 |
| Total MCP writes predicted (Create+Update+Delete+Activate) | ≤ 40 | 41–80 | > 80 |
| Text pool entries (`CreateTextElement` / `WriteTextElementsBulk`) | ≤ 40 | 41–120 | > 120 |
| DDIC objects to create | ≤ 5 | 6–15 | > 15 |

First row that triggers determines the split — pick the **higher** of the matching rows if multiple rows cross a threshold.

## Split strategies (disjoint scopes — mandatory to avoid ADT lock conflicts)

### Strategy A — by program namespace range (preferred for multi-program sweeps)

Split the program list into N contiguous ranges:

- 20 programs (`ZMMR00010–ZMMR00200`, step 10) → 3-way:
  - Exec-α: `ZMMR00010–ZMMR00070`
  - Exec-β: `ZMMR00080–ZMMR00140`
  - Exec-γ: `ZMMR00150–ZMMR00200`

Each executor owns its range's Mains + all sub-includes + screens + GUI + text pools. No executor touches another's object set.

### Strategy B — by object class (preferred for mixed scopes)

- Exec-α: DDIC (Domain, DTEL, Table, Structure, CDS)
- Exec-β: Code (Class, Interface, FM, Include, Main program)
- Exec-γ: UI artifacts (Screen, GUI Status, Text elements)

Wave-wise ordering still applies — Exec-α runs Wave 1 first, then Exec-β + Exec-γ run Wave 2 → Wave 3 → Wave 4 in parallel on their own class.

### Strategy C — by object type within a single program (rare — only very large single programs)

Use only when one program's Wave 4 generates > 15 text elements + 5 screens + 2 GUI statuses (RAP monster with classical-Dynpro fallback). Split Text pool / Screen / GUI into 3 executors.

## Coordination — mandatory rules

- **Transport**: all executors share the same transport number. Do NOT open per-executor transports.
- **Shared resources**:
  - `GetInactiveObjects` is called ONCE at Final Step by the "leader" executor (the first one in the dispatch order). Other executors report per-object status to the leader via their result summaries.
  - `ActivateObjects` is ONE call at Final Step with the aggregated object list from all executors — NOT per-executor activation.
- **Disjoint scopes enforced**: the dispatching skill validates that no two executors list the same object name. If overlap detected → abort split, fall back to single executor.
- **Shared context kit**: every executor receives the same kit per `context-loading-protocol.md`. Triggered reads may differ based on what objects each ends up processing.
- **Model per executor**: independently resolved per `model-routing-rule.md` — Strategy A executors are typically all Sonnet (uniform template work across ranges); Strategy B Exec-α (DDIC) and Exec-β (Code) are typically Opus, Exec-γ (UI) Sonnet.
- **Failure isolation**: if one executor returns `BLOCKED`, the other executors finish their scopes. The skill then re-dispatches ONLY the blocked scope (not the full batch).

## Return format (skill aggregates)

Each executor returns a per-object status table and a count summary (created / updated / deleted / activated). The skill:

1. Concatenates the tables in dispatch order.
2. Verifies scope disjointness one more time (no object appears in two executor reports).
3. Calls `GetInactiveObjects` ONCE, filters by the program namespace prefix, asserts == 0.
4. Produces the consolidated report to Phase 6 review.

## Anti-patterns

- **Per-executor transport** — each opens its own `CreateTransport`; user ends up with 3 transport numbers for one feature. Always share.
- **Per-executor activation** — dependency order breaks when Exec-β activates before Exec-α finishes Wave 1. Activation is a Final Step concern, not a per-executor concern.
- **Overlapping scopes** — same program / include appears in two executor briefs. Causes ADT lock conflicts (one succeeds, one errors out). Disjoint-scope validation before dispatch is mandatory.
- **Ignoring Wave order** — Exec-α (DDIC) not finished before Exec-β (Code) starts. Code referencing un-activated DDIC fails at semantic check. Wave ordering still applies across split executors.
