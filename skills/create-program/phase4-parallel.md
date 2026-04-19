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

## Per-Wave Protocol

### Wave 1 — G1 (DDIC + CDS)

**Mandatory first.** Everything else references these types.

Sub-order within G1 (DDIC has internal dependencies):
1. **Parallel**: `CreateDomain` for all new domains
2. **Parallel**: `CreateDataElement` for all new data elements (depends on step 1 for domain refs)
3. **Parallel**: `CreateTable` + `CreateStructure` (depend on step 2 for field types) — **every field's type decision MUST follow [`../../common/field-typing-rule.md`](../../common/field-typing-rule.md)** (priority: Standard DE → existing CBO DE → new CBO DE → raw data type + length). Raw primitives like `LIFNR CHAR 10` / `MATNR CHAR 40` / `BUKRS CHAR 4` are rejected at review.
4. **Parallel**: `CreateView` (CDS views) — depend on step 3 tables

Between steps, NO activation call — SAP can create inactive chains. Activation happens once at the final batch step.

**ECC branch**: when `SAP_VERSION = ECC` and the plan includes new Table/DTEL/Domain, do NOT call `CreateTable` / `CreateDataElement` / `CreateDomain`. Generate helper reports in `$TMP` per `common/ecc-ddic-fallback.md` and emit the mandatory user message (SE38 run → SE11 activate). Wave 1 blocks on user confirmation before Wave 2 starts.

### Wave 2 — G2 + G3 + G4-prep (parallel)

All three groups launch in a single multi-tool-use message. Within each group, members launch in parallel too:

- **G2**: parallel `CreateInterface` + `CreateClass` calls. If a class `IMPLEMENTS` an interface, SAP tolerates inactive interface refs during creation — activation resolves them in the final batch.
- **G3**: `CreateFunctionGroup` first (small-serial), then parallel `CreateFunctionModule` within the group. Each `UpdateFunctionModule` body **MUST follow [`../../common/function-module-rule.md`](../../common/function-module-rule.md)** — inline `IMPORTING / EXPORTING / CHANGING / TABLES / EXCEPTIONS` clauses directly in the `FUNCTION` statement (not as `*"` comments, not as shadow locals). Empty signature placeholder `" You can use the template 'functionModuleParameter' ...` is a failure marker.
- **G4-prep**: parallel `CreateTextElement` calls (trivial — just strings).

### Wave 3 — G5 (Includes + Main Program)

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

Needs the main program. Parallel:
- `CreateScreen` per screen number
- `CreateGuiStatus` per status (references function codes defined in the main program's CONSTANTS)

## Final Step — Batch Activation

Single call:
```
GetInactiveObjects(transport=...) → list of all inactive objects from this session
→ single activate call against the full list
```

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
