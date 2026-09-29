# sc4sap — Skill Model Architecture

Per-skill / per-phase model allocation across the sc4sap plugin. This document is the single source of truth for *which Claude model runs each step of each skill*, why that choice was made, and how the overrides work in practice.

> **Scope**: all 13 user-facing skills + 16 agents. Companion planning docs, spec files, and per-phase rule files are not repeated here — see [`../skills/<name>/SKILL.md`](../skills) and [`../agents/`](../agents) for the primary sources. This doc summarizes the runtime model decisions they encode.

## 1. Three-Tier Model Strategy

sc4sap names tiers, not versions. Agent frontmatter uses the Claude Code aliases `haiku` / `sonnet` / `opus`, which track the newest model of each tier, so no file needs editing when a new model ships:

| Tier | Alias | Use cases |
|---|---|---|
| **Haiku** | `haiku` | Pure formatting, permission bootstrap, status diagnostics, trivial lookups, reference docs |
| **Sonnet** | `sonnet` | Structured fact extraction, bulk template operations, reports |
| **Opus** | `opus` | Novel code generation, cross-file reasoning, domain synthesis (module consultants), hypothesis narrowing, architecture design |

Model choice follows [`common/model-routing-rule.md`](../common/model-routing-rule.md) § Tier decisions. The rule's core heuristic: **start at the lowest tier that can do the work correctly; escalate to Opus only for novel reasoning or ambiguity**.

## 2. Main-Thread Model by Skill

Every skill declares `model: inherit`, so the main thread runs on whatever model the session was opened with. The work that needs a specific tier is delegated to `Agent(...)` dispatches, which carry their own model (frontmatter alias or explicit override) — see § 3.

Why no skill pins its main thread:

- **The user's choice holds.** A host that opens a session on a chosen model (e.g. an Agent SDK web app) applies a skill's `model:` as a switch for the turn, so a pin silently replaced that choice. On CLI 2.1.283 the switch was registered but the replies still came from the session model (8 of 8 `model: haiku` invocations answered by Opus, 2026-09-28) — a pin was either overridden or ignored, never both useful and reliable.
- **Prompt cache is per model.** Switching the main thread re-writes the whole cached context (system prompt + skill docs, ~26–46k tokens) for the new model. Measured 2026-09-27 on S/4HANA 758 through an Agent SDK host: `ask-consultant` pinned to Haiku cost $0.43 for a one-sentence answer, $0.28 of it the cache re-write; with `inherit` on a Haiku session the same question cost $0.09. `analyze-code` pinned to Sonnet cost more on a Haiku session ($0.79) than on a Sonnet one ($0.69).
- **`trust-session` runs inside other skills.** Twelve skills invoke it mid-pipeline; a pin there would switch the model twice per pipeline and re-write the cache both times.

A main-thread pin driven by a user preference (`~/.sc4sap/preferences.json`) is not offered: frontmatter `model:` is applied before the skill body runs, so a preference read at runtime cannot change it, and rewriting installed SKILL.md files would be undone by every plugin update.

Suggested session model per skill (guidance only — nothing enforces it):

| Skill | Suggested session | Main-thread work |
|---|---|---|
| `trust-session` | any (inherits the caller) | Pure file editing + regex extraction, no domain judgment |
| `sap-option` | Haiku or above | Interactive config editor, regex validation, secret masking |
| `sap-doctor` | Haiku or above | 5-layer static checklist + structured PASS/FAIL report |
| `mcp-setup` | Haiku or above | Reference documentation, optional `check` subcommand |
| `ask-consultant` | Sonnet or above | Routing, teamMode divergence checks and synthesis review |
| `setup` | Sonnet or above | Configuration workflow with failure triage and escalation |
| `analyze-cbo-obj` | Sonnet or above | Orchestrates inventory analysis; synthesizes stocker output |
| `analyze-code` | Sonnet or above | Orchestrates review; report composition needs judgment |
| `analyze-symptom` | Sonnet or above | Routes questions, composes narratives from debugger output |
| `compare-programs` | Sonnet or above | Orchestrates multi-program analysis; matrix assembly |
| `create-object` | Sonnet or above | Metadata validation + executor/writer orchestration |
| `create-program` | Sonnet or above | 9-phase pipeline orchestration, resume logic, state.json |
| `package-to-process` | Sonnet or above | Entry-point detection, progress, per-process assembly and render |
| `program-to-spec` | Sonnet or above | Socratic interview → structural inventory → analyst+writer delegation → render; depth / format / language state across turns |

A Haiku session still works for the orchestration skills — the dispatched agents keep their own tiers — but multi-round state reconciliation and edge-case handling on the main thread are shallower.

