# create-object Workflow Steps

Detailed step sequence for `sc4sap:create-object`. Referenced from `SKILL.md` → `<Workflow_Steps>`.

**Step 1 - Classify Object Type** (auto)
- Parse user request to determine object type
- If ambiguous: ask "Do you want a class, program, function module, or other type?"

**Step 2 - Collect Metadata** (confirm required)
- Object name: suggest name based on description, enforce naming conventions
  - Z/Y prefix required for customer objects
  - Max 30 characters
  - Uppercase only
  - No special characters except underscore
- Short description: 1 line, max 60 chars
- Package: show recent packages or search; warn if `$TMP` (local, not transportable)
- Transport: list open transports owned by current user; option to create new

**Step 3 - Pre-Creation Check** (auto)
- Call `SearchObject` to verify the name does not already exist
- If exists: "Object {name} already exists. Modify it with direct MCP `Update*` calls (`UpdateClass`, `UpdateProgram`, `UpdateInclude`, etc.)."

**Step 3.5 - Version Branch Decision** (auto)
- Read `SAP_VERSION` from `.sc4sap/config.json` (or `sap.env`).
- If `SAP_VERSION = ECC` **and** object type ∈ {Table, Data Element, Domain}: go to Step 4-ECC.
- Otherwise: go to Step 4 (standard flow).

**Step 4 - Create Object (standard flow — S/4HANA or non-DDIC on ECC)** (auto)
- Call appropriate Create* MCP tool with confirmed metadata
- For Function Module: create Function Group first if it doesn't exist (`CreateFunctionGroup`)
- For Service Binding: ensure Service Definition exists first
- For Screen / GUI Status: parent program must exist first; create program if needed

**Step 4-ECC - Generate DDIC Helper Program (ECC + Table/DTEL/DOMA)** (auto)
- Pick the matching reference file in `ecc/` (table / domain / element) and `Read` it.
- Compute helper program name per the naming table in [`../../common/ecc-ddic-fallback.md`](../../common/ecc-ddic-fallback.md). Verify ≤ 30 chars.
- Call `CreateProgram` with `program_name = <helper>`, `package_name = '$TMP'`, `program_type = 'executable'`, description "Create DDIC {type} {name} on ECC".
- **Field list MUST follow [`../../common/field-typing-rule.md`](../../common/field-typing-rule.md)** — each `add_field` call uses `rollname` (priority 1–3 Data Element); primitive data-type+length is priority 4 and requires inline justification.
- Call `UpdateProgram` with the generated source — substitute only the target name, field / fixed-value / label content, and the description. Keep the template skeleton verbatim.
- Activate the helper program (`activate = true`).
- **Skip Step 5, Step 6** — the DDIC object itself is not created now; the user must run the helper in SE38.

**Step 5 - Generate Initial Implementation (standard flow only)** (auto)
- Write skeleton code appropriate to object type:
  - Class: constructor, standard interface implementations if applicable
  - Program: REPORT statement, basic structure
  - Function Module: parameter documentation, basic error handling
  - Table / Structure: key fields, client field for client-dependent tables; **every field's type follows [`../../common/field-typing-rule.md`](../../common/field-typing-rule.md)** — Standard DE first, CBO DE next, raw data type + length only as a justified last resort
  - Interface: method signatures based on described purpose
  - Screen: PROCESS BEFORE OUTPUT / PROCESS AFTER INPUT flow logic, basic module stubs
  - GUI Status: standard function key layout (Back/Exit/Cancel), application toolbar
- Write code via appropriate Update* MCP tool

**Step 6 - Activate (standard flow only)** (auto)
- Activate the object
- Check `GetInactiveObjects` — must be empty for this object
- If activation fails: display error, suggest fix, retry once

**Step 7 - Completion Report**

*Standard flow:*
- Object name and type
- Package and transport
- Activation status (ACTIVE / FAILED)
- Next steps suggestion (e.g., "Add methods with direct `UpdateClass` MCP calls" or "Release with `/sc4sap:release`")

*ECC DDIC fallback flow (MANDATORY message format):*
```
⚠ ECC detected — DDIC {Table|Data Element|Domain} cannot be created via MCP.
Helper program generated instead:
  Program : <HELPER_NAME>           (package $TMP, activated)
  Target  : <DDIC_OBJECT_NAME>      ({type})

Next steps (manual, in ECC):
  1. SE38 → run <HELPER_NAME>                 (dry-run previews field layout)
  2. Uncheck p_dryrun → re-run                (writes inactive DDIC version)
  3. SE11 → open <DDIC_OBJECT_NAME>           (activate, assign package + transport)
```
Do not claim the DDIC object is created. Do not propose follow-up automation until the user confirms activation in SE11.
