# Multi-Profile Implementation Plan

Companion to `multi-profile-design.md`. Sequences work across the three layers so each phase produces a verifiable milestone.

**Layers**:
- **L3** — seven `@babamba2/*` npm packages (`mcp-abap-adt-clients`, `mcp-abap-connection`, `mcp-abap-adt-auth-broker`, `mcp-abap-adt-auth-providers`, `mcp-abap-adt-auth-stores`, `mcp-abap-adt-header-validator`, `mcp-abap-adt-interfaces`, `mcp-abap-adt-logger`). Consumed as npm dependencies.
- **L2** — `@babamba2/abap-mcp-adt-powerup` (MCP server at `~/.claude/plugins/marketplaces/abap-mcp-adt-powerup`; depends on all L3 packages)
- **L1** — `sc4sap` plugin (skills, hooks, HUD; depends on L2)

Each phase lists **deliverables**, **verification**, and **blocking dependencies**.

---

## Architectural reuse (from existing L2 code review, 2026-04-21)

L2 already ships the infrastructure needed for hot-swapping SAP connections. **No L3 package modifications are required** for Phases 0–2:

- `src/lib/connectionEvents.ts` — `registerConnectionResetHook(fn)` + `notifyConnectionResetListeners()` fanout.
- `src/lib/clients.ts` — module-level `adtClient` cache with `resetClientCache()` already registered as a reset hook.
- `src/lib/utils.ts` — existing reset functions (lines 794/818/835/859) clear `cachedConnection` / `cachedConfigSignature` and call `notifyConnectionResetListeners()`. Config is read directly from `process.env.SAP_URL` etc. (line 1869), so overwriting `process.env.*` + firing the reset is sufficient.
- `src/server/ConnectionContext.ts` + `docs/architecture/CONNECTION_ISOLATION.md` — session-isolated multi-tenant infra (HTTP transport). Orthogonal to this feature but confirms the codebase is already multi-connection aware.

**Implication**: `ReloadProfile` is a thin MCP tool that (a) loads env from `~/.sc4sap/profiles/{alias}/sap.env`, (b) resolves keychain references, (c) overwrites `process.env.*`, (d) calls an existing reset function. Keychain resolution is the only genuinely new code; it lives in L2 (near the env loader), not in any L3 package.

Phase 0 below is accordingly collapsed to a single keychain utility. Phase 1 focuses on the tool wiring and guard.

---

## Phase 0 — Keychain resolver (L2 only)

Goal: add password-from-keychain support in the MCP server. No L3 package modifications.

| # | Layer | Deliverable |
|---|---|---|
| 0.1 | L2 | `src/lib/secrets.ts` — `resolveSecret(value: string): Promise<string>`. If `value.startsWith('keychain:')`, parse `keychain:{service}/{account}`, return `@napi-rs/keyring.getPassword(service, account)`. Otherwise return `value`. Graceful error when `@napi-rs/keyring` is unavailable (CI/docker): throw `ERR_KEYCHAIN_UNAVAILABLE` with guidance. |
| 0.2 | L2 | Add `@napi-rs/keyring` as an optional dependency (declare in `optionalDependencies`, same pattern as `node-rfc`). |
| 0.3 | L2 | Unit tests under `src/__tests__/lib/secrets.test.ts` covering: plain-string passthrough, `keychain:` parse, missing keychain entry, @napi-rs/keyring unavailable. |

**Verification**: `npm test` green (requires npm install for @napi-rs/keyring — ASK USER before running). `resolveSecret("plain")` returns `"plain"`. `resolveSecret("keychain:sc4sap/KR-DEV/DEV")` resolves against the OS keychain.

**Dependencies**: none.

---

## Phase 1 — MCP layer foundation (L2 only)

Goal: server can load a user-level profile, hot-reload it via a new `ReloadProfile` tool, and refuse mutations on non-DEV tiers. Reuses existing reset infrastructure (`notifyConnectionResetListeners`, `resetClientCache`).

| # | Layer | Deliverable |
|---|---|---|
| 1.1 | L2 | `src/lib/profile.ts` — `loadActiveProfile(): { alias, envVars, tier }`. Resolution order: `{cwd}/.sc4sap/active-profile.txt` → `~/.sc4sap/profiles/{alias}/sap.env`. Fallback to legacy `{cwd}/.sc4sap/sap.env` if active-profile.txt is absent. Calls `resolveSecret()` for `SAP_PASSWORD`. Logs which path won. |
| 1.2 | L2 | `src/lib/profile.ts` — `applyProfile(loaded)`: clear existing `SAP_*` keys from `process.env`, set new keys, cache `SAP_TIER` in a module-level variable `activeTierRef`. |
| 1.3 | L2 | On server startup (`src/server/launcher.ts` or equivalent), call `loadActiveProfile()` + `applyProfile()` BEFORE any connection is created. Keeps existing `.env` behavior intact when no profile system is in use. |
| 1.4 | L2 | `ReloadProfile` MCP tool — no args, returns `{ ok, alias, host, client, tier, readonly }`. Calls `loadActiveProfile()` + `applyProfile()` + the existing reset function that fires `notifyConnectionResetListeners()` (triggers `resetClientCache` via already-registered hook). Next tool call sees the new connection automatically. |
| 1.5 | L2 | `src/lib/readonlyGuard.ts` — tier-based guard. `guardMutation(toolName)` throws `McpError(ErrorCode.MethodNotFound, "ERR_READONLY_TIER: tool X not allowed on tier Y (alias Z). Switch to a DEV profile.")` when `activeTierRef !== 'DEV'` and toolName matches the §4 block matrix. |
| 1.6 | L2 | Wire the guard into every tool handler in the §4 matrix. Single chokepoint preferred — add the check at the tool-dispatch layer if present, else decorate each handler. |

