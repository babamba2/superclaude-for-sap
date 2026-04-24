# analyze-symptom Workflow Steps

Referenced from `SKILL.md` → `<Workflow_Steps>`. Main thread runs Haiku 4.5; the heavy work is pushed into the `sap-debugger` agent (Opus 4.7 via override) so dump payloads, call graphs, and transport object lists never sit in the orchestrator context.

## Step 0 — Trust Session (skill-to-skill, Haiku)

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:analyze-symptom`. Skip silently if already trusted within 24h.

## Step 1 — Initial Triage (main thread, Haiku)

- Extract user-supplied clues: error text, message class/number, TCode, program/class name, affected user, timing, dump indicators.
- Call `GetSession` to capture system info (SID, client, release, SP, current user). This is the ONLY MCP call the main thread makes directly.
- Package the structured clue set + system info and proceed to Step 2.

Exit condition: `<CLUES>` + `<SESSION_INFO>` resolved.

## Step 2 — Investigate + Gap + Narrow (one `sap-debugger` dispatch per round, Opus override)

> **teamMode variant (Type C Incident Triage)** — after round 1 completes, if debugger's hypothesis cites code in a Z/Y object or customized SAP include AND the affected module is non-BC AND debugger's confidence is `med` or lower, activate Type C teamMode per [`team-mode.md`](team-mode.md) BEFORE Step 3 (user confirmation). Debugger + sap-bc-consultant + sap-<module>-consultant cross-check hypothesis; final synthesis includes tri-lens evidence trail.

Emit phase banner per `common/model-routing-rule.md` § Phase Banner Convention:
```
▶ phase=2 (debugger-r<N>) · agent=sap-debugger · model=Opus 4.7
```

Dispatch:
```
Agent({
  subagent_type: "sc4sap:sap-debugger",
  model: "opus",                                  // override base Sonnet — production incident triage needs Opus
  description: "Symptom triage — round <N>",
  prompt: """
    Perform full root-cause analysis for the reported SAP incident.

    Known clues (from main):
    <CLUES>
    System info:
    <SESSION_INFO>
    Previous-round findings (empty on first round, else the prior dispatch's return):
    <PRIOR_FINDINGS>

    Your responsibilities (ALL in one response):

    A. AUTO-INVESTIGATE via your own MCP tools — never ask me, fetch directly:
       - Dump path:      RuntimeListDumps → RuntimeGetDumpById → RuntimeAnalyzeDump
       - Recent changes: ListTransports (last 7d) → GetTransport (candidate TRs) → GetObjectInfo
       - Code path:      ReadClass / ReadProgram / ReadFunctionModule → GetAbapAST → GetWhereUsed
       - Enhancement:    GetEnhancements → GetEnhancementImpl / GetEnhancementSpot
       - Customization:  read .sc4sap/customizations/<MODULE>/{enhancements,extensions}.json (local file)
       - Profiler:       RuntimeRunProgramWithProfiling → RuntimeAnalyzeProfilerTrace (when TIME_OUT / slowness)

    B. GAP IDENTIFICATION — separate evidence collected via MCP from areas MCP cannot reach
       (SU53 authorization trace, SLG1 app log, SM13 update, SM58 RFC, SM37 jobs, WE02 IDoc,
       /IWFND/ERROR_LOG OData).

    C. HYPOTHESIS NARROWING — reduce to 2–3 candidate causes from the 8-category framework
       in skills/analyze-symptom/SKILL.md § Analysis_Framework. Each hypothesis MUST include:
         - category
         - confidence: High | Medium | Low
         - evidence (bullet list of MCP facts supporting it)
         - confirmation_path (next probe: MCP call, TCode, or user question)

    D. RETURN STRUCTURE (JSON-like):
       {
         "mcp_confirmed": [ "System: S4H / client 100 / 756", "3 recent dumps at ...", ... ],
         "mcp_unavailable_gaps": [ "SU53 — main MCP can't fetch", ... ],
         "hypotheses": [ { category, confidence, evidence, confirmation_path }, ... ],   // 2–3 items
         "priority_questions": [ "Q1 ...", "Q2 ...", "Q3 ..." ],                          // max 3, targets mcp_unavailable_gaps
         "sap_note_hints": [ "MESSAGE_TYPE_X + ZCL_SD_ORDER", ... ]                       // candidate search keywords
       }

    Rules:
    - Never call GetTableContents / GetSqlQuery.
    - Never speculate without evidence ("probably" statements are forbidden).
    - When a Z*/Y* object or customized SAP include appears in the trace, MANDATORY reverse-lookup
      via the local customization cache per SKILL.md § Evidence_Collection_Matrix.
    - If narrowing is impossible because 4+ categories fit equally, return BLOCKED with the reason
      so the skill can surface more targeted user questions.
  """,
  mode: "dontAsk"
})
```

On `BLOCKED`: main surfaces the reason verbatim and asks the user for one disambiguating question before re-dispatching.

## Step 3 — User Questions (main thread, Haiku · round N)

Render the debugger's return block:
```
✅ Confirmed via MCP:
  <mcp_confirmed bullet list>

❓ Need your input (max 3):
  <priority_questions>

🎯 Leading hypotheses (2–3):
  <per-hypothesis: category · confidence · evidence summary>
```

Wait for user answers. If answers arrive → re-dispatch Step 2 (round N+1) with `<PRIOR_FINDINGS>` = the previous return. If the user closes the loop (e.g., "yes, SU53 dump attached" or "no more input"), proceed to Step 4.

Max 3 questions per round is enforced by the debugger's prompt; main just displays them.

## Step 4 — SAP Note Keywords (main thread, Haiku)

Main assembles copy-paste-ready search strings, ordered most-specific → broadest, from the debugger's `sap_note_hints` + user-confirmed evidence:

1. Exact error string in quotes + message class + number
2. Dump runtime error name (e.g., `MESSAGE_TYPE_X`, `ASSERTION_FAILED`)
3. Program / class / function module name
4. Component + symptom keyword (`FI-GL open period short dump`)
5. TCode + symptom keyword

Suggest filters: release, SP level, kernel level, component.

This is pure assembly — no fresh reasoning — so Haiku is sufficient.

## Step 5 — Recommended Actions (main thread, Haiku)

Classify actions by who can execute them:

- **Immediately actionable**: additional MCP queries, local file checks
- **Requires SAP GUI access**: SU53, SM13, SM58, STMS, etc. (the `mcp_unavailable_gaps` items)
- **Escalation**: development team / Basis / module consultant

Draw directly from the debugger's `hypotheses[].confirmation_path`. Static classification — Haiku.

## Step 6 — Escalation Routing (main thread, Haiku)

After hypothesis confirmation, hand off to the correct follow-up:

- **Custom code fix** → direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls, or dispatch `sap-debugger` (write mode, base Sonnet — no Opus override needed for mechanical fix)
- **Code quality review** → `/sc4sap:analyze-code`
- **Module-specific configuration deep-dive** → `/sc4sap:ask-consultant` with the target module
- **Dump reproduction** → dispatch `sap-debugger` with `RuntimeRunClassWithProfiling` / `RuntimeRunProgramWithProfiling`
- **Runtime investigation needing cross-user auth check** → user does SU53 externally

This is a static decision-tree lookup — Haiku is sufficient.

## Safety Rails

- Blocklist: `GetTableContents` / `GetSqlQuery` are forbidden in this skill — enforced by the debugger's prompt.
- No speculation: "probably" statements must be rejected; the debugger should return BLOCKED instead.
- No re-asking: any item already in `mcp_confirmed` must NOT appear as a user question.
