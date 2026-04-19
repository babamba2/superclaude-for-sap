# Changelog

All notable changes to **SuperClaude for SAP (sc4sap)** will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.5.1] — 2026-04-20

### Added — Multi-Executor Split for Phase 4 bulk work

- **`skills/create-program/multi-executor-split.md`** *(new, 71 lines)* — Threshold table + 3 split strategies (A: by program range, B: by object class, C: within single program) + shared-transport / single-activation coordination rules. Planner decides single vs 2-way vs 3-way at Phase 2 sizing; Phase 4 skill reads the recommendation and dispatches accordingly.

### Changed — Phase 2 planner emits sizing; Phase 4 triggers split

- **`skills/create-program/agent-pipeline.md`** Phase 2 — planner now MUST emit § *Execution Sizing* into `plan.md` with `programs_count` / `includes_count` / `total_mcp_writes` / `text_elements_count` / `ddic_objects_count` and a `split_recommendation` + `split_strategy`. Phase 4 reads these to pick single vs parallel dispatch.
- **`skills/create-program/phase4-parallel.md`** — new "Multi-Executor Split" intro section points to the companion file; Waves 3 and 4 inherit the split decision from Phase 2.
- **`skills/create-program/spec-approval-gate.md`** — spec.md template gains § 8 *Execution Sizing* so the user sees the scale + split plan before approving.

### Why

The ZMMR00010–ZMMR00200 repair sweep (20 programs, ~150 MCP writes) ran as a single `sap-executor` dispatch that blew past its session budget mid-way. Thresholds + pre-computed sizing + disjoint-scope split let the same workload run as 3 parallel executors sharing a transport — faster wall-clock, lower per-call attention load, cleaner failure isolation (one blocked executor doesn't poison the other two's work).

## [0.5.0] — 2026-04-20

### Added — Context Loading Protocol + Model Routing Rule

Two cross-cutting architectural rules that change how every `Agent(...)` dispatch in sc4sap consumes context and selects a model. Result: lower per-dispatch tokens, higher enforcement accuracy, cheaper repetitive bulk work.

- **`common/context-loading-protocol.md`** *(new, 85 lines)* — `CLAUDE.md` is an index, not a payload. Every dispatch declares a **Context kit** (minimal file set) + optional triggered reads. Agents read only the kit; expansion requires a logged on-demand fetch or `BLOCKED` return. Kills the implicit "load 25 rule files just in case" anti-pattern observed in past runs.
- **`common/model-routing-rule.md`** *(new, 88 lines)* — 3-tier heuristic (Sonnet for reads + repetitive bulk + template writes; Opus for novel code + cross-file reasoning + ambiguity; Haiku for trivial lookups). Per-phase / per-Wave routing table for `/sc4sap:create-program`. Sonnet → Opus escalation pattern for hard blockers.

### Changed — Every phase now declares kit + model

- **`skills/create-program/phase4-parallel.md`** — Each Wave (1 DDIC, 2 Classes/FMs/Text, 3 Includes+Main, 4 Screen/GUI, Final Activation) now lists its `**Context kit**:` + `**Model**:` at the top of its section. Wave 2 G4-prep explicitly routes to Sonnet for `CreateTextElement` × N bulk; Wave 4 Screen/GUI to Sonnet for template-based Create/Update/Verify.
- **`skills/create-program/phase6-review.md`** — Convention Checklist header mandates that each §1–§12 is an independent bucket with its own narrow kit. Bucket-scoped reads replace the "read everything, skim checks" pattern.
- **`skills/create-program/agent-pipeline.md`** — Top paragraph anchors the discipline to the two rule files.
- **`agents/sap-executor.md`** — New `<Context_Kit_Protocol>` + `<Model_Selection>` sections. The large `<Shared_Conventions>` table is demoted to a LOOKUP INDEX (not a preload list).
- **`agents/sap-code-reviewer.md`** — Same two sections; explicit per-bucket kit rule (no preloading across §1–§12).
- **`CLAUDE.md`** — Top intro now flags the index-not-payload semantics; index adds rows for the two new rules.

### Why

The `/sc4sap:create-program` pipeline was running every agent with the implicit "load every common/*.md referenced by CLAUDE.md" behavior. Two measured costs: (1) per-dispatch token overhead of ~40–60% on simple repetitive tasks, (2) reviewer attention dilution — 12-bucket checklist gets skimmed because all 12 rule files are in context at once. The context kit + model routing fix both in the same release.

### Expected effects

- Per-dispatch tokens: −40 to −60% on Sonnet-tier work.
- Opus usage share: −50% across `/sc4sap:create-program` (previously all Opus; now only Waves that need reasoning).
- Phase 6 reviewer consistency: MAJOR-finding detection improves because each bucket runs with only its relevant rule in context.

## [0.4.1] — 2026-04-20

### Added — OK_CODE Binding Pattern for Procedural Screens

