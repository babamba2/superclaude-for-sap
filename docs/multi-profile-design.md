# Multi-Profile Design (Dev / QA / Prod multi-connection)

**Status**: Design finalized 2026-04-21 — not yet implemented.
**Scope**: sc4sap plugin + abap-mcp-adt-powerup MCP server + mcp-abap-adt-clients library.

---

## Problem

Multinational SAP customers run a 3-tier (Dev/QA/Prod) landscape per legal entity, often with several companies. A single user needs to:

- Connect to any of N×3 systems (KR-DEV, KR-QA, KR-PRD, US-DEV, US-PRD, ...).
- Switch contexts during a session without restarting Claude Code.
- Be protected from accidentally running destructive operations against QA or Prod.

The current plugin stores one system in `.sc4sap/sap.env` + `.sc4sap/config.json`.

## Core principle

**Safety is not memory, it is code.** Tier-based readonly enforcement must be enforced by plugin-shipped hooks and MCP-server guards, not by user configuration or documentation. A first-time plugin user creating `KR-PRD` must get readonly enforcement without opting in.

---

## 1. Directory layout

### User home (profile definitions — shared across repos)

```
~/.sc4sap/
└── profiles/
    ├── KR-DEV/{sap.env, config.json}
    ├── KR-QA/ {sap.env, config.json}
    ├── KR-PRD/{sap.env, config.json}
    ├── US-DEV/
    ├── US-PRD/
    └── .trash/{alias}-{timestamp}/     # 7-day auto-purge
```

### Project root (artifacts — per-profile isolation)

```
{project}/.sc4sap/
├── active-profile.txt                  # e.g., "KR-DEV"
├── sap.env.legacy                      # migration backup (rollback)
└── work/
    ├── KR-DEV/{program, cbo, customizations, audit}/
    ├── KR-QA/ {program, cbo, ...}/
    └── KR-PRD/{program, cbo, ...}/
```

### Rationale

- **Profile definitions** are system-scoped (host/user/pwd/tier) — shared across repos via user home.
- **Artifacts** (generated specs, audit logs, CBO catalogs) are engagement-scoped — live with the project.
- **Per-profile artifact isolation** prevents QA work from overwriting DEV work while allowing **read-only cross-view** (see §7).

---

## 2. Profile schema

### `profiles/{alias}/sap.env`

```
# Connection
SAP_URL=http://dev.kr.corp:50000
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=DEVELOPER
SAP_PASSWORD=keychain:sc4sap/KR-DEV/DEVELOPER    # OS keychain reference
SAP_LANGUAGE=EN
SAP_SYSTEM_TYPE=onprem

# System metadata
SAP_VERSION=S4
ABAP_RELEASE=816
SAP_INDUSTRY=tire
SAP_ACTIVE_MODULES=MM,SD,FI,CO,PP
SAP_RFC_BACKEND=soap

# Tier + description (NEW)
SAP_TIER=DEV                # enum: DEV | QA | PRD   (required)
SAP_DESCRIPTION="Korea Development"

# Table-access blocklist (unchanged)
MCP_BLOCKLIST_PROFILE=standard
MCP_BLOCKLIST_EXTEND=
MCP_ALLOW_TABLE=
```

`SAP_TIER` is an enum validated on load. Non-canonical tiers (SBX, STG, PRE-PRD, TRN) map to the closest canonical value via convention — the alias carries the precise name.

| Customer tier | `SAP_TIER` | Rationale |
|---|---|---|
| Sandbox | `DEV` | Write-enabled, throwaway |
| Integration | `QA` | Read + unit tests |
| Staging | `PRD` | Safe default — treat as prod |
| Pre-Prod | `PRD` | |
| Training | `QA` | Usually writable at app layer but not by tooling |

### `profiles/{alias}/config.json`

Keeps the existing fields (`activeTransport`, `namingConvention`, `systemInfo`, `blocklistProfile`, …) but per-profile.

### Secrets

Passwords **never** live in plaintext `.env`. They are stored in the OS keychain:

| OS | Backend |
|---|---|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret |

The `sap.env` line `SAP_PASSWORD=keychain:sc4sap/{alias}/{user}` is a reference that the MCP server resolves at connect time via `keytar`.

---