**Verification**:
- Manual: create `~/.sc4sap/profiles/KR-DEV/sap.env` + `.sc4sap/active-profile.txt=KR-DEV`. Start server. `UpdateClass` succeeds.
- Write `active-profile.txt=KR-PRD` (with a second profile), call `ReloadProfile`, call `UpdateClass` → returns `ERR_READONLY_TIER`.
- Start server without profile system (only legacy `.sc4sap/sap.env`) → server still works; no regression for existing users.
- Rapid switch: DEV → PRD → DEV via three `ReloadProfile` calls → all three reflect correctly in subsequent tool calls (cache invalidation is clean).

**Dependencies**: Phase 0 complete (`resolveSecret` required by `loadActiveProfile`).

---

## Phase 2 — Plugin baseline (switching works)

Goal: user can list and switch between profiles they have manually placed under `~/.sc4sap/profiles/`. Safety hook is in place.

| # | Layer | Deliverable |
|---|---|---|
| 2.1 | L1 | `sap-option` skill rewrite — extract profile-listing and switch logic. `list` and `switch [alias]` subcommands work. Interactive menu via `AskUserQuestion`. `switch` writes `active-profile.txt` then calls `mcp__sap__ReloadProfile`. |
| 2.2 | L1 | PreToolUse hook (Node script, shipped in plugin). Reads active-profile.txt + sap.env, applies block matrix, returns `{ decision: "block", reason, hint }` on violation. Installs into `.claude/settings.json` (project-level) via `setup`. |
| 2.3 | L1 | Profile resolver utility (`lib/profile.ts` or equivalent) used by hook and skills — single source for `getActiveProfile()`, `getTier()`, `getProfilePaths()`. |
| 2.4 | L1 | HUD renderer reads `active-profile.txt` + `SAP_TIER` → emits `{alias} [{tier}] {🔒 if readonly}`. |

**Verification**:
- Pre-populate two profiles manually. `switch KR-DEV` → HUD shows `KR-DEV [DEV]`, tools work.
- `switch KR-PRD` → HUD shows `KR-PRD [PRD] 🔒`, `UpdateClass` blocked by hook. Disable hook → MCP still blocks (Phase 1 layer).
- `list` displays all profiles with current marker.

**Dependencies**: Phase 1 complete.

---

## Phase 3 — Profile lifecycle management

Goal: users manage profiles without hand-editing files.

| # | Layer | Deliverable |
|---|---|---|
| 3.1 | L1 | `sap-option add` wizard — alias, tier, same-company meta-copy prompt, connection fields, password capture → keychain (via L3 keychain helper invoked through a small node CLI bundled with plugin). |
| 3.2 | L1 | `sap-option remove` — confirm by alias typing, archive to `~/.sc4sap/profiles/.trash/{alias}-{iso-timestamp}/`, delete keychain entry (prompt before), refuse if alias is active. |
| 3.3 | L1 | `sap-option edit` — modify non-tier fields; re-prompt password if username changes. Tier is immutable here (force remove+add to change tier). |
| 3.4 | L1 | `sap-option purge` — remove `.trash/*` older than 7 days; `--all` flag for immediate full purge with confirmation. Optional background prune on `sap-option` invocation. |

**Verification**:
- Add `KR-DEV`, then add `KR-QA` — wizard offers KR-DEV meta copy. Confirm copied fields match.
- Remove `KR-QA` → `.trash/KR-QA-{ts}/` exists, original gone. Try to remove active profile → refused.
- Edit KR-DEV description → sap.env updated, keychain untouched.

**Dependencies**: Phase 2 complete.

---

## Phase 4 — Migration (existing users upgrade)

Goal: users who had `{cwd}/.sc4sap/sap.env` are migrated to `~/.sc4sap/profiles/{alias}/` on first run without data loss.