- **`common/ok-code-pattern.md`** *(new, 104 lines)* — Authoritative 3-step contract for wiring screen user commands: (1) TOP declares `DATA: gv_okcode TYPE sy-ucomm.`, (2) Screen's `fields_to_containers[]` OKCODE entry has `NAME=GV_OKCODE`, (3) PAI `user_command_xxxx` FORM copies `gv_okcode` to a local, `CLEAR gv_okcode`, `CASE` on the local. Blocks the silent-failure mode where `CASE sy-ucomm.` works on the main screen but breaks on the first popup / ALV toolbar event because the popup runtime overwrites `sy-ucomm`.

### Changed — Reviewer and Phase-4 Wave 4

- **`skills/create-program/phase4-parallel.md`** Wave 4 — `UpdateScreen` payload MUST set `fields_to_containers[].NAME=GV_OKCODE` for the OKCODE field; Verify step now checks NAME binding in addition to flow-logic uncommenting.
- **`skills/create-program/phase6-review.md`** §1 — New reviewer check for the 3-step contract; `CASE sy-ucomm.` inside a `user_command_xxxx` FORM is a MAJOR finding.
- **`skills/create-program/phase6-output-format.md`** — Added OK_CODE-broken pattern to the enumerated false-positive list.
- **`common/include-structure.md`** TOP row — Link to `ok-code-pattern.md` + explicit `CASE sy-ucomm` warning.
- **`common/clean-code-procedural.md`** — PAI user-command routing rule references the new pattern file.
- **`CLAUDE.md`** index — Added row linking to `ok-code-pattern.md`.

### Motivation

Observed during the ZMMR00010–ZMMR00200 batch fix: every `user_command_xxxx` FORM reads `sy-ucomm` directly, none bind `gv_okcode`. Programs work today on the single main screen but are time-bombs the first time a popup is introduced. The rule was missing from the plugin so first-time users could ship this bug unchallenged.

## [0.4.0] — 2026-04-19

### Changed — Phase 4 / Phase 6 Hardening

Phase 4 and Phase 6 of `/sc4sap:create-program` now block a class of silent-failure regressions where the SAP MCP `Create*` call returned 200 but the resulting object was an empty shell, and where reviewer reported "완료" without re-verifying activation state.

- **`common/text-element-rule.md`** — Four pool types (`I` / `S` / `R` / `H`) defined explicitly. Type `S` (Selection Text) is now **mandatory** for every `SELECT-OPTIONS` / `PARAMETERS` name — previously missing, which made selection screens render technical names (`S_BUDAT`, `P_FILE`) at runtime.
- **`common/include-structure.md`** — Activation protocol made explicit (`UpdateProgram(activate=true)` does NOT cascade to sub-includes; every include must be activated individually or via batch `ActivateObjects`). Six anti-patterns enumerated as MAJOR Phase 6 findings, including Procedural `{PROG}E` presence and "5/5 활성화 OK" reports that leave sub-includes inactive.
- **`common/procedural-sample/main-program.abap`** — Promoted to source-of-truth template for every Procedural program: 6-field header comment block, canonical include order, event-block-to-`PERFORM` delegation. Deviation now requires written justification in `spec.md`.
- **`skills/create-program/phase4-parallel.md`**
  - Wave 2 G4-prep: emit all applicable text-pool types with `ReadTextElementsBulk` verify before Wave 3 starts.
  - Wave 4: enforced `Create → Update(body) → Get*(verify)` 3-step protocol for every screen and every GUI Status. `CreateScreen` + `CreateGuiStatus` alone produce empty shells and are no longer considered success.
  - Final Step: mandatory post-`ActivateObjects` `GetInactiveObjects({PROG}*) == 0` verification. Blocks "programs activated" reports that leave sub-includes inactive.
- **`skills/create-program/phase6-review.md`**
  - §1 ALV: reviewer must verify `flow_logic` contains uncommented `MODULE ... OUTPUT.` / `INPUT.` lines and GUI Status has populated PFKEYS/toolbar — not just `STA` + `TIT` shells.
  - §2 Text elements: `counts.R` / `counts.I` / `counts.S` / `counts.H` cross-checked against source declarations.
  - §6 Include structure: Main program must contain `INCLUDE` statements (reject inlined Main); Procedural paradigm with `{PROG}E` include present is MAJOR.
- **`skills/create-program/phase6-output-format.md`** *(new)* — Split from `phase6-review.md` to stay under the 200-line-per-MD hard limit. Holds the `review.md` template, failure-fix loop, and the enumerated false-positive patterns reviewer must reject.

### Fixed

- Reviewer false positives on the ZMMR00010–00200 batch build (shell-only Screen 0100, empty GUI STATUS_0100, `counts.S == 0` across all programs, ZMMR00060 and ZMMR00110 sub-includes inactive after "활성화 완료", forbidden `{PROG}E` in ZMMR00120/130/140/150, inlined-Main in ZMMR00110) motivated this change. Future regenerations of programs in this pattern will fail Phase 6 before the user sees them.

### Notes

- `package-lock.json` version field was stale at `0.1.0` (inconsistent with `package.json` `0.3.3`) and is now aligned to `0.4.0`.

## Prior versions

Releases prior to 0.4.0 were untagged. The `0.3.3` in `package.json` was an internal-only bump without a git tag or GitHub release; commit history on the `active` / `main` branches is the authoritative record for that period.
