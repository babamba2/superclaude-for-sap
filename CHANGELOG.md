# Changelog

All notable changes to **SuperClaude for SAP (sc4sap)** will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [0.6.11] — 2026-04-24

### Added — `runtime-deps/` bundle integrity verification (offline, Stage 3-lite v1)

The keyring bundle landed in 0.6.9 had no tamper detection — any modification to a committed `.node` binary (intentional or accidental) would go unnoticed. 0.6.11 closes that gap with an offline integrity check.

- `runtime-deps/keyring/integrity.json` — new manifest. Per package, records the SHA-512 `npmIntegrity` copied verbatim from `package-lock.json` (provenance) plus per-file SHA-256 hashes in `ssri` format (tamper detection). Schema version 1, 5 packages, 19 files on initial generation.
- `scripts/bundle-keyring.mjs` — two new subcommands:
  - `--refresh-integrity` — regenerates `integrity.json` from the current bundle + `package-lock.json`. Run after any bundle update.
  - `--verify` — offline SHA-256 re-hash and compare against the recorded manifest. Reports missing / unexpected files and hash mismatches individually. Exit codes: `0` pass, `7` manifest missing, `8` integrity failed.
- `docs/bundle-integrity.md` — new maintainer doc covering the workflow, `--verify` semantics, what is and is not detected, and Stage 3-lite v2 (upstream re-verification) as deferred scope.

End-to-end verified: clean `--verify` passes on 19 files across 5 packages; a single-byte tamper in `runtime-deps/keyring/node_modules/@napi-rs/keyring/index.js` is detected with exact expected-vs-actual SHA-256 diff; re-bundling restores the expected state.

CI hook not auto-installed — the repo has no `.github/workflows/`. `docs/bundle-integrity.md` documents pre-commit / pre-push invocation until CI is wired.

### Fixed — 0.6.9 CHANGELOG misstated bundled `@napi-rs/keyring` version

The 0.6.9 release note said the bundled package was `@napi-rs/keyring@1.1.0`. The actual installed and committed version per `package-lock.json` was **`1.2.0`**; the 0.6.9 bundle bytes are unchanged, only the description was wrong. `integrity.json` records the correct `1.2.0` version and registry `resolved` URL for every entry.

## [0.6.10] — 2026-04-24

Follow-up patch to 0.6.9. Three independent fixes + one missing implementation; no behavioural changes to the keychain bundle landed in 0.6.9.

### Fixed — HUD showed "SAP not configured" when launched from a subdirectory

`scripts/hud/lib/sc4sap-status.mjs` resolved the active profile only at the exact `cwd`, while the MCP server walked up the ancestry chain — so launching Claude Code from a nested dev repo (e.g. the plugin source inside a larger workspace) produced HUD line 2 "SAP not configured" even though the MCP connection, `/sc4sap:sap-doctor`, and tool calls all reported the profile live.

`scripts/lib/profile-resolve.mjs` now exposes a shared `findDotSc4sapDir()` + `resolveWorkspaceRoot()`. `readActiveAlias()`, `resolveSapEnvPath()`, and `resolveConfigJsonPath()` accept a `startDir` and walk up until they find a `.sc4sap/` that contains profile state (`active-profile.txt`, `sap.env`, or `config.json`) — skipping any intermediate `.sc4sap/` that holds only artifact folders (`comparisons/`, `test-reports/`, `cbo/`). Falls back to the first `.sc4sap/` on the chain when no ancestor has state. The HUD's `activeProfile()` switched to the shared resolver; downstream `SID` / `client` / `user` fields now render correctly from any subdirectory.

### Fixed — Blocklist `deny` rule short-circuited by built-in `warn` pattern

`scripts/hooks/block-forbidden-tables.mjs` previously returned the first matching blocklist rule (exact-table lookup first, then the first matching pattern in iteration order). If a user extended `.sc4sap/blocklist-extend.txt` with a strict `deny` rule for a table that also matched a looser built-in `warn` pattern, the `warn` match could win the first-match race and the aggregate `deny > warn` decision downstream never saw the user's `deny`.

