---
name: sc4sap:analyze-symptom
description: Step-by-step root cause analysis for SAP operational errors. Uses MCP to directly inspect dumps, logs, transports, and where-used relations, then narrows hypotheses with minimal user questions and provides SAP Note search keywords.
level: 2
model: sonnet
---

# SC4SAP Analyze Symptom

Performs structured root cause analysis for SAP operational incidents by connecting to the live SAP system through MCP. Auto-collects evidence from dumps, system state, recent transports, and code call graphs before asking the user any question.

<Purpose>
sc4sap:analyze-symptom is the first-line triage skill for SAP production incidents. Rather than bombarding the user with questions, it **directly investigates the SAP system through MCP** to gather evidence it can collect on its own. It then asks the user only about gaps that MCP cannot fill, narrows hypotheses to 2–3 categories, and produces SAP Note search keywords plus recommended next actions.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus 4.7|Sonnet 4.6|Haiku 4.5>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention.
</Phase_Banner>

<Use_When>
- User reports a symptom using words like "error", "dump", "failing", "broken", "not working", "timeout", "slow"
- User has at least one clue: error message, TCode, program name, job name, or affected user/data
- User is unsure which log or transaction to inspect (ST22, SM21, SLG1, SU53, SM13, SM58, WE02, etc.)
- Need to classify whether the issue is custom development vs SAP standard
- Need to trace root cause of an incident that started after a recent transport or patch
</Use_When>

