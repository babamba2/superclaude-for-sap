---
name: sc4sap:create-object
description: ABAP object creation workflow — confirm transport+package, auto-create and activate
level: 3
model: sonnet
---

# SC4SAP Create Object

Guided ABAP object creation workflow. Hybrid mode: confirms transport and package interactively, then auto-creates, writes initial code, and activates the object.

<Purpose>
sc4sap:create-object handles the full lifecycle of creating a new ABAP object: determining the right object type, confirming package and transport assignment, creating the object via MCP, generating a well-structured initial implementation, and activating it — all in one workflow.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Phase_Banner>
Multi-phase skill. Before each `Agent(...)` dispatch, emit `▶ phase=<id> (<label>) · agent=<name> · model=<Opus 4.7|Sonnet 4.6|Haiku 4.5>` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Phase Banner Convention.
</Phase_Banner>

<Use_When>
- User says "create", "new class", "new program", "create object", "add a function module", "new table", etc.
- A new ABAP development artifact needs to be created from scratch
- User knows what they want to build but needs the creation scaffolded correctly
</Use_When>

<Do_Not_Use_When>
- Modifying an existing object -- use direct MCP `Update*` tools (`UpdateClass`, `UpdateProgram`, `UpdateInclude`, etc.)
- Creating multiple interdependent objects -- use `/sc4sap:team` for parallel orchestration or `/sc4sap:create-program` for a full program with includes
- User just wants to understand what type to use -- ask a module consultant agent directly
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call or user interaction.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:create-object` to pre-grant all MCP tool + file-op permissions for this session (eliminates per-tool "Allow this tool?" prompts during Create* + activation flow).

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.
- All subsequent `Agent` dispatches within this skill MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

<Supported_Object_Types>
| Type | MCP Create Tool | Description |
|------|----------------|-------------|
| Class | `CreateClass` | ABAP OO class (local or global) |
| Interface | `CreateInterface` | ABAP OO interface |
| Program | `CreateProgram` | Executable program (report) |
| Function Module | `CreateFunctionModule` + `CreateFunctionGroup` | RFC-capable function module |
| Table | `CreateTable` | Transparent database table |
| Structure | `CreateStructure` | ABAP structure (type definition) |
| Data Element | `CreateDataElement` | Domain-based data element |
| Domain | `CreateDomain` | Value domain with fixed values or ranges |
| CDS View | `CreateView` | Core Data Services view |
| Service Definition | `CreateServiceDefinition` | OData service definition |
| Service Binding | `CreateServiceBinding` | OData service binding (UI5/API) |
| Behavior Definition | `CreateBehaviorDefinition` | RAP behavior definition |
| Screen | `CreateScreen` | Dynpro screen (selection screen or dialog) |
| GUI Status | `CreateGuiStatus` | PF-Status (menu bar, toolbar, function keys) |
</Supported_Object_Types>

<ECC_DDIC_Fallback>
**MANDATORY**: Read [`../../common/ecc-ddic-fallback.md`](../../common/ecc-ddic-fallback.md) before creating any Table / Data Element / Domain. It defines when the ECC branch triggers, the helper-program naming rules, the strict template format (mirroring the files under `ecc/`), and the hard constraints (`$TMP` only, no activate, no CTS).
</ECC_DDIC_Fallback>

<Field_Typing_Rule>
**MANDATORY** for every Table / Structure / Table Type field-type decision (standard MCP flow **and** ECC helper-program fallback): read [`../../common/field-typing-rule.md`](../../common/field-typing-rule.md).

Priority: **Standard DE (1)** → **existing CBO DE (2)** → **new CBO DE (3)** → **Data Type + Length (4, last resort)**. Raw primitives like `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` are forbidden when an authoritative SAP data element exists. Before each field, run `SearchObject` against `DTEL` and check `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.
</Field_Typing_Rule>

<Function_Module_Rule>
**MANDATORY** for every `UpdateFunctionModule` source emission: read [`../../common/function-module-rule.md`](../../common/function-module-rule.md).

FM signature is stored inline in the `FUNCTION` statement source (SAP parses it on write and updates TFDIR/FUPARAREF automatically). There is no separate "parameters" endpoint. Every FM source MUST declare `IMPORTING / EXPORTING / CHANGING / TABLES / EXCEPTIONS` clauses directly between `FUNCTION {name}` and the first `.`. Never emit the placeholder `" You can use the template 'functionModuleParameter' ...` line, never use `*"*"Local Interface:` blocks as a substitute, never declare shadow locals like `lv_iv_xxx TYPE ...` to stand in for missing parameters.

Remote-Enabled (RFC) flag is a separate concern — stored in TFDIR.FMODE, not in source. Currently requires manual SE37 Properties update; flag this in the completion report.
</Function_Module_Rule>

<Hybrid_Mode>
**Confirm** (interactive):
- Object name (enforce Z/Y prefix, max 30 chars, uppercase)
- Package assignment (search with `GetPackage` if unsure)
- Transport number (list open transports via `ListTransports`, or create new)
- Short description

**Auto-execute** (after confirmation):
- Create object via appropriate MCP Create* tool
- Generate initial implementation (skeleton with proper structure)
- Activate the object
- Verify activation via `GetInactiveObjects`
</Hybrid_Mode>

