# Agent Pipeline — create-program

Authoritative pipeline for the `sc4sap:create-program` skill. `SKILL.md` references this file instead of inlining the phase definitions. Every phase below is MANDATORY unless explicitly marked conditional. Do not skip, reorder, or merge phases.

**Context + model discipline** — every phase declares its context kit (files the lead agent MUST read) per [`../../common/context-loading-protocol.md`](../../common/context-loading-protocol.md), and its expected model (Sonnet / Opus) per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md). Per-phase values in the per-Wave detail file `phase4-parallel.md` and the bullets below are authoritative — do not preload beyond them.

## Phase 0 — SAP Version Preflight (skill itself, mandatory)
- Resolve/confirm platform (ECC / S4 On-Prem / S4 Cloud Public / S4 Cloud Private) and `abapRelease`
- Block or redirect incompatible requests (e.g., classical Dynpro on Cloud Public)
- Output: `.sc4sap/program/{PROG}/platform.md`

## Phase 1 — Two-stage Socratic Interview

Phase 1 splits into **Phase 1A (Module Interview)** and **Phase 1B (Program Interview)**, run sequentially. Phase 1B never starts before Phase 1A closes. Authoritative dimension list lives in `SKILL.md` → `<Interview_Gating>`.

### Phase 1A — Module Interview (module consultant lead)

