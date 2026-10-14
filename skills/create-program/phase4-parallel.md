# Phase 4 — Parallel Implementation Flow (5-Group Wave Model)

Authoritative rule for the parallelized Phase 4 implementation in `/sc4sap:create-program`. Replaces the old per-include sequential loop with a 5-group, dependency-ordered parallel wave model. Referenced from `agent-pipeline.md`.

## Why a Wave Model

Phase 4 artifacts have strict one-way dependencies:
- DDIC / CDS is referenced by everything (types, tables, domains — upstream of code)
- Functions / Classes / Interfaces / Screens / GUI Status / Text Elements are independent of each other (same horizontal tier)
- Includes + Main Program glue all previous artifacts together (downstream — last to build)

Running everything in one giant parallel batch breaks DDIC dependencies; running everything sequentially wastes time. The **wave model** respects dependencies while maximizing within-wave parallelism.

## The 5 Groups

| Group | Members | Depends on |
|-------|---------|------------|
| **G1 — DDIC + CDS** | Domain, Data Element, Table, Structure, Table Type, CDS View | (nothing inside Phase 4; may depend on ECC helper programs per `ecc-ddic-fallback.md`) |
| **G2 — Classes + Interfaces** | Global Class, Global Interface, Exception Class | G1 types |
| **G3 — Functions** | Function Group, Function Module | G1 types, G2 classes |
| **G4 — Screens + GUI Status + Text Elements** | Dynpro Screen, GUI Status (PF-Status), Text Elements | G1 structures (for screen fields), main program (screens attach to a program) |
| **G5 — Includes + Main Program** | All `{PROG}T` / `S` / `C` / `CT` / `E` / `O` / `I` (/ `F`) includes (no underscore), main REPORT program | G1, G2, G3 (everything referenced inside includes) |

## Wave Order

```
Wave 1 (HIGHEST PRIORITY — must fully complete before Wave 2):
   G1 (DDIC + CDS)
        │
        ▼
Wave 2 (parallel, all launch simultaneously after Wave 1):
   G2 (Classes + Interfaces)  ║  G3 (Functions)  ║  G4-prep (Text Elements only)
        │                           │                   │
        ▼                           ▼                   ▼
        └─────────┬─────────────────┘
                  ▼
Wave 3 (depends on Wave 1 + 2):
   G5 (Includes + Main Program)
        │
        ▼
Wave 4 (depends on Wave 3 — main program must exist):
   G4-late (Screens + GUI Status — they attach to the main program)
        │
        ▼
Final step:
   Batch activation via GetInactiveObjects
```

**Why G4 splits**: Text Elements are attached to the main program but don't need the program to exist during creation (they're just strings). Screens and GUI Status, however, are child objects of the program — they must be created AFTER the main program exists. So `G4-prep` (Text Elements) runs with Wave 2; `G4-late` (Screens + GUI Status) runs as Wave 4.

## Multi-Executor Split — triggered by Phase 2 sizing

Default is ONE `sap-executor` dispatch per Wave and model (Wave 2 = two dispatches: G2+G3 on Opus, G4-prep on Sonnet). When `plan.md` § *Execution Sizing* crosses the thresholds in [`multi-executor-split.md`](./multi-executor-split.md) (programs > 5, or includes > 15, or total writes > 40, or text elements > 40, or DDIC > 5), Wave 3 + Wave 4 split into 2-way or 3-way parallel executors per Strategy A/B/C in that file. Transport is shared; `ActivateObjects` runs once at Final Step (main thread or the leader executor) and the inactive-count check is one Haiku `sap-checker` per [`phase4-verify.md`](./phase4-verify.md).

## Per-Wave Protocol

Each Wave declares a **Context kit** (files agent MUST read — per `../../common/context-loading-protocol.md`) and a **Model** (per `../../common/model-routing-rule.md`).

### Wave 1 — G1 (DDIC + CDS)

- **Context kit**: `../../common/naming-conventions.md`, `../../common/field-typing-rule.md`, `../../common/ecc-ddic-fallback.md` (ECC only)
- **Model**: Opus — `sap-executor` dispatched with `model: "opus"` (frontmatter is Sonnet); novel DDIC writes, cross-type refs
- **Mandatory first.** Everything else references these types.

