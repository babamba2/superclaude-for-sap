# Phase 6 Golden Set — `/sc4sap:create-program` review step

## Purpose

`skills/create-program/phase6-detect-judge.md` § *Golden-set gate* keeps the `detect-judge` strategy opt-in
until it matches the default `buckets` strategy on a fixed set of known defects. This folder is that set:
nine small ABAP programs, each with **exactly one planted defect** taken from a past incident. Everything
else in each program follows the rules in `common/`, so any other MAJOR finding is a false positive.

The set measures **detection only**. The fix loop (executor + re-review) is not run.

## Cases

| Case | Program | Paradigm | Display | Planted defect | Checklist | Rule file |
|------|---------|----------|---------|----------------|-----------|-----------|
| GS01 | ZSC4SAP_GS01 | OOP | Docking + CL_GUI_ALV_GRID | `LVC_T_FCAT` built by hand in `LCL_ALV->GET_FIELDCAT` (9× `APPEND VALUE #( ) TO rt_fcat`) | §1 | alv-rules.md |
| GS02 | ZSC4SAP_GS02 | OOP | Docking + CL_GUI_ALV_GRID | GUI status `STATUS_0100` created as an empty shell (no FUN/PFK/BUT/TIT) | §1 | alv-rules.md, phase4-verify.md |
| GS03 | ZSC4SAP_GS03 | OOP | Docking + CL_GUI_ALV_GRID | No `S` selection texts for `S_CARRID` / `S_FLDATE` | §2 | text-element-rule.md |
| GS04 | ZSC4SAP_GS04 | OOP | Docking + CL_GUI_ALV_GRID | Include `ZSC4SAP_GS04O` left with an inactive version | §12 | include-structure.md |
| GS05 | ZSC4SAP_GS05 | Procedural | SALV popup | `{PROG}E` include holding the event blocks | §6 | include-structure.md |
| GS06 | ZSC4SAP_GS06 | Procedural | SALV popup | Everything inlined into Main (plan lists t/s/f) | §6 | include-structure.md, procedural-sample |
| GS07 | ZSC4SAP_GS07 | Procedural | Docking + CL_GUI_ALV_GRID | `CASE sy-ucomm` in FORM `user_command_0100` (TOP declares `ok_code`, screen NAME `OK_CODE`) | §1 | ok-code-pattern.md |
| GS08 | ZSC4SAP_GS08 + FM ZSC4SAP_GS08_FM (FG ZSC4SAP_GSFG) | Procedural | SALV popup | FM placeholder signature + shadow locals | §7 | function-module-rule.md |
| GS09 | ZSC4SAP_GS09 | OOP | Tabstrip 0200 + subscreens 0210 / 0220 (custom controls + CL_GUI_ALV_GRID) | Tabstrip PAI flow logic lacks `CALL SUBSCREEN ts_sca.` | §1 | screen-tabstrip.md |

All nine planted defects are MAJOR (`phase6-buckets.md` § Finding Classification: each blocks Phase 8).
Data source is SFLIGHT / SCARR only (present on ECC and S/4HANA). Syntax is limited to ABAP 7.40 with `abapSp`
unset (classic Open SQL).

**OOP cases (GS01–GS04, GS09)** follow the house OOP skeleton: Main + `T`, `S`, `C`, `CT`, `O`, `I` (+ `E` when
the grid has events — GS01–GS04 handle a row double-click), `LCL_DATA` + `LCL_ALV` in `C` after `DEFERRED`,
bootstrap `go_data = NEW #( )` / `go_alv ?= go_data->mo_alv` / `go_data->initialization( )`, `LCL_TEST` in `CT`.
They run with the profile setting **`alvFramework = none`** (`common/oop-pattern.md` § ALV Framework): plain
`CL_GUI_DOCKING_CONTAINER` / `CL_GUI_CUSTOM_CONTAINER` + `CL_GUI_ALV_GRID`, no `ZCL_S4SAP_CM_*` and no message class,
so the set needs no framework on the target system. Every main program carries the house header block
(`clean-code-procedural.md` § Mandatory Main Program Header).

## Folder layout

```
tests/golden/phase6/
  README.md            this file
  run-plan.md          exact main-thread orchestration (create, review x2 strategies, score, cost)
  GSnn/
    src/*.abap         every source unit exactly as created (main, includes, FM)
    recipe.json        ordered MCP creation steps + objects, screen, GUI status, texts, activation
    spec.md            Phase 3 spec (approved) — the reviewer's spec input
    interview.md       Phase 1B decisions (paradigm, display mode, testing scope)
    plan.md            Phase 2 plan (objects, planned include list, text table, sizing)
    expected.json      planted findings + must_not_flag list + unavoidable secondary findings
```

## How to create the set on a system

Run once per system (ECC 7.40 and S/4HANA). Package `$TMP`, no transport.