## 3. Readonly enforcement — Defense in Depth

### Layer 1: PreToolUse hook (fast, user-friendly)

Ships with the plugin (`.claude/settings.json` installed by `sap-option` / `setup`). On every MCP tool invocation:

1. Read `{project}/.sc4sap/active-profile.txt` → `alias`.
2. Read `~/.sc4sap/profiles/{alias}/sap.env` → `SAP_TIER`.
3. Apply the block matrix (§4). If blocked, reject with a structured error message so the LLM understands **why** and can explain to the user.

### Layer 2: MCP server guard (uncircumventable)

`abap-mcp-adt-powerup` attaches a `@readonly(tier)` decorator to every mutation tool. The decorator reads the tier cached at `ReloadProfile` time and returns `ERR_READONLY_TIER` if violated. This layer fires even when the hook is missing, misconfigured, manually edited out of `settings.json`, or the plugin has not been installed yet (MCP server connected directly without the sc4sap plugin).

### Why both layers

- Hook gives the LLM a **fast**, **contextual** rejection *before* a wire request is sent.
- MCP guard is the **last line of defense** and the one that survives misconfiguration. Hook-only would leave a bypass; MCP-only would waste tokens (the LLM has to interpret a server error instead of seeing a clean pre-call rejection).

---

## 4. Block matrix (Strict policy)

| Tool family | DEV | QA | PRD |
|---|---|---|---|
| `Create*` / `Update*` / `Delete*` (DDIC, ABAP, CDS, BO, SB, MDE, Screen, GUI Status, Text Element, Package) | ✓ | ✗ | ✗ |
| `CreateTransport` | ✓ | ✗ | ✗ |
| `RunUnitTest` | ✓ | ✓ | ✗ |
| `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` | ✓ | ✗ | ✗ |
| `RuntimeAnalyzeDump` / `RuntimeGetDumpById` / `RuntimeListDumps` | ✓ | ✓ | ✓ |
| `RuntimeAnalyzeProfilerTrace` / `RuntimeGet/ListProfilerTrace*` | ✓ | ✓ | ✓ |
| `Get*` / `Read*` / `Search*` / `List*` | ✓ | ✓ | ✓ |
| `ValidateServiceBinding` (read-only validation) | ✓ | ✓ | ✓ |
| `GetTableContents` / `GetSqlQuery` | gated by existing blocklist profile (orthogonal to tier) |

`CreateTransport` is blocked in QA/PRD because these tiers cannot originate changes. An existing transport *number* may still be pinned into `config.json.activeTransport` for read context via `GetTransport`.

---

## 5. `sap-option` UX

Invoked as `/sc4sap:sap-option` (interactive) or with subcommands:

| Subcommand | Purpose |
|---|---|
| (none) | Menu: active profile summary + actions |
| `switch [alias]` | Change active profile; triggers `ReloadProfile` on MCP |
| `add` | Wizard: alias → tier → (same-company meta copy prompt) → host/client/user/pwd(→keychain) |
| `remove [alias]` | Archive to `.trash/{alias}-{timestamp}/`; requires alias re-typing; rejects if `alias` is active |
| `list` | Show all profiles with tier badges and active marker |
| `purge` | Permanently delete `.trash/*` older than 7 days (or explicit) |
| `edit [alias]` | Change non-critical fields (tier is immutable via this path) |

Interactive menus are built with Claude Code's built-in **`AskUserQuestion`** tool — no external TUI library needed. Options are generated dynamically from the `profiles/` directory; each option's `preview` field shows connection details and allowed-tools matrix for the selected profile.

### `add` wizard — same-company meta copy

When the new alias shares a prefix with an existing profile (e.g., adding `KR-QA` while `KR-DEV` exists), the wizard offers to copy `SAP_INDUSTRY`, `SAP_ACTIVE_MODULES`, `SAP_LANGUAGE`, `SAP_VERSION`, `ABAP_RELEASE`, and `namingConvention` from the sibling. Connection fields (host/client/user/password) are always entered fresh.

---

## 6. Migration (existing single-profile users)

On first run after upgrading, `sap-option` / `setup` detects legacy `.sc4sap/sap.env` and performs a **mandatory** prompt:

