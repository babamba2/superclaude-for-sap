---
name: sc4sap:analyze-code
description: ABAP code analysis — delegate source reads + AST/semantic/where-used analysis + rule-based review to sap-code-reviewer, then optionally render a rich briefing via sap-writer
level: 2
model: sonnet
---

# SC4SAP Analyze Code

Reviews an ABAP object by delegating the heavy work (source read, structural/semantic/where-used analysis, 14-dimension rule matching) to `sap-code-reviewer` (Opus 4.7). The main thread only handles Socratic intake, report formatting, and the follow-up action menu — all on Haiku for cost efficiency.


<Purpose>
sc4sap:analyze-code provides a comprehensive, severity-rated ABAP code review backed by the AST, semantic analysis, and where-used data that only the live SAP system can produce. The flow is deliberately thin on the main thread: the reviewer agent owns context-heavy work so the skill orchestrator stays light.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus 4.7|Sonnet 4.6|Haiku 4.5>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention.
</Phase_Banner>

<Team_Mode>
Type B (Coder ↔ Consultant) teamMode activates between Step 2 (reviewer full review) and Step 3 (report) when reviewer's findings include a **business-alignment dimension** (§ 1 Business Purpose, § 2 Rule Faithfulness, § 13 Cross-Module Side-Effects) AND the object touches 2+ modules. Reviewer becomes Worker, module consultants become Peers; consultants live-validate the reviewer's business-alignment findings. See [`team-mode.md`](team-mode.md). Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § Type B.
</Team_Mode>

<Use_When>
- User says "analyze", "review code", "check this class", "what's wrong with", "analyze code", or "code review"
- Before releasing a transport, to catch issues early
- When taking over existing ABAP code and wanting to understand its quality
- When optimizing performance of an ABAP program or class
- User wants where-used impact analysis before modifying an object
</Use_When>

<Do_Not_Use_When>
- User wants to modify the code immediately → `/sc4sap:create-program` (full program flows) or direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls
- Object doesn't exist yet → `/sc4sap:create-object`
- User just wants to read the source → `ReadClass`, `ReadProgram` etc. directly
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:analyze-code` to pre-grant all MCP tool + file-op permissions for this session (eliminates per-tool "Allow this tool?" prompts during the review flow).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.
- All subsequent `Agent` dispatches within this skill MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Companion_Files>
**MANDATORY**: Read the companion files below before executing.

| Companion | Scope |
|-----------|-------|
| [`analysis-dimensions.md`](analysis-dimensions.md) | 9 `common/` rule files that the **reviewer agent** (not main) loads + 14 evaluation dimensions |
| [`workflow.md`](workflow.md) | 4-step execution flow: Identify → Review (delegated) → Report (branching) → Actions |
| [`output-and-tools.md`](output-and-tools.md) | Report output format + MCP tool list used **by the reviewer agent** |
</Companion_Files>

<Execution_Summary>
Orchestration is **1 main-thread Socratic intake + one delegated dispatch to `sap-code-reviewer` + a branching report + main-thread action menu**.

- **Step 1 (main · Haiku)** — Identify: ask for (or confirm) the ABAP object name + type; verify via `SearchObject`.
- **Step 2 (delegated · Opus 4.7)** — Dispatch to `sap-code-reviewer` with only the object reference. The reviewer agent **itself** reads source (via `GetClass`/`GetProgram`/`GetProgFullCode`/...), runs structural analysis (`GetAbapAST` + `GetAbapSemanticAnalysis` + `GetWhereUsed`), loads the 9 `common/` rule files, and evaluates all 14 dimensions. Returns: findings list (severity · location · rule ref · fix suggestion) + summary metrics.
- **Step 3 (branching)**:
  - **Branch A — canned** (default: no Critical findings AND < 10 findings total) → main (Haiku) formats the standard report template from [`output-and-tools.md`](output-and-tools.md).
  - **Branch B — briefing** (Critical present OR ≥ 10 findings) → dispatch `sap-writer` (Haiku) for a rich reader-facing report with code examples and impact explanations. Fallback to Branch A on writer failure.
- **Step 4 (main · Haiku)** — Follow-up action menu: show where-used · explain finding #N · save report · delegate fix to `sap-executor` (user's choice).

Full spec in [`workflow.md`](workflow.md). Main thread NEVER calls `ReadClass` / `GetAbapAST` / `GetWhereUsed` directly — that context stays inside the reviewer agent so the orchestrator window remains small even for large objects.
</Execution_Summary>

Task: {{ARGUMENTS}}
