# Changelog

All notable changes to **SuperClaude for SAP (sc4sap)** will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

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
