# Model Routing Rule — Opus / Sonnet / Haiku per Work Type

Decides which Claude model a given `Agent(...)` dispatch should run on, based on the **kind of work** it does: judgment, template work, or mechanical fetch/compare. Reduces cost without compromising correctness.

**Price premise (5.5 generation, USD per 1M tokens)** — source of truth: `scripts/hud/lib/pricing.mjs` (`priceFor`, `costOf`); update both together. Cache write = 1.25× input (5 min) / 2× (1 h), cache read ≈ 0.1× input.

| Model | Input | Output |
|---|---|---|
| Opus 5.5 | 4.00 | 20.00 |
| Sonnet 5.5 | 2.00 | 10.00 |
| Haiku 5.5 | 0.10 | 0.50 |

Haiku 5.5 prices hold for prompts ≤ 100K tokens ($0.50 / $2.50 above). Opus is only **2×** Sonnet, Haiku is **1/40** of Opus and **1/20** of Sonnet. So the main lever is no longer "Sonnet instead of Opus" but **"Haiku workers instead of an expensive model doing mechanical work"**. Prompt caches are per model — mixing many models on one task shrinks cache reuse, so prefer two axes (Opus + Haiku) and keep Sonnet only where it is the right fit.

## The 3-tier heuristic

### Tier 1 — Opus (judgment: design, ambiguity, cross-file reasoning, novel code)

- **Novel code generation** — a new FORM, method, CDS view or FM body that is not a template (`CreateClass`, `CreateProgram`, `CreateFunctionModule` with business logic).
- **Cross-file reasoning** — reconciling Phase 1A business rules with Phase 1B technical choices, CBO-reuse decisions, enhancement vs new-asset trade-offs.
- **Ambiguity resolution and adjudication** — classifying N programs, or deciding which of the Haiku-reported candidates are real violations (Phase 6 judge).
- **Architecture / planning output** — Phase 2 planner, Phase 3 spec writer, Phase 6 judge and escalation.
- **Debugging** — Phase 7 dump analysis, where the root cause could be in any of 10 files.

### Tier 2 — Sonnet (template work with light judgment)

- **Repetitive bulk writes** — the same MCP tool × the same payload shape × N (≥ 5) targets: `CreateTextElement` × 40, `UpdateScreen(flow_logic)` × 15, `UpdateProgram(header)` × 10.
- **Template-based Create/Update** — screens and GUI statuses from a known template; structural refactors that move code without rewriting it.
- **Formatting with light reasoning** — a report that aggregates verdicts and timing into prose.

### Tier 3 — Haiku (mechanical: fetch, compare, detect) — via `sap-checker`

Use the `sc4sap:sap-checker` agent (Haiku, R/O, returns structured lines — see `agents/sap-checker.md`) for work where the answer is **read or compared, not decided**:

- **scout** — fetch DDIC / FM signatures / object metadata for one named object and return facts, so Opus reads a brief instead of raw MCP output.
- **verify** — "does the `Get*` result satisfy assertion X?" (non-comment `MODULE` lines, `NAME=GV_OKCODE`, `counts.S == N`, inactive count = 0).
- **detect** — scan one object's source against one narrow rule group and report every *candidate* (recall first). An Opus judge decides.

**Pattern — "one Opus judges, N Haiku do the legwork"**: the main thread fans out N `sap-checker` dispatches in ONE message (one scope each, < 100K context each), concatenates their `CHECKER … END` blocks into a local file, and hands that file to the Opus agent. Sub-agents cannot spawn sub-agents — every fan-out is dispatched by the main thread.

Never use Haiku for: code generation, fixing, severity decisions, spec/plan writing, anything where a wrong answer is not caught by a later Opus or Sonnet step.

## Dispatch-time decision procedure

Before every `Agent(...)` call:

