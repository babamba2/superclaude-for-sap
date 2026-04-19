---
name: sc4sap:release
description: CTS Transport Release workflow — list, validate, release, and confirm import
level: 3
---

# SC4SAP Release

Full CTS (Change and Transport System) transport release workflow. Hybrid mode: confirms transport selection interactively, then auto-executes validation and release steps.

<Purpose>
sc4sap:release guides you through the complete CTS transport release process: listing available transports, selecting the target, validating pre-release conditions, performing the release, and confirming import readiness. It prevents releasing transports with syntax errors or inactive objects.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Use_When>
- User says "release", "release transport", "release CTS", "push to QAS", or "transport release"
- A development cycle is complete and objects need to move to the next system (QAS/PRD)
- User wants to validate a transport before releasing
- User wants to check what is in a transport before releasing
</Use_When>

<Do_Not_Use_When>
- User wants to create a new transport -- use `/sc4sap:create-object` (which handles transport assignment) or `CreateTransport` directly
- User wants to import a transport (import is done on the target system by Basis)
- Task is not transport-related
</Do_Not_Use_When>

<Hybrid_Mode>
**Confirm** (interactive): Transport selection — always asks the user to confirm which transport to release.
**Auto-execute**: Validation and release steps run automatically after confirmation.

This ensures you never accidentally release the wrong transport, but don't need to manually trigger each validation step.
</Hybrid_Mode>

<Workflow_Steps>

**Step 1 - List Transports** (auto)
- Call `ListTransports` to retrieve open modifiable transports
- Display table: Transport No | Description | Owner | Object Count | Last Changed
- Highlight transports owned by current user

**Step 2 - Select Transport** (confirm required)
- Present list and ask: "Which transport do you want to release? (Enter transport number)"
- User confirms transport number
- Call `GetTransport` to show full transport details including object list

**Step 3 - Pre-Release Validation** (auto, after confirmation)
- **Syntax check**: For each ABAP object in transport, verify via `GetAbapAST` or `GetAbapSemanticAnalysis` — abort if any syntax errors
- **Inactive objects check**: Call `GetInactiveObjects` — abort if any objects in the transport are still inactive
- **Object completeness**: Verify all referenced objects (used classes, interfaces) are either in this transport or already in the target system
- Display validation report: PASS / FAIL per check

**Step 4 - Release** (auto, only if Step 3 all PASS)
- If any validation failed: display errors and stop — do NOT release
- If all validations pass: proceed with transport release
- Report release result: transport number, release timestamp, status

**Step 5 - Import Confirmation**
- Display post-release summary:
  - Transport number and description
  - Released at timestamp
  - Object count
  - Target system(s) in transport route
- Reminder: "Transport released. Import on target system must be triggered by Basis or via STMS."
- Optionally display next steps for the target system import queue

</Workflow_Steps>

<Error_Handling>
- Syntax errors found: list each object with error message; do not release; suggest fix via direct MCP `Update*` calls or re-run `/sc4sap:create-program`
- Inactive objects found: list each inactive object; do not release; suggest activation
- Transport already released: report status and skip release step
- Authorization error on release: report S_TRANSPRT authorization requirement
</Error_Handling>

<MCP_Tools_Used>
- `ListTransports` — retrieve open transports
- `GetTransport` — transport details and object list
- `GetAbapAST` — syntax validation per object
- `GetAbapSemanticAnalysis` — semantic validation
- `GetInactiveObjects` — check for inactive objects
</MCP_Tools_Used>

Task: {{ARGUMENTS}}