Sub-order within G1 (DDIC has internal dependencies):
1. **Parallel**: `CreateDomain` for all new domains
2. **Parallel**: `CreateDataElement` for all new data elements (depends on step 1 for domain refs)
3. **Parallel**: `CreateTable` + `CreateStructure` (depend on step 2 for field types) — **every field's type decision MUST follow [`../../common/field-typing-rule.md`](../../common/field-typing-rule.md)** (priority: Standard DE → existing CBO DE → new CBO DE → raw data type + length). Raw primitives like `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` are rejected at review.
4. **Parallel**: `CreateView` (CDS views) — depend on step 3 tables

Between steps, NO activation call — SAP can create inactive chains. Activation happens once at the final batch step.

**ECC branch**: when `SAP_VERSION = ECC` and the plan includes new Table/DTEL/Domain, do NOT call `CreateTable` / `CreateDataElement` / `CreateDomain`. Generate helper reports in `$TMP` per `common/ecc-ddic-fallback.md` and emit the mandatory user message (SE38 run → SE11 activate). Wave 1 blocks on user confirmation before Wave 2 starts.

### Wave 2 — G2 + G3 + G4-prep (parallel)

> **teamMode variant (Type B)** — within G2 (Classes) and G3 (Function Modules), if the drafted code touches tables/FMs in 2+ modules AND is novel business logic, activate Type B teamMode per [`team-mode-b.md`](team-mode-b.md) BEFORE `ActivateObjects`. Consultants live-review; findings annotated `peer-validated` propagate to Phase 6 (avoids double-review). Skip for template-fill / boilerplate.

- **Context kit**: `../../common/oop-pattern.md` (OOP), `../../common/function-module-rule.md`, `../../common/text-element-rule.md` (G4-prep)
- **Model**: Opus for G2/G3 (`model: "opus"` override — novel classes/FMs); **Sonnet for G4-prep** (bulk repetitive CreateTextElement); **Haiku `sap-checker`** for the G4-prep count check

All three groups launch in a single multi-tool-use message as **two** `Agent(...)` calls — one `sap-executor` with `model: "opus"` for G2 + G3, one with `model: "sonnet"` for G4-prep (one model per dispatch). Within each group, members launch in parallel too:

- **G2**: parallel `CreateInterface` + `CreateClass` calls. If a class `IMPLEMENTS` an interface, SAP tolerates inactive interface refs during creation — activation resolves them in the final batch.
- **G3**: `CreateFunctionGroup` first (small-serial), then parallel `CreateFunctionModule` within the group. Each `UpdateFunctionModule` body **MUST follow [`../../common/function-module-rule.md`](../../common/function-module-rule.md)** — inline `IMPORTING / EXPORTING / CHANGING / TABLES / EXCEPTIONS` clauses directly in the `FUNCTION` statement (not as `*"` comments, not as shadow locals). Empty signature placeholder `" You can use the template 'functionModuleParameter' ...` is a failure marker.
- **G4-prep**: parallel `CreateTextElement` calls. **MANDATORY — emit all four applicable types per [`../../common/text-element-rule.md`](../../common/text-element-rule.md)**:
  - Type `R` — 1× program title (per language pass).
  - Type `I` — one per `TEXT-xxx` literal used in source (ALV coltext, MESSAGE, titles in code).
  - **Type `S` — one per `SELECT-OPTIONS` and `PARAMETERS` name on the selection screen.** Skipping `S` is the single most common Phase 4 regression — runtime shows `S_BUDAT` / `P_FILE` instead of human labels. Do not rely on a later pass to add them.
  - Type `H` — only when the program emits classical WRITE lists (skip for ALV-only).
  - After creation, the main thread dispatches one `sap-checker` (`MODE: verify`) per language pass per [`phase4-verify.md`](./phase4-verify.md) § Verification fan-out; it calls `ReadTextElementsBulk(program, language)` and asserts: `counts.R ≥ 1` AND `counts.I == emitted_I` AND `counts.S == declared_select_options_and_parameters`. On mismatch, re-emit the missing rows before Wave 3 starts.

### Wave 3 — G5 (Includes + Main Program)

> **teamMode variant (Type B)** — same pattern as Wave 2 for novel cross-module business logic in event blocks / FORM routines. See [`team-mode-b.md`](team-mode-b.md). Skip for pure-structural includes (TOP decl, selection screen, PBO/PAI boilerplate).