## 3. Per-Skill Dispatch Map

### Configuration / diagnostic skills (0 or conditional dispatches)

#### `trust-session` — caller's model, 0 dispatches
Pure local file operations. No Agent calls.

#### `sap-option` — session-model main, 0 dispatches
2 MCP reads (`GetSession`, `GetInactiveObjects`) for the status panel; rest is interactive editing.

#### `sap-doctor` — session-model main, 0 dispatches
~15 MCP probes across 6 layers (plugin / MCP / SAP / required objects / config / RFC backend).

#### `mcp-setup` — session-model main, 0 dispatches
Reference-doc renderer + optional `check` subcommand that shells out to `build-mcp-server.mjs --check`.

#### `setup` — session-model main, escalation-only dispatches
Happy path on the main thread. Two conditional escalation paths:
- **Step 4bis (RFC backend install) on error** → `sap-bc-consultant` (Opus) — pure Basis domain
- **Steps 5–8 (connect/test) on error** → `general-purpose` with `model: "opus"` override — 3-layer diagnosis (SAP + MCP framework + Claude Code)

Steps 11/11b (SPRO / customization extraction) are intentionally LLM-free: `scripts/extract-spro.mjs` and `scripts/extract-customizations.mjs` run as background Node processes.

### Consultation skill

#### `ask-consultant` — session-model main, 1–N+1 dispatches
- Step 4 — `sap-{module}-consultant` × 1–3 (Opus, frontmatter)
- Step 5 (conditional, ≥ 2 consultants) — `sap-writer` with `model: "sonnet"` override for cross-module synthesis

### Analysis cluster (session-model main)

#### `analyze-cbo-obj` — session-model main, 1–2 dispatches
- Steps 3–7 — `sap-stocker` (Sonnet) walks package + where-used graph + business purpose inference + cross-module gap
- Step 8 (conditional, `Logic-heavy: true`) — main thread renders the briefing from `inventory.json` (no agent dispatch)

#### `analyze-code` — session-model main, 1–3 dispatches
- Step 2 — `sap-code-reviewer` (Opus) reads source + AST + semantic + where-used, evaluates 14 dimensions
- Step 3 Branch B (conditional, Critical or ≥ 10 findings) — main thread renders the briefing (no agent dispatch)
- Step 4 user-selected fix — `sap-executor` (Sonnet)

#### `analyze-symptom` — session-model main, 1–N dispatches per round
- Step 2 per round — `sap-debugger` with `model: "opus"` override for full investigation + hypothesis narrowing (dump + transport + code + enhancement + customization + profiler)

#### `compare-programs` — session-model main, N+1+K+1 dispatches
- Step 3 — `sap-code-reviewer` × N with `model: "sonnet"` override — facts extraction per program
- Step 4 — `sap-analyst` × 1 (Opus) — consolidated module classify + dimension scoring + exec summary + recommendation
- Step 4b (conditional, 2+ modules) — `sap-{module}-consultant` × K (Opus)
- Step 5 — `sap-writer` × 1 (Haiku) — final Markdown render

### Creation cluster (session-model main)

#### `create-object` — session-model main, 2 dispatches
- Step 4+5+6 (or 4-ECC) — `sap-executor` with `model: "opus"` override — create + novel implementation + activate
- Step 7 — main thread renders the completion report from the executor return (ECC uses mandatory verbatim format; no agent dispatch)

#### `create-program` — session-model main, 9-phase pipeline
Flagship skill. Full phase-by-phase in [`../skills/create-program/agent-pipeline.md`](../skills/create-program/agent-pipeline.md).

| Phase | Agent | Model | Notes |
|---|---|---|---|
| 0 Preflight | main thread | session | platform.md + active-modules |
| 1A Module Interview | `sap-{module}-consultant` | Opus | frontmatter |
| 1B Program Interview | `sap-analyst` + `sap-architect` | Opus | frontmatter |
| 2 Planning | `sap-planner` + consultants | Opus | frontmatter |
| **3 Spec Writing** | `sap-writer` | **Opus** (override) | Spec is the most critical artifact |
| 3.5 Execution Mode | main thread | session | user prompt + state.json |
| 4 Implementation | `sap-executor` × 1–3 | Wave-dependent | DDIC/Classes/Main → Opus · Text/Screen → Sonnet per [`model-routing-rule.md`](../common/model-routing-rule.md) |
| 5 QA | `sap-qa-tester` | Opus | OOP mode only |
| 6 Review | `sap-code-reviewer` × 4 buckets | Sonnet + Opus escalate | parallel buckets, MAJOR → Opus merge |
| 7 Debug | `sap-debugger` | Opus (escalation) | failure-only |
| **8 Completion Report** | `sap-writer` | **Sonnet** (override) | Report composition from structured state |

