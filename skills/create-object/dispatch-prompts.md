# Dispatch Prompts

Full `Agent(...)` prompt bodies for create-object. Referenced from `workflow-steps.md` to keep that file under the 200-line cap.

## Step 4+5+6 — sap-executor (standard flow, Opus override)

One dispatch covers create + implement + activate for all non-ECC-DDIC cases.

```
Create, implement, and activate ABAP object per the provided metadata. One continuous workflow.

Metadata:
  name         : <NAME>
  type         : <TYPE>   // Class|Interface|Program|FunctionModule|Table|Structure|DataElement|Domain|CDSView|ServiceDefinition|ServiceBinding|BehaviorDefinition|Screen|GuiStatus
  description  : <DESC>
  package      : <PACKAGE>
  transport    : <TRKORR or "$TMP">
  extra_fields : <per-module integration fields confirmed by user>  // Tables/Structures only
  fm_signature : <IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS>   // FunctionModule only

Execute in order:

1. CREATE — call the matching MCP tool (CreateClass / CreateProgram / CreateFunctionGroup + CreateFunctionModule / CreateTable / ...). For FM: ensure parent Function Group exists first. For Service Binding: Service Definition must exist first. For Screen / GUI Status: parent program must exist.

2. IMPLEMENT — write initial implementation via the matching Update* MCP tool:
   - Class: constructor + method signatures + CL_OBJECT_DESCR-based exception handling (common/clean-code-oop.md)
   - Program: REPORT statement + basic structure + include scaffold when applicable (common/include-structure.md)
   - Function Module: inline IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS in the FUNCTION statement per common/function-module-rule.md — never use *"*"Local Interface:* blocks, never emit shadow-local placeholders
   - Table / Structure: key fields + client field (MANDT for client-dependent) + each field typed per common/field-typing-rule.md (priority Standard DE → CBO DE → new CBO DE → primitive data-type+length (last resort, requires inline justification))
   - Interface: method signatures based on described purpose
   - Screen: PROCESS BEFORE OUTPUT / PROCESS AFTER INPUT + basic module stubs
   - GUI Status: standard function key layout (Back/Exit/Cancel) + application toolbar

3. ACTIVATE — ActivateObjects then GetInactiveObjects to verify. Retry once on activation failure. If still failing, return status FAILED with the error message.

Return structure (JSON-like):
  {
    "object_name"        : "<NAME>",
    "object_type"        : "<TYPE>",
    "package"            : "<PACKAGE>",
    "transport"          : "<TRKORR or $TMP>",
    "flow"               : "standard",
    "activation_status"  : "ACTIVE" | "FAILED",
    "field_typing_decisions": [{field, type, rollname, priority, justification}],  // Tables/Structures only
    "warnings"           : ["..."],
    "errors"             : ["..."]                                              // only on FAILED
  }

Rules:
- Field typing: always follow common/field-typing-rule.md — run SearchObject(DTEL) + check .sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json before falling back to primitives.
- FM signature: always inline in the FUNCTION statement per common/function-module-rule.md.
- Naming: already validated by main before dispatch, but reject if any second-pass check fails.
```

## Step 4-ECC — sap-executor (ECC DDIC helper program, Opus override)

ECC-only branch for Table / DataElement / Domain. Generates an ABAP helper program that the user runs in SE38; does NOT attempt direct DDIC MCP creates.

```
Generate a DDIC helper program for ECC (SAP_VERSION=ECC forbids direct DDIC MCP creates).

Metadata:
  ddic_target_name : <NAME>                  // Z-table / data element / domain
  ddic_target_type : Table | DataElement | Domain
  description      : <DESC>
  field_list       : [...]                   // Tables only; per common/field-typing-rule.md

Execute in order:

1. Read the matching template from skills/create-object/ecc/:
   - Table        → table_create_sample.abap
   - DataElement  → element_create_sample.abap
   - Domain       → domain_create_sample.abap

2. Compute helper program name per common/ecc-ddic-fallback.md naming table. Verify ≤ 30 chars.

3. Call CreateProgram with:
     program_name = <helper>
     package_name = "$TMP"
     program_type = "executable"
     description  = "Create DDIC <type> <name> on ECC"

4. Call UpdateProgram with the generated source — substitute ONLY:
     - the target DDIC object name
     - field list / fixed values / labels
     - the description line
   Every add_field call MUST use rollname where priority 1–3 (Standard DE / CBO DE) applies; primitive data-type+length requires inline justification. Keep the template skeleton verbatim.

5. Activate the helper program (activate = true).

DO NOT attempt CreateTable / CreateDataElement / CreateDomain on ECC — they are disallowed.

Return:
  {
    "object_name"        : "<NAME>",
    "object_type"        : "<TYPE>",
    "flow"               : "ecc-helper",
    "activation_status"  : "ECC_DEFERRED",
    "helper_program_name": "<HELPER_NAME>",
    "field_typing_decisions": [...],
    "warnings"           : ["..."]
  }
```

## Step 7 — sap-writer (completion report, Haiku base)

Pure formatting from the executor's structured return. Writer localizes to the user's current conversation language.

```
Render the completion report for a just-executed create-object workflow.

Inputs (from executor's return):
<executor_return_json>

User conversation language: <LANG>

Render rules:
- flow = "standard" AND activation_status = "ACTIVE":
    5–7 line block — object name · type · package · transport · ACTIVE status + 1-line next-step hint
    (e.g., "Add methods with direct UpdateClass MCP calls" or "Release with /sc4sap:release").

- flow = "standard" AND activation_status = "FAILED":
    error message + suggested fix + retry hint.

- flow = "ecc-helper" AND activation_status = "ECC_DEFERRED":
    **Use the MANDATORY format VERBATIM** (do NOT rephrase):

    ⚠ ECC detected — DDIC {Table|Data Element|Domain} cannot be created via MCP.
    Helper program generated instead:
      Program : <HELPER_NAME>           (package $TMP, activated)
      Target  : <DDIC_OBJECT_NAME>      ({type})

    Next steps (manual, in ECC):
      1. SE38 → run <HELPER_NAME>                 (dry-run previews field layout)
      2. Uncheck p_dryrun → re-run                (writes inactive DDIC version)
      3. SE11 → open <DDIC_OBJECT_NAME>           (activate, assign package + transport)

    Do NOT claim the DDIC object is created. Do NOT propose follow-up automation until the user confirms activation in SE11.

Any warnings → append a "⚠️ Warnings" bullet list after the main block.
Any field_typing_decisions with priority=4 (primitive fallback) → append a "🔍 Field typing" note listing which field + the justification, so the user can inspect.
```