0. **Resolve the dispatch mode** once per skill run per [`model-dispatch-mode.md`](model-dispatch-mode.md) (`~/.sc4sap/preferences.json` → `modelDispatch`). `auto` (default) → steps 1–4 decide the model silently. `user-defined` → steps 1–4 produce the *recommendation*, then ask the user (Opus / Sonnet / Haiku) once per dispatch group. Also resolve the **cost mode** per [`cost-mode.md`](cost-mode.md); in `eco`, its lever-A table replaces the model below and adds a per-call `effort`.
1. If the result is read or compared and a later Opus or Sonnet step (or the main thread) consumes it → **Haiku** (`sap-checker`).
2. Else if the work writes novel code, reconciles files, or decides → **Opus**.
3. Else if it is template / bulk-repetitive writing → **Sonnet**.
4. Else → **Opus** (the 2× price gap no longer justifies a weaker model on unclear work).

## Per-wave pre-routing for `/sc4sap:create-program`

Every non-frontmatter model below is passed as an explicit `model:` on the `Agent(...)` call — `agent-pipeline.md` names it per phase. Frontmatter defaults: executor / qa-tester / debugger = `sonnet`, stocker / doc-specialist = `sonnet`, writer = `haiku`, checker = `haiku`, others = `opus`.

| Wave / Phase | Dominant work | Agent → Model |
|---|---|---|
| Phase 1A/1B (interview) | Consultant / analyst / architect judgment | consultants, analyst, architect → **Opus** |
| Phase 1A → 2 scout | DDIC / FM / reference-program facts | `sap-checker` ×N → **Haiku** |
| Phase 2 (planner) | Cross-file reasoning, CBO gate, consultant reconcile | planner → **Opus** |
| Phase 3 (writer) | Spec drafting from plan | writer → **Opus** (override) |
| Phase 4 Wave 1 (DDIC) | Small novel DDIC writes | executor → **Opus** (override) |
| Phase 4 Wave 2 G2/G3 | Novel classes / FMs | executor → **Opus** (override) |
| Phase 4 Wave 2 G4-prep | `CreateTextElement` × N | executor → **Sonnet**; count check `sap-checker` → **Haiku** |
| Phase 4 Wave 3 (Includes + Main) | Code layout + cross-include refs | executor → **Opus** (override) |
| Phase 4 Wave 4 (Screen/GUI) | Template Create/Update | executor → **Sonnet**; verify `sap-checker` ×N → **Haiku** |
| Phase 4 Final (activation) | `ActivateObjects` | main thread; inactive-count verify `sap-checker` → **Haiku** |
| Phase 5 (QA) | Unit test generation + prod fixes | qa-tester → **Opus** (override) |
| Phase 6 `buckets` strategy | Rule-matching per bucket | code-reviewer ×4 → **Sonnet**, MAJOR escalation → **Opus** |
| Phase 6 `detect-judge` strategy | Detection / adjudication | `sap-checker` ×N → **Haiku**, code-reviewer judge → **Opus** |
| Phase 6 fixes | `Update*` on confirmed findings | executor → **Opus** (override) |
| Phase 7 (debugger) | Dump + code cross-reference | debugger → **Opus** (override) |
| Phase 8 (report) | Template-filled report | writer → **Sonnet** (override) |

## Escalation pattern

A Sonnet- or Haiku-dispatched agent that hits a hard blocker (spec ambiguity, cross-file conflict, 3 syntax failures, `status=BLOCKED` from a checker) MUST stop and return `BLOCKED — <reason>`. The skill re-dispatches the same scope to Opus with the cheaper agent's findings attached, so Opus starts from the inventory and the failure point, not from scratch.

## Anti-patterns

- **Opus doing legwork** — an Opus agent calling `GetTable` × 15 or reading every include just to grep for `SELECT *`. Fan the reads out to `sap-checker` and give Opus the brief.
- **Haiku deciding** — letting a checker's `CAND` line become a finding without an Opus judge, or letting Haiku write a fix.
- **"Sonnet everywhere to save cost"** — Phase 2 / Phase 3 / Wave 1 on Sonnet produces thin specs and mistyped data elements; the saving is only 2× now.
- **Skipping escalation** — on `BLOCKED`, re-dispatch to Opus with the blocker context; never abandon or retry on the same tier.

