---
name: sc4sap:trust-session
description: INTERNAL-ONLY permission bootstrap. Pre-approves Agent dispatch + `.sc4sap/` state-file I/O for the session so parent-skill pipelines run without prompts. SAP MCP handlers are auto-approved by the `permission-approver` PreToolUse hook (except GetTableContents / GetSqlQuery, which stay prompt-gated). MUST be invoked by a parent skill (create-program, setup, team, analyze-*, create-object) — direct user invocation is rejected with a redirect message.
level: 2
internal: true
model: haiku
---

# SC4SAP Trust Session (Internal-Only)

Session-scoped permission bootstrap for automated pipelines. When a long-running parent skill enters its automated phases, sub-agent dispatch (`Agent`/`Task`) and `.sc4sap/` state-file writes would otherwise trigger permission prompts. This skill pre-grants those so the parent pipeline proceeds uninterrupted.

**⚠️ This skill is NOT user-facing.** It exists only as a sub-routine of other skills. Direct `/sc4sap:trust-session` invocation by the user is rejected — see `<Standalone_Invocation_Refusal>` below.

<Permission_Model_Note>
**SAP MCP handler permissions are NOT managed by this skill anymore.** They are auto-approved at call time by the `permission-approver` PreToolUse hook (`scripts/permission-approver.mjs`, wired in `hooks/hooks.json`), which returns `permissionDecision: "allow"` for every `mcp__plugin_sc4sap_sap__*` / `mcp__mcp-abap-adt__*` tool except the two row-data extraction tools (`GetTableContents`, `GetSqlQuery`), which fall through to normal prompting plus the `block-forbidden-tables` safeguard. The hook runs in BOTH the main thread and sub-agents, regardless of session permission mode — this replaces the former `settings.local.json` MCP enumeration and the deprecated `mode: "dontAsk"` Agent-dispatch parameter (ignored by current Claude Code; sub-agents now inherit the parent session's permission mode). trust-session therefore only handles the NON-MCP grants below.
</Permission_Model_Note>

<Purpose>
Pre-approve the non-MCP operations an automated parent pipeline needs — sub-agent dispatch and `.sc4sap/` runtime-state I/O — by writing a scoped allowlist to `.claude/settings.local.json`. Must ride on the authority of a parent skill so the grant is contextual, not a blanket user-initiated one.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Standalone_Invocation_Refusal>
**MANDATORY gate — runs as Step 0 before any file write.**

Detect whether this skill is being invoked standalone or by a parent skill:
- **Parent skill present**: the invocation is chained from `/sc4sap:create-program`, `/sc4sap:setup`, `/sc4sap:analyze-cbo-obj`, `/sc4sap:analyze-code`, `/sc4sap:analyze-symptom`, or `/sc4sap:create-object`. The caller passes `parent_skill={name}` as the first argument OR the invocation appears inside another skill's execution trace in the current turn.
- **Standalone (no parent)**: user typed `/sc4sap:trust-session` directly, or the arguments do not identify a known parent.

**On standalone invocation, refuse and redirect**:

```
⚠️ /sc4sap:trust-session is an internal-only skill. Direct invocation is not allowed.

To grant session-wide permissions for an automated pipeline, run one of the following
parent skills instead (each auto-invokes trust-session at entry):

  • /sc4sap:create-program       — program creation pipeline (invokes at Phase 1)
  • /sc4sap:create-object        — single object creation
  • /sc4sap:analyze-cbo-obj      — CBO package inventory walk
  • /sc4sap:analyze-code         — code review
  • /sc4sap:analyze-symptom      — dump / error root-cause analysis

→ A separate trust-session run is unnecessary — the parent skill handles it for you.
```

After printing the message, STOP. Do NOT modify `.claude/settings.local.json`. Do NOT write `.sc4sap/session-trust.log`.
</Standalone_Invocation_Refusal>

<Use_When>
- Called automatically as Phase 0 / entry step of a parent skill (see list above)
- Parent skill passes `parent_skill={name}` argument to identify itself
</Use_When>

<Do_Not_Use_When>
- User types `/sc4sap:trust-session` directly → refuse per `<Standalone_Invocation_Refusal>`
- Running on a production SAP system without change authorization
</Do_Not_Use_When>

<What_This_Skill_Does>
Single-layer, non-MCP permission grant written to `.claude/settings.local.json` → `permissions.allow` (project-local, persists). **Scope policy: sub-agent dispatch + `.sc4sap/` state I/O only. SAP MCP is handled by the hook; everything else stays prompt-gated.**

- **Sub-agent dispatch — allowed**:
  - `Agent(*)` — required so parallel review fan-out and any other sub-agent dispatch run without prompts. Each sub-agent's MCP calls are still auto-approved individually by the `permission-approver` hook; its non-MCP tool calls follow this same allowlist.
- **Internal state file I/O — allowed (path-scoped)**:
  - `Write(.sc4sap/**)`, `Edit(.sc4sap/**)` — runtime state files only (`state.json`, `spec.md`, `plan.md`, `review.md`, `report.md`, `cbo/**`, `session-trust.log`, etc.). Writes outside `.sc4sap/**` still prompt.
  - `Read(.sc4sap/**)`, `Read(sc4sap/**)` — read project state and rule files.
  - `Glob(.sc4sap/**)`, `Glob(sc4sap/**)`, `Grep(.sc4sap/**)`, `Grep(sc4sap/**)` — search within project and state folders.
- **Everything else — NOT added to allow** (normal prompt behavior preserved):
  - `Bash(...)` — prompt per command.
  - `Write` / `Edit` outside `.sc4sap/**` — prompt (protects `sc4sap/` source, `.claude/`, elsewhere).
  - `WebFetch` / `WebSearch` and any non-SAP MCP namespace (`mcp__claude_ai_Notion__*`, `mcp__ide__*`, …) — prompt.
  - SAP MCP handlers — NOT added here; the hook approves them at call time (do NOT enumerate them in `settings.local.json`).

Idempotent: if an entry already exists, do not duplicate.

**Row-data extraction stays gated**: `GetTableContents` / `GetSqlQuery` (both namespaces) are never auto-approved — the hook passes them through to the normal prompt, and `block-forbidden-tables` enforces the blocklist. See `common/data-extraction-policy.md`.
</What_This_Skill_Does>

<Execution_Steps>
0. **Standalone gate** — if `<Standalone_Invocation_Refusal>` conditions match, refuse and STOP.
1. Read `.claude/settings.local.json` (create `{"permissions":{"allow":[]}}` skeleton if missing).
2. **Strip forbidden broad entries if present** — remove these from `permissions.allow` when found (they violate the scoped policy):
   - Broad wildcards: `Read(*)`, `Write(*)`, `Edit(*)`, `Glob(*)`, `Grep(*)`.
   - SAP MCP entries added by a prior version or by an "Always allow" click — the hook now owns MCP approval, so enumerated `mcp__plugin_sc4sap_sap__*` / `mcp__mcp-abap-adt__*` entries are redundant and the wildcards `mcp__plugin_sc4sap_sap__*` / `mcp__mcp-abap-adt__*` MUST be removed (a wildcard would silently auto-approve `GetTableContents` / `GetSqlQuery`, defeating the safeguard). Removing enumerated non-gated MCP entries is optional cleanup; removing the two gated tools and any MCP wildcard is MANDATORY.
   - Non-SAP MCP wildcards: `mcp__claude_ai_Notion__*`, `mcp__ide__*`.
3. **Append scoped entries** to `permissions.allow` only if not already present:
   ```
   Agent(*)
   Read(.sc4sap/**)
   Read(sc4sap/**)
   Write(.sc4sap/**)
   Edit(.sc4sap/**)
   Glob(.sc4sap/**)
   Glob(sc4sap/**)
   Grep(.sc4sap/**)
   Grep(sc4sap/**)
   ```
4. Preserve all other existing entries verbatim (env, hooks, other permissions).
5. Write the updated JSON back with 2-space indent.
6. Print one-line confirmation: `"✅ Session trust granted by {parent_skill} — Agent dispatch + .sc4sap/ state I/O auto-approved. SAP MCP handlers are auto-approved by the permission-approver hook; Bash, WebFetch, Write/Edit outside .sc4sap/, GetTableContents, GetSqlQuery remain prompt-gated."`
7. Record activation in `.sc4sap/session-trust.log` (append line: `{ISO-timestamp} granted-by={parent_skill}`) for audit.
</Execution_Steps>

<Enforcement_Contract>
- Parent skills invoke `trust-session` with `parent_skill={self-name}` at entry, before their first sub-agent dispatch.
- SAP MCP permission prompts are handled by the `permission-approver` hook — parent skills do NOT pass any `mode` parameter to `Agent` (the parameter is deprecated and ignored by current Claude Code).
- If the user has `DISABLE_SC4SAP=1` (or `DISABLE_OMC=1`) set, skip the allowlist writes and warn.
- **Standalone refusal is non-negotiable** — even if the user insists, the refusal message stands.
</Enforcement_Contract>

<Revocation>
To revoke: user runs `/sc4sap:sap-option` → permissions tab → "revoke session trust", which strips the `Agent(*)` and `.sc4sap/`-scoped entries from `settings.local.json`. Per-tool prompts resume on next run. SAP MCP auto-approval is disabled separately via `DISABLE_SC4SAP=1` (turns off the hook).
</Revocation>

<State_Files>
- `.claude/settings.local.json` — permissions allowlist (modified)
- `.sc4sap/session-trust.log` — audit trail
</State_Files>

Task: {{ARGUMENTS}}
