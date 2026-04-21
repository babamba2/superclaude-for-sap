# Multi-Profile Setup Gap — `/sc4sap:setup` ↔ 0.6.0 Profile Architecture

**Status**: gap analysis, 2026-04-21. Companion to [`multi-profile-design.md`](multi-profile-design.md) and [`multi-profile-implementation-plan.md`](multi-profile-implementation-plan.md).

**Scope**: realign `/sc4sap:setup` with the multi-profile architecture. `/sc4sap:sap-option` already drives profile `switch/add/edit/remove/migrate`; `setup` still writes directly to `<project>/.sc4sap/{sap.env, config.json}` as if single-profile. This document enumerates the gaps, the open decisions, and the proposed execution plan. **No code is edited here** — only analysis.

## 1. Baseline — infrastructure already in place (reuse, do not rebuild)

| Asset | Path | Role |
|---|---|---|
| Profile CLI | `scripts/sap-profile-cli.mjs` | `list / show / switch / add / remove / migrate / detect-legacy / keychain-set / keychain-delete / validate` — JSON-in / JSON-out |
| Tier guard hook | `scripts/hooks/tier-readonly-guard.mjs` | PreToolUse Layer 1 readonly enforcement per DEV/QA/PRD matrix |
| Blocklist hook | `scripts/hooks/block-forbidden-tables.mjs` | PreToolUse row-extraction guard (pre-existing) |
| Legacy detector | `scripts/legacy-migration-banner.mjs` | SessionStart banner + `sap-option` hint |
| Profile UX | `skills/sap-option/{profile-management,migration,rfc-managed-keys,standalone-tui}.md` | switch / add / edit / remove / purge / migrate |
| Artifact resolver | `common/multi-profile-artifact-resolution.md` | `work/<alias>/` read-write rules with cross-view fallthrough |
| Design docs | `docs/multi-profile-{design,implementation-plan}.md` | canonical spec |

## 2. Gaps — per wizard step (numbering follows `skills/setup/wizard-steps.md`)

| Step | Current (single-profile) | Target (multi-profile) | Effort |
|---|---|---|---|
| **0 (new)** | — | Call `sap-profile-cli.mjs detect-legacy`. If `needsMigration:true` → route to `sap-option/migration.md` and STOP. Else if no `~/.sc4sap/profiles/` exists → require `alias` + `SAP_TIER` up front (before Step 4). | L |
| **2 (System ID)** | Collects `SAP_VERSION / ABAP_RELEASE / SAP_INDUSTRY` for Step 4 | Unchanged; values land inside the profile env at Step 4. | XS |
| **4 (SAP Connection)** | Writes `<project>/.sc4sap/sap.env` | (a) collect `alias` + `SAP_TIER` + `SAP_DESCRIPTION` first; (b) stdin-pipe to `sap-profile-cli.mjs add` (writes `~/.sc4sap/profiles/<alias>/sap.env`, stores password in OS keychain via `keychain:sc4sap/<alias>/<user>`); (c) write `<project>/.sc4sap/active-profile.txt=<alias>`; (d) DO NOT write `<project>/.sc4sap/sap.env` | L |
| **4bis (RFC backend)** | `SAP_RFC_*` written to `<project>/.sc4sap/sap.env` | Write to `~/.sc4sap/profiles/<alias>/sap.env` | S |
| **5 (Reconnect MCP)** | `/mcp` reconnect | Unchanged — `ReloadProfile` picks up new env via `active-profile.txt` | XS |
| **6 (Connection Test)** | `GetSession` | Unchanged | — |
| **7 (Persist systemInfo)** | `<project>/.sc4sap/config.json.systemInfo` | `~/.sc4sap/profiles/<alias>/config.json.systemInfo` | S |
| **9 (ABAP utility objects)** | Create `ZMCP_ADT_UTILS` + `ZCL_S4SAP_CM_*` once per project | **Tier-gated + system-scoped**. (a) If `SAP_TIER ∈ {QA, PRD}` → REFUSE install; print CTS import guidance and skip. (b) If `SAP_TIER=DEV` → dedup by `SAP_URL + SAP_CLIENT` (already captured, no connection needed); if a sibling DEV profile on the same system already installed, skip with a note; else install. Sentinel file: `~/.sc4sap/profiles/<alias>/.abap-utils-installed` containing `{installedAt, dedupKey, objects:[...]}`. | M |
| **10 (Write config.json)** | `<project>/.sc4sap/config.json` carries version / release / industry / modules | Those fields move to `~/.sc4sap/profiles/<alias>/config.json`. Project `config.json` keeps only engagement state (`activeTransport`) or is omitted. | M |
| **11 (SPRO + Customizations)** | `<project>/.sc4sap/{spro-config.json, customizations/}` | `<project>/.sc4sap/work/<alias>/{spro-config.json, customizations/}` per artifact-resolver | S |
| **12 (PreToolUse hook)** | Installs `block-forbidden-tables.mjs` only | Install BOTH `block-forbidden-tables.mjs` AND `tier-readonly-guard.mjs` | S |
| **13 (HUD)** | Already reads `active-profile.txt` | No change | — |

