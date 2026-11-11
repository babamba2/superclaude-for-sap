# ECC DDIC Creation

Shared rule for any sc4sap skill that may create DDIC objects (Table, Structure, Table type, Data Element, Domain) on ECC. Referenced from:
- `skills/create-object/SKILL.md` → `<ECC_DDIC_Fallback>`
- `skills/create-program/SKILL.md` → `<Shared_Conventions>`
- Any other skill that creates or may create DDIC objects as part of its pipeline.

**Context.** On ECC (BASIS < 7.50) the ADT REST API has no DDIC endpoints. The MCP server routes DDIC writes to server-side function modules installed by `/sc4sap:setup` Step 9a.2 (`ZMCP_ADT_DDIC_TABL` / `_TTYP` / `_DTEL` / `_DOMA` / `_ACTIVATE`, called through the OData service `ZMCP_ADT_SRV`). They write with `DDIF_*_PUT`, record the object on the transport and activate. A helper report the user runs in SE38 is the **fallback only**.

## Path 1 — MCP tools (default)

Use the normal MCP tools on ECC. Each creates, records the transport and activates in one call:

| Object | Call (ECC shape) |
|---|---|
| Domain | `CreateDomain` |
| Data Element | `CreateDataElement` with `type_kind: "domain"`, `type_name: <domain>` (other type kinds are not supported on ECC — use the domain of the wanted type, e.g. `CHAR20`, `NUM10`) |
| Structure | `CreateStructure` with `fields`, optional `includes` (no `suffix` on ECC), `enhancement_category` (4 when includes or `structure_ref` / `table_ref` components exist, else 1) |
| Table type | `CreateTableType` with `row_type`, `row_kind` (structure / data_element / table_type), `access_type` (standard), `key_definition` (standard; `key_components` + field list on ECC only), `key_kind` (non_unique; hashed needs unique) |
| Table | `CreateTable` with `fields` (`name`, `key`, `data_element` or `data_type` + `length`, `reference_field` for QUAN / CURR), optional `includes` (appended after the fields), `delivery_class` (A), `enhancement_category` (4 with includes, else 1 — a table with includes does not activate as 1), `data_class` (APPL1 — some systems enforce a customer class such as USER / USER1; the SAP message names it), `size_category` (0) |

Rules:
- Package and transport as for any object: transportable package → `transport_request` required; `$TMP` → none.
- Order of creation: domains → data elements → structures → tables / table types. A table activates only when every data element it uses is active.
- Field typing follows `field-typing-rule.md`; prefer `data_element` over `data_type`.
- Activation `rc=4` (warnings) is success; the tool reports it in `message`. Show it to the user.
- After creating, read the object back (`GetTable` / `GetDataElement`) and show the key fields as evidence.

## Path 2 — helper report (fallback)

Switch to the helper report only when Path 1 cannot run. Decide from the first MCP call's error, never by assumption:

| Error | Cause | Say to the user |
|---|---|---|
| `requires SAP_RFC_BACKEND=odata` | Profile uses `soap` / `native` / `gateway` (e.g. BASIS 7.31 without Gateway) | DDIC writes need the OData backend; helper report used instead |
| FunctionImport / FM `ZMCP_ADT_DDIC_*` not found | Setup Step 9a.2 not installed on this system | Run `/sc4sap:setup` Step 9 (9a.2 FMs + 9c OData classes, DEV tier) to enable direct creation; helper report used now |
| `CreateTable is not supported on ECC` | MCP server older than the ECC `CreateTable` branch | Update the MCP server; helper report used now |

Any other error (authorization, lock, transport, field definition) is **not** a fallback reason — report it and fix the input.

**Program naming (Y-prefix on purpose — helper generators are distinct from their Z* targets).**
| DDIC target | Generator program |
|---|---|
| Table `Z<NAME>` | `YCREATE_<NAME>` |
| Data Element `Z<NAME>` | `YCREATE_DTEL_<NAME>` |
| Domain `Z<NAME>` | `YCREATE_DOMA_<NAME>` |

If the resulting name exceeds 30 characters, truncate the `<NAME>` segment while keeping prefix and type tag intact.

**Source format (strict).** Mirror the three reference templates one-to-one — same header block, same `p_dryrun` checkbox default `'X'`, same `DEFINE ... END-OF-DEFINITION` helper macros, same preview/WRITE section, same `DDIF_*_PUT` exception list, same final "Next steps: open SE11 -> activate -> assign to transport." line. Reference files (relative to plugin root):
- Table:        `skills/create-object/ecc/table_create_sample.abap`
- Domain:       `skills/create-object/ecc/domain_create_sample.abap`
- Data Element: `skills/create-object/ecc/element_create_sample.abap`

Read the matching template with `Read` on every run and generate the new report by substituting only: target object name, DDIC field list / fixed values / label texts, and the `ddtext` description. Allowed additions to the table template: REFTABLE / REFFIELD on QUAN / CURR rows, and `.INCLUDE` rows (FIELDNAME `.INCLUDE`, PRECFIELD = structure, COMPTYPE `S`). Do not refactor the skeleton.

**Target package.** `$TMP` always. The helper program is a one-shot developer utility, not a deliverable. Never assign it to a transport. Never attempt to activate the DDIC object from inside the program (PUT only, no `DDIF_*_ACTIVATE`, no `TR_OBJECTS_INSERT`).

**Mandatory completion message format** (Path 2 only):
```
⚠ ECC — DDIC {Table|Data Element|Domain} could not be created via MCP: <reason from the table above>.
Helper program generated instead:
  Program : <HELPER_NAME>           (package $TMP, activated)
  Target  : <DDIC_OBJECT_NAME>      ({type})

Next steps (manual, in ECC):
  1. SE38 → run <HELPER_NAME>                 (dry-run previews field layout)
  2. Uncheck p_dryrun → re-run                (writes inactive DDIC version)
  3. SE11 → open <DDIC_OBJECT_NAME>           (activate, assign package + transport)
```
Do not claim the DDIC object is created. Do not propose follow-up automation until the user confirms activation in SE11.
