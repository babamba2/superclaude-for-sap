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
     > "No CBO inventory at `.sc4sap/cbo/<MODULE>/<PACKAGE>/`. Pick one: **(A) stock now** — dispatch `sap-stocker` inline (Sonnet, ~2-5 min, recommended) · **(B) skip** — continue without reuse analysis · **(C) cancel** — I'll run `/sc4sap:analyze-cbo-obj` separately first."
     - **(A) stock now** → Emit phase banner `▶ phase=1.CBO-stock · agent=sap-stocker · model=Sonnet 4.6` and dispatch:
       ```
       Agent({
         subagent_type: "sap-stocker",
         description: "CBO inventory — <PACKAGE>",
         prompt: "Stock the CBO package <PACKAGE> (module <MODULE>). Flagship programs: none (invoked from create-program). Follow your Investigation_Protocol and return success block.",
         mode: "dontAsk"
       })
       ```
       On stocker success, re-read the freshly written `inventory.json` and continue to step 3. On `BLOCKED`, surface the reason, fall back to option (B), and log `cbo_inventory: "stock_failed: <reason>"`.
     - **(B) skip** → Record `cbo_inventory: "skipped"` in `.sc4sap/program/{PROG}/platform.md` and continue.
     - **(C) cancel** → Stop the skill and let the user run `/sc4sap:analyze-cbo-obj` manually.
3. Persist the loaded inventory to `.sc4sap/program/{PROG}/cbo-context.md` — one bullet per reusable object: name · type · role · one-line purpose · `reuse_hint`. Planner, writer, and executor all read this file.

Reuse gating rule (applied by `sap-planner` and `sap-writer`):
- If an inventory entry matches the spec's semantic need (same role + matching FK pattern + purpose overlap), **default to reuse**. Only propose a new Z-object when the consultant or user explicitly rejects the candidate, with the rejection reason logged in `plan.md`.

## Customization Inventory Lookup

**Runs immediately after the CBO Inventory Lookup and uses the same resolved `<MODULE>`.** Loads the per-module enhancement + extension cache so the planner/writer prefer extending existing customer assets over creating new ones — critical for BAPI extension / BAdI impl / append-structure scenarios.

Steps:
1. For the resolved `<MODULE>`, check whether `.sc4sap/customizations/<MODULE>/enhancements.json` **and/or** `.sc4sap/customizations/<MODULE>/extensions.json` exist.
   - **Exists** → Read both files. Treat every `badiImplementations[]` entry, `cmodProjects[]` entry, `formBasedExits[]` entry, and `appendStructures[]` entry as a **reuse candidate**.
   - **Does not exist** → Print one line to the user:
     > "No customization inventory at `.sc4sap/customizations/<MODULE>/`. Run `/sc4sap:setup customizations` to scan this module's Z*/Y* enhancements first, or type `skip` to proceed without customization reuse analysis."
     If the user chooses to skip, record `customization_inventory: "skipped"` in `.sc4sap/program/{PROG}/platform.md` and continue.
2. Persist the loaded inventory to `.sc4sap/program/{PROG}/customization-context.md`. One bullet per entry:
   - BAdI impl: `• BAdI {standardName} → existing impl {Z*_CLASS} (impl name: {impl_name}) — reuse target for any new hook into this BAdI`
   - CMOD project: `• SMOD {standardName} → existing CMOD project {Z_PROJECT} — add new components here instead of creating a second project`
   - Form-based exit: `• Include {ZXVEDU01|MV45AFZZ|...} ({lineCount} lines) — already customized; read existing logic before adding new FORMs`
   - Append: `• Table {VBAK|EKKO|...} → existing append {CI_VBAK_ZZ|Z_APPEND_VBAK} fields: [{ZZ_FIELD1}, {ZZ_FIELD2}] — extend this append, do not create a second one`
3. Follow `../../common/customization-lookup.md` for the full resolution protocol and "prefer reuse" ✅/❌ examples.

Reuse gating rule (applied by `sap-planner` and `sap-writer`):
- If the request is to add a BAdI implementation / CMOD component / append field and the cache already lists a `Z*`/`Y*` asset for the same `standardName` or base table, **default to extending the existing asset**. Creating a second parallel Z impl, a second CMOD project for the same SMOD, or a second append on the same standard table is a **MAJOR finding** in Phase 6 review and will block the spec.
- Rejection requires a written justification in `plan.md` (e.g., "existing ZCL_SD_ORDER_IMPL is used by another business flow and merging would break it").
