# Changelog

← [Back to README](../README.md) · [Installation](INSTALLATION.md) · [Features](FEATURES.md)

All notable changes to sc4sap are documented here. For full release notes, see [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases).

The project adheres to [Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

---

## [Unreleased]

_No unreleased changes yet._

---

## [0.6.1] - 2026-04-21

### Added
- **`/sc4sap:setup` multi-profile awareness** — setup wizard now has Step 0 (legacy detection + profile bootstrap) and a dedicated profile-creation flow (`skills/setup/wizard-step-04-profile-creation.md`). Migrates pre-0.6.0 `<project>/.sc4sap/sap.env` users automatically via `sap-profile-cli.mjs migrate`; fresh installs create their first profile under `~/.sc4sap/profiles/<alias>/` with OS-keychain-backed password storage.
- **Tier-gated Step 9** — ABAP utility installation (`ZMCP_ADT_UTILS`, `ZCL_S4SAP_CM_*`, OData/ZRFC classes) now only runs on `SAP_TIER=DEV`. QA/PRD profiles refuse installation and print CTS import guidance; DEV installs are deduped across sibling profiles on the same `SAP_URL+SAP_CLIENT` via `~/.sc4sap/profiles/<alias>/.abap-utils-installed` sentinel.
- **Step 12 dual PreToolUse hooks** — setup now installs BOTH `block-forbidden-tables.mjs` AND `tier-readonly-guard.mjs` into `.claude/settings.json` (project-level), with smoke tests for each.
- **Shared profile resolver** (`scripts/lib/profile-resolve.mjs`) — `resolveSapEnvPath`, `resolveConfigJsonPath`, `resolveArtifactBase`, `readActiveSapEnv`, `readActiveConfigJson`, `readDotenv`, `normalizeTier`. Centralizes the active-profile → `~/.sc4sap/profiles/<alias>/` resolution pattern used by HUD, hooks, and scripts.
- **Gap-plan doc** (`docs/multi-profile-setup-gap.md`) — companion to `multi-profile-design.md` + `-implementation-plan.md`; records the 5 decisions made for the setup-skill retrofit.
- **Active-module awareness** (`common/active-modules.md`) — cross-module integration matrix. `SAP_ACTIVE_MODULES` env var + `activeModules` in `config.json` now drive proactive integration-field suggestions in `create-program`, `create-object`, `analyze-cbo-obj`, and consultant agents. Example: MM object + PS active → auto-suggest WBS fields (`PS_POSID` / `AUFNR`).
- **Fix #3 `handleUpdateDomain.ts`** — handler property naming aligned to `AdtDomain.update()` snake_case expectations (`value_table`, `fixed_values`, `conversion_exit`, `sign_exists`). Previously silently dropped.
- **Fix #4 `core/domain/update.ts`** (mcp-abap-adt-clients) — `patchXmlBlock` replaces `patchXmlElementAttribute` for `<doma:valueTableRef>` self-closing case; now emits full `adtcore:uri` + `adtcore:type` + `adtcore:name` attributes.

### Changed
- **Artifact paths in multi-profile mode** — `extract-spro.mjs`, `extract-customizations.mjs`, and consumer skills now write under `<project>/.sc4sap/work/<activeAlias>/` instead of `<project>/.sc4sap/` directly, per `common/multi-profile-artifact-resolution.md`. Legacy (no `active-profile.txt`) fallback preserved.
- **`rfc-backend-selection.md`** — all `SAP_RFC_*` env keys for `soap` / `native` / `gateway` / `odata` / `zrfc` backends now write to the active profile env (`~/.sc4sap/profiles/<alias>/sap.env`), never to the project folder. Bootstrap-order note for `odata` / `zrfc` backends retained (Step 9c/9d chicken-and-egg with first-time vs re-run scenarios).
- **`handleCreateTable.ts`** — auto-inject MANDT-based transparent-table skeleton (`key mandt : mandt not null`) after Create; replaces SAP backend's default CDS-style `key client : abap.clnt`. First-time users no longer hit `ExceptionResourceAlreadyExists` on UpdateTable.
- **`handleUpdateTable.ts`** — `ddl_code` schema description updated with MANDT example + annotation preservation guidance.

### Fixed
- **Password leak in `sap-profile-cli.mjs list`/`show`** — `passwordRef` field output the raw plaintext password when a profile's env used plaintext-fallback (keychain unavailable). Now returns the literal `"plaintext (masked)"` for non-keychain values; `keychain:…` refs pass through unchanged.
- **HUD ENV status after migration** — `sc4sap-status.mjs::sapEnvPresent / readConfig / activeTransport / systemInfo / sproCacheAge` all only looked at `<project>/.sc4sap/…`, which doesn't exist after multi-profile migration. Now resolve via the active-profile pointer first, with legacy fallback.
- **`block-forbidden-tables.mjs` profile mismatch** — hook reported the default `standard` blocklist even when the active profile's `config.json` said otherwise, because it read only the legacy project `config.json` (now deleted by migration). Now reads the active profile's config.
- **`code-simplifier.mjs`** and **`sap-option-tui.mjs`** — stop-hook and standalone TUI respectively read legacy project paths only; now resolve through the shared profile helper.

### Documentation
- **`INSTALLATION.md` / `.ko.md` / `.ja.md` / `.de.md`** — all four variants rewritten for 0.6.0 multi-profile setup. Adds "Multi-profile architecture" section, expands wizard table from 12 to 14 steps (new Step 0 + Step 13 HUD), documents the three-layer defense (L1a row-extraction hook + L1b tier hook + L2 MCP server guard), and adds after-setup profile-management + rollback recipes.
- README split — main page now slim (core capabilities + author + contributors). Installation / features / history moved to `docs/INSTALLATION.md` / `docs/FEATURES.md` / `docs/CHANGELOG.md` (this file).

---

## Release history

For older releases, see the [Git tag history](https://github.com/babamba2/superclaude-for-sap/tags) and [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases).

### Version scheme

sc4sap follows `v{MAJOR}.{MINOR}.{PATCH}`:
- **MAJOR** — breaking changes to skill API, config schema, or minimum SAP/Claude Code version
- **MINOR** — new skills, new agents, new common rules, backward-compatible feature additions
- **PATCH** — bug fixes, documentation-only changes, non-breaking refactors

### Compatibility

- **Claude Code**: >= 2.x
- **Node.js**: >= 20.0.0
- **SAP**: ECC 6.0 / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)
- **MCP server**: bundled `abap-mcp-adt-powerup` (auto-installed by `/sc4sap:setup`; version pinned by release)

---

← [Back to README](../README.md)