<Do_Not_Use_When>
- Root cause is already identified and only a code fix is needed — use `/sc4sap:create-program` or direct MCP `Update*` calls
- Pure static code quality review — use `/sc4sap:analyze-code`
- Need to create a new ABAP object — use `/sc4sap:create-object`
- Conceptual or configuration-guide question — use a module consultant agent directly
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:analyze-symptom` to pre-grant all MCP tool + file-op permissions for this session (eliminates per-tool "Allow this tool?" prompts during auto-investigation — `RuntimeAnalyzeDump`, `ListTransports`, `GetWhereUsed`, etc.).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.
- All subsequent `Agent` dispatches within this skill MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Core_Principles>
- **MCP-first**: Before asking the user, investigate the SAP system directly with MCP. Never re-ask what MCP can answer.
- **Evidence over assumption**: Do not speculate. No "probably" statements without supporting MCP or user-provided evidence.
- **Minimal questions**: At most 3 questions per round. Skip any question whose answer is already known via MCP.
- **Hypothesis narrowing**: Reduce candidate causes to 2–3 from the 8-category framework; each must carry a confidence level and a confirmation path.
- **Actionable output**: Every hypothesis must include the next evidence step (another MCP call, a TCode, or an escalation target).
- **Customization cache first (local, before live MCP) when a Z*/Y* object or customized SAP include appears in the trace**: read `.sc4sap/customizations/<MODULE>/{enhancements,extensions}.json` and correlate — a `Z*` class in a dump may be a known BAdI impl, a customized `MV45AFZZ`/`ZXRSRU01` may be a recorded form-based exit, a failing field may be a recorded append. Follow `common/customization-lookup.md`. If the cache is absent, suggest `/sc4sap:setup customizations` but do not block the current analysis.
</Core_Principles>

<Analysis_Framework>
All hypotheses must map to one of these 8 root cause categories:

| Category | Typical Symptoms | Key Signals |
|----------|------------------|-------------|
| Master / Input data | Only specific data fails, others succeed | Data values, related master records |
| Authorization | Only specific users fail | SU53, STAUTHTRACE, recent role changes |
| Customizing | Only specific org units affected | SPRO values, recent customizing transports |
| Interface / RFC / Batch | External integration fails | SM58, SMQ1/2, SM37, WE02, BD87 |
| Custom development | Z*/Y* objects in call stack | Recent Z* transports, GetWhereUsed |
| Standard SAP bug | Only standard objects in stack; right after SP upgrade | SAP Note search, kernel/SP level |
| Performance / Locks / DB | Timeouts, increased wait times | ST05, SAT, SM12, SQLM |
| Operational procedure | Step order or prerequisite violated | Month-end, dependency job status |

Every hypothesis presented to the user must declare its **category** explicitly.
</Analysis_Framework>

<Evidence_Collection_Matrix>
Evidence collection strategy — prefer MCP auto-query, fall back to manual TCode guidance:

| Symptom Type | MCP Auto-Query | Manual TCode |
|--------------|----------------|--------------|
| Short dump / runtime error | `RuntimeListDumps`, `RuntimeGetDumpById`, `RuntimeAnalyzeDump` | ST22 |
| Performance / long runtime | `RuntimeRunProgramWithProfiling`, `RuntimeAnalyzeProfilerTrace`, `RuntimeListProfilerTraceFiles` | ST05, SAT, SQLM |
| Suspect program/class logic | `ReadClass`/`ReadProgram`, `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetWhereUsed` | SE80, SE24, SE38 |
| Recent change tracking | `ListTransports`, `GetTransport`, `GetObjectInfo` (Author/Changed-by) | SE09, SE10, SE16 → E070 |
| **Z\*/Y\* object or customized SAP include in trace** | Local file read: `.sc4sap/customizations/<MODULE>/enhancements.json` (→ `badiImplementations[]`, `cmodProjects[]`, `formBasedExits[]`) and `.sc4sap/customizations/<MODULE>/extensions.json` (→ `appendStructures[]`) | n/a — local cache only |
| Enhancement / BAdI | `GetEnhancements`, `GetEnhancementImpl`, `GetEnhancementSpot` | SE18, SE19, SMOD, CMOD |
| System / session info | `GetSession` | /n (status), /o SM04 |
| Table schema (not rows) | `GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain` | SE11 |
| Unit test results | `GetUnitTestResult`, `RunUnitTest` | SE80 → test class |
| Authorization error | (MCP not supported) | SU53, STAUTHTRACE |
| Application log | (MCP not supported) | SLG1 |
| System log | (MCP not supported) | SM21 |
| Update error | (MCP not supported) | SM13 |
| RFC / tRFC / qRFC | (MCP not supported) | SM58, SMQ1, SMQ2 |
| Background job | (MCP not supported) | SM37 |
| IDoc | (MCP not supported) | WE02, WE05, BD87 |
| OData / Fiori | (MCP not supported) | /IWFND/ERROR_LOG, /IWBEP/ERROR_LOG |

**Rule**: For any MCP-supported item, never ask the user — query it directly.
</Evidence_Collection_Matrix>

<Workflow_Steps>
**MANDATORY**: Follow the step sequence defined in [`workflow-steps.md`](workflow-steps.md).

Per-step model allocation (skill main thread runs on Haiku 4.5 per frontmatter; heavy analysis is delegated):

| Step | Owner | Model | Role |
|------|-------|-------|------|
| 0 Trust | skill-to-skill | Haiku | permission bootstrap |
| 1 Initial Triage | main | **Haiku** | clue parsing + `GetSession` |
| **2 Investigate + Gap + Narrow** | **`sap-debugger`** with `model: "opus"` override | **Opus 4.7** | auto-investigation (dump/transport/code/enhancement/customization) + gap identification + 2–3 hypotheses with confidence/evidence/confirmation-path + priority questions. One dispatch per round. |
| 3 User Questions | main | **Haiku** | render debugger's priority questions + collect answers (max 3/round) |
| (multi-round) repeat Step 2 | `sap-debugger` (Opus override) | Opus 4.7 | re-run with new user-supplied evidence |
| 4 SAP Note Keywords | main | **Haiku** | assemble copy-paste search strings from debugger's sap_note_hints |
| 5 Recommended Actions | main | **Haiku** | static classification by actor (immediate / access-required / escalation) |
| 6 Escalation Routing | main | **Haiku** | point to next skill or agent (sap-debugger write mode, /sc4sap:analyze-code, module consultant, etc.) |

sap-debugger's tool set already covers `RuntimeAnalyzeDump`, profiler, transport queries, code reads, enhancement lookup, and customization cache reads — see the agent's Investigation_Protocol for the full inventory. The `model: "opus"` override is appropriate here because symptom triage is cross-file reasoning (dump × transport × source × customization × profiler) with ambiguity resolution (8-category framework), which `common/model-routing-rule.md` § Tier 2 classifies as Opus territory.
</Workflow_Steps>

<Question_Strategy>
**Rule**: max 3 questions per response. Never re-ask what MCP already answered.

Priority when information is missing:
1. Exact error text + message class/number — the strongest SAP Note search key
2. TCode / App / Program / Job where the error occurs
3. Reproduction conditions (always vs intermittent; user/data/org specificity)

Situation-specific follow-ups:
- **Authorization suspected**: Does another user succeed with the same input? Any SU53 capture?
- **Batch suspected**: Does manual execution also fail? Any recent variant change?
- **Interface suspected**: Does SM59 Connection Test succeed? What is the IDoc status code (51/52/53/64)?
- **Custom development suspected**: (First run `ListTransports` + `GetWhereUsed`, then) Does TR candidate X match the timing of the incident?
- **Standard bug suspected**: Release/SP auto-detected via `GetSession`. Does the same symptom reproduce on QAS/DEV?
- **Performance suspected**: How much slower than usual? Which resource saturates first — DB / CPU / memory?
</Question_Strategy>

<Output_Format>
Per-round report template and the final-round consolidated report structure live in [`output-format.md`](output-format.md). Follow it literally for both intermediate rounds and the final analysis.
</Output_Format>

<MCP_Tools_Used>

Only `GetSession` is called by the main thread (Step 1 intake). Every other tool below is called **by the `sap-debugger` agent** inside its Step 2 dispatch — the orchestrator never holds dump payloads, full source, or transport object lists.

**Main thread (Haiku · Step 1 only)**
- `GetSession` — system ID, client, release, SP level, current user

**Reviewer agent (`sap-debugger` with Opus override · Step 2 dispatch)**

**Dump Analysis**
- `RuntimeListDumps` — recent dumps
- `RuntimeGetDumpById` — specific dump detail
- `RuntimeAnalyzeDump` — automated dump analysis (location, variables, stack)

**Performance Profiling**
- `RuntimeCreateProfilerTraceParameters` — profiler setup
- `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` — reproducible run with profiler
- `RuntimeListProfilerTraceFiles` / `RuntimeGetProfilerTraceData` / `RuntimeAnalyzeProfilerTrace` — trace analysis

**Transport / Change Tracking**
- `ListTransports` — recent transports
- `GetTransport` — objects included in a transport
- `GetObjectInfo` — author, last changed by, modification date

**Code Analysis**
- `ReadClass` / `ReadProgram` / `ReadFunctionModule` / `ReadInterface` — source
- `GetProgFullCode` — full source including includes
- `GetAbapAST` — parse tree
- `GetAbapSemanticAnalysis` — semantic analysis (activation / type errors)
- `GetWhereUsed` — caller graph
- `GetInactiveObjects` — any inactive objects remaining

**Enhancement**
- `GetEnhancements` — enhancements attached to program
- `GetEnhancementImpl` / `GetEnhancementSpot` — implementation and spot detail

**Data Dictionary** (schema only — not row extraction)
- `GetTable` / `GetStructure` / `GetView` / `GetDataElement` / `GetDomain`

**Search**
- `SearchObject` — existence / type check
- `DescribeByList` — batch metadata lookup

</MCP_Tools_Used>

<Common_Pitfalls_To_Avoid>
- ❌ Asking the user for information MCP can retrieve (system info, program source, recent transports)
- ❌ Firing 4+ questions at once
- ❌ Diagnosing a root cause without an error message in hand
- ❌ Skipping `RuntimeListDumps` when a dump is suspected and speculating instead
- ❌ Deflecting with "contact Basis / dev team" without a concrete checklist and evidence
- ❌ Claiming a standard SAP bug before attempting a SAP Note search
- ❌ Blaming recent changes without inspecting transport history via `ListTransports`
- ❌ Listing 4+ hypotheses (narrow to 2–3)
</Common_Pitfalls_To_Avoid>

Task: {{ARGUMENTS}}