- **Context kit**: `../../common/include-structure.md`, `../../common/procedural-sample/main-program.abap` OR `../../common/oop-sample/zrsc4sap_oop_ex.prog.abap` (per paradigm), `../../common/clean-code-procedural.md` OR `../../common/clean-code-oop.md`, `../../common/ok-code-pattern.md` (if `CALL SCREEN` present)
- **Model**: Opus — `model: "opus"` override; code layout + cross-include reference resolution

Local source generation (executor, no MCP) happens first — `sap-executor` reads `spec.md` + `plan.md` and builds every include body + main program body in memory, referencing G1/G2/G3 artifacts by name.

**Mandatory main-program template (gated on paradigm)**:
- `paradigm = OOP` → executor MUST start from `../../common/oop-sample/zrsc4sap_oop_ex.prog.abap` (with companion includes / screens in the same folder) and adapt identifiers. See `common/clean-code-oop.md` § Mandatory Main Program Template.
- `paradigm = Procedural` → executor MUST start from `../../common/procedural-sample/main-program.abap` and adapt identifiers. See `common/clean-code-procedural.md` § Mandatory Main Program Template.

Any structural deviation (event block reordering, include-suffix rename, bootstrap shortcut) requires a written justification in `spec.md`. Without it, Phase 6 B3 (Structure + Naming) bucket flags the deviation as MAJOR and escalates to Opus.

Then:
1. **Parallel**: `CreateInclude` for every required include (`{PROG}T` / `S` / `C` / `CT` / `E` / `O` / `I` / `F` as the spec dictates — see `include-structure.md`)
2. **Single**: `CreateProgram` for the main REPORT (attaches include refs)
3. **Single**: `GetAbapSemanticAnalysis(main)` — analyzes the whole include tree together; per-include check is skipped because includes cannot parse standalone (cross-include type refs fail).

On syntax errors, parse locations → identify offending include(s) → **parallel** `UpdateInclude` patches → re-run `GetAbapSemanticAnalysis(main)`. Loop max 3 iterations. On persistent failure, escalate to Phase 7 (sap-debugger).

### Wave 4 — G4-late (Screens + GUI Status) + Final Step — Batch Activation

Moved to [`phase4-verify.md`](./phase4-verify.md): the 3-step `Create → Update(body) → Verify` protocol per screen / GUI status (Sonnet executor writes, Haiku `sap-checker` ×N verifies), the single `ActivateObjects` batch, and the mandatory post-activation inactive-count check. Read it before Wave 4.

## Ordering Constraints Summary

| Must precede | Reason |
|--------------|--------|
| Domain → Data Element → Table/Structure | DDIC dependency order |
| Table → CDS View | CDS views select from tables |
| G1 → everything else | Universal type references |
| G2 classes and G3 FMs can be concurrent | No hard dependency; activation resolves |
| Includes → Main Program | Main references include names |
| Main Program → Screens + GUI Status | Screen flow logic lives in main |
| Everything → activation | Activation resolves all cross-refs at once |

## Error Recovery Matrix

| Error at wave | Action |
|---------------|--------|
| Wave 1 — Domain/DTEL/Table collision | Abort; user confirms overwrite via `Update*` |
| Wave 1 — ECC DDIC helper path | Pause, emit user message, wait for user confirmation |
| Wave 2 — class/interface collision | Same as Wave 1 |
| Wave 3 — syntax errors on main | Wave 3 Step E loop (max 3) |
| Wave 3 — unresolved include | Step D missed an include; re-run just that include |
| Wave 4 — screen/GUI collision | Abort; user confirms overwrite |
| Batch activation failure | Reorder by dependency, retry. Persistent fail → Phase 7 |

## Measurement

Record in `state.json`:
```json
"4_implement": {
  "status": "completed",
  "ts": "...",
  "timing": {
    "wave1_ddic_cds_sec": 6,
    "wave2_class_fm_text_sec": 10,
    "wave3_include_main_sec": 12,
    "wave4_screen_gui_sec": 4,
    "activation_sec": 5,
    "total_sec": 37
  },
  "iterations": { "wave3_syntax_retries": 1 }
}
```

Compare total_sec against a same-spec sequential baseline to verify the expected ~40–60 % speedup on typical programs (and ~30 % on DDIC-heavy programs where Wave 1 is the long pole).