#### `program-to-spec` — session-model main, 2-3 dispatches
- Step 3 — `sap-analyst` (Opus, frontmatter) — business purpose + inputs/outputs + data sources + main logic narrative + auth checks + error cases (single dispatch covers all narrative dimensions; CBO-annotated when `cbo-context.md` preloaded)
- Step 3 — `sap-writer`:
  - **L1 / L2 depth** → Haiku base (pure templating from analyst output)
  - **L3 / L4 depth** → **Sonnet** override (`model: "sonnet"`) — longer narrative + deeper cross-reference + stronger consistency requirement
- Step 3 (conditional, L4 only) — `sap-critic` (Opus, frontmatter) — verify every claim cross-references a concrete line range in source

Excel output uses the same writer tier (depth-driven) — xlsx driver fill-in is mechanical; rendering depth determines tier, not format.

## 4. Design Patterns

### Pattern 1 — Main orchestrates, agent does heavy lifting
Applied in every analysis / creation skill. Main thread holds only the structured return from agents, not their working memory (dump stack, source code, AST, where-used graph). Keeps orchestrator context small even for large objects / packages.

### Pattern 2 — Conditional branching
Analyze-cbo-obj, analyze-code, ask-consultant branch between canned output (main thread formats directly) and rich briefing (dispatch to writer). Branching decision lives in the primary agent's return (`Logic-heavy`, `complexity_hint`, consultant count).

### Pattern 3 — Model override on agent dispatch
The `Agent(...)` tool's `model` parameter overrides the agent's frontmatter. Used in:
- `sap-executor` → Opus for novel code generation (`create-object`, `create-program` Wave 1/2.G2/3)
- `sap-debugger` → Opus for production-incident triage (`analyze-symptom`)
- `sap-code-reviewer` → Sonnet for facts-only extraction (`compare-programs`)
- `sap-writer` → Opus for spec writing (`create-program` Phase 3)
- `sap-writer` → Sonnet for reports (`create-program` Phase 8, `ask-consultant` synthesis)
- `sap-writer` → Sonnet for L3/L4 specs (`program-to-spec` Step 3)
- `general-purpose` → Opus for cross-layer diagnosis (`setup` Steps 5–8 escalation)

Rationale: one agent can serve multiple skills at different model tiers without cloning the agent.

### Pattern 4 — Escalation ladder
Sonnet base + Opus escalate, per `common/model-routing-rule.md` § Escalation pattern. Agents return `BLOCKED` with context; skill re-dispatches at higher tier. Used in `create-program` Phase 6 (reviewer buckets) and `analyze-symptom` (debugger hypothesis narrowing).

### Pattern 5 — Non-LLM bypass
When the work is pure data extraction with no judgment (hundreds of MCP calls producing structured JSON), bypass the LLM entirely and run a background Node script. Used in `setup` Steps 11/11b (`extract-spro.mjs`, `extract-customizations.mjs`). Saves significant tokens on large modules.

## 5. Response Transparency

Every `/sc4sap:*` skill response starts with a **model prefix** indicating what ran where:

```
[Model: Sonnet · Dispatched: Opus×1 (sap-code-reviewer), Haiku×1 (sap-writer)]
```

Multi-phase skills additionally emit a **phase banner** before each dispatch:

```
▶ phase=3 (facts-ZMMR_GR_LIST) · agent=sap-code-reviewer · model=Sonnet
▶ phase=4 (analyst) · agent=sap-analyst · model=Opus
▶ phase=5 (render) · agent=sap-writer · model=Haiku
```

Rationale: users see cost and expertise levels in real time. Per-phase banners make model-routing decisions auditable. Spec lives in [`../common/model-routing-rule.md`](../common/model-routing-rule.md) § Response Prefix Convention and § Phase Banner Convention.

## 6. Decision Cheat Sheet

When adding a new step or sub-agent, pick a tier by answering:

1. **Does it generate novel ABAP code (a class body, FM signature, spec prose) or resolve cross-file ambiguity?** → **Opus**
2. **Does it extract facts from structured inputs (AST, where-used, dumps) with rule-based matching?** → **Sonnet**
3. **Is it pure string formatting from structured state, or permission / file bootstrap?** → **Haiku**

If uncertain, start one tier lower and escalate on `BLOCKED`. Never start at Opus "just to be safe" — that defaults every new step to the most expensive tier and defeats the routing rule's cost-discipline goal.
