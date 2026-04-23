---
name: sc4sap:team
description: N coordinated SAP agents on a shared task list using Claude Code native teams
level: 3
---

# SC4SAP Team

Follows OMC `team` pattern adapted for SAP. Coordinates multiple specialized SAP agents working in parallel on a shared task list using Claude Code native team mode.

<Purpose>
sc4sap:team spins up N coordinated agents that divide and conquer a SAP development task. Each agent is assigned a role (sap-developer, sap-code-reviewer, sap-transport-manager, etc.) and works on its slice of the task list simultaneously, with results merged at the end.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch (including every parallel spawn), emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus 4.7|Sonnet 4.6|Haiku 4.5>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention.
</Phase_Banner>

<Use_When>
- Task has multiple independent SAP objects to create or modify (e.g., class + interface + unit test)
- User wants parallel development across multiple ABAP programs or packages
- Large transport release requiring parallel validation across multiple objects
- User says "team", "parallel", "all at once", or "split the work"
</Use_When>

<Do_Not_Use_When>
- Task is sequential (one object depends on another) -- use `/sc4sap:create-program` (for a full program with ordered includes) or `/sc4sap:create-object` repeatedly
- Single object creation or modification -- delegate directly to executor
- User wants to review options first -- use `/sc4sap:deep-interview` to crystallize the spec before dispatching agents
</Do_Not_Use_When>

<SAP_Agent_Roles>
Available roles to assign to team members:
- `sap-developer`: Writes and activates ABAP code via MCP (CreateClass, UpdateClass, RunUnitTest, etc.)
- `sap-code-reviewer`: Reviews ABAP code quality, naming conventions, and SAP best practices
- `sap-transport-manager`: Handles CTS transport creation, assignment, and release via ListTransports, GetTransport, CreateTransport
- `sap-architect`: Designs ABAP object structure, package hierarchy, and dependency graph
- `sap-tester`: Writes and runs ABAP unit tests via CreateUnitTest, RunUnitTest, GetUnitTestResult
</SAP_Agent_Roles>

<Execution_Policy>
- Assign agents to non-overlapping task slices to avoid transport conflicts
- Each agent must confirm transport assignment before writing objects
- Merge results: collect activation status from each agent before team completion
- If any agent reports activation failure, halt and escalate to orchestrator
- Use `run_in_background: true` for long-running unit test suites
</Execution_Policy>

<Steps>
1. Parse task into independent work slices (by ABAP object or package)
2. Assign one agent per slice with explicit role and task scope
3. Each agent: create/modify objects -> activate -> run unit tests -> report status
4. Orchestrator: collect all agent results, verify zero inactive objects remain
5. If all pass: report completion summary with object list and transport number
6. If any fail: surface errors and retry failed slices
</Steps>

Task: {{ARGUMENTS}}