## 3. File-by-file work list

1. **`skills/setup/SKILL.md`** — Usage/Notes rewrite: profile semantics, detect-legacy routing, migration link.
2. **`skills/setup/wizard-steps.md`** — insert Step 0; rewrite Steps 4 / 4bis / 7 / 10 / 11 / 12; adjust Step 9 to system-scoped.
3. **`skills/setup/wizard-step-04-profile-creation.md`** (NEW) — alias + tier + connection + keychain flow; fallback to migration; same-company meta-copy prompt.
4. **`skills/setup/wizard-step-12-blocklist-hook.md`** — add `tier-readonly-guard.mjs` registration alongside the blocklist hook.
5. **`skills/setup/rfc-backend-selection.md`** — retarget writes to `~/.sc4sap/profiles/<alias>/sap.env`.
6. **`skills/setup/{spro-auto-generation,customization-auto-generation}.md`** — artifact paths move under `work/<alias>/`.
7. **`skills/setup/wizard-step-09-abap-objects.md`** — system-dedup sentinel logic.
8. **`skills/setup/wizard-step-11-optional-extraction.md`** — path updates only.

All edits ride on existing `sap-profile-cli.mjs` contracts — no CLI changes required.

## 4. Decisions — RESOLVED 2026-04-21

1. **Existing `<project>/.sc4sap/{sap.env, config.json}` in this repo** → **migrate** into a named profile (e.g. `KR-DEV`) via `sap-profile-cli.mjs migrate`.
2. **Step 9 system-dedup key** → `SAP_URL + SAP_CLIENT` (cheap, pre-connect). **Hard constraint**: Step 9 runs ONLY when `SAP_TIER=DEV`. QA/PRD profiles MUST NOT install ABAP objects; the wizard prints a CTS import recommendation instead (transport the utility FG from a DEV system to QA/PRD via the standard TMS route).
3. **Project-local `.sc4sap/config.json`** → **delete entirely** after successful migration. All profile-scoped state lives under `~/.sc4sap/profiles/<alias>/config.json`; engagement state (`activeTransport`, naming convention) migrates into the profile config too. Project folder keeps only `active-profile.txt` + `work/<alias>/` artifacts.
4. **Step 12 hook install target** → `.claude/settings.json` (project-level). User-level migration is a separate follow-up, not part of this work.
5. **`setup {mcp,spro,customizations}` with no active profile** → **error out** with a direct pointer to `/sc4sap:setup` (full wizard) or `/sc4sap:sap-option` (if profiles already exist).

## 5. Proposed execution order

- ~~**Phase A1** — this document~~ ✅ done
- ~~**Phase A2** — §4 decisions~~ ✅ resolved 2026-04-21
- **Phase A3** — edit files listed in §3, bottom-up: companion files first, then `wizard-steps.md`, then `SKILL.md`.
- **Phase A4** — dry-run full wizard on this repo. Verify:
  - migration produces `~/.sc4sap/profiles/<alias>/` and archives `<project>/.sc4sap/sap.env.legacy`
  - `<project>/.sc4sap/config.json` is removed (per decision §4.3)
  - `/mcp` reconnects; `ReloadProfile` returns `{ok, alias, tier}`
  - `tier-readonly-guard.mjs` blocks `UpdateClass` when tested against a dummy PRD profile
  - Step 9 refuses on QA/PRD and prints CTS import guidance
  - Step 11 SPRO extraction lands under `work/<alias>/spro-config.json`
- **Phase A5** — update README (en/de/ja/ko), CHANGELOG, and `docs/multi-profile-migration.md`.

## 6. Out of scope

- L2 (`abap-mcp-adt-powerup`) changes — already complete per implementation-plan Phase 1.
- L3 npm package changes — not required.
- New skills beyond `setup` edits — `sap-option` already handles profile lifecycle.
- Standalone TUI — already covered by `sap-option/standalone-tui.md`.

---

**Next action**: approve the document, answer §4 decisions (or say "go with defaults"), and I begin §3 edits.