## Checker fan-out in other skills

| Skill | Haiku `sap-checker` work | Opus / Sonnet consumer |
|---|---|---|
| `analyze-code` | size scout; > 1,500 lines: detect × N (5 rule groups); evidence verify on every finding | `sap-code-reviewer` → **Opus** (reviewer or judge) |
| `compare-programs` | facts scout × N (one per program / include batch) | `sap-analyst` → **Opus** |
| `analyze-cbo-obj`, `package-to-process` | stocking scouts × N (≥ 30 objects): in-package callers + DDIC first pass | `sap-stocker` → **Sonnet** (walk + finalize; re-reads DDIC for the objects it interprets) |

## Reasoning effort (agent frontmatter `effort:`)

`effort:` is set once per agent and applies to every dispatch of that agent, including `model:` overrides — unless the `Agent(...)` call passes its own `effort` (verified 2026-10-26; used only by eco cost mode, see `cost-mode.md`). **Never rely on the default**: observed 2026-10-07/08 in subagent transcripts (`"effort"` field), `sap-code-reviewer` without `effort:` ran Opus 5.5 at `medium`, while Opus 4.7 ran `xhigh` in the 2026-09-28 measurement. Re-check the transcript field after every model or CLI update.

- `effort: xhigh` — `sap-planner` (the plan drives every later phase).
- `effort: high` — analyst, architect, critic, code-reviewer, all module consultants + BC, executor, qa-tester, debugger.
- `effort: medium` — `sap-stocker`, `sap-doc-specialist` (lookup / inventory, no code generation).
- No `effort:` — `sap-writer` (reused across Haiku / Sonnet / Opus overrides) and `sap-checker` (Haiku, mechanical).
- Lowering an agent needs a measured comparison on real tasks first — measure **cost per completed program** (retries and escalations included), not cost per request.

## Integration

- `agents/sap-executor.md` — "Model Selection" section references this rule.
- `agents/sap-checker.md` — the Haiku worker contract (modes, output lines, recall-first rule).
- `skills/create-program/agent-pipeline.md` — each Phase states its explicit model override.
- `skills/create-program/phase4-parallel.md` + `phase4-verify.md` — per-Wave models and Haiku verification.
- `skills/create-program/phase6-buckets.md` + `phase6-detect-judge.md` — the two Phase 6 strategies.
- `common/model-dispatch-mode.md` — when `modelDispatch=user-defined`, every model named here becomes the *recommended* option the user confirms or overrides.

## Response Prefix Convention — `/sc4sap:*` skills

Every sc4sap skill (`/sc4sap:*`) MUST cause the main-thread response to begin with a model-routing prefix line, so the user can see at a glance which model is doing the work and which sub-agents were dispatched.

**Format (first line of the skill-triggered response):**

```
[Model: <main-model> · Dispatched: <sub-summary>]
```

- `<main-model>` — the model actually answering this turn, read from its own model identity at runtime (a version is fine here because it is read, not hardcoded — e.g. `Opus 5.5`). Every sc4sap skill declares `model: inherit`, so this is normally the session model — still report the model that is answering, not an assumed one.
- `<sub-summary>` — a compact list of `Agent(...)` dispatches issued during the response, with model + count. Examples:
  - `Sonnet×2` — two Sonnet sub-agent dispatches.
  - `Opus×1 (planner), Sonnet×3 (executor)` — role-annotated when helpful.
  - `Haiku×9 (checker), Opus×1 (judge)` — a checker fan-out followed by its Opus consumer.
  - Omit the `· Dispatched: ...` portion entirely when the response uses no `Agent(...)` dispatches.

**Examples:**

