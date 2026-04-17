---
name: sc4sap:create-program
description: Create ABAP programs (Report/CRUD/ALV/Batch) with Main+Include structure, OOP or Procedural, and full agent-driven coding/QA pipeline
level: 4
---

# SC4SAP Create Program

Core ABAP program creation skill. Generates a Main Program wrapped with conditional Includes following the sc4sap template convention. Supports both OOP (two-class split: Data + Screen/ALV) and Procedural (PERFORM) paradigms. Full pipeline: SAP version preflight → Socratic interview → planner → writer spec → user confirm → executor/qa/reviewer.

<Purpose>
sc4sap:create-program is the flagship skill for creating new ABAP programs. It handles a wide range of purposes (Report, CRUD, ALV list, Batch, Interface). Before coding starts, it runs an internal Socratic interview to resolve ambiguity, then produces a confirmed spec, then orchestrates coding and QA agents to deliver activated, tested ABAP objects following sc4sap conventions.
</Purpose>

<Use_When>
- User says "create program", "new report", "ALV program", "CRUD program", "make me a batch program", etc.
- A new ABAP executable program (REPORT) needs to be created from scratch
- Program requires the Main+Include wrapping convention
- ALV display is needed (full CL_GUI_ALV_GRID or simple SALV popup)
</Use_When>

<Do_Not_Use_When>
- Creating a single class/interface/table — use `/sc4sap:create-object`
- Modifying an existing program — use `/sc4sap:ralph` or direct `UpdateProgram`/`UpdateInclude`
- Creating a RAP business object / OData service — use `/sc4sap:autopilot`
- User wants only scaffolding without coding — use `/sc4sap:create-object` with type=program
</Do_Not_Use_When>

<Shared_Conventions>
The following rules are **shared across sc4sap skills** and live in `sc4sap/common/`. Load and apply them during the relevant phases of this skill:

| Convention | Reference File | Applied In |
|------------|----------------|------------|
| Include structure (t/s/c/a/o/i/e/f/_tst) | `../../common/include-structure.md` | Planner, Executor |
| OOP two-class pattern (LCL_DATA + LCL_ALV) | `../../common/oop-pattern.md` | Executor (OOP mode) |
| ALV rules (Full vs SALV, field catalog standard) | `../../common/alv-rules.md` | Executor, Reviewer |
| Text element rule (no hardcoded display literals) | `../../common/text-element-rule.md` | Executor, Reviewer |
| Constant rule (no magic literals in logic) | `../../common/constant-rule.md` | Executor, Reviewer |
| Procedural FORM naming (`_{screen_no}` suffix) | `../../common/procedural-form-naming.md` | Executor (Procedural), Reviewer |
| Naming conventions (program/include/class/screen) | `../../common/naming-conventions.md` | Planner, Executor, Reviewer |
| ECC DDIC fallback (Table / DTEL / DOMA on ECC) | `../../common/ecc-ddic-fallback.md` | Planner (gate), Executor (program generation), Reviewer |

Paths are relative to this skill's directory (`sc4sap/skills/create-program/`).

**ECC DDIC fallback gate.** When the planner's object list includes a new Table, Data Element, or Domain AND `SAP_VERSION = ECC`, Phase 4 (Executor) must not call `CreateTable` / `CreateDataElement` / `CreateDomain`. Instead, follow [`../../common/ecc-ddic-fallback.md`](../../common/ecc-ddic-fallback.md): generate a helper report in `$TMP` using the matching template under `skills/create-object/ecc/`, activate the helper, then emit the mandatory user message (SE38 run → uncheck dry-run → SE11 activate + assign transport). Do not treat the DDIC object as created until the user confirms activation. Remaining objects (classes, includes, screens, …) proceed on the normal flow; the plan should sequence the DDIC helpers first so the user can create them before code that depends on them is activated.
</Shared_Conventions>

<Preflight_SAP_Version_Check>
**MUST run BEFORE the Socratic interview starts.** The entire development approach (tables, BAPIs, CDS availability, ABAP syntax, RAP eligibility) depends on the SAP platform and release.

Steps:
1. Read `.sc4sap/config.json` for `sapVersion` and `abapRelease`
2. If missing or stale, ask the user to confirm:
   - **ECC** (ECC 6.0) — classical DDIC, LFA1/KNA1/BKPF/BSEG/MKPF/MSEG world, SAPGUI only
   - **S/4HANA On-Premise** — ACDOCA, MATDOC, Business Partner (BUT000), CDS/AMDP preferred, Fiori possible, ADT-first
   - **S/4HANA Cloud (Public)** — **no classical Dynpro**, **no SE80 custom dev**, only **Developer Extensibility** / **Key User Extensibility** (RAP managed, Custom Fields/Logic, Custom Business Objects)
   - **S/4HANA Cloud (Private)** — similar to On-Premise but with extensibility-first mindset