```
⚙  sc4sap upgrade detected — switching to profile-based multi-connection.

Legacy .sc4sap/sap.env found.

  • Alias for this connection? (e.g., KR-DEV, KR-PRD)
    > KR-DEV
  • Tier? [DEV | QA | PRD]
    > DEV

✔ Created ~/.sc4sap/profiles/KR-DEV/sap.env
✔ Created ~/.sc4sap/profiles/KR-DEV/config.json  (from legacy config.json)
✔ Moved password to OS keychain (sc4sap/KR-DEV/{user})
✔ Archived legacy → .sc4sap/sap.env.legacy
✔ Set active-profile → KR-DEV

ℹ  Add other companies/tiers with `sap-option add`.
```

No auto-naming (`default` is forbidden) — the user must supply a meaningful alias so multinational installs do not end up with ambiguous profiles.

---

## 7. Cross-profile artifact access

Artifacts are per-profile but reads fall through:

- **Read** `work/{active}/program/ZMMR_X/spec.md`:
  1. Current profile → hit ⇒ done.
  2. Else scan other profiles → first hit, annotate `ℹ from={origin} (readonly)`.
- **Write** any artifact: always goes to `work/{active}/...` regardless of where a read found the file.

This lets a QA session reference a DEV-produced spec while keeping QA outputs (qa-report, regression log) isolated.

A pluggable `resolveArtifact(path)` helper in the skill layer encapsulates this logic; skills call it instead of raw `Read`.

---

## 8. HUD rendering

```
│ KR-DEV  [DEV]     • tokens: 23.5k/100k                 │
│ KR-QA   [QA] 🔒   • tokens: 23.5k/100k                 │
│ KR-PRD  [PRD] 🔒  • tokens: 23.5k/100k                 │
```

- Alias (always shown).
- Tier badge `[DEV]` / `[QA]` / `[PRD]`.
- 🔒 iff `SAP_TIER ∈ {QA, PRD}`.
- No color — avoids conflicting with terminal themes and keeps the signal single-channel (lock icon).

---

## 9. MCP reconnection

New MCP tool `ReloadProfile` (no arguments):

1. Read `{cwd}/.sc4sap/active-profile.txt` → `alias`.
2. Read `~/.sc4sap/profiles/{alias}/sap.env`.
3. Resolve `SAP_PASSWORD=keychain:...` via `keytar`.
4. Close existing HTTP client, build a new one.
5. Cache `SAP_TIER` for Layer 2 readonly guard.
6. Return `{ ok, alias, host, tier, readonly }`.

The `sap-option switch` skill writes `active-profile.txt` then calls `mcp__sap__ReloadProfile()`. Session context is preserved — no Claude Code restart required.

The PreToolUse hook is stateless: it rereads `active-profile.txt` + `sap.env` on every tool call, so it picks up the new tier automatically without any signal.

---

## 10. Validation

On profile `add`/`edit`:

- `SAP_TIER` must be one of `DEV|QA|PRD` (enum).
- `SAP_CLIENT` is a 3-digit string.
- If `SAP_TIER=PRD` and `SAP_URL` contains `dev`/`qa`/`test`/`sbx` substrings → warn (not block).
- Duplicate detection: same `(host, client)` as an existing profile → warn.
- Password for a keychain-backed profile is prompted only on creation/edit; re-use thereafter.

---

## 11. Open edges (not yet decided)

- **Hook settings location**: `~/.claude/settings.json` (user-level, applies to all projects) vs `.claude/settings.json` (project-level). User-level is preferred so new projects inherit safety automatically; to be confirmed during implementation.
- **Transport pinning in readonly tiers**: `CreateTransport` is blocked, but pinning an existing transport in `activeTransport` should remain possible via `GetTransport` + manual pin in `sap-option`. Exact UX TBD.
- **`.hud-mcp-probe.json` scope**: remains project-level. The probe tests local MCP process existence (regex match on `node` processes), not SAP host reachability — so it is orthogonal to the active profile. `.hud-usage.json` / `.hud-week.json` likewise stay project-level.
- **Hook self-check on startup**: if `SAP_TIER != DEV` and the PreToolUse hook is not registered (missing from `settings.json`, file absent, or reports unhealthy) → emit a loud warning via status so the user knows only the MCP-layer guard is protecting them.