Replaced the single-match helper with `matchBlocklistAll()` (returns every matching rule) + `effectiveHitForTable()` (collapses matches by `deny > warn > first-rule`). User overrides in `blocklist-extend.txt` now always take precedence over built-in defaults for the same table.

### Added — `scripts/prune-cache.mjs` implementation (Layer 7 cache hygiene)

`skills/sap-doctor/SKILL.md` advertised `/sc4sap:sap-doctor --prune` and `--prune --yes` flags since the doctor skill was introduced, but the underlying `scripts/prune-cache.mjs` implementation had never been committed — running the option hit "script not found" at runtime.

Ships the missing script (227 LOC, dry-run by default, `--yes` to actually delete; `--json` for machine output). It resolves the active plugin version from the marketplace `plugin.json`, walks `~/.claude/plugins/cache/<marketplace>/sc4sap/` to list stale version directories (each typically carrying its own ~500–800 MB `vendor/abap-mcp-adt/node_modules/` subtree), reports sizes in MB, and refuses to run when the active version cannot be resolved. Never touches the marketplace directory or the active cache directory.

`skills/sap-doctor/diagnostic-checks.md` gains a "Layer 7 — Cache Hygiene" section: PASS at zero stale versions, INFO when stale < 500 MB, WARN when stale ≥ 500 MB. Runs independently of Layer 2/3 connectivity so cache bloat is reported even when the SAP system is unreachable.

## [0.6.9] — 2026-04-24

### Fixed — Keychain storage silently degraded to plaintext on git-clone installs

Claude Code plugin installation is a **git clone**, not an `npm install`. `@napi-rs/keyring` was declared in `optionalDependencies`, but since end users receive only what is committed to the repo (and `node_modules/` is gitignored), the plugin shipped with no keyring module at all. At runtime `scripts/sap-profile-cli.mjs` → `loadKeyring()` → `require('@napi-rs/keyring')` failed silently, `keychainWrite()` threw `KeychainUnavailableError`, and `cmdAdd` caught the error and wrote `SAP_PASSWORD=<plaintext>` to `sap.env` with only a stderr warning that the setup wizard never surfaced. New profiles created via `/sc4sap:sap-option` therefore stored passwords in plaintext regardless of OS keychain support.

**Fix — bundle keyring under `runtime-deps/`**:
- `runtime-deps/keyring/package.json` — `createRequire` anchor.
- `runtime-deps/keyring/node_modules/@napi-rs/keyring/` — JS wrapper (56 KB).
- `runtime-deps/keyring/node_modules/@napi-rs/keyring-<platform>/` — native binaries for `win32-x64-msvc`, `darwin-x64`, `darwin-arm64`, `linux-x64-gnu` (combined ~4.3 MB).
- `scripts/bundle-keyring.mjs` — idempotent `npm install` output → `runtime-deps/` copy, with `--check` to verify all 4 platform binaries are present.
- `scripts/sap-profile-cli.mjs` — `loadKeyring()` now uses a `KEYRING_REQUIRE` anchored at `runtime-deps/keyring/package.json` so resolution goes through the committed bundle, not the plugin-root `node_modules/` (which is empty for end users).
- `.gitignore` — negation rule `!runtime-deps/**/node_modules/**` so the bundle is tracked despite the global `node_modules/` ignore.
- `.gitattributes` — NEW, `runtime-deps/** -text` + `*.node binary` so native binaries and package metadata survive cross-platform checkout without CRLF normalization.

