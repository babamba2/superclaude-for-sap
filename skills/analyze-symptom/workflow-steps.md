# analyze-symptom Workflow Steps

Referenced from `SKILL.md` → `<Workflow_Steps>`. The main thread stays thin; the heavy work is pushed into the `sap-debugger` agent (Opus via override) so dump payloads, call graphs, and transport object lists never sit in the orchestrator context. The debugger writes the user-facing report itself — main relays it, it does not rewrite it.

## Step 0 — Trust Session (skill-to-skill)

- **Headless host → skip.** If the system prompt declares `Host: sc4sap-web` (or any other headless host that governs permissions itself), skip this step entirely — no log read, no Glob, no invocation. `.claude/settings.local.json` is not loaded there, so the grant would do nothing.
- Otherwise invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:analyze-symptom`. Skip silently if `.sc4sap/session-trust.log` has a line within the last 24h (one `Read`, no search).

## Step 1 — Initial Triage (main thread)

- Extract user-supplied clues: error text, message class/number, runtime error name, dump ID, TCode, program/class name, affected user, timing, frequency.
- Call `GetSession` to capture system info (SID, client, release, SP, current user). This is the ONLY MCP call the main thread makes directly.
- Resolve `<CUSTOMIZATION_DIR>` = absolute path of `<cwd>/.sc4sap/customizations`. Do not search for it — if it does not exist, pass `none`.
- Choose `<MODE>`:

| MODE | When | Scope |
|---|---|---|
| `quick-dump` | Symptom is a single short dump (runtime error name such as `CONVT_NO_NUMBER`, a dump ID, or "Short dump" chosen) AND nothing points at change history — frequency is not "since a recent change" / "intermittent" / "only some users or data", and no transport or upgrade is mentioned | Dump → source at the termination point → answer |
| `full` | Everything else (error messages, wrong results, performance, transport failures, unknown shape, or a dump tied to a recent change) | All investigation paths below |

Exit condition: `<CLUES>` + `<SESSION_INFO>` + `<MODE>` + `<CUSTOMIZATION_DIR>` resolved.

## Step 2 — Investigate + Narrow + Report (one `sap-debugger` dispatch per round)

> **teamMode variant (Type C Incident Triage)** — after round 1 completes, if the report's leading hypothesis cites code in a Z/Y object or customized SAP include AND the affected module is non-BC AND its confidence is Medium or lower, activate Type C teamMode per [`team-mode.md`](team-mode.md) BEFORE Step 3. Debugger + sap-bc-consultant + sap-<module>-consultant cross-check the hypothesis; the final synthesis includes the tri-lens evidence trail.

Emit the phase banner per `common/model-routing-rule.md` § Phase Banner Convention:
```
▶ phase=2 (debugger-r<N>, <MODE>) · agent=sap-debugger · model=Opus
```

Dispatch:
```
Agent({
  subagent_type: "sc4sap:sap-debugger",
  model: "opus",                                  // override base Sonnet — incident triage is cross-file reasoning
  description: "Symptom triage — round <N>",
  prompt: """
    Root-cause analysis for a reported SAP incident. Read-only investigation.

    Mode: <MODE>
    Known clues: <CLUES>
    System info: <SESSION_INFO>
    Customization cache: <CUSTOMIZATION_DIR>   (a directory, or "none")
    Previous-round findings and user answers (empty on round 1): <PRIOR_FINDINGS>

    A. INVESTIGATE via your own MCP tools — never ask me, fetch directly.

       If Mode = quick-dump (budget: about 6 MCP calls):
         1. Locate the dump: RuntimeGetDumpById when an ID is known; otherwise
            RuntimeListDumps with top <= 10, orderby "TERMINATION_DATE desc",
            and user=<affected user> when known. Pick the dump matching the clues.
         2. RuntimeAnalyzeDump on that dump.
         3. Read the source at the termination point only (one Read*/Get* call on
            the failing program / include / class).
         4. Optional: one DDIC call (GetTable / GetDataElement) when the failing
            statement moves or converts a field.
         If the cause is established with High confidence, stop and report.
         If not, continue with the Full paths below in this same dispatch.

       If Mode = full:
         - Dump path:      RuntimeListDumps (top <= 10) → RuntimeGetDumpById → RuntimeAnalyzeDump
         - Recent changes: ListTransports (last 7d) → GetTransport (candidate TRs) → GetObjectInfo
         - Code path:      ReadClass / ReadProgram / ReadFunctionModule → GetAbapAST → GetWhereUsed
         - Enhancement:    GetEnhancements → GetEnhancementImpl / GetEnhancementSpot
         - Customization:  read <CUSTOMIZATION_DIR>/<MODULE>/{enhancements,extensions}.json
         - Profiler:       RuntimeRunProgramWithProfiling → RuntimeAnalyzeProfilerTrace (TIME_OUT / slowness only)

    B. GAPS — list what MCP cannot reach and matters here (SU53, SLG1, SM13,
       SM58, SM37, WE02, /IWFND/ERROR_LOG). Skip this section when there are none.

    C. HYPOTHESES — 1 when confirmed at High confidence, else 2–3, from the
       8-category framework in skills/analyze-symptom/SKILL.md § Analysis_Framework.
       Each carries: category, confidence (High | Medium | Low), evidence
       (MCP facts), confirmation path (next MCP call, TCode, or user question).

    D. REPORT — your final message IS the user-facing report. Write it in the
       user's language, following skills/analyze-symptom/output-format.md:
       the Per-Round Structure when questions remain open, the Final Round
       structure when none do. Include SAP Note search keywords and next steps
       there. Max 3 questions, only for gaps MCP cannot fill. No JSON, no
       preamble, no notes addressed to the orchestrator.

    Rules:
    - Never call GetTableContents / GetSqlQuery.
    - Never speculate without evidence ("probably" statements are forbidden).
    - Everything you need about the environment is in this prompt. Do NOT search
      the filesystem (no find / Glob / recursive ls) for config, caches, or
      earlier reports. If <CUSTOMIZATION_DIR> is "none", record the missing
      cache as a gap and move on.
    - Keep tool output small (top <= 10 on list calls). Do not Grep / Read the
      files where oversized tool results were saved — re-query narrower instead.
    - When a Z*/Y* object or customized SAP include appears in the trace and the
      cache exists, reverse-look it up per SKILL.md § Evidence_Collection_Matrix.
    - If 4+ categories fit equally, return a short BLOCKED report stating the
      reason and the one question that would disambiguate.
  """
})
```

On `BLOCKED`: relay the report and wait for the user's answer before re-dispatching.

## Step 3 — Relay (main thread · round N)

- Output the debugger's report **verbatim**, preceded only by the Response Prefix. Do not summarize, restructure, translate, or append your own analysis — the report already carries SAP Note keywords, next steps, and escalation targets.
- Exception: when Type C teamMode ran, present the team synthesis per [`team-mode.md`](team-mode.md) instead.
- If the report contains open questions, stop and wait. When answers arrive → re-dispatch Step 2 (round N+1, same `<MODE>` unless the answers point at change history, then `full`) with `<PRIOR_FINDINGS>` = the previous report + the answers.
- If the report is a Final Round report, the run is complete.

## Step 4 — Follow-up Routing (only when the user asks for the fix)

- **Custom code fix** → direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls, or dispatch `sap-debugger` in write mode (base Sonnet — no Opus override needed for a mechanical fix)
- **Code quality review** → `/sc4sap:analyze-code`
- **Module-specific configuration deep-dive** → `/sc4sap:ask-consultant` with the target module
- **Dump reproduction** → dispatch `sap-debugger` with `RuntimeRunClassWithProfiling` / `RuntimeRunProgramWithProfiling`
- **Cross-user authorization check** → user runs SU53 externally

## Safety Rails

- Blocklist: `GetTableContents` / `GetSqlQuery` are forbidden in this skill — enforced by the debugger's prompt.
- No speculation: "probably" statements are rejected; the debugger returns BLOCKED instead.
- No re-asking: anything already confirmed via MCP must NOT appear as a user question.
- No filesystem search: paths are resolved once in Step 1 and passed down.
