# analyze-symptom Workflow Steps

Detailed step sequence for `sc4sap:analyze-symptom`. Referenced from `SKILL.md` → `<Workflow_Steps>`.

**Step 1 — Initial Triage** (auto)
- Extract clues from the user message: error text, message class/number, TCode, program/class name, affected user, timing, dump indicators
- Call `GetSession` to capture system info (SID, client, release, SP, user)
- Structure the extracted clues and proceed to Step 2

**Step 2 — MCP-Driven Auto-Investigation** (auto — primary phase)

Route by available clues and collect evidence before any user question:

1. **Dump suspected** (keywords: runtime error, dump, short dump, ABORT)
   - `RuntimeListDumps` → recent dumps list
   - Candidate dumps → `RuntimeGetDumpById` → `RuntimeAnalyzeDump`
   - Extract program/class/FM names from dump → feed to step 2.3

2. **Recent transport suspected** (user says "suddenly", "was fine yesterday", "after deployment")
   - `ListTransports` → recent released/open TRs (last 7 days priority)
   - Candidate TRs → `GetTransport` → object list
   - Cross-reference with symptom object

3. **Program / class logic analysis**
   - `ReadClass` / `ReadProgram` / `ReadFunctionModule` → source
   - `GetAbapSemanticAnalysis` → detect inactive/type errors
   - `GetWhereUsed` → impact scope
   - `GetObjectInfo` → last changed by, recent modification date

4. **Enhancement / BAdI suspected** (standard TCode exhibiting non-standard behavior)
   - `GetEnhancements` → enhancements attached to program
   - `GetEnhancementImpl` / `GetEnhancementSpot` → implementation details
   - For any Z* implementation, check recent changes via `GetObjectInfo`

5. **Performance suspected** (TIME_OUT, slowness reports)
   - For reproducible programs: `RuntimeRunProgramWithProfiling` → `RuntimeAnalyzeProfilerTrace`
   - Identify bottleneck (DB access / loop / memory)

**Step 3 — Gap Identification**
After MCP investigation, identify remaining gaps:
- MCP-unsupported areas (authorization, application log, IDoc, batch)
- Reproduction conditions, scope of impact, data patterns only the user can confirm

**Step 4 — Minimal User Questions** (max 3 per round)
Ask only the questions that best narrow the hypothesis. Always surface what MCP already confirmed to avoid redundancy:

```
✅ Confirmed via MCP:
  - System: S4H / client 100 / 756
  - 3 recent dumps found (MESSAGE_TYPE_X at line 247)
  - Call stack includes ZCL_SD_ORDER_PROCESSOR (modified 2 days ago)

❓ Need your input:
  1. Does the error occur only for specific sales orgs or company codes?
  2. Any authorization-related popup (e.g., SU53 capture)?
```

Priority order for questions:
1. Exact error text + message class/number (if not yet known)
2. Reproduction conditions (always / intermittent; specific user / data / org)
3. Recent operational changes (transports, roles, kernel) from the user's perspective

**Step 5 — Hypothesis Narrowing**
- Combine MCP evidence and user answers to narrow to 2–3 categories from `<Analysis_Framework>`
- Each hypothesis must include: **category**, **confidence (High / Medium / Low)**, **evidence**, **confirmation path**

**Step 6 — SAP Note Search Strategy**
Provide copy-paste-ready search keywords, ordered from most specific to broadest:
1. Exact error string in quotes + message class + number
2. Dump runtime error name (e.g., `MESSAGE_TYPE_X`, `ASSERTION_FAILED`)
3. Program / class / function module name
4. Component + keyword (e.g., `FI-GL open period short dump`)
5. TCode + symptom keyword

Additional filters: release, SP level, kernel level, component.

**Step 7 — Recommended Actions**
Split recommendations by who can act:
- Immediately actionable: additional MCP queries, local checks
- Requires access: SU53, SM13, STMS, etc.
- Escalation: development team / Basis / module consultant

**Step 8 — Escalation Routing**
After hypothesis confirmation, hand off to the correct follow-up:
- Custom code fix → `/sc4sap:ralph` or sap-debugger agent
- Code quality review → `/sc4sap:analyze-code`
- Module-specific configuration deep-dive → module consultant (`sap-sd-consultant`, `sap-fi-consultant`, etc.)
- Dump reproduction → `RuntimeRunClassWithProfiling` / `RuntimeRunProgramWithProfiling`