<Workflow_Steps>
**MANDATORY**: Follow the step sequence defined in [`workflow-steps.md`](workflow-steps.md).

Per-step model allocation (skill main thread runs on Haiku 4.5 per frontmatter; creation + report delegate to agents):

| Step | Owner | Model | Role |
|------|-------|-------|------|
| 0 Trust | skill-to-skill | Haiku | permission bootstrap |
| 1 Classify | main | **Haiku** | keyword → object type |
| 2 Metadata | main | **Haiku** | name / package / transport / description (Q&A + `SearchObject` + `ListTransports` + naming validation) |
| 3 Pre-Creation Check | main | **Haiku** | `SearchObject` (name-exists guard) |
| 3.5 Version Branch | main | **Haiku** | `SAP_VERSION` ECC vs S/4 routing |
| **4 + 5 + 6 Create + Implement + Activate (standard flow)** | **`sap-executor`** with `model: "opus"` override | **Opus 4.7** | One dispatch covers: `CreateClass`/`CreateProgram`/... → `UpdateClass`/`UpdateProgram`/... with initial implementation code → `ActivateObjects` → `GetInactiveObjects` verify. The Opus override is justified because Step 5 is novel code generation (`common/model-routing-rule.md` § Tier 2) — field typing priority 1–4, class constructor + method signatures, FM inline parameter declarations, etc. |
| **4-ECC DDIC Helper Program (ECC fallback)** | **`sap-executor`** with `model: "opus"` override | **Opus 4.7** | ECC-only branch for Table/DTEL/DOMA. Executor picks the matching template from `skills/create-object/ecc/`, substitutes names, fills the field list per `common/field-typing-rule.md`, and `CreateProgram` + `UpdateProgram` + `ActivateObjects` the helper into `$TMP`. |
| **7 Completion Report** | **`sap-writer`** (Haiku base — no override) | **Haiku 4.5** | Pure formatting from the executor's structured return. Localizes to the user's current conversation language. For ECC fallback, uses the mandatory report format in `workflow-steps.md` § Step 7 verbatim (do NOT rephrase the ⚠ header + 3-step SE38/SE11 checklist). |

At Step 2 (metadata collection) — when the object belongs to a specific SAP module (MM table, SD structure, PS data element, …) — the main thread reads `SAP_ACTIVE_MODULES` from `sap.env` / `config.json` and consults [`../../common/active-modules.md`](../../common/active-modules.md). If companion modules are active, proactively suggest integration fields (e.g., creating an MM CBO table in a landscape with PS active → suggest adding `PS_POSID` / `AUFNR`). Do NOT add silently — propose to user and let them accept/decline, then pass the confirmed field list through to the executor dispatch.
</Workflow_Steps>

<Naming_Convention_Enforcement>
**MANDATORY**: Always read `configs/common/naming-conventions.md` for the complete, authoritative ABAP naming conventions reference before creating any object.

The reference file covers:
- General rules (prefix, case, character set, length limits)
- Module codes (SD/MM/FI/CO/...) for the `Z{MODULE}_...` pattern
- Object-specific patterns — Classes (ZCL_/ZIF_/ZCX_), Programs (ZR_), Function Groups/Modules, Data Dictionary (ZT_/ZDE_/ZDO_), UI (Dynpro/GUI Status), OData/RAP (Z_I_/Z_C_/Z_BP_/Z_SB_), Enhancements, IDoc/ALE
- Code-level naming (variables: LV_/LS_/LT_/IV_/EV_/MV_; constants GC_/LC_; types TY_; methods)
- Validation rules (uppercase, Z/Y prefix, character set, max length, non-generic)

**Quick validation checklist (applied before every create):**
1. Starts with `Z` or `Y` (customer namespace)
2. UPPERCASE only, characters in `[A-Z0-9_]`
3. Within max length (30 chars for most objects)
4. Not generic (ZTEST/ZTEMP/ZDUMMY forbidden)
5. Object-type prefix follows the reference (e.g., `ZCL_` for classes, `ZIF_` for interfaces)
6. Screen = 4-digit number (e.g., 0100); GUI Status = uppercase identifier (e.g., STATUS_0100) — both require a parent program

If the user-provided name violates any rule, suggest a compliant alternative based on `configs/common/naming-conventions.md` before proceeding.
</Naming_Convention_Enforcement>

<MCP_Tools_Used>
- `SearchObject` — check for existing objects
- `ListTransports` — list available transports
- `GetPackage` — verify package existence
- `CreateClass` / `CreateInterface` / `CreateProgram` / `CreateFunctionGroup` / `CreateFunctionModule` / `CreateTable` / `CreateStructure` / `CreateDataElement` / `CreateDomain` / `CreateView` / `CreateServiceDefinition` / `CreateServiceBinding` / `CreateBehaviorDefinition` / `CreateScreen` / `CreateGuiStatus`
- `UpdateClass` / `UpdateProgram` / `UpdateScreen` / `UpdateGuiStatus` / etc. — write initial implementation
- `GetInactiveObjects` — verify activation
- **ECC DDIC fallback:** only `CreateProgram` + `UpdateProgram` (target `$TMP`). `CreateTable` / `CreateDataElement` / `CreateDomain` must NOT be attempted when `SAP_VERSION = ECC`.
</MCP_Tools_Used>

Task: {{ARGUMENTS}}