1. Confirm the active profile (`/sc4sap:sap-option`) points at the target system and that `$TMP` objects
   are allowed. Note `systemInfo.language` — the primary logon language for the second text pass.
2. For each case, execute `recipe.json` → `steps[]` in order. `source_file` paths are relative to the case
   folder; pass the file content verbatim as `source_code`. Steps marked `PLANTED` must be executed exactly
   as written — never "fix" them.
3. After each case, `GetInactiveObjects`: 0 entries for `ZSC4SAP_GS0n*` (GS04: exactly `ZSC4SAP_GS04O`). For the
   cases with tests, the recipe's `RunUnitTest` step (container `PROG`) must report all tests green — record
   it per `run-plan.md` § 1a (on S/4HANA the MCP tool runs `CLAS` containers only).
4. Record per system: activation result per object, any deviation from the recipe, the MCP backend path
   (ADT vs ECC fallback). A case that could not be created as written is **excluded** from scoring.

Cleanup (`DeleteProgram`, `DeleteFunctionModule`, `DeleteFunctionGroup`) needs explicit per-call user approval.

## How to run and score

Follow `run-plan.md`. Per case and system, run both strategies on the same created objects:

- **buckets** — 4 parallel Sonnet `sap-code-reviewer` buckets + Opus escalation scoped to MAJORs.
- **detect-judge** — Haiku `sap-checker` detectors D1–D5 + one Opus judge.

Score each run against `GSnn/expected.json`:

| Metric | Definition |
|--------|-----------|
| Recall | planted findings reported (any severity, matching object + checklist item or an `also_acceptable_as` item) ÷ planted (1 per case) |
| Severity hit | planted finding reported as MAJOR |
| False MAJOR | MAJOR findings that match neither a planted entry, its `also_acceptable_as`, nor an `unavoidable_secondary_findings` facet. A MAJOR that matches a `must_not_flag` entry counts as false and is tagged `MNF-*` |
| False MINOR | same, for MINOR (reported, not gating) |
| Cost (USD) | sum over the run's subagent transcripts of tokens × model price (see run-plan.md § Cost) |
| Wall-clock | first dispatch → last agent result, seconds (main-thread timestamps) |

Gate (from `phase6-detect-judge.md`): switch the default to `detect-judge` only when its recall ≥ buckets
recall **on every case** on both systems. False MAJORs and cost are reported alongside, not gated.

## Results template

Copy per system into `results-<system>-<date>.md` (local, not committed unless asked).

```markdown
# Phase 6 golden set — <SYSTEM> (<ECC 7.40 | S/4HANA xxxx>) — <date>

| Case | Strategy | Planted found | Severity | False MAJOR | False MINOR | Cost USD | Wall s | Notes |
|------|----------|---------------|----------|-------------|-------------|----------|--------|-------|
| GS01 | buckets      | 1/1 | MAJOR | 0 | 0 | 0.00 | 0 | |
| GS01 | detect-judge | 1/1 | MAJOR | 0 | 0 | 0.00 | 0 | |
| ...  |              |     |       |   |   |      |   | |

| Strategy | Recall (sum) | Cases with recall 1 | False MAJOR (sum) | Cost USD (sum) | Wall s (sum) | Opus escalations |
|----------|--------------|---------------------|-------------------|----------------|--------------|------------------|
| buckets      | x/9 | x | x | x | x | x |
| detect-judge | x/9 | x | x | x | x | n/a |

Gate verdict: detect-judge recall ≥ buckets on every case? yes / no (list failing cases)
```

## Rule decisions this set relies on

The ambiguities found while building the set were resolved in the rules (decision sheet 2026-10-12). Each
affected construct stays a `must_not_flag` entry whose `reason` cites the rule text, so a regression in the
rules shows up as a false MAJOR:

- Harness object names `ZSC4SAP_GS*` — `naming-conventions.md` § Exceptions (§7 N/A).
- Dynpro flow logic has no `OUTPUT` / `INPUT` keyword; `phase6-review.md` §1 and `phase4-verify.md` a1/a2 now say
  so explicitly (kept as a regression guard, `MNF-FLOWLOGIC`).
- `FINAL` is allowed, not required (`clean-code-oop.md`); `abap-release-reference.md` no longer lists it under 754.
- Procedural `c` / `a` only when the spec declares them (`include-structure.md`); GS07 has neither.
- `alvFramework = none` → plain grid classes and text symbols are PASS (`oop-pattern.md`, `phase6-review.md` §5).
- `abapSp` unset on 740 → classic Open SQL (`abap-release-reference.md` § 1a).
- OK_CODE: any one TOP variable (`ok_code` here), dispatch in the PAI module or an `LCL_ALV` method; `CASE sy-ucomm`
  stays MAJOR (GS07's planted defect).
- A shared, non-executed house syntax-guide include is never generated and never flagged
  (`MNF-HOUSE-GUIDE-INCLUDE`, marked `applicable: false` — no case contains one).
