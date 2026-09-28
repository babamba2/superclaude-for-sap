# Model Dispatch Mode — auto vs user-defined

Decides **who picks the model** for each `Agent(...)` dispatch issued by a `/sc4sap:*` skill. The *recommended* model always comes from [`model-routing-rule.md`](model-routing-rule.md); this file only controls whether that recommendation is applied silently or offered to the user first.

## Setting

| Item | Value |
|---|---|
| File | `~/.sc4sap/preferences.json` (user-level — applies to every profile and project) |
| Key | `modelDispatch` |
| Values | `auto` (default) \| `user-defined` |
| Edited via | `/sc4sap:sap-option` → "dispatch" (see [`../skills/sap-option/model-dispatch.md`](../skills/sap-option/model-dispatch.md)) |

Missing file, missing key, unreadable JSON, or an unknown value → treat as `auto`. Never fail a skill because of this file.

```json
{ "modelDispatch": "user-defined" }
```

## Resolution — once per skill invocation

Read `~/.sc4sap/preferences.json` once at the start of a skill run (before the first dispatch) and keep the resolved mode for the rest of that run, including continuation turns. Do not re-read it before every dispatch.

## Mode `auto` (default)

Behave exactly as before: pick the model per `model-routing-rule.md` (Tier heuristic, per-wave tables, and any `model:` override written in the skill's own MD). No question is asked.

## Mode `user-defined`

Before each **dispatch group**, ask the user which model to use, then dispatch with that model as an explicit `model:` parameter.

1. Compute the recommended model exactly as `auto` would (skill MD override → per-wave table → Tier heuristic → agent frontmatter `model:`).
2. Call `AskUserQuestion` with one question:
   - `header`: `Model`
   - `question`: `Which model for phase=<id> (<label>) · agent=<name>?` — add ` ×<N>` when the group fans out to N agents.
   - `options` (always these three, in this order, with the recommended one moved first and suffixed ` (Recommended)`):
     - `Opus` — deep reasoning: novel code, cross-file design, debugging. Highest cost.
     - `Sonnet` — reads, repetitive bulk writes, rule-based review. Balanced.
     - `Haiku` — trivial lookups and pure formatting. Cheapest.
   - Put the one-line reason for the recommendation (from `model-routing-rule.md`) in the recommended option's `description`.
3. Dispatch with `model: "opus" | "sonnet" | "haiku"` set explicitly — even when the choice equals the agent's frontmatter model.
4. Emit the Phase Banner with the chosen model and a `(user)` marker: `▶ phase=4.W2.G3 (executor) · agent=sap-executor · model=Sonnet (user)`.
5. If the user answers via "Other" with free text, map `opus`/`sonnet`/`haiku` (any case or language) to the model; anything else → re-ask once, then fall back to the recommended model and say so.

### Dispatch group = one question

- A **parallel fan-out** of the same phase (e.g. Phase 6 buckets ×4, G4-prep executors α/β/γ, compare-programs reviewers ×N) is ONE group → ask once, apply to every spawn.
- A **sequential dispatch** of a new phase is a new group → ask again.
- A **Sonnet→Opus escalation** after `BLOCKED` (per `model-routing-rule.md` § Escalation pattern) is a new group → ask again, with the escalation target as the recommendation and the `BLOCKED` reason in the question text.
- A **retry of the same phase** after a transient failure (timeout, MCP reconnect) reuses the previous answer — do not ask again.

### Constraints

- `AskUserQuestion` and `Agent` are main-thread tools. Only the orchestrating skill asks; sub-agents never ask about models.
- Choosing a model lower than recommended is allowed — do not argue. Add one short caution line in the banner reply when the user picks Haiku for a phase the rule classifies as Opus (novel code generation, planner, spec writer, debugger).
- Non-interactive runs (no user available to answer) → fall back to `auto` for that run and state it once.
- Skills with no `Agent(...)` dispatch (e.g. `/sc4sap:sap-option`, `/sc4sap:trust-session`) are unaffected.
- Team mode (teamMode rounds per `team-consultation-protocol.md`) follows the same rule: each round's parallel member dispatch is one group → one question before that round is dispatched.

## Response prefix

When the mode is `user-defined`, append `· Dispatch: user-defined` to the `[Model: ...]` prefix line so the user can see the mode is active, e.g. `[Model: Opus 5.5 · Dispatched: Sonnet×4 (user) · Dispatch: user-defined]`.