```
[Model: Opus]
— pure main-thread response, no sub-agent dispatches

[Model: Opus · Dispatched: Sonnet×2]
— main thread + two parallel Sonnet executors (e.g., Phase 4 Wave 2 G4-prep split)

[Model: Opus · Dispatched: Opus×1 (planner)]
— Phase 2 planner dispatch

[Model: Opus · Dispatched: Opus×3 (executor range α/β/γ)]
— Multi-Executor Split per multi-executor-split.md Strategy A
```

**When the prefix applies:**

- Every response that resulted from invoking a `/sc4sap:*` skill — not every conversation turn.
- Continuation turns on the same skill-triggered task (follow-ups, verification, clarifications) keep the prefix.
- A user message that pivots to unrelated work drops the prefix starting with that turn.

**Each sc4sap SKILL.md MUST include** a `<Response_Prefix>` block near the top pointing at this section, so every skill inherits the convention without restating it.

## Phase Banner Convention — multi-phase skills

Skills that internally orchestrate **two or more phases** (e.g., `/sc4sap:create-program`, `/sc4sap:program-to-spec`, `/sc4sap:compare-programs`, `/sc4sap:analyze-symptom`, `/sc4sap:analyze-cbo-obj`, `/sc4sap:create-object`) MUST emit a **single-line phase banner** immediately before each phase dispatch, so the user can see which model is doing each step without reading skill internals.

**Format:**

```
▶ phase=<id> (<short-label>) · agent=<agent-name> · model=<Opus|Sonnet|Haiku>
```

- `<id>` — stable phase identifier from the skill's own phase map (e.g., `2`, `4.W2.G3`, `6`, `1A`).
- `<short-label>` — 1-3 word role label (`planner`, `executor`, `reviewer`, `debugger`, `writer`, `consultant-MM`, …).
- `<agent-name>` — exact agent frontmatter `name:` (e.g., `sap-planner`, `sap-executor`).
- `<model>` — the model tier: the explicit `model:` passed to `Agent(...)` if any, else the agent's frontmatter alias (`opus` → `Opus`, `sonnet` → `Sonnet`, `haiku` → `Haiku`, `fable` → `Fable`).
  - Never write a version number here. Aliases track the newest model of each tier (per Claude Code model config), so a hardcoded version goes stale; the tier name stays correct.
  - In `user-defined` dispatch mode, show the model the user chose and append ` (user)` (see `model-dispatch-mode.md`).

**When to emit:**

- Once per `Agent(...)` dispatch that begins a new phase.
- For **parallel fan-out** (e.g., Phase 4 Wave 2 G4-prep on 3 executors), emit one banner per spawn:
  ```
  ▶ phase=4.W2.G4-prep · agent=sap-executor[α] · model=Sonnet
  ▶ phase=4.W2.G4-prep · agent=sap-executor[β] · model=Sonnet
  ▶ phase=4.W2.G4-prep · agent=sap-executor[γ] · model=Sonnet
  ```
  Exception — a `sap-checker` fan-out of more than 3 workers emits ONE banner: `▶ phase=6.detect · agent=sap-checker×12 · model=Haiku`.
- For **Sonnet→Opus escalation** on BLOCKED (per § Escalation pattern), emit a second banner when re-dispatching:
  ```
  ▶ phase=4.W4 · agent=sap-executor · model=Sonnet
  ... (BLOCKED: screen field list conflicts with TOP include)
  ▶ phase=4.W4 (escalated) · agent=sap-executor · model=Opus
  ```

**When NOT to emit:**

- Single-dispatch skills (`/sc4sap:ask-consultant`, `/sc4sap:trust-session`, `/sc4sap:sap-option`, `/sc4sap:sap-doctor`) — the `[Model: ...]` response prefix alone is sufficient.
- Pure main-thread work inside a phase (no `Agent(...)` call).

**Relationship to Response Prefix:**

Response Prefix (§ above) is emitted **once per skill-triggered response** — aggregate view.
Phase Banner is emitted **once per agent dispatch** — per-step view.
Multi-phase skills use both.
