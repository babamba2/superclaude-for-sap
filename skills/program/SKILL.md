---
name: sc4sap:program
description: Create ABAP programs (Report/CRUD/ALV/Batch) with Main+Include structure, OOP or Procedural, and full agent-driven coding/QA pipeline
level: 4
---

# SC4SAP Program

Core ABAP program creation skill. Generates a Main Program wrapped with conditional Includes following the sc4sap template convention. Supports both OOP (two-class split: Data + Screen/ALV) and Procedural (PERFORM) paradigms. Full pipeline: SAP version preflight → Socratic interview → planner → writer spec → user confirm → executor/qa/reviewer.

<Purpose>
sc4sap:program is the flagship skill for creating new ABAP programs. It handles a wide range of purposes (Report, CRUD, ALV list, Batch, Interface). Before coding starts, it runs an internal Socratic interview to resolve ambiguity, then produces a confirmed spec, then orchestrates coding and QA agents to deliver activated, tested ABAP objects following sc4sap conventions.
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

Paths are relative to this skill's directory (`sc4sap/skills/program/`).
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
