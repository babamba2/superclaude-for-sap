# create-program — CBO + Customization Inventory Lookups

Runs immediately after `<MODULE>` and `<PACKAGE>` are resolved during Phase 1 (interview dimension #6), before the planner starts. Two back-to-back inventory passes feed every downstream phase.

## CBO Inventory Lookup

**Input**: `<MODULE>`, `<PACKAGE>` from interview.
**Output**: `.sc4sap/program/{PROG}/cbo-context.md` (consumed by planner / writer / executor).

Steps:
1. Resolve `<MODULE>` (from interview) and `<PACKAGE>` (from interview dimension #6).
2. Check whether `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` exists.
   - **Exists** → Read it. Extract the `objects[]` array. Treat every entry as a **reuse candidate** and surface it in Phase 2 / Phase 3 so the planner and writer prefer the existing asset over creating a new one.
   - **Does not exist** → Offer the user three options in one question:
     > "No CBO inventory at `.sc4sap/cbo/<MODULE>/<PACKAGE>/`. Pick one: **(A) stock now** — dispatch `sap-stocker` inline (Sonnet, ~2-5 min, recommended) · **(B) skip** — continue without reuse analysis · **(C) cancel** — I'll run `/sc4sap:stock-cbo` separately first."
     - **(A) stock now** → Emit phase banner `▶ phase=1.CBO-stock · agent=sap-stocker · model=Sonnet` and dispatch:
       ```
       Agent({
         subagent_type: "sc4sap:sap-stocker",
         description: "CBO inventory — <PACKAGE>",
         prompt: "Stock the CBO package <PACKAGE> (module <MODULE>). Flagship programs: none (invoked from create-program). Follow your Investigation_Protocol and return success block."
       })
       ```
       On stocker success, re-read the freshly written `inventory.json` and continue to step 3. On `BLOCKED`, surface the reason, fall back to option (B), and log `cbo_inventory: "stock_failed: <reason>"`.
     - **(B) skip** → Record `cbo_inventory: "skipped"` in `.sc4sap/program/{PROG}/platform.md` and continue.
     - **(C) cancel** → Stop the skill and let the user run `/sc4sap:stock-cbo` manually.
3. Persist the loaded inventory to `.sc4sap/program/{PROG}/cbo-context.md` — one bullet per reusable object: name · type · role · one-line purpose · `reuse_hint`. Planner, writer, and executor all read this file.

Reuse gating rule (applied by `sap-planner` and `sap-writer`):
- If an inventory entry matches the spec's semantic need (same role + matching FK pattern + purpose overlap), **default to reuse**. Only propose a new Z-object when the consultant or user explicitly rejects the candidate, with the rejection reason logged in `plan.md`.

## CBO Graph Lookup (tables the program changes or reads)

**Runs right after the CBO Inventory Lookup**, once the interview names the tables the program changes or reads (customer tables, and standard tables it would update). Local, no SAP call — rules in [`../../common/cbo-graph-lookup.md`](../../common/cbo-graph-lookup.md).

1. `<CBO_BASE>` per that file (missing → record `cbo_graph: "not collected"` in `platform.md` and skip; never collect unasked — the stock offer above covers it).
2. One Bash call for all those tables: `node "<PLUGIN_ROOT>/scripts/graph/cbo-lookup.mjs" --base "<CBO_BASE>" --system "<alias>,<SID>" table <T1> <T2> … --md`. A field the spec changes on a shared table → also `table <T>-<FIELD>`.
3. Append to `cbo-context.md` a `## Existing writers and readers` section: per table, the objects that already change it (with ops and the TCodes reaching them) and the readers, plus the lookup's notes (stale, not collected) verbatim.

Gating (applied by `sap-planner` and `sap-writer`):
- A customer FM / method that already changes the table (e.g. an `*_UPD` / `*_SAVE` FM) is the **default write path** — call it instead of a new direct `INSERT` / `UPDATE` / `MODIFY`, unless `plan.md` records why not.
- A new direct write to a table other programs also change → `plan.md` names those programs and states how the new program stays consistent with them (lock object, same key logic, same status field values).
- A direct write to a standard table is already a finding in Phase 6; the lookup shows the precedent programs — a precedent is never a justification by itself.

## Customization Inventory Lookup

**Runs immediately after the CBO Inventory Lookup and uses the same resolved `<MODULE>`.** Loads the per-module enhancement + extension cache so the planner/writer prefer extending existing customer assets over creating new ones — critical for BAPI extension / BAdI impl / append-structure scenarios.

Steps:
1. For the resolved `<MODULE>`, check whether `.sc4sap/customizations/<MODULE>/enhancements.json` **and/or** `.sc4sap/customizations/<MODULE>/extensions.json` exist.
   - **Exists** → Read both files. Treat every `badiImplementations[]` entry, `smodExits[]` entry, `formBasedExits[]` entry, and `appendStructures[]` entry as a **reuse candidate**.
   - **Does not exist** → Print one line to the user:
     > "No customization inventory at `.sc4sap/customizations/<MODULE>/`. Run `/sc4sap:setup customizations` to scan this module's Z*/Y* enhancements first, or type `skip` to proceed without customization reuse analysis."
     If the user chooses to skip, record `customization_inventory: "skipped"` in `.sc4sap/program/{PROG}/platform.md` and continue.
2. Persist the loaded inventory to `.sc4sap/program/{PROG}/customization-context.md`. One bullet per entry:
   - BAdI impl: `• BAdI {standardName} → existing impl {Z*_CLASS} (impl name: {impl_name}) — reuse target for any new hook into this BAdI`
   - CMOD project: `• SMOD {standardName} → existing CMOD project {Z_PROJECT} — add new components here instead of creating a second project`
   - Form-based exit: `• Include {ZXVEDU01|MV45AFZZ|...} ({codeLines} code lines; FORMs with code: {routines}; Z includes: {zIncludes}) — already customized; read existing logic before adding new FORMs`
   - Append: `• Table {VBAK|EKKO|...} → existing append {CI_VBAK_ZZ|Z_APPEND_VBAK} fields: [{ZZ_FIELD1}, {ZZ_FIELD2}] — extend this append, do not create a second one`
3. Follow `../../common/customization-lookup.md` for the full resolution protocol and "prefer reuse" ✅/❌ examples.

Reuse gating rule (applied by `sap-planner` and `sap-writer`):
- If the request is to add a BAdI implementation / CMOD component / append field and the cache already lists a `Z*`/`Y*` asset for the same `standardName` or base table, **default to extending the existing asset**. Creating a second parallel Z impl, a second CMOD project for the same SMOD, or a second append on the same standard table is a **MAJOR finding** in Phase 6 review and will block the spec.
- Rejection requires a written justification in `plan.md` (e.g., "existing ZCL_SD_ORDER_IMPL is used by another business flow and merging would break it").
