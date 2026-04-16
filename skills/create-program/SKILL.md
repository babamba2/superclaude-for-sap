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

<Interview_Gating>
**Ambiguity threshold: ≤ 5%** (stricter than deep-interview's "< 5/10").

Socratic loop runs until every dimension is resolved:
1. **Purpose** — Report / CRUD / ALV List / Batch / Interface
2. **Paradigm** — OOP (two-class) vs Procedural (PERFORM)
3. **Display mode** — None / SALV popup / Full CL_GUI_ALV_GRID
4. **Screen/GUI** — required? screen numbers? Docking Container layout?
5. **Data source** — standard tables / Z-tables / BAPI / CDS view
6. **Package + Transport** — target package, new or existing transport
7. **Testing scope** — when OOP is selected, which test class methods to cover

Score ambiguity after each round. Do NOT proceed to spec generation until ≤ 5%. Then write the spec and require explicit user confirmation before any Create* MCP call.
</Interview_Gating>

<Agent_Pipeline>
**Phase 0 — SAP Version Preflight** (skill itself, mandatory)
- Resolve/confirm platform (ECC / S4 On-Prem / S4 Cloud Public / S4 Cloud Private) and `abapRelease`
- Block or redirect incompatible requests (e.g., classical Dynpro on Cloud Public)
- Output: `.sc4sap/program/{PROG}/platform.md`

**Phase 1 — Socratic Interview** (skill itself + module consultant co-host)
- Dimensions pre-filtered by resolved platform
- Loop question → ambiguity score → until ≤ 5%
- **Consultant co-interview (mandatory when the request touches an SAP business module)**:
  - As soon as the user's initial request reveals the target module (SD / MM / FI / CO / PP / PS / QM / PM / WM / HCM / TM / TR / Ariba / BW / BC), summon the matching consultant agent (`sap-sd-consultant`, `sap-mm-consultant`, `sap-fi-consultant`, `sap-co-consultant`, `sap-pp-consultant`, `sap-ps-consultant`, `sap-qm-consultant`, `sap-pm-consultant`, `sap-wm-consultant`, `sap-hcm-consultant`, `sap-tm-consultant`, `sap-tr-consultant`, `sap-ariba-consultant`, `sap-bw-consultant`, `sap-bc-consultant`) **before the first question**.
  - The consultant participates in question authoring: it contributes module-specific dimensions (master data, customizing views, standard BAPIs/FMs, authorization objects, common pitfalls) that the generic interview would miss.
  - Questions are still delivered one dimension per turn (see `feedback_one_question_at_a_time`), but the consultant decides *which* business dimension to probe next when the module is business-heavy.
  - If the module is ambiguous in the initial request, ask the user which module this concerns **first**, then summon the consultant — do not proceed with generic questions without a consultant present.
  - Multi-module request: summon each consultant in parallel and reconcile their question streams through the skill.
  - Skip consultant only for pure technical utilities with zero business logic (e.g., generic string helper, file converter).
- Consultant contribution is appended to `.sc4sap/program/{PROG}/interview.md` and carried into Phase 2 so `sap-planner` does not re-interview.

**Phase 2 — Planning**: `sap-planner` (+ module consultant when needed)
- **CBO reuse gate (mandatory when `.sc4sap/program/{PROG}/cbo-context.md` exists)**: Before designing any new Z-object (table / structure / class / FM / data element), scan `cbo-context.md` for a reuse candidate. Default to reuse when role + FK pattern + purpose overlap. Every new-object proposal in the plan must include a one-line justification of why no CBO candidate fits.
- Apply shared conventions: `include-structure.md`, `naming-conventions.md`
- **Consultant consultation (mandatory when requirements touch SAP business configuration)**:
  - Identify the affected SAP module(s) from the interview output (SD / MM / FI / CO / PP / PS / QM / PM / WM / HCM / TM / TR / Ariba / BW / BC)
  - Delegate to the corresponding consultant agent: `sap-sd-consultant`, `sap-mm-consultant`, `sap-fi-consultant`, `sap-co-consultant`, `sap-pp-consultant`, `sap-ps-consultant`, `sap-qm-consultant`, `sap-pm-consultant`, `sap-wm-consultant`, `sap-hcm-consultant`, `sap-tm-consultant`, `sap-tr-consultant`, `sap-ariba-consultant`, `sap-bw-consultant`, `sap-bc-consultant`
  - Before dispatch, check for local SPRO cache at `.sc4sap/spro-config.json` and pass a `local_cache_available: true/false` flag in the handoff context
  - The consultant **MUST resolve SPRO data per `common/spro-lookup.md`** (priority: local cache → `configs/{MODULE}/*.md` static docs → live MCP query with user confirmation)
  - Consultant output: business-aligned recommendations — relevant IMG customizing tables/views, master data dependencies, standard BAPIs/FMs to leverage, authorization objects, integration touchpoints with neighboring modules
  - File: `.sc4sap/program/{PROG}/consult-{module}.md` (one per consulted module)
  - For multi-module scenarios, consult each module in parallel and let `sap-planner` reconcile
- `sap-planner` integrates consultant inputs into the final plan
- Output: include list, screen numbers, class names, transport plan, test coverage, **referenced SPRO views / standard APIs / authorization objects**
- File: `.sc4sap/program/{PROG}/plan.md`

**Skip consultant when**: pure technical utility with no business logic (e.g., a generic string helper class, a pure file converter) — `sap-planner` proceeds alone.

**Phase 3 — Spec Writing**: `sap-writer`
- Produce functional + technical spec from plan
- **CBO reuse (mandatory when `cbo-context.md` exists)**: every spec section that references an existing CBO asset must name it explicitly (e.g., "writes to existing table `ZSD_ORDER_LOG`") and include a one-line reason for reuse.
- **MANDATORY before writing**: open and read every shared convention file applicable to the program type (`alv-rules.md`, `text-element-rule.md`, `constant-rule.md`, `oop-pattern.md` if OOP, `procedural-form-naming.md` if Procedural, `naming-conventions.md`, `include-structure.md`). The spec must NOT contain instructions that contradict these conventions (e.g., "build LVC_T_FCAT manually" contradicts `alv-rules.md`'s SALV-factory rule). When the spec describes a technique, paraphrase the convention's prescribed approach — never invent a shortcut.
- File: `.sc4sap/program/{PROG}/spec.md`
- **User confirmation required** — do not proceed without explicit OK

**Phase 4 — Implementation**: `sap-executor` (parallel where independent)
- Apply shared conventions: `oop-pattern.md` (OOP), `alv-rules.md`, `text-element-rule.md`, `constant-rule.md`, `procedural-form-naming.md` (Procedural), `naming-conventions.md`
- Create main program + all required includes
- Create screens / GUI status / text elements as needed
- Activate each object; syntax failures → fix-and-retry (max 3)

**Phase 5 — QA** (OOP mode only): `sap-qa-tester`
- Write `{PROG}_tst` with FOR TESTING RISK LEVEL HARMLESS DURATION SHORT local classes
- Call `RunUnitTest` → `GetUnitTestResult`
- On FAIL: fix production code (not tests) → re-activate → re-run (loop until green or 3 attempts)

**Phase 6 — Review (MANDATORY — never skip, never conditional)**: `sap-code-reviewer`

> ⚠️ Phase 4 is NOT complete until Phase 6 has run. Phase 5 (QA) is conditional on OOP mode, Phase 7 (Debug) is conditional on failures, but **Phase 6 is unconditional**.

**Authoritative checklist**: see [`phase6-review.md`](./phase6-review.md) in this skill folder. It defines the per-convention review items, the file format for `.sc4sap/program/{PROG}/review.md`, and the failure-handling loop. Read it before delegating to `sap-code-reviewer`, and pass its path to the agent.

**Phase 7 — Debug escalation**: `sap-debugger`
- Activation failures persisting after retry
- Runtime dumps during test execution

**Phase 8 — Completion Report**
- **Pre-condition (HARD GATE)**: `.sc4sap/program/{PROG}/review.md` must exist and end in PASS verdicts for every applicable convention. If missing or contains unresolved violations, return to Phase 6 — do not write the report and do not tell the user the program is done.
- Objects created + activation status
- Transport number
- Test results summary
- Reference to `review.md` (Phase 6 verdicts)
- File: `.sc4sap/program/{PROG}/report.md`
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
- `.sc4sap/program/{PROG}/platform.md` — preflight output
- `.sc4sap/program/{PROG}/interview.md` — Socratic Q&A log
- `.sc4sap/program/{PROG}/plan.md` — planner output
- `.sc4sap/program/{PROG}/spec.md` — writer output (requires user confirm)
- `.sc4sap/program/{PROG}/state.json` — object creation status
- `.sc4sap/program/{PROG}/report.md` — final completion report
</State_Files>

Task: {{ARGUMENTS}}