- **Step 0 — Session Trust Bootstrap (MANDATORY, before any MCP call or user question)**:
  Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:create-program` to pre-grant all MCP tool + file-op permissions for the session. This ensures interview-time MCP calls (`SearchObject`, `GetWhereUsed`, SPRO consultant queries, `program-to-spec` L1 lookups) do NOT trigger permission prompts.
  - If `.sc4sap/session-trust.log` has a line within the last 24h, skip silently.
  - Otherwise run it and surface the one-line confirmation.
  - All subsequent `Agent` dispatches (consultants, analyst, architect, planner, writer, executor, qa, reviewer, debugger) MUST pass `mode: "dontAsk"`.
  - Phase 3.5 no longer invokes trust-session; it assumes the bootstrap has already happened here.

- **Lead agent**: `sap-{module}-consultant` (`sap-sd-consultant`, `sap-mm-consultant`, `sap-fi-consultant`, `sap-co-consultant`, `sap-pp-consultant`, `sap-ps-consultant`, `sap-qm-consultant`, `sap-pm-consultant`, `sap-wm-consultant`, `sap-hcm-consultant`, `sap-tm-consultant`, `sap-tr-consultant`, `sap-ariba-consultant`, `sap-bw-consultant`, `sap-bc-consultant`)
- **Trigger**: As soon as Phase 0 closes. If the target module is unclear from the initial request, the FIRST question is "which module?" — consultant cannot be summoned until resolved. Multi-module: summon each consultant in parallel and reconcile question streams through the skill.
- **Industry / Country context preflight (MANDATORY — runs before the first business question)**:
  - Read `.sc4sap/config.json` (`industry`, `country`) and `.sc4sap/sap.env` (`SAP_INDUSTRY`, `SAP_COUNTRY`). Precedence: `config.json` > `sap.env`.
  - **If `industry` is set** → load `industry/<key>.md` and use it as the consultant's business-context backdrop (do NOT re-ask the user).
  - **If `country` is set** → load `country/<iso>.md` (ISO alpha-2 lowercase, e.g. `kr`, `us`, `de`, `eu-common`); multi-country: load each file and flag cross-country touchpoints. Do NOT re-ask the user.
  - **If either value is missing** → asking is **MANDATORY** before dimension 1. Do not infer from the project name, package, or prior interviews. Blocking questions:
    - Industry missing: *"Which industry does this program belong to? (see `industry/README.md` for the supported keys — e.g. `automotive`, `retail`, `pharma`, …)"*
    - Country missing: *"Which country / localization applies? (ISO alpha-2 lowercase, e.g. `kr`, `us`, `de`, or `eu-common` for EU-wide; multiple allowed)"*
  - Offer to persist the answer: *"Save to `.sc4sap/config.json` so future runs skip this question? (yes/no)"*. On `yes`, write the value; on `no`, keep it for this run only.
  - Record resolved values in `.sc4sap/program/{PROG}/module-interview.md` header (`industry:`, `country:`, `source: config.json | sap.env | user-this-run`).
- **Question dimensions** (one per turn, owned by consultant):
  1. Module identification (single / multi)
  2. Business purpose — what business outcome does this program produce
  3. Business reason / pain point — current Gap, manual workaround, regulatory driver
  4. Company-specific business rules — deviations from SAP standard process
  5. Reference assets — existing CBO packages, prior Z programs, vendor add-ons
     - When a reference Z program is named: consultant MAY invoke `sc4sap:program-to-spec` at depth **L1 (Overview only)** for that single object. Inline the Purpose / inputs / outputs / 1-paragraph flow into `module-interview.md`. Do NOT generate a full `spec.md` artifact for the reference object.
  6. **Standard SAP solution screen (mandatory)** — consultant MUST propose at least one standard alternative (Fiori app, standard report/transaction, BAPI flow, CDS analytical query, embedded analytics) BEFORE agreeing to a custom build. Each rejection logged with reason.
- **Skip rule**: Skip Phase 1A only for pure technical utilities with zero business logic (e.g., generic string helper, file converter). Default behavior is "do not skip".
- **Gate**: business ambiguity ≤ 5%
- **Output**: `.sc4sap/program/{PROG}/module-interview.md`
- **Enforcement**: Phase 1B refuses to start if this file is missing or its ambiguity score > 5%.

### Phase 1B — Program Interview (analyst + architect lead)

- **Pre-condition**: `module-interview.md` exists; business gate passed
- **Lead agents**: `sap-analyst` (functional decomposition — owns dimensions 1, 5) + `sap-architect` (technical structure — owns dimensions 2, 3, 4, 7); both contribute to dimension 6. Skill itself orchestrates the question stream, one dimension per turn.
- **Question dimensions** (pre-filtered by resolved platform):
  1. Purpose-type — Report / CRUD / ALV List / Batch / Interface
  2. Paradigm — OOP (two-class) vs Procedural (PERFORM)
  3. Display mode — None / SALV popup / Full CL_GUI_ALV_GRID
  4. Screen/GUI — required? screen numbers? Docking Container / Splitter / TOP_OF_PAGE layout?
  5. Data source — standard tables / Z-tables / BAPI / CDS view (must be consistent with Phase 1A reference assets)
  6. Package + Transport — target package, new or existing transport
  7. Testing scope — when OOP is selected, which test class methods to cover
- **Gate**: technical ambiguity ≤ 5%
- **Output**: `.sc4sap/program/{PROG}/interview.md`
- **Enforcement**: Phase 2 `sap-planner` MUST refuse to run if either `module-interview.md` or `interview.md` is missing or incomplete. Both files are passed forward to Phase 2 so the planner does not re-interview.

## Phase 2 — Planning: `sap-planner` (+ module consultant when needed)
- **Inputs (mandatory read before planning)**: `module-interview.md` (Phase 1A — business context, standard-SAP rejections, reference assets) AND `interview.md` (Phase 1B — technical decisions). The planner MUST reconcile both — if a Phase 1B technical choice contradicts a Phase 1A business rule (e.g., chose custom Z-table when consultant proposed standard CDS), raise the conflict back to the user before producing `plan.md`.
- **CBO reuse gate (mandatory when `.sc4sap/program/{PROG}/cbo-context.md` exists)**: Before designing any new Z-object (table / structure / class / FM / data element), scan `cbo-context.md` for a reuse candidate. Default to reuse when role + FK pattern + purpose overlap. Every new-object proposal in the plan must include a one-line justification of why no CBO candidate fits.
- **Customization reuse gate (mandatory when `.sc4sap/program/{PROG}/customization-context.md` exists)**: Before proposing a new BAdI implementation, CMOD component, form-based user-exit FORM, or append structure, scan `customization-context.md` for an existing customer asset covering the same `standardName` / base table. Default to **extending the existing asset**. Every new-enhancement/extension proposal in the plan must include a written justification of why no customization candidate fits (follow `common/customization-lookup.md`). Creating a second parallel impl when one already exists is a MAJOR finding in Phase 6.
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
- **Execution Sizing (new — mandatory)** — plan.md MUST include a § *Execution Sizing* with numeric estimates used by Phase 4 to decide single vs multi-executor dispatch: `programs_count`, `includes_count`, `total_mcp_writes`, `text_elements_count`, `ddic_objects_count`. Thresholds and split strategies live in [`multi-executor-split.md`](./multi-executor-split.md). Planner may mark `split_recommendation: "single" | "2-way" | "3-way"` + `split_strategy: "A" | "B" | "C"` explicitly when the scope is obvious (e.g., multi-program sweep → Strategy A).
- File: `.sc4sap/program/{PROG}/plan.md`

**Skip consultant when**: pure technical utility with no business logic (e.g., a generic string helper class, a pure file converter) — `sap-planner` proceeds alone.

## Phase 3 — Spec Writing: `sap-writer`
- Produce functional + technical spec from plan
- **CBO reuse (mandatory when `cbo-context.md` exists)**: every spec section that references an existing CBO asset must name it explicitly (e.g., "writes to existing table `ZSD_ORDER_LOG`") and include a one-line reason for reuse.
- **Customization reuse (mandatory when `customization-context.md` exists)**: when the spec extends a BAdI / SMOD / form-based exit / append, it MUST reference the existing `Z*`/`Y*` implementation class, CMOD project, include, or append structure by name (e.g., "add new method to existing BAdI impl `ZCL_SD_ORDER_IMPL`"; "extend existing append `CI_VBAK_ZZ` with field `ZZ_DELIVERY_PRIORITY`"). Never silently introduce a parallel Z-object when a reuse target exists in `customization-context.md`.
- **MANDATORY before writing**: open and read every shared convention file applicable to the program type (`alv-rules.md`, `text-element-rule.md`, `constant-rule.md`, `oop-pattern.md` if OOP, `procedural-form-naming.md` if Procedural, `naming-conventions.md`, `include-structure.md`). The spec must NOT contain instructions that contradict these conventions (e.g., "build LVC_T_FCAT manually" contradicts `alv-rules.md`'s SALV-factory rule). When the spec describes a technique, paraphrase the convention's prescribed approach — never invent a shortcut.
- File: `.sc4sap/program/{PROG}/spec.md`
- **Spec Approval Gate (MANDATORY) — enforced per `SKILL.md` → `<Spec_Approval_Gate>`**:
  - Display spec.md contents in chat (or surface the path prominently)
  - Block every downstream `Create*` / `Update*` MCP call
  - Wait for **explicit approval keyword** from user: `승인` / `approve` / `ok` / `proceed` / `go ahead` / `confirmed`
  - Silence or ambiguous responses (`yes`, `Just do it`, `Quick`, `try it`) are **change requests**, not approvals — loop back and revise
  - On approval: append `## Approval` section to spec.md with approver / timestamp / keyword, THEN proceed to Phase 4
  - Phase 4 Executor MUST refuse to run if spec.md missing, lacks Approval footer, or was modified after approval was logged

