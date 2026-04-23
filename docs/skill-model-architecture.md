# sc4sap — Skill Model Architecture

Per-skill / per-phase model allocation across the sc4sap plugin. This document is the single source of truth for *which Claude model runs each step of each skill*, why that choice was made, and how the overrides work in practice.

> **Scope**: all 12 user-facing skills + 16 agents. Companion planning docs, spec files, and per-phase rule files are not repeated here — see [`../skills/<name>/SKILL.md`](../skills) and [`../agents/`](../agents) for the primary sources. This doc summarizes the runtime model decisions they encode.

## 1. Three-Tier Model Strategy

sc4sap runs on Claude's 4.x family:

| Tier | Model | Use cases |
|---|---|---|
| **Haiku 4.5** | `claude-haiku-4-5` | Pure formatting, permission bootstrap, status diagnostics, trivial lookups, reference docs |
| **Sonnet 4.6** | `claude-sonnet-4-6` | Skill orchestration (main thread for analysis/creation/compare work), structured fact extraction, bulk template operations |
| **Opus 4.7** | `claude-opus-4-7` | Novel code generation, cross-file reasoning, domain synthesis (module consultants), hypothesis narrowing, architecture design |

Model choice follows [`common/model-routing-rule.md`](../common/model-routing-rule.md) § Tier decisions. The rule's core heuristic: **start at the lowest tier that can do the work correctly; escalate to Opus only for novel reasoning or ambiguity**.

## 2. Main-Thread Model by Skill

Every skill's main thread (orchestrator) runs at one specific tier per its `model:` frontmatter. Per-step work delegated to `Agent(...)` carries its own model (frontmatter or explicit override).

| Skill | Main | Rationale |
|---|---|---|
| `trust-session` | Haiku | Pure file editing + regex extraction, no domain judgment |
| `sap-option` | Haiku | Interactive config editor, regex validation, secret masking |
| `sap-doctor` | Haiku | 5-layer static checklist + structured PASS/FAIL report |
| `mcp-setup` | Haiku | Reference documentation, optional `check` subcommand |
| `ask-consultant` | Haiku | Intake + keyword routing + output formatting |
| `setup` | Haiku | Configuration workflow (Q&A + Bash CLI + template MCP) |
| `analyze-cbo-obj` | **Sonnet** | Orchestrates inventory analysis; synthesizes stocker output |
| `analyze-code` | **Sonnet** | Orchestrates review; report composition needs judgment |
| `analyze-symptom` | **Sonnet** | Routes questions, composes narratives from debugger output |
| `compare-programs` | **Sonnet** | Orchestrates multi-program analysis; matrix assembly |
| `create-object` | **Sonnet** | Metadata validation + executor/writer orchestration |
| `create-program` | **Sonnet** | 9-phase pipeline orchestration, resume logic, state.json |

**Upgrade rationale for analyze/create/compare cluster** (as of this revision): these skills sit on the critical development path. A Sonnet main thread gives enough reasoning headroom for state reconciliation and edge-case handling even while heavy lifting is delegated to specialist agents. Haiku would be too shallow to reliably orchestrate multi-round flows.

## 3. Per-Skill Dispatch Map

### Configuration / diagnostic skills (0 or conditional dispatches)

#### `trust-session` — Haiku main, 0 dispatches
Pure local file operations. No Agent calls.

#### `sap-option` — Haiku main, 0 dispatches
2 MCP reads (`GetSession`, `GetInactiveObjects`) for the status panel; rest is interactive editing.

#### `sap-doctor` — Haiku main, 0 dispatches
~15 MCP probes across 6 layers (plugin / MCP / SAP / required objects / config / RFC backend).

#### `mcp-setup` — Haiku main, 0 dispatches
Reference-doc renderer + optional `check` subcommand that shells out to `build-mcp-server.mjs --check`.

#### `setup` — Haiku main, escalation-only dispatches
Happy path on Haiku. Two conditional escalation paths:
- **Step 4bis (RFC backend install) on error** → `sap-bc-consultant` (Opus 4.7) — pure Basis domain
- **Steps 5–8 (connect/test) on error** → `general-purpose` with `model: "opus"` override — 3-layer diagnosis (SAP + MCP framework + Claude Code)

Steps 11/11b (SPRO / customization extraction) are intentionally LLM-free: `scripts/extract-spro.mjs` and `scripts/extract-customizations.mjs` run as background Node processes.

### Consultation skill

#### `ask-consultant` — Haiku main, 1–N+1 dispatches
- Step 4 — `sap-{module}-consultant` × 1–3 (Opus 4.7, frontmatter)
- Step 5 (conditional, ≥ 2 consultants) — `sap-writer` with `model: "sonnet"` override for cross-module synthesis

### Analysis cluster (Sonnet main)

#### `analyze-cbo-obj` — Sonnet main, 1–2 dispatches
- Steps 3–7 — `sap-stocker` (Sonnet 4.6) walks package + where-used graph + business purpose inference + cross-module gap
- Step 8 (conditional, `Logic-heavy: true`) — `sap-writer` (Haiku 4.5) for rich briefing

