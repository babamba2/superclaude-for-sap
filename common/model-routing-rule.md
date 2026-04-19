# Model Routing Rule — Sonnet vs Opus per Work Type

Decides which Claude model a given `Agent(...)` dispatch should run on, based on the **dominant MCP tool mix** the dispatch will perform. Reduces cost without compromising correctness.

## The 3-tier heuristic

### Tier 1 — Sonnet (default for reads, repetitive work, bulk ops)

Use Sonnet (`sonnet`) when the dispatch is dominated by:

- **Read-only MCP tools**: `GetProgram`, `GetClass`, `GetInterface`, `GetFunctionModule`, `GetScreen`, `GetGuiStatus`, `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `GetView`, `GetInclude`, `GetBehaviorDefinition`, `GetBehaviorImplementation`, `GetServiceDefinition`, `GetServiceBinding`, `GetMetadataExtension`, `GetPackage`, `GetPackageContents`, `GetPackageTree`, `GetObjectsByType`, `SearchObject`, `GetObjectInfo`, `GetObjectStructure`, `GetAbapSemanticAnalysis`, `GetAbapAST`, `GetWhereUsed`, `GetTypeInfo`, `ReadTextElementsBulk`, `GetTextElement`, `GetInactiveObjects`, `GetTransport`, `ListTransports`, `GetSession`, `RuntimeListDumps`, `RuntimeGetDumpById`, `RuntimeAnalyzeDump`, `RuntimeAnalyzeProfilerTrace`, `RuntimeGetProfilerTraceData`, `RuntimeListProfilerTraceFiles`, `RuntimeListFeeds`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `Read*` variants.
- **Repetitive bulk writes** — the same MCP tool × the same payload shape × N iterations. Examples: `CreateTextElement` × 40 for a text pool, `UpdateScreen(flow_logic=...)` × 15 with identical flow logic, `UpdateProgram(header)` × 10 with the same header template. Threshold: ≥ 5 repetitions of the same operation on different objects.
- **Structural / mechanical refactors** — moving code between containers without rewriting logic (e.g., split inlined Main into sub-includes when the sub-include bodies already exist).

Sonnet is fast, capacity-efficient, and accurate enough for work where the judgment is "apply this template to N targets".

### Tier 2 — Opus (default for design, ambiguity, cross-file reasoning)

Use Opus (`opus`) when the dispatch requires:

- **Novel code generation** — writing a new FORM, method, or CDS view whose body is not a template — especially `CreateClass`, `CreateProgram`, `CreateFunctionModule` with substantial business logic.
- **Cross-file reasoning** — reconciling interview dimensions, resolving conflicts between Phase 1A business rules and Phase 1B technical choices, CBO-reuse decisions, enhancement vs new-asset trade-offs.
- **Ambiguity resolution** — when the task is "figure out which of the 20 programs belong to Class A vs Class B vs Class C and why" (the classification step in a repair sweep).
- **Architectural / planning output** — Phase 2 planner, Phase 3 spec writer, Phase 6 Opus escalation on MAJOR findings.
- **Debugging** — Phase 7 dump analysis, where the root cause could be in any of 10 files.

### Tier 3 — Haiku (opportunistic)

Use Haiku (`haiku`) for:

- Trivial one-shot lookups (`SearchObject` for existence check, single `GetObjectInfo`).
- Pure text formatting — writing a `report.md` summary from structured state.
- Documentation stubs (short doc-specialist tasks).

Most sc4sap workflows do NOT reach Haiku — use only when you're confident the task is pure substitution.

## Dispatch-time decision procedure

Before every `Agent(...)` call, classify the planned MCP tool mix:

1. Enumerate the MCP tools the agent will call (from the skill's Wave description or the agent's known behavior).
2. Count **reads** (Tier-1 tools) vs **writes** (Create / Update / Delete / Activate / Patch / Write).
3. If `writes == 0` OR the writes are repetitive-bulk per Tier 1 criteria → **Sonnet**.
4. Else if the writes require novel code generation OR cross-file reasoning → **Opus**.
5. Else (mixed, moderate complexity) → **Sonnet**, escalate to Opus on first hard blocker.

## Per-wave pre-routing for `/sc4sap:create-program`

| Wave / Phase | Dominant work | Model |
|---|---|---|
| Phase 0 (platform preflight) | Config read + 1-2 questions | Sonnet |
| Phase 1A/1B (interview) | Question-generation + SearchObject | Sonnet |
| Phase 2 (planner) | Cross-file reasoning, CBO gate, consultant reconcile | **Opus** |
| Phase 3 (writer) | Spec drafting from plan | **Opus** |
| Phase 4 Wave 1 (DDIC) | `CreateDomain/DE/Table/Structure` — small novel writes | **Opus** |
| Phase 4 Wave 2 G4-prep (TextElements) | `CreateTextElement` × N — bulk repetitive | **Sonnet** |
| Phase 4 Wave 2 G2/G3 (Classes/FMs) | Novel code generation | **Opus** |
| Phase 4 Wave 3 (Includes + Main) | Code layout + cross-include refs | **Opus** |
| Phase 4 Wave 4 (Screen/GUI) | Template-based Create/Update, verify | **Sonnet** |
| Phase 4 Final (activation) | `ActivateObjects` + `GetInactiveObjects` verify | **Sonnet** |
| Phase 5 (QA) | Unit test generation | **Opus** |
| Phase 6 per-bucket review | Rule-matching per section | **Sonnet** (base), escalate to **Opus** on MAJOR findings |
| Phase 6 Opus escalation | Multi-file root-cause on MAJOR | **Opus** |
| Phase 7 (debugger) | Dump + code cross-reference | **Opus** |
| Phase 8 (report) | Template-filled report | **Sonnet** |

## Escalation pattern

A Sonnet-dispatched agent that hits a hard blocker (e.g., spec ambiguity it can't resolve, cross-file conflict, repeated syntax error after 3 attempts) MUST:

1. Stop the current iteration (don't keep writing).
2. Return a `BLOCKED` response with the specific reason.
3. The skill receiving the `BLOCKED` response re-dispatches the same scope to Opus with the Sonnet's findings attached as context.

This gives Opus the cheap agent's inventory + the specific failure point, rather than starting from scratch.

## Anti-patterns

- **"Always Opus for safety"** — burns 5-10× the cost on tasks Sonnet handles identically (e.g., the recent ZMMR Selection Texts bulk task was correctly Sonnet — 51 × 2 CreateTextElement calls with identical template).
- **"Sonnet for everything to save cost"** — Phase 2 planner / Phase 3 writer / Wave 1 DDIC on Sonnet produces thin specs and miss-typed data elements.
- **Skipping escalation** — if Sonnet returns `BLOCKED`, the skill MUST re-dispatch to Opus with the blocker context. Abandoning the task or re-trying on Sonnet wastes the tier-1 learnings.

## Integration

- `agents/sap-executor.md` — "Model Selection" section references this rule.
- `skills/create-program/phase4-parallel.md` — per-Wave model column above is authoritative.
- `skills/create-program/agent-pipeline.md` — each Phase bullet states its expected model.
- `skills/create-program/phase6-buckets.md` — reviewer bucket dispatch + Opus escalation ladder uses this rule.
