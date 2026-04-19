---
name: sc4sap:analyze-code
description: ABAP code analysis — read via MCP, analyze with sap-code-reviewer, suggest improvements
level: 2
---

# SC4SAP Analyze Code

Reads ABAP source code directly from the connected SAP system via MCP tools, performs deep structural and semantic analysis using the sap-code-reviewer agent, and produces an actionable improvement report.

<Purpose>
sc4sap:analyze-code gives you a comprehensive code review of any ABAP object in your SAP system — without leaving Claude Code. It leverages the AST, semantic analysis, and where-used capabilities of mcp-abap-adt to go beyond surface-level review into actual type safety, performance patterns, and SAP best practice compliance.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Use_When>
- User says "analyze", "review code", "check this class", "what's wrong with", "analyze code", or "code review"
- Before releasing a transport, to catch issues early
- When taking over existing ABAP code and wanting to understand its quality
- When optimizing performance of an ABAP program or class
- User wants where-used impact analysis before modifying an object
</Use_When>

<Do_Not_Use_When>
- User wants to modify the code immediately -- use `/sc4sap:create-program` (for full program flows) or direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls
- Object doesn't exist yet -- use `/sc4sap:create-object`
- User just wants to read the source -- use `ReadClass`, `ReadProgram` etc. directly
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:analyze-code` to pre-grant all MCP tool + file-op permissions for this session (eliminates per-tool "Allow this tool?" prompts during the 6-step review flow).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.
- All subsequent `Agent` dispatches within this skill MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Companion_Files>
**MANDATORY**: Read the companion files below before executing. Each covers a self-contained section of this skill:

| Companion | Scope |
|-----------|-------|
| [`analysis-dimensions.md`](analysis-dimensions.md) | 9 `common/` rule files to load + 14 evaluation dimensions the sap-code-reviewer agent scores against |
| [`workflow.md`](workflow.md) | 6-step execution flow (Identify → Read → Structural Analysis → Review → Report → Actions) |
| [`output-and-tools.md`](output-and-tools.md) | Report output format + full MCP tool list used by this skill |
</Companion_Files>

<Execution_Summary>
1. Load rule context from `analysis-dimensions.md` (9 `common/` rule files).
2. Follow the 6 steps in `workflow.md`.
3. Emit the report using the format in `output-and-tools.md`.

Do not skip the companion-file reads — the scoring rubric, workflow, and report schema all live there.
</Execution_Summary>

Task: {{ARGUMENTS}}