## Phase 3.5 — Execution Mode Gate (MANDATORY, between spec approval and Phase 4)

Full procedure — `trust-session` invocation, auto/manual/hybrid mode prompt, state.json schema, resume behavior — lives in [`execution-mode.md`](./execution-mode.md). Read it before dispatching Phase 4.

**One-line summary**: Invoke `/sc4sap:trust-session` (suppresses all tool permission prompts for the session) → prompt user for mode (`auto` / `manual` / `hybrid`) → persist to `state.json` → proceed to Phase 4 per the chosen cadence. Permission prompts are suppressed in ALL modes; the only prompt in `manual`/`hybrid` is the phase-transition confirmation.

## Phase 4 — Implementation: `sap-executor` (PARALLELIZED)

**Authoritative flow**: [`phase4-parallel.md`](./phase4-parallel.md) — local source generation → parallel `CreateInclude` → `CreateProgram` → single `GetAbapSemanticAnalysis(main)` → batch activation via `GetInactiveObjects`. Replaces the old per-include create-check-activate loop (40–60% faster for typical 6–10 include programs).

**Multi-executor split**: when Phase 2 plan.md § *Execution Sizing* crosses the thresholds in [`multi-executor-split.md`](./multi-executor-split.md), the skill dispatches 2 or 3 parallel `sap-executor` instances per Strategy A / B / C in that file. Shared transport, single activation at Final Step.