3. Confirm `abapRelease` (e.g. `750`, `756`, `758`) — drives allowed syntax

Branching consequences:
- **ECC**: no RAP, no ACDOCA, no Business Partner; inline decl only if 740+; CDS/AMDP typically unavailable (<750)
- **S/4HANA On-Prem**: prefer CDS + AMDP, RAP where applicable, Business Partner APIs, ACDOCA for finance
- **S/4HANA Cloud Public**: **REJECT classical Dynpro / custom screen + GUI Status requests**. The standard Full-ALV path (CL_GUI_ALV_GRID + Docking Container) is not executable on Cloud Public — must redirect to RAP + Fiori Elements, `if_oo_adt_classrun`, or SALV-only output. Fail-fast with an explanation. **Full prohibited-statement list and Cloud-native API replacements**: see `cloud-abap-constraints.md` in this skill directory.
- **S/4HANA Cloud Private**: classical Dynpro technically possible but discouraged; warn user and confirm intent before proceeding.

Outputs:
- `.sc4sap/program/{PROG}/platform.md` — resolved platform, release, and constraints
- Interview dimensions pre-filtered by platform (e.g., ALV-Full hidden on Cloud Public)
</Preflight_SAP_Version_Check>

<CBO_Inventory_Lookup>
**Runs immediately after package + module are resolved during the interview** (Phase 1 dimension #6) and feeds every downstream phase.

Steps:
1. Resolve `<MODULE>` (from interview) and `<PACKAGE>` (from interview dimension #6).
2. Check whether `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` exists.
   - **Exists** → Read it. Extract the `objects[]` array. Treat every entry as a **reuse candidate** and surface it in Phase 2 / Phase 3 so the planner and writer prefer the existing asset over creating a new one.
   - **Does not exist** → Print one line to the user:
     > "No CBO inventory at `.sc4sap/cbo/<MODULE>/<PACKAGE>/`. Run `/sc4sap:analyze-cbo-obj` first to map reusable Z objects, or type `skip` to proceed without reuse analysis."
     If the user chooses to skip, record `cbo_inventory: "skipped"` in `.sc4sap/program/{PROG}/platform.md` and continue. If the user runs the CBO skill, resume here once it completes.
3. Persist the loaded inventory to `.sc4sap/program/{PROG}/cbo-context.md` — one bullet per reusable object: name · type · role · one-line purpose · `reuse_hint`. Planner, writer, and executor all read this file.

Reuse gating rule (applied by `sap-planner` and `sap-writer`):
- If an inventory entry matches the spec's semantic need (same role + matching FK pattern + purpose overlap), **default to reuse**. Only propose a new Z-object when the consultant or user explicitly rejects the candidate, with the rejection reason logged in `plan.md`.
</CBO_Inventory_Lookup>

<Customization_Inventory_Lookup>
**Runs immediately after `<CBO_Inventory_Lookup>` and uses the same resolved `<MODULE>`.** Loads the per-module enhancement + extension cache so the planner/writer prefer extending existing customer assets over creating new ones — critical for BAPI extension / BAdI impl / append-structure scenarios.

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
3. Follow `common/customization-lookup.md` for the full resolution protocol and "prefer reuse" ✅/❌ examples.

Reuse gating rule (applied by `sap-planner` and `sap-writer`):
- If the request is to add a BAdI implementation / CMOD component / append field and the cache already lists a `Z*`/`Y*` asset for the same `standardName` or base table, **default to extending the existing asset**. Creating a second parallel Z impl, a second CMOD project for the same SMOD, or a second append on the same standard table is a **MAJOR finding** in Phase 6 review and will block the spec.
- Rejection requires a written justification in `plan.md` (e.g., "existing ZCL_SD_ORDER_IMPL is used by another business flow and merging would break it").
</Customization_Inventory_Lookup>

<Interview_Gating>
**MANDATORY — never skip, never shortcut, never merge.** Phase 1 runs as **two sequential sub-phases** (1A then 1B) on every `sc4sap:create-program` invocation.

Full procedure — two-stage rule, lead agents, dimension lists, skip rules, gates, output files, and enforcement contracts — lives in **[`interview-gating.md`](interview-gating.md)**. Read that file and follow it literally before asking the first question.

**One-line summary**:
> Phase 1A `sap-{module}-consultant` interviews business context (purpose / reason / company rules / reference assets / standard-SAP alternatives) → file `module-interview.md`, gate ≤ 5% → Phase 1B `sap-analyst` + `sap-architect` interview technical dimensions (purpose-type / paradigm / display / screen / data / package / test) → file `interview.md`, gate ≤ 5% → proceed to `<Spec_Approval_Gate>`. Phase 1B never starts before 1A closes; Phase 2 planner refuses to run if either file is missing.
</Interview_Gating>

<Spec_Approval_Gate>
**MANDATORY — never skip, never shortcut.** After `<Interview_Gating>` closes (ambiguity ≤ 5%) and Phase 2 (Planning) produces `plan.md`, the skill MUST run a spec-approval gate before any `Create*` / `Update*` MCP call.

Full procedure — required steps, enforcement contract, rationale, spec template, and the verbatim user-facing approval prompt — lives in **[`spec-approval-gate.md`](spec-approval-gate.md)**. Read that file and follow it literally.

**One-line summary** (the full text lives in the companion file):
> Invoke `sap-writer` → produce `spec.md` → display to user → wait for an **explicit approval keyword** (`승인` / `approve` / `ok` / `proceed` / `go ahead` / `confirmed`). "yes" / "빨리" / "해봐" / silence are NOT approval — loop with revisions. Phase 4 Executor refuses to run if spec.md is missing, unapproved, or modified after approval.
</Spec_Approval_Gate>

<Agent_Pipeline>
**The full phase-by-phase pipeline (Phase 0 – Phase 8) lives in [`agent-pipeline.md`](./agent-pipeline.md) in this skill folder.**

Read that file before dispatching any agent. It is the authoritative source for:
- Phase 0 — SAP Version Preflight
- Phase 1A — Module Interview (`sap-{module}-consultant`, business context)
- Phase 1B — Program Interview (`sap-analyst` + `sap-architect`, technical dimensions)
- Phase 2 — Planning (`sap-planner` + consultants, CBO reuse gate, SPRO lookup)
- Phase 3 — Spec Writing (`sap-writer`)
- Phase 4 — Implementation (`sap-executor`)
- Phase 5 — QA (`sap-qa-tester`, OOP mode)
- Phase 6 — Review (`sap-code-reviewer`, **mandatory**, see `phase6-review.md`)
- Phase 7 — Debug escalation (`sap-debugger`)
- Phase 8 — Completion Report (gated on Phase 6 PASS)

Do not inline or paraphrase phase logic here — update `agent-pipeline.md` instead so the pipeline stays single-sourced.
</Agent_Pipeline>

<MCP_Tools_Used>
- `SearchObject` — existence check
- `ListTransports` / `CreateTransport` — transport management
- `GetPackage` — package validation
- `CreateProgram` + `UpdateProgram` — main program
- `CreateInclude` + `UpdateInclude` — all includes (TOP/SEL/CLASS/ALV/PBO/PAI/EVENT/FORM/TEST)
- `CreateScreen` + `UpdateScreen` — custom screens (ALV full mode)
- `CreateGuiStatus` + `UpdateGuiStatus` — PF-Status for custom screens
- `CreateTextElement` + `UpdateTextElement` — text-xxx resources
- `GetAbapSemanticAnalysis` — pre-activation syntax check
- `GetInactiveObjects` — post-activation verification
- `RunUnitTest` / `GetUnitTestResult` — QA (OOP mode)
</MCP_Tools_Used>

<State_Files>
- `.sc4sap/program/{PROG}/platform.md` — Phase 0 preflight output
- `.sc4sap/program/{PROG}/module-interview.md` — Phase 1A business interview (consultant-led: purpose / reason / company-specific rules / reference assets / standard-SAP alternatives)
- `.sc4sap/program/{PROG}/interview.md` — Phase 1B technical interview (analyst+architect-led: 7 dimensions Q&A log)
- `.sc4sap/program/{PROG}/cbo-context.md` — CBO reuse candidates (written by `<CBO_Inventory_Lookup>`)
- `.sc4sap/program/{PROG}/customization-context.md` — Z*/Y* BAdI impl / CMOD / form-exit / append reuse candidates (written by `<Customization_Inventory_Lookup>`)
- `.sc4sap/program/{PROG}/plan.md` — planner output
- `.sc4sap/program/{PROG}/spec.md` — writer output (requires user confirm)
- `.sc4sap/program/{PROG}/state.json` — object creation status
- `.sc4sap/program/{PROG}/report.md` — final completion report
</State_Files>

Task: {{ARGUMENTS}}