| # | Layer | Deliverable |
|---|---|---|
| 4.1 | L1 | `setup` and `sap-option` detect legacy `{cwd}/.sc4sap/sap.env` without sibling `active-profile.txt`. Emit mandatory prompt: alias + tier. |
| 4.2 | L1 | Migration executor: create `~/.sc4sap/profiles/{alias}/{sap.env, config.json}` (copy + rewrite password to keychain reference). Write password to OS keychain. Set `active-profile.txt` in project. |
| 4.3 | L1 | Archive original: `mv {cwd}/.sc4sap/sap.env {cwd}/.sc4sap/sap.env.legacy`. Same for `config.json` if present and not already copied. |
| 4.4 | L1 | Post-migration help output reminding how to add other companies/tiers. |

**Verification**:
- Start with current `.sc4sap/sap.env` fixture, run `sap-option` → prompted → migrated → all downstream skills still work.
- Rerun `sap-option` → no prompt (migration already done).
- Delete `~/.sc4sap/profiles/`, keep `sap.env.legacy` → manual rollback by renaming `.legacy` back works.

**Dependencies**: Phase 3 complete (needs `add` flow internals for the migration executor).

---

## Phase 5 — UX polish

Goal: cross-profile reads, validation warnings, and safety nudges.

| # | Layer | Deliverable |
|---|---|---|
| 5.1 | L1 | `resolveArtifact(path)` helper — searches current profile first, then other profiles; tags result with `from={alias}`; skills (`program-to-spec`, `analyze-cbo-obj`, `create-program`, `analyze-symptom`) call it instead of raw Read. |
| 5.2 | L1 | Validation on `add`/`edit`: tier enum, client format, tier-vs-host heuristic warnings, duplicate `(host, client)` detection. |
| 5.3 | L1 | Hook startup self-check: on first tool call in a session, if `SAP_TIER != DEV` and the PreToolUse hook is not registered in `settings.json` or its script file is missing → emit a loud warning via status (only the MCP-layer guard is active). |
| 5.4 | L1 | `.hud-mcp-probe.json` moved to per-profile location. |

**Verification**:
- With KR-QA active, read a spec originally created under KR-DEV → `ℹ from=KR-DEV (readonly)` annotation appears.
- Add a `PRD` profile with `dev.corp` in the host → warn.
- `add KR-QA` while another profile already uses same (host, client) → warn.

**Dependencies**: Phase 4 complete.

---

## Phase 6 — Documentation & release

| # | Layer | Deliverable |
|---|---|---|
| 6.1 | L1 | README updates (en/de/ja/ko) — add Multi-profile section with quick examples. |
| 6.2 | L1 | `CHANGELOG.md` entry — breaking change notice, migration steps summary. |
| 6.3 | L1 | `docs/multi-profile-migration.md` — dedicated migration guide with rollback instructions. |
| 6.4 | All | End-to-end smoke test checklist: clean install → add 3 profiles (DEV/QA/PRD) across 2 companies → switch → verify each tier's block matrix → migration from legacy → remove/purge. |
| 6.5 | All | `npm pack` + install + smoke test in a separate target repo before `npm publish` / marketplace release. |

**Dependencies**: Phase 5 complete.

---

## Critical path

```
Phase 0 (L2 keychain)  ─  Phase 1 (L2 ReloadProfile + guard)  ─┬─ Phase 2 (L1)  ─  Phase 3 (L1)  ─  Phase 4 (L1)  ─┐
                                                               │                                                    │
                                                               └─ L3 package changes NOT required for this feature  │
                                                                                                                    │
                                                                                  Phase 5 (UX polish)  ─  Phase 6 ──┘
```

Phases 0→1→2 are strictly sequential (functional dependency). Phase 5 items can be parallelized with Phase 4 once Phase 3 is done. No L3 npm package needs republishing — everything lives in L1 (sc4sap plugin) and L2 (abap-mcp-adt-powerup).

## Risk register

| Risk | Mitigation |
|---|---|
| `@napi-rs/keyring` prebuilt binary missing for customer's OS/arch, or keychain daemon absent (headless Linux/docker/CI) | Graceful fallback: `resolveSecret` detects load failure, surfaces `ERR_KEYCHAIN_UNAVAILABLE`. Documented escape hatch `SAP_PASSWORD_STORAGE=file` using AES-encrypted sidecar file with a machine-derived key. Not default. |
| User disables hook; MCP guard is their only defense | Phase 5.3 startup warning + docs emphasize the MCP layer; release note calls this out. |
| Legacy `.sc4sap/config.json` has engagement artifacts (activeTransport with live transport number) that are Dev-only | Migration preserves them into the created DEV profile; other profiles start with empty `activeTransport`. |
| Concurrent Claude Code sessions in different projects with different active profiles | Each session reads its own `{cwd}/.sc4sap/active-profile.txt`; MCP server instances are per-session. No cross-contamination. |
| Profile deletion leaves orphan keychain entries | `remove` prompts to also delete keychain secret; `purge` cleans orphans found in `.trash/`. |

## Definition of done (per phase)

Each phase is done only when:
1. Deliverables merged.
2. Automated tests (where applicable) green.
3. Manual verification steps executed and recorded.
4. `npm pack` → install → smoke test in a clean target repo (per user's verify-before-publish preference).