- Apply shared conventions: `oop-pattern.md` (OOP), `alv-rules.md`, `text-element-rule.md`, `constant-rule.md`, `procedural-form-naming.md` (Procedural), `naming-conventions.md`
- Screens / GUI status / text elements run AFTER main activation (see phase4-parallel.md Step G)
- Syntax failures → fix-and-retry loop (max 3 iterations on the main program, NOT per include)
- In `manual`/`hybrid` mode: prompt user before starting Phase 4; do NOT prompt mid-flow once started

## Phase 5 — QA (conditional): `sap-qa-tester`

**Skip conditions (either triggers skip, recorded as `skipped` in state.json)**:
- Paradigm = Procedural (no local test classes expected)
- Paradigm = OOP AND `interview.md` dimension 7 (testing scope) = `none` / empty

**When running**:
- Test class SHOULD already exist — Phase 4 executor creates `{PROG}_tst` include as part of the initial parallel batch (see phase4-parallel.md Step B). Phase 5 agent only writes test methods + runs them.
- Call `RunUnitTest` → `GetUnitTestResult`
- On FAIL: fix production code (not tests) → re-activate → re-run (loop until green or 3 attempts)
- In `manual`/`hybrid` mode: prompt before starting Phase 5 (unless skip condition matched, then auto-skip with message)

## Phase 6 — Review (MANDATORY — never skip, never conditional): `sap-code-reviewer`

> ⚠️ Phase 4 is NOT complete until Phase 6 has run. Phase 5 (QA) is conditional on OOP mode, Phase 7 (Debug) is conditional on failures, but **Phase 6 is unconditional**.

**Authoritative checklist**: see [`phase6-review.md`](./phase6-review.md) in this skill folder. It defines the per-convention review items, the file format for `.sc4sap/program/{PROG}/review.md`, and the failure-handling loop. Read it before delegating to `sap-code-reviewer`, and pass its path to the agent.

**Execution strategy**: see [`phase6-buckets.md`](./phase6-buckets.md) — 4-bucket parallel Sonnet review (ALV+UI / Logic / Structure / Platform), merged with Opus escalation only when MAJOR findings exist. ~50% wall-clock reduction vs. single-Opus review. In `manual`/`hybrid` mode: prompt before starting Phase 6; the bucket run itself is uninterrupted once started.

## Phase 7 — Debug escalation: `sap-debugger`
- Activation failures persisting after retry
- Runtime dumps during test execution

## Phase 8 — Completion Report
- **Pre-condition (HARD GATE)**: `.sc4sap/program/{PROG}/review.md` must exist and end in PASS verdicts for every applicable convention. If missing or contains unresolved violations, return to Phase 6 — do not write the report and do not tell the user the program is done.
- Objects created + activation status
- Transport number
- Test results summary
- Reference to `review.md` (Phase 6 verdicts)
- **Timing summary** — read per-phase `timing` / `sec` fields from `state.json` and include a total-duration table (Phase 4 parallel gains, Phase 6 bucket gains, Opus escalation ratio)
- File: `.sc4sap/program/{PROG}/report.md`
- In `manual`/`hybrid` mode: prompt before writing the report

## State.json — Resume Support (C-2)

All phases above record their completion into `.sc4sap/program/{PROG}/state.json` per the schema in [`execution-mode.md`](./execution-mode.md). On a subsequent invocation for the same `{PROG}`, the skill:
1. Reads `state.json` and finds the first non-completed, non-skipped phase
2. Resumes from that phase, skipping all preceding ones
3. In `auto` mode, resumption happens silently; in `manual`/`hybrid`, the user is shown the resume point and asked to confirm

Phase restart (rerun a completed phase) requires the user to delete the corresponding `state.json` entry explicitly — the pipeline does not re-run completed phases automatically.
