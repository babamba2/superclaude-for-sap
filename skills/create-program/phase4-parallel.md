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
| **G5 — Includes + Main Program** | All `_TOP` / `_SEL` / `_CLASS` / `_ALV` / `_PBO` / `_PAI` / `_FORM` / `_TST` includes, main REPORT program | G1, G2, G3 (everything referenced inside includes) |

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

Default is ONE `sap-executor` dispatch per Wave. When `plan.md` § *Execution Sizing* crosses the thresholds in [`multi-executor-split.md`](./multi-executor-split.md) (programs > 5, or includes > 15, or total writes > 40, or text elements > 40, or DDIC > 5), Wave 3 + Wave 4 split into 2-way or 3-way parallel executors per Strategy A/B/C in that file. Transport is shared; `ActivateObjects` and `GetInactiveObjects` run once at Final Step by the leader.

## Per-Wave Protocol

Each Wave declares a **Context kit** (files agent MUST read — per `../../common/context-loading-protocol.md`) and a **Model** (per `../../common/model-routing-rule.md`).

### Wave 1 — G1 (DDIC + CDS)

- **Context kit**: `../../common/naming-conventions.md`, `../../common/field-typing-rule.md`, `../../common/ecc-ddic-fallback.md` (ECC only)
- **Model**: Opus — novel DDIC writes, cross-type refs
- **Mandatory first.** Everything else references these types.

Sub-order within G1 (DDIC has internal dependencies):
1. **Parallel**: `CreateDomain` for all new domains
2. **Parallel**: `CreateDataElement` for all new data elements (depends on step 1 for domain refs)
3. **Parallel**: `CreateTable` + `CreateStructure` (depend on step 2 for field types) — **every field's type decision MUST follow [`../../common/field-typing-rule.md`](../../common/field-typing-rule.md)** (priority: Standard DE → existing CBO DE → new CBO DE → raw data type + length). Raw primitives like `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` are rejected at review.
4. **Parallel**: `CreateView` (CDS views) — depend on step 3 tables

Between steps, NO activation call — SAP can create inactive chains. Activation happens once at the final batch step.

**ECC branch**: when `SAP_VERSION = ECC` and the plan includes new Table/DTEL/Domain, do NOT call `CreateTable` / `CreateDataElement` / `CreateDomain`. Generate helper reports in `$TMP` per `common/ecc-ddic-fallback.md` and emit the mandatory user message (SE38 run → SE11 activate). Wave 1 blocks on user confirmation before Wave 2 starts.

### Wave 2 — G2 + G3 + G4-prep (parallel)

- **Context kit**: `../../common/oop-pattern.md` (OOP), `../../common/function-module-rule.md`, `../../common/text-element-rule.md` (G4-prep)
- **Model**: Opus for G2/G3 (novel classes/FMs); **Sonnet for G4-prep** (bulk repetitive CreateTextElement)

All three groups launch in a single multi-tool-use message. Within each group, members launch in parallel too:

- **G2**: parallel `CreateInterface` + `CreateClass` calls. If a class `IMPLEMENTS` an interface, SAP tolerates inactive interface refs during creation — activation resolves them in the final batch.
- **G3**: `CreateFunctionGroup` first (small-serial), then parallel `CreateFunctionModule` within the group. Each `UpdateFunctionModule` body **MUST follow [`../../common/function-module-rule.md`](../../common/function-module-rule.md)** — inline `IMPORTING / EXPORTING / CHANGING / TABLES / EXCEPTIONS` clauses directly in the `FUNCTION` statement (not as `*"` comments, not as shadow locals). Empty signature placeholder `" You can use the template 'functionModuleParameter' ...` is a failure marker.
- **G4-prep**: parallel `CreateTextElement` calls. **MANDATORY — emit all four applicable types per [`../../common/text-element-rule.md`](../../common/text-element-rule.md)**:
  - Type `R` — 1× program title (per language pass).
  - Type `I` — one per `TEXT-xxx` literal used in source (ALV coltext, MESSAGE, titles in code).
  - **Type `S` — one per `SELECT-OPTIONS` and `PARAMETERS` name on the selection screen.** Skipping `S` is the single most common Phase 4 regression — runtime shows `S_BUDAT` / `P_FILE` instead of human labels. Do not rely on a later pass to add them.
  - Type `H` — only when the program emits classical WRITE lists (skip for ALV-only).
  - After creation (for every language pass), call `ReadTextElementsBulk(program, language)` and verify: `counts.R ≥ 1` AND `counts.I == emitted_I` AND `counts.S == declared_select_options_and_parameters`. On mismatch, re-emit the missing rows before Wave 3 starts.

### Wave 3 — G5 (Includes + Main Program)

- **Context kit**: `../../common/include-structure.md`, `../../common/procedural-sample/main-program.abap` OR `../../common/oop-sample/zrsc4sap_oop_ex.prog.abap` (per paradigm), `../../common/clean-code-procedural.md` OR `../../common/clean-code-oop.md`, `../../common/ok-code-pattern.md` (if `CALL SCREEN` present)
- **Model**: Opus — code layout + cross-include reference resolution

Local source generation (executor, no MCP) happens first — `sap-executor` reads `spec.md` + `plan.md` and builds every include body + main program body in memory, referencing G1/G2/G3 artifacts by name.

