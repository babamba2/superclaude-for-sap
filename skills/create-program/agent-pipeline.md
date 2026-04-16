# Agent Pipeline — create-program

Authoritative pipeline for the `sc4sap:create-program` skill. `SKILL.md` references this file instead of inlining the phase definitions. Every phase below is MANDATORY unless explicitly marked conditional. Do not skip, reorder, or merge phases.

## Phase 0 — SAP Version Preflight (skill itself, mandatory)
- Resolve/confirm platform (ECC / S4 On-Prem / S4 Cloud Public / S4 Cloud Private) and `abapRelease`
- Block or redirect incompatible requests (e.g., classical Dynpro on Cloud Public)
- Output: `.sc4sap/program/{PROG}/platform.md`

## Phase 1 — Socratic Interview (skill itself + module consultant co-host)
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

## Phase 2 — Planning: `sap-planner` (+ module consultant when needed)
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
  - Silence or ambiguous responses (`yes`, `그냥 해`, `빨리`, `try it`) are **change requests**, not approvals — loop back and revise
  - On approval: append `## Approval` section to spec.md with approver / timestamp / keyword, THEN proceed to Phase 4
  - Phase 4 Executor MUST refuse to run if spec.md missing, lacks Approval footer, or was modified after approval was logged

## Phase 4 — Implementation: `sap-executor` (parallel where independent)
- Apply shared conventions: `oop-pattern.md` (OOP), `alv-rules.md`, `text-element-rule.md`, `constant-rule.md`, `procedural-form-naming.md` (Procedural), `naming-conventions.md`
- Create main program + all required includes
- Create screens / GUI status / text elements as needed
- Activate each object; syntax failures → fix-and-retry (max 3)

## Phase 5 — QA (OOP mode only): `sap-qa-tester`
- Write `{PROG}_tst` with FOR TESTING RISK LEVEL HARMLESS DURATION SHORT local classes
- Call `RunUnitTest` → `GetUnitTestResult`
- On FAIL: fix production code (not tests) → re-activate → re-run (loop until green or 3 attempts)

## Phase 6 — Review (MANDATORY — never skip, never conditional): `sap-code-reviewer`

> ⚠️ Phase 4 is NOT complete until Phase 6 has run. Phase 5 (QA) is conditional on OOP mode, Phase 7 (Debug) is conditional on failures, but **Phase 6 is unconditional**.

**Authoritative checklist**: see [`phase6-review.md`](./phase6-review.md) in this skill folder. It defines the per-convention review items, the file format for `.sc4sap/program/{PROG}/review.md`, and the failure-handling loop. Read it before delegating to `sap-code-reviewer`, and pass its path to the agent.

## Phase 7 — Debug escalation: `sap-debugger`
- Activation failures persisting after retry
- Runtime dumps during test execution

## Phase 8 — Completion Report
- **Pre-condition (HARD GATE)**: `.sc4sap/program/{PROG}/review.md` must exist and end in PASS verdicts for every applicable convention. If missing or contains unresolved violations, return to Phase 6 — do not write the report and do not tell the user the program is done.
- Objects created + activation status
- Transport number
- Test results summary
- Reference to `review.md` (Phase 6 verdicts)
- File: `.sc4sap/program/{PROG}/report.md`
