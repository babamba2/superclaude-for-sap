# Features Deep-Dive

← [Back to README](../README.md) · [Installation →](INSTALLATION.md)

## Table of Contents

- [25 SAP-Specialized Agents](#25-sap-specialized-agents)
- [18 Skills](#18-skills)
- [Skills — Examples & Workflow](#skills--examples--workflow)
- [MCP ABAP ADT Server Capabilities](#mcp-abap-adt-server--unique-capabilities)
- [Shared Conventions](#shared-conventions-common)
- [Context Loading Architecture (v0.5.2+)](#context-loading-architecture-v052)
- [Response Prefix Convention (v0.5.2+)](#response-prefix-convention-v052)
- [Industry Reference](#industry-reference-industry)
- [Country / Localization](#country--localization-reference-country)
- [Active-Module Integration](#active-module-integration)
- [SAP Platform Awareness](#sap-platform-awareness-ecc--s4-on-prem--cloud)
- [SPRO Configuration Reference](#spro-configuration-reference)
- [SAP-Specific Hooks](#sap-specific-hooks)
- [Data Extraction Blocklist](#-data-extraction-blocklist)
- [acknowledge_risk HARD RULE](#-acknowledge_risk--hard-rule)
- [RFC Backend Selection](#-rfc-backend-selection)
- [RFC Gateway (Enterprise)](#-rfc-gateway-enterprise-deployment)

## 25 SAP-Specialized Agents

| Category | Agents |
|----------|--------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — system admin, transport management, diagnostics |
| **Modules (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**Delegation map (Module Consultation Protocol):**
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` → `sap-{module}-consultant` (business semantics) or `sap-bc-consultant` (system-level)
- `sap-architect` → `## Consultation Needed` → `sap-bc-consultant` (transport strategy, authorization, performance, sizing, patching) or module consultant
- `sap-analyst` / `sap-critic` / `sap-planner` additionally have mandatory **Country Context** block (loads `country/<iso>.md`)
- **Direct MCP read access** for Core agents — package / DDIC / class / program / where-used / runtime-dump tools carry read-only access; write CRUD stays on `sap-executor` / `sap-planner` / `sap-writer` / `sap-qa-tester` / `sap-debugger`

## 16 Skills

| Skill | Description |
|-------|-------------|
| `sc4sap:setup` | Plugin setup — auto-installs MCP server, generates SPRO config, installs blocklist hook |
| `sc4sap:mcp-setup` | Standalone MCP ABAP ADT server install / reconfigure guide |
| `sc4sap:sap-option` | View / edit `.sc4sap/sap.env` (credentials, RFC backend, blocklist, active modules) |
| `sc4sap:sap-doctor` | Plugin + MCP + SAP diagnostics (6 layers) |
| `sc4sap:create-object` | ABAP object creation (hybrid mode — transport + package confirm, create, activate) |
| `sc4sap:create-program` | Full ABAP program pipeline — Main+Include, OOP/Procedural, ALV, Dynpro, Text Elements, ABAP Unit |
| `sc4sap:program-to-spec` | Reverse-engineer an ABAP program into a Functional/Technical Spec (Markdown / Excel) |
| `sc4sap:compare-programs` | Side-by-side business comparison of 2–5 ABAP programs that split the same scenario by module / country / persona — consultant-facing Markdown report |
| `sc4sap:analyze-code` | ABAP code analysis (Clean ABAP / performance / security) |
| `sc4sap:analyze-cbo-obj` | Customer Business Object (CBO) inventory scanner with cross-module gap analysis |
| `sc4sap:analyze-symptom` | Step-by-step SAP operational error/symptom analysis (dumps, logs, SAP Note candidates) |
| `sc4sap:ask-consultant` | Direct user-facing Q&A with a module consultant agent (SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC). Read-only — honors the configured SAP environment. |
| `sc4sap:trust-session` | INTERNAL-ONLY — session-wide MCP permission bootstrap |
| `sc4sap:deep-interview` | Socratic requirements gathering before implementation |
| `sc4sap:team` | Coordinated parallel agent execution (native Claude Code teams) |
| `sc4sap:release` | CTS transport release workflow |

## Skills — Examples & Workflow

### `/sc4sap:create-object`
Hybrid-mode single-object creation: confirms transport + package interactively, then creates, scaffolds, and activates.
```
/sc4sap:create-object
→ "Create a class ZCL_SD_ORDER_VALIDATOR in package ZSD_ORDER"
```
Flow: type inference → package + transport confirm → MCP `Create*` → initial implementation → `GetAbapSemanticAnalysis` → activate.

### `/sc4sap:create-program`
Flagship program creation pipeline — Main + Include wrapping, OOP or Procedural, full ALV + Dynpro support.
```
/sc4sap:create-program
→ "Make an ALV report for open sales orders, selection screen by sales org + date range"
```
Flow (Phase 0–8):
- Phase 0 — SAP version preflight + active modules load
- Phase 1A — module consultant business interview (industry/country preflight, business purpose, standard-SAP alternative)
- Phase 1B — `sap-analyst` + `sap-architect` technical interview (7 dimensions)
- Phase 2 — planning with CBO + customization reuse gates
- Phase 3 — spec + user approval
- Phase 3.5 — execution mode gate (`auto` / `manual` / `hybrid`)
- Phase 4 — parallel include generation → batch activation
- Phase 5 — ABAP Unit
- Phase 6 — 4-bucket convention review (Sonnet parallel, Opus escalation on MAJOR findings)
- Phase 7 — debug escalation
- Phase 8 — completion report with timing table

### `/sc4sap:analyze-code`
```
/sc4sap:analyze-code
→ "Review ZCL_SD_ORDER_VALIDATOR for Clean ABAP violations and SELECT * usage"
```

### `/sc4sap:analyze-cbo-obj`
Walks a Z-package, catalogs reusable assets, runs cross-module gap analysis.
```
/sc4sap:analyze-cbo-obj
→ "Scan ZSD_ORDER package for MM module reuse candidates"
```
Flow: `GetPackageTree` → category walk → frequency heuristics → cross-module gap check → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.

### `/sc4sap:analyze-symptom`
```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_POSTING at line 234 during F110"
```
Flow: `RuntimeListDumps` → `RuntimeAnalyzeDump` → stack trace → SAP Note candidates → remediation options.

### `/sc4sap:program-to-spec`
Reverse-engineer an ABAP program into a spec (Markdown/Excel) with Socratic scope narrowing.

### `/sc4sap:team`
Coordinated parallel agent execution via native Claude Code teams.

### `/sc4sap:release`
CTS transport release workflow — list, validate, release, confirm import.

### `/sc4sap:sap-doctor`
Plugin + MCP + SAP connectivity diagnostics. First thing to run when something's off.

### `/sc4sap:sap-option`
View and edit `.sc4sap/sap.env` — credentials, RFC backend, blocklist policy, active modules. Secrets masked.

## MCP ABAP ADT Server — Unique Capabilities

sc4sap is backed by **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)** (150+ tools). Beyond the usual Class / Program / Table / CDS / FM CRUD, it adds **full R/U/C coverage for classic Dynpro artifacts** that most MCP servers don't touch:

| Artifact | Coverage |
|----------|----------|
| **Screen (Dynpro)** | `GetScreen` / `CreateScreen` / `UpdateScreen` / `DeleteScreen` — full header + flow logic round-trip |
| **GUI Status** | `GetGuiStatus` / `CreateGuiStatus` / `UpdateGuiStatus` / `DeleteGuiStatus` — menu bar, function keys, toolbar |
| **Text Element** | `GetTextElement` / `CreateTextElement` / `UpdateTextElement` / `DeleteTextElement` — text symbols, selection texts, list headings |
| **Includes** | `GetInclude` / `CreateInclude` / `UpdateInclude` / `DeleteInclude` — Main+Include convention |
| **Local defs/macros/tests/types** | In-program local sections edited independently |
| **Metadata Extension (CDS)** | `Get/Create/Update/Delete MetadataExtension` — Fiori/UI annotation layering |
| **Behavior Definition / Implementation (RAP)** | Full RAP BDEF + BHV cycle |
| **Service Definition / Binding** | OData V2/V4 exposure + `ValidateServiceBinding` |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` discovery |
| **Runtime & Profiling** | `RuntimeAnalyzeDump`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `RuntimeGetProfilerTraceData`, `RuntimeRunProgramWithProfiling` — ST22 / SM02 / /IWFND/ERROR_LOG / SAT-style profiling from Claude |
| **Semantic / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetWhereUsed` |
| **Unit Tests** | Both ABAP Unit (`CreateUnitTest`) and CDS Unit (`CreateCdsUnitTest`) |
| **Transport** | `GetTransport`, `ListTransports`, `CreateTransport` |

## Shared Conventions (`common/`)

Cross-skill authoring rules live in `common/` so every skill and agent follows the same playbook. `CLAUDE.md` is a thin index referencing these files.

| File | Covers |
|------|--------|
| `clean-code.md` + `clean-code-oop.md` + `clean-code-procedural.md` | Clean ABAP standards, split by paradigm |
| `include-structure.md` | Main program + conditional include set (t/s/c/a/o/i/e/f/_tst) |
| `oop-pattern.md` | Two-class OOP split (`LCL_DATA` + `LCL_ALV` + `LCL_EVENT`) |
| `alv-rules.md` | Full ALV (CL_GUI_ALV_GRID + Docking) vs SALV + SALV-factory fieldcatalog |
| `text-element-rule.md` | Mandatory Text Elements — two-pass language rule (primary + `'E'` safety-net) |
| `constant-rule.md` | Mandatory CONSTANTS for non-fieldcatalog magic literals |
| `procedural-form-naming.md` | `_{screen_no}` suffix for ALV-bound FORMs |
| `naming-conventions.md` | Shared naming for programs, includes, LCL_*, screens, GUI status |
| `sap-version-reference.md` | ECC vs S/4HANA differences |
| `abap-release-reference.md` | ABAP syntax availability by release |
| `spro-lookup.md` | SPRO lookup priority (local cache → static → MCP) |
| `data-extraction-policy.md` | Agent refusal protocol + `acknowledge_risk` HARD RULE |
| `active-modules.md` | Cross-module integration matrix (MM↔PS, SD↔CO, QM↔PP, …) |
| `context-loading-protocol.md` | 4-tier on-demand file loading (global → role → triggered → per-task) |
| `model-routing-rule.md` | Sonnet / Opus / Haiku routing + Response Prefix Convention |
| `ok-code-pattern.md` | Procedural screen OK_CODE 3-step contract (TOP decl → screen NAME → PAI FORM local routing) |
| `field-typing-rule.md` | DDIC field typing priority (Standard DE → CBO DE → new DE → primitive) |
| `function-module-rule.md` | FM source convention (inline IMPORTING/EXPORTING/TABLES signature) |
| `transport-client-rule.md` | Every `CreateTransport` requires explicit client from `sap.env` |
| `ecc-ddic-fallback.md` | ECC `$TMP` helper-report path for Table/DTEL/Domain creation |
| `cloud-abap-constraints.md` | Forbidden statements + Cloud-native API replacements for S/4 Cloud Public |
| `customization-lookup.md` | Existing Z*/Y* BAdI impl / CMOD / form-exit / append reuse gate |

## Context Loading Architecture (v0.5.2+)

sc4sap's rule corpus is large — 25+ `common/*.md` + 14 `configs/{MODULE}/*.md` + 30+ industry/country files. Loading every file on every agent dispatch wastes tokens and dilutes model attention. The **4-tier context loading model** (defined in [`common/context-loading-protocol.md`](../common/context-loading-protocol.md)) separates "always-load safety rails" from "role-specific baseline" from "condition-triggered" from "per-task kit".

| Tier | When loaded | Files |
|------|-------------|-------|
| **Tier 1 — Global Mandatory** | Every agent, every skill, every session start | `data-extraction-policy.md`, `sap-version-reference.md`, `naming-conventions.md`, `context-loading-protocol.md`, `model-routing-rule.md` |
| **Tier 2 — Role-Mandatory** | Agent's role group fixed set, session start | varies by role group (see below) |
| **Tier 3 — Triggered Reads** | When a condition matches the current task | ALV → `alv-rules.md` · Procedural → `clean-code-procedural.md` + `ok-code-pattern.md` · `CALL SCREEN` → `ok-code-pattern.md` · ECC → `ecc-ddic-fallback.md` · industry/country set → corresponding file · etc. |
| **Tier 4 — Per-Task Kit** | Declared by the dispatching skill/phase/bucket | per wave in `phase4-parallel.md`, per §1-§12 in `phase6-review.md` |

### Tier 2 role groups

| Role group | Agents | Tier 2 adds |
|------------|--------|-------------|
| **Code Writer** | `sap-executor`, `sap-qa-tester`, `sap-debugger` | `clean-code.md`, `abap-release-reference.md`, `transport-client-rule.md`, `include-structure.md` (+ paradigm file) |
| **Reviewer** | `sap-code-reviewer`, `sap-critic` | `clean-code.md`, `abap-release-reference.md`, `include-structure.md` (per-bucket narrowing in Phase 6) |
| **Planner / Architect** | `sap-planner`, `sap-architect` | `include-structure.md`, `active-modules.md`, `customization-lookup.md`, `field-typing-rule.md` |
| **Analyst / Writer** | `sap-analyst`, `sap-writer` | `active-modules.md` |
| **Doc Specialist** | `sap-doc-specialist` | *(none — task-driven only)* |
| **Module Consultant** | 14 module consultants (SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba) | `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, `configs/{MODULE}/{spro,tcodes,bapi,tables,enhancements,workflows}.md` |
| **Basis Consultant** | `sap-bc-consultant` | `transport-client-rule.md`, `configs/common/*.md` |

### Enforcement

Every `agents/*.md` file declares its role group in a `<Mandatory_Baseline>` block at the top of `<Agent_Prompt>`. The agent loads Tier 1 + Tier 2 at session start before any MCP call. Skill prompts declare only Tier 4 (per-task) additions; Tier 1+2 are assumed. On a MAJOR blocker the agent returns `BLOCKED — context kit insufficient: <list>` so the skill can provide an updated kit.

### Measured effects

- Per-dispatch tokens: −40 to −60% vs pre-v0.5.0 implicit load-all pattern.
- Opus usage share in `/sc4sap:create-program`: −50% (routing matrix in `model-routing-rule.md`).
- Reviewer MAJOR-finding detection: improved — each of §1-§12 runs with only its relevant rule in context instead of skimming 12 rule files at once.

## Response Prefix Convention (v0.5.2+)

Every `/sc4sap:*` skill-triggered response begins with a one-line prefix so the user can see at a glance which model is running the work and which sub-agents were dispatched:

```
[Model: <main-model> · Dispatched: <sub-summary>]
```

Examples:

```
[Model: Opus 4.7]
— pure main-thread response, no sub-agent dispatches

[Model: Opus 4.7 · Dispatched: Sonnet×2]
— main thread + two parallel Sonnet executors (Wave 2 G4-prep text bulk)

[Model: Opus 4.7 · Dispatched: Opus×1 (planner)]
— Phase 2 planner dispatch

[Model: Opus 4.7 · Dispatched: Sonnet×3 (B3a executor range α/β/γ)]
— Multi-Executor Split per multi-executor-split.md Strategy A
```

The convention is enforced by a `<Response_Prefix>` block in every `/sc4sap:*` SKILL.md pointing to [`common/model-routing-rule.md`](../common/model-routing-rule.md) § *Response Prefix Convention*. The prefix applies only to skill-triggered turns and unrelated-pivot user messages drop the prefix on the turn they arrive.

## Industry Reference (`industry/`)

14 industry files — consulted by every `sap-*-consultant`. Each covers **Business Characteristics / Key Processes / Master Data / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls**.

Industries: retail, fashion, cosmetics, tire, automotive, pharmaceutical, food-beverage, chemical, electronics, construction, steel, utilities, banking, public-sector.

## Country / Localization Reference (`country/`)

15 per-country files + `eu-common.md` — mandatory for analyst / critic / planner. Covers **Formats / Tax System / e-Invoicing / Banking / Payroll / Statutory Reporting / SAP Country Version / Pitfalls**.

| File | Key peculiarities |
|------|-------------------|
| 🇰🇷 `kr.md` | e-세금계산서 (NTS), 사업자등록번호, 주민번호 PII |
| 🇯🇵 `jp.md` | Qualified Invoice System (2023+), Zengin, 法人番号 |
| 🇨🇳 `cn.md` | Golden Tax, 发票/e-fapiao, SAFE FX |
| 🇺🇸 `us.md` | Sales & Use Tax (no VAT), 1099, Nexus |
| 🇩🇪 `de.md` | USt, ELSTER, XRechnung / ZUGFeRD, SEPA |
| 🇬🇧 `gb.md` | VAT + MTD, BACS/FPS/CHAPS, Post-Brexit (GB vs XI) |
| 🇫🇷 `fr.md` | TVA, FEC, Factur-X 2026 |
| 🇮🇹 `it.md` | IVA, FatturaPA / SDI (mandatory since 2019) |
| 🇪🇸 `es.md` | IVA, SII (real-time 4-day), TicketBAI |
| 🇳🇱 `nl.md` | BTW, KvK, Peppol, XAF |
| 🇧🇷 `br.md` | NF-e, SPED, CFOP, PIX |
| 🇲🇽 `mx.md` | CFDI 4.0, SAT, Carta Porte, SPEI |
| 🇮🇳 `in.md` | GST, IRN e-invoice, e-Way Bill, TDS |
| 🇦🇺 `au.md` | GST, ABN, STP Phase 2, BAS |
| 🇸🇬 `sg.md` | GST, UEN, InvoiceNow, PayNow |
| 🇪🇺 `eu-common.md` | VIES, INTRASTAT, SEPA, GDPR |

Multi-country rollouts: every relevant file loads + cross-country touchpoints (intra-EU VAT, intercompany, transfer pricing, withholding) surfaced.

## Active-Module Integration

`common/active-modules.md` defines a cross-module integration matrix. When multiple modules are active, skills proactively suggest integration fields.

Example: MM PO creation in a landscape with **PS active** → suggest account assignment category `P`/`Q` + `PS_POSID` (WBS element); **CO active** → suggest cost center derivation; **QM active** → inspection lot auto-creation on GR.

Configure via `/sc4sap:setup` (Step 4) or `/sc4sap:sap-option modules`. Consumed by `create-program`, `create-object`, `analyze-cbo-obj`, all consultant agents.

## SAP Platform Awareness (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program` runs a mandatory SAP Version Preflight, reading `.sc4sap/config.json` for `sapVersion` and `abapRelease`:

- **ECC** — no RAP/ACDOCA/BP; syntax gated by release
- **S/4HANA On-Premise** — classical Dynpro warned; extensibility-first, MATDOC + ACDOCA for finance
- **S/4HANA Cloud (Public)** — **classical Dynpro forbidden**; redirects to RAP + Fiori Elements, `if_oo_adt_classrun`, or SALV-only. Full list in `common/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — prefer CDS + AMDP + RAP + Business Partner APIs

## SPRO Configuration Reference

Built-in reference data for all 14 SAP modules under `configs/{MODULE}/`:
- `spro.md` — SPRO configuration tables/views
- `tcodes.md` — Transaction codes
- `bapi.md` — BAPI/FM reference
- `tables.md` — Key tables
- `enhancements.md` — BAdI / User Exit / BTE / VOFM
- `workflows.md` — Development workflows

Modules: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW.

### SPRO Local Cache (Token-Saving)

`/sc4sap:setup spro` extracts customer-specific SPRO customizing into `.sc4sap/spro-config.json`. Consultants follow `common/spro-lookup.md`:
1. Local cache → 2. Static references → 3. Live MCP query (with confirmation).

## SAP-Specific Hooks

- **SPRO Auto-Injection** — Haiku LLM classifies user input and injects relevant module SPRO config
- **Transport Validation** — Checks transport exists before MCP Create/Update
- **Auto-Activation** — Triggers ABAP object activation after creation/modification
- **Syntax Checker** — Auto-runs semantic analysis on ABAP errors
- **🔒 Data Extraction Blocklist** — `PreToolUse` hook blocks row extraction from sensitive SAP tables

## 🔒 Data Extraction Blocklist

Defense-in-depth layer preventing row data from sensitive tables (PII, credentials, payroll, banking, transactional finance) via `GetTableContents` / `GetSqlQuery`.

**Four enforcement layers**: L1 agent instructions · L2 global directive in `CLAUDE.md` · L3 Claude Code `PreToolUse` hook · L4 MCP server env-gated guard.

**Blocklist source**: `exceptions/table_exception.md` is the index; actual lists live in 11 per-section files under `exceptions/`.

| Tier | Coverage |
|------|----------|
| minimal | Banking/Payment, Master-data PII, Addresses, Auth/Security, HR/Payroll, Tax/Govt IDs, Pricing/Conditions, custom `Z*` PII patterns |
| standard | + Protected Business Data (VBAK/BKPF/ACDOCA/VBRK/EKKO/CDHDR/STXH + CDS) |
| strict | + Audit/Security logs, Communication/Workflow |

**Actions**: `deny` (blocked) vs `warn` (proceeds with warning block). If any table in a call is `deny` → whole call blocked.

**Profiles** (picked during `/sc4sap:setup`): `strict` / `standard` / `minimal` / `custom`. Site-specific additions via `.sc4sap/blocklist-extend.txt`.

**Install** (automated by `/sc4sap:setup`; manual):
```bash
node scripts/install-hooks.mjs            # user-level
node scripts/install-hooks.mjs --project  # project-level
```

**Verify**:
```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# Expected: JSON with "permissionDecision":"deny"
```

**L4 server-side enforcement** (stops any client — including external scripts):
```bash
export SC4SAP_POLICY=on
export SC4SAP_POLICY_PROFILE=strict
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md
export SC4SAP_ALLOW_TABLE=TAB1,TAB2  # session emergency exemption (logged)
```

Schema/DDIC metadata (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`) and existence checks remain allowed.

## 🚫 `acknowledge_risk` — HARD RULE

`GetTableContents` / `GetSqlQuery` accept `acknowledge_risk: true` to bypass the ask-tier gate. **It is an audit boundary, not a convenience flag.**

1. **Never set `acknowledge_risk: true` on a first call** — let the hook/server gate it
2. **On an `ask` response**, STOP — surface the refusal to the user
3. **Ask an explicit yes/no question** naming the tables and scope
4. **Only retry with `acknowledge_risk: true`** after an explicit affirmative keyword: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `confirmed`
5. **Ambiguous imperatives are NOT authorization** — `"pull it"`, `"try it"`, `"뽑아봐"`, `"my mistake"`, silence
6. **Per-call, per-table, per-session** — authorization does not carry over

Full protocol: `common/data-extraction-policy.md`.

### ⚠️ "Always allow" pitfall
When a `GetTableContents` / `GetSqlQuery` permission prompt appears, choose **"Allow once"**, never **"Always allow"**. Claude Code appends the tool ID to `permissions.allow` on "Always allow", permanently disabling the safeguard. Recovery: re-run any parent skill — `trust-session` Step 2 scans and strips `GetTableContents`/`GetSqlQuery` entries on every invocation.

## 🔀 RFC Backend Selection

Screen / GUI Status / Text Element operations dispatch through RFC-enabled FMs on SAP. 5 transport backends:

| `SAP_RFC_BACKEND` | How | When to use |
|---|---|---|
| `soap` (default) | HTTPS `/sap/bc/soap/rfc` | Most setups — works out of the box if ICF node is active |
| `native` | `node-rfc` + NW RFC SDK | Lowest latency; requires paid SDK. _Deprecated — use `zrfc`_ |
| `gateway` | HTTPS to sc4sap-rfc-gateway middleware | Teams of 10+, centralized |
| `odata` | HTTPS OData v2 `ZMCP_ADT_SRV` | SOAP blocked but OData Gateway allowed. [docs/odata-backend.md](odata-backend.md) |
| 🆕 `zrfc` | HTTPS ICF handler `/sap/bc/rest/zmcp_rfc` | SOAP closed AND OData Gateway hard (typical ECC). No SDK, no Gateway — one class + one SICF node |

Switch any time via `/sc4sap:sap-option`, reconnect MCP, verify with `/sc4sap:sap-doctor`.

## 🏢 RFC Gateway (Enterprise Deployment)

For large SAP development teams (10s of developers), sc4sap supports a **central RFC Gateway** middleware so developer laptops never need the SAP NW RFC SDK / MSVC. One Linux host runs `node-rfc` + SDK; all MCP clients speak HTTPS/JSON to it.

**When this matters**:
- IT policy forbids SAP NW RFC SDK on developer machines
- SAP Basis deactivated `/sap/bc/soap/rfc` company-wide
- Need centralized RFC logging, rate limiting, per-developer audit trail

**Configuration**:
```
/sc4sap:sap-option
# Set SAP_RFC_BACKEND=gateway
#     SAP_RFC_GATEWAY_URL=https://rfc-gw.company.com
#     SAP_RFC_GATEWAY_TOKEN=<team-or-per-user-bearer>
```

Gateway forwards developer credentials via `X-SAP-*` headers — SAP's audit log identifies the real user.

> **Private repository.** Gateway source is at a private repo because the Docker image must be built against the SAP-licensed NW RFC SDK (cannot be redistributed). Organizations contact the maintainer for access, clone, download SDK themselves (S-user), build inside their network. Open-source users: continue with `SAP_RFC_BACKEND=soap` (default).

Client-side design is public at `abap-mcp-adt-powerup/src/lib/gatewayRfc.ts` — the HTTP contract is documented, any compliant middleware (Node/Java/Python) works.

---

← [Back to README](../README.md) · [Installation →](INSTALLATION.md) · [Changelog →](CHANGELOG.md)