#### `analyze-code` — Sonnet main, 1–3 dispatches
- Step 2 — `sap-code-reviewer` (Opus 4.7) reads source + AST + semantic + where-used, evaluates 14 dimensions
- Step 3 Branch B (conditional, Critical or ≥ 10 findings) — `sap-writer` (Haiku 4.5) for briefing
- Step 4 user-selected fix — `sap-executor` (Sonnet 4.6)

#### `analyze-symptom` — Sonnet main, 1–N dispatches per round
- Step 2 per round — `sap-debugger` with `model: "opus"` override for full investigation + hypothesis narrowing (dump + transport + code + enhancement + customization + profiler)

#### `compare-programs` — Sonnet main, N+1+K+1 dispatches
- Step 3 — `sap-code-reviewer` × N with `model: "sonnet"` override — facts extraction per program
- Step 4 — `sap-analyst` × 1 (Opus 4.7) — consolidated module classify + dimension scoring + exec summary + recommendation
- Step 4b (conditional, 2+ modules) — `sap-{module}-consultant` × K (Opus 4.7)
- Step 5 — `sap-writer` × 1 (Haiku 4.5) — final Markdown render

### Creation cluster (Sonnet main)

#### `create-object` — Sonnet main, 2 dispatches
- Step 4+5+6 (or 4-ECC) — `sap-executor` with `model: "opus"` override — create + novel implementation + activate
- Step 7 — `sap-writer` (Haiku 4.5) — completion report (ECC uses mandatory verbatim format)

#### `create-program` — Sonnet main, 9-phase pipeline
Flagship skill. Full phase-by-phase in [`../skills/create-program/agent-pipeline.md`](../skills/create-program/agent-pipeline.md).

| Phase | Agent | Model | Notes |
|---|---|---|---|
| 0 Preflight | main thread | Sonnet | platform.md + active-modules |
| 1A Module Interview | `sap-{module}-consultant` | Opus 4.7 | frontmatter |
| 1B Program Interview | `sap-analyst` + `sap-architect` | Opus 4.7 | frontmatter |
| 2 Planning | `sap-planner` + consultants | Opus 4.7 | frontmatter |
| **3 Spec Writing** | `sap-writer` | **Opus 4.7** (override) | Spec is the most critical artifact |
| 3.5 Execution Mode | main thread | Sonnet | user prompt + state.json |
| 4 Implementation | `sap-executor` × 1–3 | Wave-dependent | DDIC/Classes/Main → Opus · Text/Screen → Sonnet per [`model-routing-rule.md`](../common/model-routing-rule.md) |
| 5 QA | `sap-qa-tester` | Opus 4.7 | OOP mode only |
| 6 Review | `sap-code-reviewer` × 4 buckets | Sonnet + Opus escalate | parallel buckets, MAJOR → Opus merge |
| 7 Debug | `sap-debugger` | Opus (escalation) | failure-only |
| **8 Completion Report** | `sap-writer` | **Sonnet 4.6** (override) | Report composition from structured state |

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
- `general-purpose` → Opus for cross-layer diagnosis (`setup` Steps 5–8 escalation)

Rationale: one agent can serve multiple skills at different model tiers without cloning the agent.

### Pattern 4 — Escalation ladder
Sonnet base + Opus escalate, per `common/model-routing-rule.md` § Escalation pattern. Agents return `BLOCKED` with context; skill re-dispatches at higher tier. Used in `create-program` Phase 6 (reviewer buckets) and `analyze-symptom` (debugger hypothesis narrowing).

### Pattern 5 — Non-LLM bypass
When the work is pure data extraction with no judgment (hundreds of MCP calls producing structured JSON), bypass the LLM entirely and run a background Node script. Used in `setup` Steps 11/11b (`extract-spro.mjs`, `extract-customizations.mjs`). Saves significant tokens on large modules.

## 5. Response Transparency

Every `/sc4sap:*` skill response starts with a **model prefix** indicating what ran where:

```
[Model: Sonnet 4.6 · Dispatched: Opus×1 (sap-code-reviewer), Haiku×1 (sap-writer)]
```

Multi-phase skills additionally emit a **phase banner** before each dispatch:

```
▶ phase=3 (facts-ZMMR_GR_LIST) · agent=sap-code-reviewer · model=Sonnet 4.6
▶ phase=4 (analyst) · agent=sap-analyst · model=Opus 4.7
▶ phase=5 (render) · agent=sap-writer · model=Haiku 4.5
```

Rationale: users see cost and expertise levels in real time. Per-phase banners make model-routing decisions auditable. Spec lives in [`../common/model-routing-rule.md`](../common/model-routing-rule.md) § Response Prefix Convention and § Phase Banner Convention.

## 6. Decision Cheat Sheet

When adding a new step or sub-agent, pick a tier by answering:

1. **Does it generate novel ABAP code (a class body, FM signature, spec prose) or resolve cross-file ambiguity?** → **Opus**
2. **Does it extract facts from structured inputs (AST, where-used, dumps) with rule-based matching?** → **Sonnet**
3. **Is it pure string formatting from structured state, or permission / file bootstrap?** → **Haiku**

If uncertain, start one tier lower and escalate on `BLOCKED`. Never start at Opus "just to be safe" — that defaults every new step to the most expensive tier and defeats the routing rule's cost-discipline goal.
