# analyze-symptom Workflow Steps

Referenced from `SKILL.md` → `<Workflow_Steps>`. The main thread stays thin; the heavy work is pushed into the `sap-debugger` agent so dump payloads, call graphs, and transport object lists never sit in the orchestrator context. The debugger writes the user-facing report itself — main relays it, it does not rewrite it.

## Step 0 — Trust Session (skill-to-skill)

- **Headless host → skip.** If the system prompt declares `Host: sc4sap-web` (or any other headless host that governs permissions itself), skip this step entirely — no log read, no Glob, no invocation. `.claude/settings.local.json` is not loaded there, so the grant would do nothing.
- Otherwise invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:analyze-symptom`. Skip silently if `.sc4sap/session-trust.log` has a line within the last 24h (one `Read`, no search).

## Step 1 — Initial Triage (main thread)

- Extract user-supplied clues: error text, message class/number, runtime error name, dump ID, TCode, program/class name, affected user, timing, frequency.
- Call `GetSession` to capture system info (SID, client, release, SP, current user). This is the ONLY MCP call the main thread makes directly.
- Resolve `<CUSTOMIZATION_DIR>` = absolute path of `<cwd>/.sc4sap/customizations`. Do not search for it — if it does not exist, pass `none`.
- Choose `<MODE>` and the model for the dispatch:

| MODE | When | Scope | Model |
|---|---|---|---|
| `quick-dump` | Symptom is a single short dump (runtime error name such as `CONVT_NO_NUMBER`, a dump ID, or "Short dump" chosen) AND nothing points at change history — frequency is not "since a recent change" / "intermittent" / "only some users or data", and no transport or upgrade is mentioned | Dump metadata → failing include at the termination link → answer | **Sonnet** |
| `full` | Everything else (error messages, wrong results, performance, transport failures, unknown shape, or a dump tied to a recent change) | All investigation paths below | **Opus** |

Exit condition: `<CLUES>` + `<SESSION_INFO>` + `<MODE>` + `<CUSTOMIZATION_DIR>` resolved.

## Step 2 — Investigate + Narrow + Report (one `sap-debugger` dispatch per round)

Emit the phase banner per `common/model-routing-rule.md` § Phase Banner Convention:
```
▶ phase=2 (debugger-r<N>, <MODE>) · agent=sap-debugger · model=<Sonnet|Opus>
```

**Escalation**: a `quick-dump` round runs on Sonnet. If it returns `BLOCKED — needs full` (the cause is not established from the dump alone), re-dispatch the same round as `full` on Opus and pass the Sonnet findings as `<PRIOR_FINDINGS>` so nothing is fetched twice.

Dispatch:
```
Agent({
  subagent_type: "sc4sap:sap-debugger",
  model: "<sonnet for quick-dump | opus for full>",
  description: "Symptom triage — round <N>",
  prompt: """
    Root-cause analysis for a reported SAP incident.
    READ-ONLY: you analyze and report; you never change the SAP system or files.

    Mode: <MODE>
    Known clues: <CLUES>
    System info: <SESSION_INFO>
    Customization cache: <CUSTOMIZATION_DIR>   (a directory, or "none")
    Previous-round findings and user answers (empty on round 1): <PRIOR_FINDINGS>
    Reuse <PRIOR_FINDINGS> — do not re-fetch a dump, source or transport already covered there.

    A. INVESTIGATE via your own MCP tools — never ask me, fetch directly.

       Dump (both modes):
         1. Locate: if a dump ID is known, use it. Otherwise
            RuntimeListFeeds(feed_type: "dumps", from/to = a window around the
            reported time (default: today), user=<affected user> when known,
            max_results <= 5) — about 1 KB per dump. Do NOT use RuntimeListDumps:
            it returns an empty list on some systems (verified on S/4HANA).
         2. RuntimeGetDumpById(dump_id) with the default view and
            response_mode "payload" — about 7 KB: error, exception, terminated
            program, termination link (program + line) and the chapter index.
            With abap-mcp-adt-powerup > 4.8.5, response_mode "summary" returns the same
            facts plus the termination object/line in ~1 KB. On 4.8.5 and older the
            summary facts pick the wrong chapter ("System environment", unrelated
            line) — use the payload there, and do not use RuntimeAnalyzeDump.
         3. Source: read the ONE failing include or method at the termination link
            (GetInclude / GetProgram / GetClass / GetFunctionModule). Never GetProgFullCode.
         4. Only when steps 2–3 cannot explain the error (e.g. the exception text
            or variable values are needed): RuntimeGetDumpById(view: "formatted",
            chapters: ["developer"]) once — about 3–10 KB with the chapter filter
            (abap-mcp-adt-powerup > 4.8.5); older servers ignore `chapters` and
            return the full ~50 KB long text. Either way, use only these chapters: Short Text, What happened,
            Error analysis, Chain of Exception Objects, Information on where
            terminated, Source Code Extract, Active Calls/Events, and Selected
            Variables if a value matters. Ignore the rest (system environment,
            kernel calls, program list, memory, control blocks, table directory,
            generic "What can you do" / "How to correct").
         5. Optional: one DDIC call (GetTable / GetDataElement) when the failing
            statement moves or converts a field.

       If Mode = quick-dump: stop after the dump steps. If the cause is not
       established, return exactly "BLOCKED — needs full" plus what you found.

       If Mode = full, continue only with the paths the clues call for:
         - Recent changes: ListTransports (last 7 days), then GetTransport ONLY for
           transports that contain an object from the call stack — at most 3.
           GetObjectInfo for changed-by / changed-on of the failing object.
         - Where-used: GetWhereUsed on the failing object only when the impact on
           callers matters for the answer.
         - Enhancement: GetEnhancements → GetEnhancementImpl / GetEnhancementSpot
           when a BAdI / exit appears in the stack.
         - Customization: when a Z*/Y* object or customized SAP include is in the
           trace, Grep its name in <CUSTOMIZATION_DIR>/<MODULE>/{enhancements,extensions}.json
           — do not read the whole files.
         - Profiler: RuntimeListProfilerTraceFiles → RuntimeAnalyzeProfilerTrace on
           EXISTING traces only (TIME_OUT / slowness). Never start a run or create
           trace parameters.

    A0. KNOWN-ISSUE LOOKUP — only when the failure point is standard SAP code (no
        Z*/Y* frame at the termination point) or the symptom is a standard error
        message. Skip it for failures inside customer code, and on later rounds.
        - WebSearch, at most 2 queries, built ONLY from standard identifiers:
          runtime error name, exception class, message class + number, exact
          standard message text, standard SAP object / TCode, release. Never put
          customer data in a query: no Z*/Y* names, SID, client, host, user IDs,
          or field values.
        - Optional: one WebFetch on the most relevant hit.
        - Treat hits as leads to verify against the system, never as findings.
        - If the web tools are unavailable or denied, note it and continue.

    B. GAPS — list what MCP cannot reach and matters here (SU53, SLG1, SM13,
       SM58, SM37, WE02, /IWFND/ERROR_LOG). Skip this section when there are none.

    C. HYPOTHESES — 1 when confirmed at High confidence, else 2–3, from the
       8-category framework in skills/analyze-symptom/SKILL.md § Analysis_Framework.
       Each carries: category, confidence (High | Medium | Low), evidence
       (MCP facts), confirmation path (next MCP call, TCode, or user question).

    D. REPORT — your final message IS the user-facing report. Write it in the
       user's language, following skills/analyze-symptom/output-format.md:
       the Per-Round Structure when questions remain open, the Final Round
       structure when none do. Include known-issue hits (if A0 ran), SAP Note
       search keywords and next steps. Max 3 questions, only for gaps MCP
       cannot fill. A code fix may appear only as a proposal, in a block
       headed "Proposed fix — not applied". When a business-process question
       is left open, add one line suggesting `/sc4sap:ask-consultant` with the
       exact question. No JSON, no preamble, no notes addressed to the orchestrator.

    Rules:
    - READ-ONLY. Never call a tool that changes the SAP system: any Create*,
      Update*, Delete*, Patch*, Write*, Activate*, RunUnitTest, RuntimeRun*,
      RuntimeCreate*, CreateTransport, ReloadProfile. Never use Edit / Write,
      and never run a Bash command that writes. This holds even if the user
      asks for the fix mid-round — say it is out of scope for this skill.
    - Never call GetTableContents / GetSqlQuery.
    - Never speculate without evidence ("probably" statements are forbidden).
    - Everything you need about the environment is in this prompt. Do NOT search
      the filesystem (no find / Glob / recursive ls) for config, caches, or
      earlier reports. If <CUSTOMIZATION_DIR> is "none", record the missing
      cache as a gap and move on.
    - Keep tool output small (top <= 5 on list calls). Do not Grep / Read the
      files where oversized tool results were saved — re-query narrower instead.
    - If 4+ categories fit equally, return a short BLOCKED report stating the
      reason and the one question that would disambiguate.
  """
})
```

On `BLOCKED` (other than the quick-dump escalation above): relay the report and wait for the user's answer before re-dispatching.

## Step 3 — Relay (main thread · round N)

- Output the debugger's report **verbatim**, preceded only by the Response Prefix. Do not summarize, restructure, translate, or append your own analysis — the report already carries SAP Note keywords, next steps, and escalation targets.
- If the report contains open questions, stop and wait. When answers arrive → re-dispatch Step 2 (round N+1, same `<MODE>` and model unless the answers point at change history, then `full` on Opus) with `<PRIOR_FINDINGS>` = the previous report + the answers.
- If the report is a Final Round report, the run is complete.

## Step 4 — Follow-up Routing (pointers only — this skill never applies a fix)

This skill is analysis-only. When the user asks for the fix, do NOT call any write tool and do NOT dispatch a write-mode agent from here. Point them to where the change belongs, and stop:

- **Custom code fix** → the user applies the "Proposed fix — not applied" block in SE38 / ADT, or asks for the change as a separate request outside this skill
- **Code quality review** → `/sc4sap:analyze-code`
- **Module-specific configuration / business-process question** → `/sc4sap:ask-consultant` with the target module
- **Dump reproduction** → the user re-runs the transaction in SAP GUI; profiling runs are not started from this skill
- **Cross-user authorization check** → user runs SU53 externally

## Safety Rails

- **Read-only**: no Create / Update / Delete / Patch / Write / Activate / RunUnitTest / RuntimeRun* / RuntimeCreate* / CreateTransport / ReloadProfile, no Edit / Write, no writing Bash — in the main thread and in the debugger. Fixes appear only as proposals.
- **Web lookup hygiene**: queries carry standard identifiers only — never Z*/Y* names, system IDs, user IDs, or data values.
- Blocklist: `GetTableContents` / `GetSqlQuery` are forbidden in this skill — enforced by the debugger's prompt.
- No speculation: "probably" statements are rejected; the debugger returns BLOCKED instead.
- No re-asking: anything already confirmed via MCP must NOT appear as a user question.
- No filesystem search: paths are resolved once in Step 1 and passed down.
- No double fetch: dump metadata once, the formatted dump at most once, one include per failing location, prior-round evidence reused.
