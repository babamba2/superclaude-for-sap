---
name: analyze-code
description: ABAP code analysis — size-gated review (one Opus sap-code-reviewer, or Haiku sap-checker detectors + Opus judge for large objects), Haiku evidence check on every finding, then a canned report or a richer briefing on the main thread
model: inherit
---

# SC4SAP Analyze Code

Reviews an ABAP object by delegating the heavy work (source read, structural/semantic/where-used analysis, 14-dimension rule matching) to `sap-code-reviewer` (Opus) — for objects over 1,500 lines, Haiku `sap-checker` detectors find candidates and the Opus reviewer judges them. Every finding's cited line is then checked by Haiku before it reaches the report. The main thread (session model, `model: inherit`) only handles Socratic intake, report formatting, and the follow-up action menu.


<Purpose>
sc4sap:analyze-code provides a comprehensive, severity-rated ABAP code review backed by the AST, semantic analysis, and where-used data that only the live SAP system can produce. The flow is deliberately thin on the main thread: the reviewer agent owns context-heavy work so the skill orchestrator stays light.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>
<Target_Object>The target object is looked up on the active profile's system only. Not found → stop and ask per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Target object not on the active system — never substitute a similar name, never switch profiles on your own.</Target_Object>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus|Sonnet|Haiku>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention. Resolve the dispatch mode first per [`../../common/model-dispatch-mode.md`](../../common/model-dispatch-mode.md): `auto` (default) uses the model below/in the rule; `user-defined` asks the user Opus / Sonnet / Haiku (recommended one first) before each dispatch group.
</Phase_Banner>

<Team_Mode>
Type B (Coder ↔ Consultant) teamMode — **Opt-in, not automatic.** It runs only when (a) the arguments contain `team` (e.g. `/sc4sap:analyze-code ZSDR21500 team`), or (b) the user accepts the offer at the end of Step 3. The offer is made only when the gate below holds: after the report, one `AskUserQuestion` — "Have the <modules> consultants review the N business-alignment findings? (about +$4, +10 min)" — options `Skip (Recommended)` / `Run consultant review`. Business-alignment findings in the report carry a `consultant review recommended` tag either way. Unattended runs never offer it. Gate for the offer: the verified findings include a **business-alignment** finding (business purpose, business-rule faithfulness, cross-module side-effects — judged by content, not dimension number) AND the object touches 2+ modules. Reviewer becomes Worker, module consultants become Peers; consultants live-validate the reviewer's business-alignment findings. See [`team-mode.md`](team-mode.md). Base protocol: [`../../common/team-consultation-protocol.md`](../../common/team-consultation-protocol.md) § Type B.
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

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Companion_Files>
**MANDATORY**: Read the companion files below before executing.

| Companion | Scope |
|-----------|-------|
| [`analysis-dimensions.md`](analysis-dimensions.md) | 9 `common/` rule files that the **reviewer agent** (not main) loads + 14 evaluation dimensions |
| [`workflow.md`](workflow.md) | 4-step execution flow: Identify → Review (delegated, size-gated) → Report (branching) → Actions |
| [`detect-judge.md`](detect-judge.md) | Step 2a size scout · 2b Haiku detectors · 2c Opus judge · 2d evidence verify · `FINDING` line format |
| [`output-and-tools.md`](output-and-tools.md) | Report output format + MCP tool list used **by the reviewer agent** |
</Companion_Files>

<Execution_Summary>
Orchestration is **1 main-thread Socratic intake + a size-gated delegated review + a Haiku evidence check + a branching report + main-thread action menu**.

- **Step 1 (main)** — Identify: ask for (or confirm) the ABAP object name + type; verify via `SearchObject`.
- **Step 2a (delegated · Haiku)** — `sap-checker` scout returns source units with line counts + caller count.
- **Step 2 (delegated · Opus)** — ≤ 1,500 lines: dispatch to `sap-code-reviewer` with only the object reference. > 1,500 lines: Haiku detectors × N (5 rule groups) write candidates, then one Opus `sap-code-reviewer` judges them and evaluates the judgment dimensions (§1 / §4 / §9 / §14) — see [`detect-judge.md`](detect-judge.md). On the single path the reviewer agent **itself** reads source (via `GetClass`/`GetProgram`/`GetProgFullCode`/...), runs structural analysis (`GetAbapAST` + `GetAbapSemanticAnalysis` + `GetWhereUsed`), loads the 9 `common/` rule files, and evaluates all 14 dimensions. Returns: findings list (severity · location · rule ref · fix suggestion, one `FINDING` line each) + summary metrics.
- **Step 2d (delegated · Haiku)** — `sap-checker` verify confirms each finding's evidence quote exists at the cited line; failures move to an **Unverified** section and leave the score.
- **Step 3 (branching)**:
  - **Branch A — canned** (default: no Critical findings AND < 10 findings total) → main formats the standard report template from [`output-and-tools.md`](output-and-tools.md).
  - **Branch B — briefing** (Critical present OR ≥ 10 findings) → main renders a richer reader-facing briefing (Critical/High with root cause + fix code, where-used impact, top-3 fixes) per [`workflow.md`](workflow.md) § Branch B. No extra agent dispatch.
- **Step 4 (main)** — Follow-up action menu: show where-used · explain finding #N · save report (Markdown · HTML · both) · delegate fix to `sap-executor` (user's choice).

Full spec in [`workflow.md`](workflow.md). Main thread NEVER calls `ReadClass` / `GetAbapAST` / `GetWhereUsed` directly — that context stays inside the reviewer and checker agents so the orchestrator window remains small even for large objects.
</Execution_Summary>

Task: $ARGUMENTS