**Mandatory main-program template (gated on paradigm)**:
- `paradigm = OOP` → executor MUST start from `../../common/oop-sample/zrsc4sap_oop_ex.prog.abap` (with companion includes / screens in the same folder) and adapt identifiers. See `common/clean-code-oop.md` § Mandatory Main Program Template.
- `paradigm = Procedural` → executor MUST start from `../../common/procedural-sample/main-program.abap` and adapt identifiers. See `common/clean-code-procedural.md` § Mandatory Main Program Template.

Any structural deviation (event block reordering, include-suffix rename, bootstrap shortcut) requires a written justification in `spec.md`. Without it, Phase 6 B3 (Structure + Naming) bucket flags the deviation as MAJOR and escalates to Opus.

Then:
1. **Parallel**: `CreateInclude` for every required include (TOP / SEL / CLASS / ALV / PBO / PAI / FORM / TST as the spec dictates)
2. **Single**: `CreateProgram` for the main REPORT (attaches include refs)
3. **Single**: `GetAbapSemanticAnalysis(main)` — analyzes the whole include tree together; per-include check is skipped because includes cannot parse standalone (cross-include type refs fail).

On syntax errors, parse locations → identify offending include(s) → **parallel** `UpdateInclude` patches → re-run `GetAbapSemanticAnalysis(main)`. Loop max 3 iterations. On persistent failure, escalate to Phase 7 (sap-debugger).

### Wave 4 — G4-late (Screens + GUI Status)

- **Context kit**: `../../common/alv-rules.md`, `../../common/ok-code-pattern.md`
- **Model**: Sonnet — template-based Create/Update/Verify

Needs the main program. **Each screen and each GUI Status MUST follow the 3-step `Create → Update(body) → VerifyNonEmpty` protocol** — `Create*` alone creates an empty shell; it does NOT populate flow logic, PFKEYS, menus, or titles. Skipping the `Update*` step has been a recurring Phase 4 regression (screens with `* MODULE STATUS_0100.` commented out and empty GUI statuses passing review).

**Per screen (parallel across screens):**
1. `CreateScreen(program, screen_number, ...)` — shell + field list.
2. `UpdateScreen(program, screen_number, flow_logic=..., fields_to_containers=...)` — flow logic MUST include uncommented `MODULE STATUS_xxxx.` and `MODULE USER_COMMAND_xxxx.` lines (PBO / PAI). Every field the screen needs must be in the field list. **OK_CODE field binding is mandatory per [`../../common/ok-code-pattern.md`](../../common/ok-code-pattern.md)**: the `fields_to_containers[]` entry with `TYPE=OKCODE` MUST have `NAME=GV_OKCODE` (not the placeholder underscores). A screen whose OKCODE field has no NAME routes user commands into `sy-ucomm` only — breaks silently on popup flows and is a MAJOR Phase 6 finding.
3. **Verify**: `GetScreen(program, screen_number)` → (a) `flow_logic` contains a non-comment `MODULE ... OUTPUT.` line AND a non-comment `MODULE ... INPUT.` line (lines starting with `*` or `"` do NOT count), AND (b) `fields_to_containers[]` OKCODE entry has `NAME=GV_OKCODE`. On failure → re-`UpdateScreen` with the correct body; do not advance to activation.

**Per GUI Status (parallel across statuses):**
1. `CreateGuiStatus(program, status_name, ...)` — shell.
2. `UpdateGuiStatus(program, status_name, pfkeys=..., menu=..., toolbar=..., title=...)` — populate PFKEYS (BACK/EXIT/CANC at minimum), application toolbar entries for SAVE/REFRESH/etc., and the status title. **A separate title row per status code must also be emitted (CUAD `TIT` entry).**
3. **Verify**: `GetGuiStatus(program, status_name)` → `definition.STA[*].CODE` matches requested AND the status has non-empty function codes (not just an empty `STA` + `TIT` pair). On failure → re-`UpdateGuiStatus`; do not advance.

**Anti-pattern to block**: reporting "Screen/GUI 생성 완료" after only `Create*` returned 200. The empty-shell state is indistinguishable from success unless `Get*` is called after `Update*`. Reviewer treats missing verify step as MAJOR finding.

## Final Step — Batch Activation + Post-Activation Verification

- **Context kit**: (none — mechanical activation + verify)
- **Model**: Sonnet

1. `GetInactiveObjects(transport=...)` → list inactive objects from this session.
2. Single `ActivateObjects` call against the full list.
3. **Mandatory post-activation verification (NEW)** — call `GetInactiveObjects` again and filter for entries whose `name` matches this program's prefix (`{PROG}*`) AND every created FG/CLAS/TABL from the plan. The expected count is **exactly 0**. Any non-zero result means activation partially failed (common case: an include body references an identifier that was never activated, so the include stays inactive while the main program activates).
4. If step 3 returns > 0 entries: do NOT report "활성화 완료" / "completed". Re-run step 1 targeting the remaining items; on persistent failure (2 attempts) escalate to Phase 7 and surface the exact list of still-inactive objects to the user. Past regression: reviewer reported "5/5 프로그램 활성화 OK" while 30+ sub-includes remained in inactive state — step 3 blocks that class of false positive.

SAP's ADT activation accepts a list and resolves dependencies atomically. If one object fails (rare at this point), reorder by dependency chain and retry the remaining set. Persistent failure → Phase 7.

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