**Verified end-to-end**: `git checkout-index` to a tmp location (simulates a first-time user's machine with no `node_modules/` populated) → `node scripts/sap-profile-cli.mjs version` runs → `createRequire` at the bundle anchor resolves `@napi-rs/keyring` from `runtime-deps/keyring/node_modules/@napi-rs/keyring/index.js`. Separate 2026-04-23 verification confirmed the same chain delivers HTTP 200 on SAP OData `$metadata` with a keychain-referenced password on a live SAP system.

**Bundle size**: 4.4 MB committed (Linux x64 binary dominates at 3.0 MB; Windows/macOS binaries each ~450–470 KB).

**Post-install behaviour**: `/sc4sap:sap-option` and the setup wizard now store new profile passwords as `SAP_PASSWORD=keychain:<service>/<alias>/<user>` and write the plaintext into the OS-native credential store (Windows Credential Manager / macOS Keychain / libsecret), matching the design documented in `scripts/sap-profile-cli.mjs` since 0.6.0. Existing plaintext profiles remain functional; they can be migrated in-place by deleting and re-adding the profile after upgrading to 0.6.9.

### Deferred — Stage 3-lite bundle integrity verification

Design recorded in `.sc4sap/stage3-lite-bundle-integrity.md`. Adds an `integrity.json` sidecar under `runtime-deps/<module>/` populated from `package-lock.json`'s npm SHA-512 integrity field, plus `scripts/bundle-keyring.mjs --verify` which recomputes the hash of the bundled tarball contents and fails CI on mismatch. Out of scope for 0.6.9 so the keychain fix can ship immediately; will land in a follow-up patch.

## [0.6.8] — 2026-04-24

### Reverted — `<Main_Thread_Dispatch>` enforcement layer (0.6.7)

Reverts the enforcement layer introduced in 0.6.7. The per-skill `model:` frontmatter returns to being a **declarative hint**; no active sub-dispatch is performed.

**Why**: 2026-04-23 smoke validation (`.sc4sap/test-reports/enforcement-validation-20260423.md`) confirmed a Claude Code architectural limit — sub-dispatched `general-purpose` agents do not receive the `Agent`/`Task` spawn tool and do not have the `mcp__plugin_sc4sap_sap__*` MCP tools in their deferred-tool registry. The 0.6.7 design assumed a Sonnet sub-orchestrator could fan out to phase agents (`sap-code-reviewer`, `sap-stocker`, `sap-analyst`, …); empirically it cannot. 12/14 in-scope skills were functionally broken under 0.6.7; the 2 file-only skills that happened to work did so only by falling back to local file reads rather than live MCP calls.

**What reverted**:
- `common/main-thread-dispatch.md` — deleted (0.6.7 new file).
- `common/model-routing-rule.md` — `§ Main-Thread Dispatch Enforcement` section removed; phase banner convention restored (single-dispatch skills no longer emit `phase=0 (bootstrap)`).
- `docs/skill-model-architecture.md` — "Enforcement layer (v0.6.7+)" note removed.
- `skills/*/SKILL.md` × 14 — `<Main_Thread_Dispatch>` block removed from `ask-consultant`, `sap-doctor`, `sap-option`, `mcp-setup`, `setup`, `deep-interview`, `trust-session`, `create-program`, `create-object`, `team`, `analyze-cbo-obj`, `analyze-code`, `analyze-symptom`, `compare-programs`.

**What kept**:
- Frontmatter `model:` fields remain on all 14 skills (including `deep-interview: haiku` and `team: sonnet` which were added in 0.6.7) — they serve as model-routing guidance for future redesign and for documentation readers, without runtime enforcement.

**Operational impact**: users whose Claude Code session is on a larger model than a skill's declared target will see the skill run at session-model cost. This matches 0.6.6 and earlier behavior.

## [0.6.5] — 2026-04-22

### Changed — Publish workflow

- `prepublishOnly` simplified from `"npm run build"` to `"tsc"`. The full `build` script (which also runs `scripts/build-mcp-server.mjs` to clone and verify the vendor at the pinned SHA) is preserved for manual maintainer use (`npm run build`) but no longer executes during `npm publish`.
- Rationale: `vendor/` is not shipped in the tgz (`files` field excludes it) and the bridge re-clones it lazily at install-time, so publishing had no reason to materialize a ~500MB `vendor/abap-mcp-adt/` under the project root. This was a quality-of-life fix for maintainers.

No other changes — 0.6.5 is a pure publish-workflow follow-up to 0.6.4.

## [0.6.4] — 2026-04-22

### Changed — Vendor pin bump

- `scripts/build-mcp-server.mjs` `DEFAULT_PINNED_SHA` → `b41d4df546e2cccfa3f6693b656e16868b6facb6` (abap-mcp-adt-powerup **v4.8.1**, previously pinned at a pre-v4.8.0 SHA). npm installers of sc4sap 0.6.4 now receive the ECC DDIC write fallback vendored into the plugin.

No other functional changes — 0.6.4 is a pure vendor-pin follow-up to 0.6.3.

## [0.6.3] — 2026-04-22

### Added — ECC DDIC write path via OData RFC fallback

ECC 7.40 ADT REST lacks `/sap/bc/adt/ddic/{tables,dataelements,domains}` endpoints. This release ships the runtime integration so MCP DDIC tools route through server-side FMs when `SAP_VERSION=ECC`.

- **ABAP side** — 6 new pre-release-branch source files under `abap/` (`zmcp_adt_ddic_{activate,doma,dtel,tabl}_ecc.abap`, `zmcp_adt_{dispatch,textpool}_ecc.abap`) feeding 4 RFC FMs (`ZMCP_ADT_DDIC_{TABL,DTEL,DOMA,ACTIVATE}`) + 4 OData FunctionImports on `ZMCP_ADT_SRV`.
- **MCP server** (`abap-mcp-adt-powerup` v4.8.0+) — 9 DDIC handlers patched with `SAP_VERSION=ECC` branch. Full: Domain C/U/D + DataElement C/U/D (type_kind=domain only) + Table Delete. Inform-only: Table Create/Update (CDS-DDL translator deferred).

### Changed

- `docs/FEATURES.{md,ko,de,ja}.md`, `docs/multi-profile-design.md`, `docs/odata-backend.md`: refresh matrix and narrative for the ECC DDIC path.
- `skills/sap-option/*`, `skills/setup/{rfc-backend-selection,wizard-steps,wizard-step-09-abap-objects}.md`: SAP option UX and wizard refinements.
- `abap/zmcp_adt_dispatch.abap`, `abap/zmcp_adt_textpool.abap`: local refinements aligned with the new ECC variants.

Note: 0.6.1 and 0.6.2 were tagged but their notes were not written; see `git log v0.6.0..v0.6.2` for the intermediate changes.

## [0.6.0] — 2026-04-21

### Added — Multi-environment profiles (Dev / QA / Prod)

Register multiple SAP systems per company and hot-switch between them without restarting Claude Code. Targets the multinational 3-tier landscape (`KR-DEV`, `KR-QA`, `KR-PRD`, `US-DEV`, …).

**Key pieces**

- **Profile storage** — user-level definitions at `~/.sc4sap/profiles/<alias>/{sap.env,config.json}` (shared across repos); project-level pointer at `<project>/.sc4sap/active-profile.txt`; artifacts per-profile under `<project>/.sc4sap/work/<alias>/` with read-only cross-view.
- **Tier-based readonly enforcement** — `SAP_TIER` enum (`DEV` | `QA` | `PRD`). QA/PRD profiles auto-block `Create*/Update*/Delete*`, `CreateTransport`, and runtime-execution tools. Two-layer defense:
  - Layer 1: PreToolUse hook `scripts/hooks/tier-readonly-guard.mjs` (installed via `scripts/install-hooks.mjs`) — fast, explanatory deny.
  - Layer 2: MCP-server guard in `abap-mcp-adt-powerup/src/lib/readonlyGuard.ts` — uncircumventable; fires even when the hook is missing, disabled, or the plugin is not yet installed. `ReloadProfile` always allowed (the escape hatch back to DEV).
- **OS keychain passwords** — `SAP_PASSWORD=keychain:sc4sap/<alias>/<user>` references resolved via `@napi-rs/keyring` (Windows Credential Manager / macOS Keychain / libsecret). Declared as `optionalDependencies`; headless environments fall back to plaintext with a loud warning. Added to both `sc4sap` and `abap-mcp-adt-powerup` package.json.
- **MCP server extensions** (`abap-mcp-adt-powerup`) — new `src/lib/{profile,readonlyGuard,secrets}.ts` (37 new unit tests, no regression on 276 existing), `ReloadProfile` MCP tool, launcher startup hook that activates the profile before the config manager runs. Guard wired into `BaseHandlerGroup.registerToolOnServer` so every tool is checked from a single chokepoint.
- **`sap-option` multi-profile UX** — new `skills/sap-option/profile-management.md` and `skills/sap-option/migration.md` companions describing switch / add / remove / edit / purge / migrate flows. Status snapshot now shows active profile + tier.
- **HUD** — Line 2 renders `{alias} [{tier}]` with a 🔒 when tier ≠ DEV. No color is used; the lock icon is the single, theme-independent readonly signal.
- **Profile CLI** (`scripts/sap-profile-cli.mjs`) — JSON-in/JSON-out backend for skill flows: `list`, `show`, `switch`, `add`, `remove`, `purge`, `migrate`, `detect-legacy`, `keychain-set`, `keychain-delete`, `version`.
- **Legacy auto-detection** — SessionStart hook `scripts/legacy-migration-banner.mjs` emits a one-time notice when a project has `.sc4sap/sap.env` but no `active-profile.txt`, pointing the user to `/sc4sap:sap-option`. The migration wizard records the version threshold (`multiProfileSince: "0.6.0"`) so the CLI can make upgrade-aware decisions.

**Design docs**: [`docs/multi-profile-design.md`](multi-profile-design.md), [`docs/multi-profile-implementation-plan.md`](multi-profile-implementation-plan.md).

### Non-breaking

Projects that never migrate keep working: the profile loader falls back to legacy `<project>/.sc4sap/sap.env` and treats missing `SAP_TIER` as `DEV` (permissive). Migration is explicit — triggered only when the user runs `/sc4sap:sap-option` after the banner.

## [0.5.4] — 2026-04-20

### Fixed — Plugin manifest version alignment (critical)

The Claude Code plugin marketplace reads **`.claude-plugin/plugin.json` version**, not `package.json` version. Previous v0.4.0–v0.5.3 releases bumped only `package.json`, so users running `/plugin` saw stale `0.3.10` from `plugin.json` while GitHub showed v0.5.3. All three manifests are now synced to `0.5.4`:

- `.claude-plugin/plugin.json` version: `0.3.10` → `0.5.4`
- `.claude-plugin/marketplace.json` plugins[0].version: `0.2.5` → `0.5.4`
- `.claude-plugin/marketplace.json` root version: `0.2.2` → `0.5.4`
- `package.json` / `package-lock.json`: `0.5.3` → `0.5.4`
- `README.md` / `README.ko.md` / `README.ja.md` / `README.de.md` badge: `v0.2.4` → `v0.5.4`

### Changed — Manifest descriptions updated

`plugin.json` and `marketplace.json` descriptions now reflect all v0.4.x/v0.5.x additions: 16 skills (incl. `ask-consultant`, `compare-programs`), 4-Tier context loading, Sonnet/Opus model routing, OK_CODE binding pattern, Phase 4/6 hardening + Multi-Executor Split.

### Note — Semantic content unchanged

No skill / agent / rule file changed in this release. Only version fields + manifest descriptions. Users on 0.3.10 who upgrade to 0.5.4 get the accumulated v0.4.0–v0.5.3 feature set.

## [0.5.3] — 2026-04-20

### Added — `/sc4sap:ask-consultant` skill

New user-facing direct-Q&A skill for consulting with a module consultant agent without running a full create-program / create-object pipeline.

- **`skills/ask-consultant/SKILL.md`** *(new, 117 lines)* — routes the user's question to the matching `sap-{module}-consultant` (SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC) based on keyword inference + explicit mention. Multi-module questions dispatch 2-3 consultants in parallel. Answers are rendered against the configured SAP environment (`sapVersion`, `industry`, `country`, `activeModules` from `.sc4sap/config.json` + `.sc4sap/sap.env`).
- **Read-only**: no `Create*` / `Update*` / `Delete*` / `Activate*` / `CreateTransport` calls. DDIC metadata reads are fine; row extraction (`GetTableContents` / `GetSqlQuery`) is prohibited.
- **Inherits v0.5.2 conventions**: `<Response_Prefix>` block at top (prefix format `[Model: <main> · Dispatched: Opus×<n> (<consultants>)]`); consultant agents load Tier 1 + Tier 2 per `common/context-loading-protocol.md` so `configs/{MODULE}/*.md` are always available.

### Added — `/sc4sap:compare-programs` skill documentation

`compare-programs` existed in the skills folder but was missing from `docs/FEATURES.md` skill table. Added to all 4 language variants (en/ko/de/ja).

### Changed

- **`README.md` / `README.ko.md` / `README.ja.md` / `README.de.md`** — new "Ask Consultant" row in the Core Capabilities table; `FEATURES →` link updated from "18 skills" to "19 skills" count.
- **`CLAUDE.md`** (sc4sap root) — `/sc4sap:ask-consultant` added to the Skills list.
- **`docs/FEATURES.md` (en/ko/de/ja)** — skills table now has 16 entries (added `compare-programs` + `ask-consultant`); heading updated from "18 Skills" to "16 Skills" (matches actual count).

## [0.5.2] — 2026-04-20

### Added — 4-Tier Context Loading Model + Response Prefix

**Tier 1 (Global Mandatory — every agent/skill, every session)** — five files now unconditionally loaded at session start: `data-extraction-policy.md` (safety), `sap-version-reference.md` (platform), `naming-conventions.md` (namespace), `context-loading-protocol.md` (meta), `model-routing-rule.md` (routing).

**Tier 2 (Role-Mandatory — per agent role group)** — fixed additional set loaded at session start based on the agent's declared role group. Seven role groups:

| Role group | Agents | Tier 2 adds |
|---|---|---|
| Code Writer | executor, qa-tester, debugger | clean-code, abap-release-reference, transport-client-rule, include-structure |
| Reviewer | code-reviewer, critic | clean-code, abap-release-reference, include-structure (per-bucket narrowing) |
| Planner / Architect | planner, architect | include-structure, active-modules, customization-lookup, field-typing-rule |
| Analyst / Writer | analyst, writer | active-modules |
| Doc Specialist | doc-specialist | *(none — task-driven)* |
| Module Consultant | 14 module consultants | spro-lookup, customization-lookup, active-modules, configs/{MODULE}/*.md |
| Basis Consultant | bc-consultant | transport-client-rule, configs/common/*.md |

**Tier 3 (Triggered)** — unchanged from v0.5.0 (ALV, paradigm, CALL SCREEN, ECC, Cloud, module, industry, country, DDIC, FM, text, constant).

**Tier 4 (Per-Task Kit)** — unchanged (skill phase / Wave / reviewer bucket declaration).

### Added — Response Prefix Convention

Every `/sc4sap:*` skill-triggered response now begins with `[Model: <main-model> · Dispatched: <sub-summary>]` so the user sees at a glance which model is doing the work. Defined in `model-routing-rule.md` § *Response Prefix Convention*; each of the 15 `/sc4sap:*` SKILL.md files has a `<Response_Prefix>` block pointing to the convention.

### Changed

- **`common/context-loading-protocol.md`** — rewritten around the 4-tier model with role-mandatory tables.
- **25 `agents/*.md` files** — each gained a `<Mandatory_Baseline>` block identifying its role group and Tier 2 additions (at `<Agent_Prompt>` entry, before `<Role>`).
- **15 `skills/*/SKILL.md` files** — `<Response_Prefix>` block after `</Purpose>`.
- **`common/model-routing-rule.md`** — added § *Response Prefix Convention* (88 → 128 lines).
- **`CLAUDE.md`** — top intro now names the 4 tiers + the 5 Tier-1 files explicitly.

### Expected effect

- Tier 1/2 reads happen once per session, not once per turn → cache friendly.
- Tier 4 kit declarations remain minimal (narrow per wave/bucket).
- Per-dispatch token savings vs v0.5.0: additional ~15% on consultant dispatches (configs/{MODULE}/*.md no longer ambiguously loaded).
- Response prefix gives the user real-time visibility into model routing without opening transcripts.

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
