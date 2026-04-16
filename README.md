English | [한국어](README.ko.md) | [日本語](README.ja.md)

# SuperClaude for SAP (sc4sap)

> Claude Code plugin for SAP ABAP development — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)

[![MCP server on npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![Plugin version](https://img.shields.io/badge/sc4sap-v0.2.4-6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What is sc4sap?

SuperClaude for SAP transforms Claude Code into a full-stack SAP development assistant. It connects to your SAP system via the [MCP ABAP ADT server](https://github.com/babamba2/abap-mcp-adt-powerup) (150+ tools) to create, read, update, and delete ABAP objects directly — classes, function modules, reports, CDS views, Dynpro, GUI status, and more.

### Core Capabilities

| Capability | What it does | Skill |
|------------|--------------|-------|
| **🔌 Auto MCP Install** | `abap-mcp-adt-powerup` is auto-installed, configured, and connection-tested during setup. No manual MCP wiring, no `claude_desktop_config.json` editing — credentials go to `.sc4sap/sap.env` and the hook/blocklist layers register themselves. | `/sc4sap:setup` |
| **🏗️ Formatted Auto Program Maker** | Builds ABAP programs end-to-end following sc4sap conventions: Main + conditional Includes (t/s/c/a/o/i/e/f/_tst), OOP or Procedural split (`LCL_DATA` / `LCL_ALV` / `LCL_EVENT`), full ALV (CL_GUI_ALV_GRID + Docking) or SALV, mandatory Text Elements & CONSTANTS, Dynpro + GUI Status, ABAP Unit tests — all platform-aware (ECC / S4 On-Prem / Cloud). | `/sc4sap:create-program`, `/sc4sap:autopilot` |
| **🔍 Program Analyze** | Reverse-direction intelligence: read any ABAP object via MCP, run Clean ABAP / performance / security review, or reverse-engineer a program into a Functional / Technical Spec (Markdown or Excel) with Socratic scope narrowing. | `/sc4sap:analyze-code`, `/sc4sap:program-to-spec` |
| **🩺 Maintenance Diagnosis** | Operational triage loop: inspect ST22 dumps, SAT-style profiler traces, logs, and where-used graphs directly from Claude; narrow hypotheses, surface SAP Note candidates, and diagnose plugin / MCP / SAP connectivity health. | `/sc4sap:analyze-symptom`, `/sc4sap:sap-doctor` |
| **♻️ CBO Reuse (Brownfield Accelerator)** | Inventory a Customer Business Object (Z) package once — catalogue frequently-used Z tables / FMs / data elements / classes / structures / table types and persist to `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`. `create-program` / `program-to-spec` load the inventory at plan time and **prefer reusing existing CBO assets over creating duplicates** — essential for brownfield systems with hundreds of legacy Z-objects. | `/sc4sap:analyze-cbo-obj` → `/sc4sap:create-program` |
| **🏭 Industry Context** | 14 industry reference files (`industry/*.md`) — retail, fashion, cosmetics, tire, automotive, pharmaceutical, food-beverage, chemical, electronics, construction, steel, utilities, banking, public-sector. Consultants load the project's industry file to apply business-specific patterns, pitfalls, and SAP IS mappings when doing config analysis, Fit-Gap, or master-data decisions. | All consultants |
| **🌏 Country / Localization** | 15 per-country files + `eu-common.md` (KR, JP, CN, US, DE, GB, FR, IT, ES, NL, BR, MX, IN, AU, SG, EU common). Covers date/number formats, VAT/GST structure, mandatory e-invoicing (SDI / SII / MTD / CFDI / NF-e / 세금계산서 / Golden Tax / IRN / Peppol / STP), banking formats (IBAN / BSB / CLABE / SPEI / PIX / UPI / SEPA / Zengin …), payroll localization, statutory reporting cadence. Mandatory for analyst / critic / planner; wired into every consultant. | All consultants + analyst / critic / planner |
| **🤝 Module Consultation** | `sap-analyst`, `sap-critic`, `sap-planner`, and `sap-architect` emit a `## Module Consultation Needed` block whenever the question depends on module-specific business judgement (pricing, copy control, MRP, batch, payroll…) → delegates to `sap-{module}-consultant`. System-level issues → `sap-bc-consultant`. Never invents from general SAP knowledge. | analyst / critic / planner / architect |

## Requirements

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP ECC](https://img.shields.io/badge/SAP-ECC_6.0-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA Cloud](https://img.shields.io/badge/SAP-S%2F4HANA_Cloud-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-Auto--Installed-FF6600)

| Requirement | Details |
|-------------|---------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI installed (Max/Pro subscription or API key) |
| **SAP System** | **SAP ECC 6.0** / **S/4HANA On-Premise** / **S/4HANA Cloud (Public & Private)** — ADT enabled |

> **MCP Server** ([abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)) is **automatically installed and configured** during `/sc4sap:setup` — no manual pre-install required.

## Installation

> **Note** — sc4sap is **not yet on the official Claude Code plugin marketplace**. For now, add this repository as a custom marketplace in Claude Code, then install the plugin from it.

### Option A — Add as custom marketplace (recommended)

Inside a Claude Code session, run:

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
/plugin install sc4sap
```

To update later:

```
/plugin marketplace update babamba2/superclaude-for-sap
/plugin install sc4sap
```

### Option B — Install from source

```bash
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

Then point Claude Code at the local plugin directory via `/plugin marketplace add <local-path>`.

## Setup

```bash
# Run the setup skill — walks you through the wizard one question at a time
/sc4sap:setup
```

### Subcommands

```bash
/sc4sap:setup                # full wizard (default)
/sc4sap:setup doctor         # route to /sc4sap:sap-doctor
/sc4sap:setup mcp            # route to /sc4sap:mcp-setup
/sc4sap:setup spro           # SPRO config auto-extraction only
/sc4sap:setup customizations # Z*/Y* enhancement + extension inventory only
```

### Wizard Steps

The wizard asks **one question at a time** — never dumps the whole questionnaire. Existing values in `.sc4sap/sap.env` / `.sc4sap/config.json` are shown so you can press Enter to keep them.

| # | Step | What happens |
|---|------|--------------|
| 1 | **Version check** | Verify Claude Code version compatibility |
| 2 | **SAP system version + Industry** | (a) Choose `S4` (S/4HANA — BP, MATDOC, ACDOCA, Fiori, CDS) or `ECC` (ECC 6.0 — XK01/XD01, MKPF/MSEG, BKPF/BSEG). (b) Enter **ABAP Release** (e.g., `750`, `756`, `758`). (c) Pick **Industry** from a 15-option menu (retail / fashion / cosmetics / tire / automotive / pharmaceutical / food-beverage / chemical / electronics / construction / steel / utilities / banking / public-sector / other) — consultants load the matching `industry/*.md`. Drives SPRO tables / BAPIs / TCodes + ABAP syntax gating + industry-specific configuration patterns |
| 3 | **Install MCP server** | Clone + build `abap-mcp-adt-powerup` into `<PLUGIN_ROOT>/vendor/abap-mcp-adt/`. Skipped if already installed (`--update` to refresh) |
| 4 | **SAP connection** | Asked one field per question — `SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE` (`basic` / `xsuaa`), `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE` (`onprem` / `cloud`), `SAP_VERSION`, `ABAP_RELEASE`, `TLS_REJECT_UNAUTHORIZED` (dev only). Written to `.sc4sap/sap.env`. Optional L4 MCP-server blocklist vars (`MCP_BLOCKLIST_PROFILE`, `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`) are written as commented examples |
| 5 | **Reconnect MCP** | Prompt to run `/mcp` so the newly installed server starts |
| 6 | **Test connection** | `GetSession` round-trip against SAP |
| 7 | **Confirm system info** | Show system ID, client, user |
| 8 | **ADT authority check** | `GetInactiveObjects` to verify ADT permissions |
| 9 | **Create `ZMCP_ADT_UTILS`** | Required utility function group (package `$TMP`, local-only). Creates `ZMCP_ADT_DISPATCH` (Screen / GUI Status dispatcher) and `ZMCP_ADT_TEXTPOOL` (Text Pool R/W), both **RFC-enabled** and activated. Skipped if the FG already exists |
| 10 | **Write `config.json`** | Plugin-side config with `sapVersion` + `abapRelease` (synced with `sap.env`) |
| 11 | **SPRO extraction (optional)** | Prompt `y/N` — initial extraction is token-heavy but the resulting `.sc4sap/spro-config.json` cache dramatically reduces future token usage. Skipping is fine; static `configs/{MODULE}/*.md` references still work. Runs module-parallel via `scripts/extract-spro.mjs` |
| 11b | **🆕 Customization inventory (optional)** | Prompt `y/N` — parse each module's `configs/{MODULE}/enhancements.md`, then query live SAP to find which standard exits the customer has actually implemented with `Z*`/`Y*` objects. Writes `.sc4sap/customizations/{MODULE}/{enhancements,extensions}.json`. Hard persistence rules: BAdI only if a Z impl exists; SMOD only if a Z CMOD project includes it; Append Structures + Custom Fields go to a separate `extensions.json`. Consumed by `/sc4sap:create-program` (reuse-first) and `/sc4sap:analyze-symptom` (standard-exit origin lookup). Runs module-parallel via `scripts/extract-customizations.mjs` |
| 12 | **🔒 Blocklist hook (MANDATORY)** | **(a)** Pick profile — `strict` (default, everything) / `standard` (PII + credentials + HR + transactional finance) / `minimal` (PII + credentials + HR + Tax only) / `custom` (user list in `.sc4sap/blocklist-custom.txt`). **(b)** Install via `node scripts/install-hooks.mjs` (user-level) or `--project` (project-level). **(c)** Smoke-test with a BNKA payload, expect `permissionDecision: deny`. **(d)** Print final hook entry + extend / custom file status. Setup does not complete unless this succeeds |

> **Two blocklist layers, configured separately**
> - **L3 (step 12)** — Claude Code `PreToolUse` hook, profile in `.sc4sap/config.json` → `blocklistProfile`. Fires for any Claude Code session, regardless of MCP server.
> - **L4 (step 4, optional)** — MCP-server internal guard, profile in `sap.env` → `MCP_BLOCKLIST_PROFILE`. Applies only to `abap-mcp-adt-powerup`.
>
> Typical: L3 `strict`, L4 `standard`. Change L3 by re-running `/sc4sap:setup`; change L4 via `/sc4sap:sap-option`.

### After Setup

- Verify health: `/sc4sap:sap-doctor`
- Rotate credentials / adjust L4 blocklist: `/sc4sap:sap-option`
- Re-extract SPRO later: `/sc4sap:setup spro`

## Features

### 25 SAP-Specialized Agents

| Category | Agents |
|----------|--------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — system admin, transport management, diagnostics |
| **Modules (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**Delegation map (Module Consultation Protocol):**
- `sap-analyst` / `sap-critic` / `sap-planner` → emit `## Module Consultation Needed` → `sap-{module}-consultant` (business semantics) or `sap-bc-consultant` (system-level)
- `sap-architect` → emits `## Consultation Needed` → `sap-bc-consultant` for Basis topics (transport strategy, authorization, performance, sizing, system copy, patching) or `sap-{module}-consultant` for module design questions
- `sap-analyst` / `sap-critic` / `sap-planner` additionally have a **mandatory Country Context** block that forces loading `country/<iso>.md` before producing output

### 18 Skills

| Skill | Description |
|-------|-------------|
| `sc4sap:setup` | Plugin setup — auto-installs `abap-mcp-adt-powerup` MCP server, generates SPRO config, installs blocklist hook |
| `sc4sap:mcp-setup` | Standalone MCP ABAP ADT server install / reconfigure guide |
| `sc4sap:sap-option` | View / edit `.sc4sap/sap.env` (credentials, RFC backend, blocklist profile, whitelists) |
| `sc4sap:sap-doctor` | Plugin + MCP + SAP connection diagnostics (6 layers including RFC backend) |
| `sc4sap:create-object` | ABAP object creation (hybrid mode — transport + package confirm, create, activate) |
| `sc4sap:create-program` | Full ABAP program pipeline — Main+Include, OOP/Procedural, ALV, Dynpro, Text Elements, ABAP Unit |
| `sc4sap:program-to-spec` | Reverse-engineer an ABAP program into a Functional/Technical Spec (Markdown / Excel) |
| `sc4sap:analyze-code` | ABAP code analysis & improvement (Clean ABAP / performance / security) |
| `sc4sap:analyze-cbo-obj` | **Customer Business Object (CBO) inventory** — scan a Z-package, catalogue frequently-used Z tables / FMs / data elements / classes / structures / table types; persists to `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` so `create-program` / `program-to-spec` prefer reusing existing CBO assets over creating new ones |
| `sc4sap:analyze-symptom` | Step-by-step SAP operational error/symptom analysis (dumps, logs, SAP Note candidates) |
| `sc4sap:autopilot` | Full autonomous execution pipeline — idea → activated, tested ABAP |
| `sc4sap:ralph` | Persistent self-correcting loop until syntax clean + activation + unit tests pass |
| `sc4sap:ralplan` | Consensus-based planning gate (analyst / architect / critic convergence) |
| `sc4sap:deep-interview` | Socratic requirements gathering before implementation |
| `sc4sap:ask` | Question routing to appropriate expert agent |
| `sc4sap:team` | Coordinated parallel agent execution (native Claude Code teams) |
| `sc4sap:teams` | CLI team runtime (tmux-based process-parallel execution) |
| `sc4sap:release` | CTS transport release workflow (validate, release, import monitor) |

### MCP ABAP ADT Server — Unique Capabilities

sc4sap is backed by **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)**, an extended ADT MCP server (150+ tools). Beyond the usual Class / Program / Table / CDS / Function Module CRUD found in standard ADT MCPs, it adds **full Read / Update / Create coverage for classic Dynpro artifacts** that most MCP servers don't touch:

| Artifact | Read | Create | Update | Delete | Notes |
|----------|------|--------|--------|--------|-------|
| **Screen (Dynpro)** | `GetScreen`, `ReadScreen`, `GetScreensList` | `CreateScreen` | `UpdateScreen` | `DeleteScreen` | Full Dynpro header + flow logic round-trip in MCP JSON (uppercase `HEADER` / `FLOW_LOGIC` / `LINE` keys) |
| **GUI Status** | `GetGuiStatus`, `ReadGuiStatus`, `GetGuiStatusList` | `CreateGuiStatus` | `UpdateGuiStatus` | `DeleteGuiStatus` | Menu bar, function keys, application toolbar — programmatically created and edited |
| **Text Element** | `GetTextElement` | `CreateTextElement` | `UpdateTextElement` | `DeleteTextElement` | Text symbols, selection texts, list headings — required for Text Element enforcement rule |
| **Includes** | `GetInclude`, `GetIncludesList` | `CreateInclude` | `UpdateInclude` | `DeleteInclude` | Used by Main+Include convention |
| **Local defs/macros/tests/types** | `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes` | — | `UpdateLocalDefinitions`, `UpdateLocalMacros`, `UpdateLocalTestClass`, `UpdateLocalTypes` | `DeleteLocal*` | In-program local sections edited independently |
| **Metadata Extension (CDS)** | `GetMetadataExtension` | `CreateMetadataExtension` | `UpdateMetadataExtension` | `DeleteMetadataExtension` | Fiori/UI annotation layering on CDS |
| **Behavior Definition / Implementation (RAP)** | `Get/Read BehaviorDefinition`, `Get/Read BehaviorImplementation` | `Create*` | `Update*` | `Delete*` | Full RAP BDEF + BHV cycle |
| **Service Definition / Binding** | `Get/Read ServiceDefinition`, `Get/Read ServiceBinding`, `ListServiceBindingTypes`, `ValidateServiceBinding` | `Create*` | `Update*` | `Delete*` | OData V2/V4 exposure and validation |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` | — | — | — | Discovery of extension points |
| **Runtime & Profiling** | `RuntimeListDumps`, `RuntimeAnalyzeDump`, `RuntimeGetDumpById`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`, `RuntimeCreateProfilerTraceParameters`, `RuntimeRunProgramWithProfiling`, `RuntimeRunClassWithProfiling` | — | — | — | ST22 dump analysis + SAT-style profiling entirely from Claude |
| **Semantic / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetAdtTypes`, `GetTypeInfo`, `GetWhereUsed` | — | — | — | Richer analysis than plain syntax check |
| **Unit Tests (ABAP + CDS)** | `GetUnitTest`, `GetUnitTestResult`, `GetUnitTestStatus`, `GetCdsUnitTest`, `GetCdsUnitTestResult`, `GetCdsUnitTestStatus` | `CreateUnitTest`, `CreateCdsUnitTest` | `UpdateUnitTest`, `UpdateCdsUnitTest` | `DeleteUnitTest`, `DeleteCdsUnitTest` | Both ABAP Unit and CDS test framework |
| **Transport** | `GetTransport`, `ListTransports` | `CreateTransport` | — | — | Full transport lifecycle in MCP |

The Dynpro / GUI Status / Text Element CRUD in particular enable sc4sap's classical-UI pipeline (`sc4sap:create-program` with ALV + Docking + selection screen) to be fully AI-driven end-to-end — a scenario most ADT MCP servers cannot support.

### Shared Conventions (`common/`)

Cross-skill authoring rules live in `common/` so every skill and agent follows the same playbook without duplicating text. `CLAUDE.md` is a thin **index** that references these files (not a duplicate); agents pull the detailed rules on demand.

| File | Covers |
|------|--------|
| `common/clean-code.md` | **Consolidated Clean ABAP standards** — naming, control flow, Open SQL, modularization, testing, performance, security, version awareness + self-check checklist |
| `common/include-structure.md` | Main program + conditional include set (t/s/c/a/o/i/e/f/_tst) |
| `common/oop-pattern.md` | Two-class OOP split (`LCL_DATA` + `LCL_ALV` + optional `LCL_EVENT`) |
| `common/alv-rules.md` | Full ALV (CL_GUI_ALV_GRID + Docking Container) vs SALV + SALV-factory fieldcatalog pattern |
| `common/text-element-rule.md` | Mandatory Text Elements — no hardcoded display literals |
| `common/constant-rule.md` | Mandatory `CONSTANTS` for non-fieldcatalog magic literals |
| `common/procedural-form-naming.md` | `_{screen_no}` suffix for ALV-bound FORMs |
| `common/naming-conventions.md` | Shared naming for programs, includes, LCL_*, screens, GUI status |
| `common/sap-version-reference.md` | ECC vs S/4HANA differences (tables, TCodes, BAPIs, patterns) |
| `common/abap-release-reference.md` | ABAP syntax availability by release (inline decl, Open SQL expressions, RAP, …) |
| `common/spro-lookup.md` | SPRO lookup priority — local cache → static docs → MCP query |
| `common/data-extraction-policy.md` | Agent-side refusal protocol + **`acknowledge_risk` HARD RULE** (explicit per-request user affirmative required) |

### Industry Reference (`industry/`)

Per-industry business-characteristic files — consulted by every `sap-*-consultant` before config analysis, Fit-Gap, or master-data decisions. Each file covers **Business Characteristics / Key Processes / Master Data Specifics / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls**.

| File | Industry |
|------|----------|
| `industry/retail.md` | Retail (Article, Site, POS, Assortment) |
| `industry/fashion.md` | Fashion / Apparel (Style × Color × Size, AFS/FMS) |
| `industry/cosmetics.md` | Cosmetics (Batch, Shelf Life, Channel Pricing) |
| `industry/tire.md` | Tire (OE/RE, Mixed Mfg, Mold, Recall) |
| `industry/automotive.md` | Automotive (JIT/JIS, Scheduling Agreement, PPAP) |
| `industry/pharmaceutical.md` | Pharmaceutical (GMP, Serialization, Batch Status) |
| `industry/food-beverage.md` | Food & Beverage (Catch Weight, FEFO, TPM) |
| `industry/chemical.md` | Chemical (Process, DG, Formula Pricing) |
| `industry/electronics.md` | Electronics / High-Tech (VC / AVC, Serial, RMA) |
| `industry/construction.md` | Construction / E&C (PS, POC Billing, Subcontracting) |
| `industry/steel.md` | Steel / Metals (Characteristic-based inventory, Coil, Heat) |
| `industry/utilities.md` | Utilities (IS-U, FI-CA, Device Mgmt) |
| `industry/banking.md` | Banking (FS-CD, FS-BP, Parallel Ledger) |
| `industry/public-sector.md` | Public Sector (Funds Mgmt, Grants Mgmt, Budget Control) |

### Country / Localization Reference (`country/`)

Per-country jurisdictional rules — consulted by every consultant (**mandatory** for analyst / critic / planner). Each file covers **Formats (date / number / currency / phone / postal / timezone) / Language & Locale / Tax System / e-Invoicing / Fiscal Reporting / Banking & Payments / Master Data Peculiarities / Statutory Reporting / SAP Country Version / Common Customizations / Pitfalls**.

| File | Country | Key peculiarities |
|------|---------|-------------------|
| `country/kr.md` | 🇰🇷 Korea | e-세금계산서 (NTS), 사업자등록번호, 주민번호 PII rules |
| `country/jp.md` | 🇯🇵 Japan | Qualified Invoice System (2023+), Zengin, 法人番号 |
| `country/cn.md` | 🇨🇳 China | Golden Tax, 发票 / e-fapiao, 统一社会信用代码, SAFE FX |
| `country/us.md` | 🇺🇸 USA | Sales & Use Tax (no VAT), EIN, 1099, ACH, Nexus rules |
| `country/de.md` | 🇩🇪 Germany | USt, ELSTER, DATEV, XRechnung / ZUGFeRD e-invoice, SEPA |
| `country/gb.md` | 🇬🇧 UK | VAT + MTD, BACS / FPS / CHAPS, Post-Brexit (GB vs XI) |
| `country/fr.md` | 🇫🇷 France | TVA, FEC, Factur-X 2026, SIREN/SIRET |
| `country/it.md` | 🇮🇹 Italy | IVA, FatturaPA / SDI (mandatory since 2019), Split Payment |
| `country/es.md` | 🇪🇸 Spain | IVA, SII (real-time 4-day), TicketBAI, Confirming |
| `country/nl.md` | 🇳🇱 Netherlands | BTW, KvK, Peppol, XAF, G-rekening |
| `country/br.md` | 🇧🇷 Brazil | NF-e, SPED, CFOP, ICMS/IPI/PIS/COFINS, Boleto / PIX |
| `country/mx.md` | 🇲🇽 Mexico | CFDI 4.0, SAT, Complementos, Carta Porte, SPEI |
| `country/in.md` | 🇮🇳 India | GST (CGST/SGST/IGST), IRN e-invoice, e-Way Bill, TDS |
| `country/au.md` | 🇦🇺 Australia | GST, ABN, STP Phase 2, BAS, BSB banking |
| `country/sg.md` | 🇸🇬 Singapore | GST 9%, UEN, InvoiceNow (Peppol), PayNow |
| `country/eu-common.md` | 🇪🇺 EU-wide | VAT ID format per country (VIES), INTRASTAT, ESL, OSS/IOSS, SEPA, GDPR |

Identify the active country from `.sc4sap/config.json` → `country` (or `sap.env` → `SAP_COUNTRY`, ISO alpha-2 lowercase). Multi-country rollouts: every relevant file is loaded and cross-country touchpoints (intra-EU VAT, intercompany, transfer pricing, withholding across borders) are surfaced.

### SAP Platform Awareness (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program` runs a mandatory **SAP Version Preflight** before anything else, reading `.sc4sap/config.json` for `sapVersion` (ECC / S4 On-Prem / S/4HANA Cloud Public / Private) and `abapRelease`. The pipeline branches accordingly:

- **ECC** — no RAP/ACDOCA/BP; syntax gated by release (no inline decl <740, no CDS <750, etc.)
- **S/4HANA On-Premise** — classical Dynpro technically possible but warned; extensibility-first, MATDOC ACDOCA for finance
- **S/4HANA Cloud (Public)** — **classical Dynpro forbidden**; redirects to RAP + Fiori Elements, `if_oo_adt_classrun`, or SALV-only output. Full prohibited-statement list + Cloud-native API replacements in `skills/create-program/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — refer CDS + AMDP + RAP, Business Partner APIs

### SPRO Configuration Reference

Built-in reference data for all 13 SAP modules:

```
configs/{MODULE}/
  ├── spro.md        # SPRO configuration tables/views
  ├── tcodes.md      # Transaction codes
  ├── bapi.md        # BAPI/FM reference
  ├── tables.md      # Key tables
  ├── enhancements.md # BAdI / User Exit / BTE / VOFM
  └── workflows.md   # Development workflows
configs/common/      # cross-module references (IDOC, Factory Calendar, DD* tables, etc.)
```

**Modules**: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW

### SPRO Local Cache (Token-Saving)

`/sc4sap:setup spro` extracts customer-specific SPRO customizing from the live S/4HANA system into `.sc4sap/spro-config.json`. Every consultant agent follows `common/spro-lookup.md`:

1. **Priority 1 — Local cache** (`.sc4sap/spro-config.json` → `modules.{MODULE}`) — no MCP call
2. **Priority 2 — Static references** (`configs/{MODULE}/*.md`)
3. **Priority 3 — Live MCP query** — only with user confirmation (token cost warned)

One-time extraction saves substantial tokens across all future sessions.

### SAP-Specific Hooks

- **SPRO Auto-Injection** — Haiku LLM classifies user input and injects relevant module SPRO config
- **Transport Validation** — Checks transport exists before MCP ABAP Create/Update operations
- **Auto-Activation** — Triggers ABAP object activation after creation/modification
- **Syntax Checker** — Auto-runs semantic analysis on ABAP errors
- **🔒 Data Extraction Blocklist** — `PreToolUse` hook blocks row extraction from sensitive SAP tables (see below)

### 🔒 Data Extraction Blocklist

A mandatory defense-in-depth layer that prevents row data from sensitive tables (PII, credentials, payroll, banking, transactional finance) from being extracted via `GetTableContents` / `GetSqlQuery` — by sc4sap agents, direct user prompts, or other plugins in the same Claude Code session.

**Four enforcement layers**:

| Layer | Where | What it does |
|-------|-------|--------------|
| L1 — Agent instructions | `common/data-extraction-policy.md`, consultant agents | Every agent refuses blocked extraction with a categorized reason + alternatives |
| L2 — Global directive | `CLAUDE.md` "Data Extraction Policy" block | Loaded into every Claude session, including direct prompts |
| L3 — Claude Code hook | `scripts/hooks/block-forbidden-tables.mjs` (`PreToolUse`) | Programmatic block — intercepts the MCP call and returns a `deny` decision |
| L4 — MCP server (opt-in) | `abap-mcp-adt-powerup` source (`src/lib/policy/blocklist.ts`) | Hardcoded block inside the MCP server regardless of caller — enable with env `SC4SAP_POLICY=on` |

**Blocklist source**: `exceptions/table_exception.md` is the **index**; actual table lists live in **11 per-section files** under `exceptions/` so each file stays small and grep-able. The hook auto-scans every `*.md` in the folder except the index.

| Tier | File | Covers |
|------|------|--------|
| minimal | `banking-payment.md` | Banking / Payment credentials (BNKA, KNBK, LFBK, REGUH, PAYR, CCARD, FPAYH…) |
| minimal | `master-data-pii.md` | Customer / Vendor / BP master PII (KNA1, LFA1, BUT000, BUT0ID, KNVK…) + related CDS views (I_Customer, I_Supplier, I_BusinessPartner, I_Employee…) |
| minimal | `addresses-communication.md` | ADR* (address, email, phone, fax) + CDS (I_Address, I_AddressEmailAddress…) |
| minimal | `auth-security.md` | USR02 password hashes, RFCDES, AGR_1251, SSF_PSE_D + CDS (I_User, I_UserAuthorization…) |
| minimal | `hr-payroll.md` | PA* / HRP* / PCL* infotypes and clusters (salary, medical, dependents…) |
| minimal | `tax-government-ids.md` | KNAS, LFAS, BUT0TX, Brazil J_1B*, BP tax numbers |
| minimal | **`pricing-conditions.md`** | **Pricing / Conditions / Rebates** — KONH, KONP, KONV, KONA, KOTE*, `PRCD_ELEMENT`, `PRCD_COND_HEAD`, `PRCD_COND`, `A###` (A001–A999 access tables) + pricing CDS (I_PriceCondition, I_PricingProcedure, I_RebateAgreement, I_SalesOrderItemPrice…). Top-tier commercial risk — leakage exposes customer-specific discounts and margin |
| minimal | `custom-patterns.md` | `Z*` / `Y*` with PII content, ZHR_*, ZPA_*, ZCUST_*, ZVEND_*, ZKNA_* |
| standard | `protected-business-data.md` | VBAK / BKPF / ACDOCA / VBRK / EKKO / CDHDR / STXH + transactional CDS (I_JournalEntry, I_SalesOrder, I_BillingDocument, I_PurchaseOrder, I_Payable, I_Receivable…) |
| strict | `audit-security-logs.md` | BALDAT, SLG1, RSAU_BUF_DATA, SNAP, DBTABLOG |
| strict | `communication-workflow.md` | SAPoffice (SOOD, SOC3), workflow (SWWWIHEAD, SWWCONT), broadcast |

**Pattern syntax** — exact names, `TABLE*` wildcard, `TABLExxx` legacy wildcard, and `A###` (new: `#` = exactly one digit, so `A###` matches A001–A999 precisely without false positives).

**Two actions — `deny` vs `warn`**:

- **`deny`** (default for every category) — the call is blocked outright. SAP is not contacted. The agent surfaces the category, reason, and safer alternatives.
- **`warn`** — the call proceeds, but the response is prefixed with a `⚠️ sc4sap blocklist WARNING` block listing the table(s), category, and recommended alternatives. Intended for categories where legitimate daily use is common.

`warn`-default categories: **Protected Business Data** (VBAK/BKPF/ACDOCA/etc.) and **Customer-Specific PII Patterns** (`Z*` tables). Everything else stays `deny`. If a single call touches *any* `deny` table, the whole call is blocked — `deny` wins.

**Configurable scope** — choose one profile during `/sc4sap:setup`:

| Profile | Blocks |
|---------|--------|
| `strict` (default) | PII + credentials + HR + transactional finance + audit logs + workflow |
| `standard` | PII + credentials + HR + transactional finance |
| `minimal` | PII + credentials + HR + Tax only (business tables allowed) |
| `custom` | User-supplied list only (`.sc4sap/blocklist-custom.txt`) |

Any profile additionally honors `.sc4sap/blocklist-extend.txt` (one table name or pattern per line) for site-specific additions.

**Install** — automated and **required** by `/sc4sap:setup`; manual install:

```bash
node scripts/install-hooks.mjs            # user-level (~/.claude/settings.json)
node scripts/install-hooks.mjs --project  # project-level (.claude/settings.json)
node scripts/install-hooks.mjs --uninstall
```

**Verify**:

```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# Expected: JSON with "permissionDecision":"deny"
```

Schema/DDIC metadata (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`), existence checks (`SearchObject`), and counts/aggregates via `GetSqlQuery` remain allowed. Per-task exceptions can be documented in `.sc4sap/data-access-approval-{YYYYMMDD}.md`.

**L4 server-side enforcement** (stops calls from any client — direct JSON-RPC, other LLMs, external scripts):

```bash
# Activate when starting mcp-abap-adt-powerup
export SC4SAP_POLICY=on                    # or: strict | standard | minimal | custom
export SC4SAP_POLICY_PROFILE=strict        # optional, default when SC4SAP_POLICY=on
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md  # optional extra list
export SC4SAP_ALLOW_TABLE=TAB1,TAB2        # session-scoped emergency exemption (logged)
```

When a blocked table is accessed, the MCP server responds with `isError: true` and the categorized reason — no SAP round-trip occurs.

### 🚫 `acknowledge_risk` — HARD RULE

`GetTableContents` / `GetSqlQuery` accept an `acknowledge_risk: true` parameter that bypasses the MCP server's `ask`-tier confirmation gate. **This flag is an audit boundary, not a convenience flag** — its value is logged to stderr and represents an attestation that the user granted per-request authorization. Agents MUST follow these rules without exception:

1. **Never set `acknowledge_risk: true` on a first call.** Let the hook / server gate the request.
2. **On an `ask` response**, STOP — do not retry. Surface the refusal to the user.
3. **Ask an explicit yes/no question** naming the tables and scope.
4. **Only retry with `acknowledge_risk: true` after an explicit affirmative keyword** from the user: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `go ahead` / `confirmed`.
5. **Ambiguous imperatives are NOT authorization** — including `"pull it"`, `"try it"`, `"뽑아봐"`, `"가져와봐"`, `"해봐"`, `"my mistake"`, silence.
6. **Per-call, per-table, per-session.** Authorization does not carry across requests.

Full protocol: `common/data-extraction-policy.md` → "The `acknowledge_risk` Parameter — HARD RULE".

### 🔀 RFC Backend Selection

The Screen / GUI Status / Text Element operations dispatch through RFC-enabled function modules on SAP. sc4sap offers **4 transport backends** — pick the one that matches your environment:

| `SAP_RFC_BACKEND` | How it calls SAP | When to use |
|---|---|---|
| `soap` (default) | HTTPS `/sap/bc/soap/rfc` | Most setups — works out of the box if ICF node is active |
| `native` | Direct RFC via `node-rfc` + NW RFC SDK | Power users, lowest latency, requires SDK on each laptop |
| `gateway` | HTTPS to a sc4sap-rfc-gateway middleware | Teams of 10+ developers, centralised deployment |
| 🆕 `odata` | HTTPS OData v2 service `ZMCP_ADT_SRV` | **NEW in v0.2.4** — when the company blocks `/sap/bc/soap/rfc` but allows the OData Gateway. Requires one-time Basis registration of the `ZMCP_ADT_SRV` service. See [`docs/odata-backend.md`](docs/odata-backend.md) for the end-to-end registration + client switch guide |

Switch backends any time with `/sc4sap:sap-option`, reconnect MCP, verify with `/sc4sap:sap-doctor`.

### 🏢 RFC Gateway (Enterprise Deployment)

For large SAP development teams (typically tens of developers), sc4sap supports a **central RFC Gateway** middleware so developer laptops never need the SAP NW RFC SDK, MSVC build tools, or S-user SDK downloads. One Linux host runs `node-rfc` + the SDK; all MCP clients speak HTTPS/JSON to it.

When this matters:

- Your IT policy forbids installing the SAP NW RFC SDK on developer machines
- The SAP Basis team has deactivated the `/sap/bc/soap/rfc` ICF endpoint company-wide
- You want centralised RFC logging, rate limiting, and per-developer audit trail

Configuration on each developer laptop:

```
/sc4sap:sap-option
# Set SAP_RFC_BACKEND=gateway
#     SAP_RFC_GATEWAY_URL=https://rfc-gw.company.com
#     SAP_RFC_GATEWAY_TOKEN=<team-or-per-user-bearer>
```

The gateway forwards the developer's SAP credentials on every request via `X-SAP-*` headers, so SAP's audit log still identifies the real user (not a shared service account).

> **Private repository.** The gateway source lives at a **private repo** because the Docker image must be built against the SAP-licensed NW RFC SDK, which cannot be redistributed. Organisations contact the maintainer for access; they then clone, download the SDK themselves (S-user required), and build the image inside their own network. Individual open-source sc4sap users should continue using `SAP_RFC_BACKEND=soap` (default) — no gateway needed.

Client-side design lives in this repo (`abap-mcp-adt-powerup/src/lib/gatewayRfc.ts`) — the HTTP contract is documented and any compliant middleware (Node, Java, Python, …) will work. Contact the maintainer for repository access or to discuss alternative gateway implementations.

## Skills — Examples & Workflow

Each skill below shows a one-line invocation, a typical prompt, and what happens under the hood. Screenshots will be added in a future update.

### `/sc4sap:setup`

One-time onboarding: installs the MCP ABAP ADT server, extracts SPRO cache, installs the data-extraction blocklist hook.

```
/sc4sap:setup
```

**Flow** — connection test → SAP version detect (ECC / S4 On-Prem / Cloud) → SPRO extraction per module → blocklist profile prompt (`strict` / `standard` / `minimal` / `custom`) → hook registration in `settings.json`.

> _Screenshot placeholder — setup wizard_

---

### `/sc4sap:create-object`

Hybrid-mode single-object creation: confirms transport + package interactively, then creates, scaffolds, and activates.

```
/sc4sap:create-object
→ "Create a class ZCL_SD_ORDER_VALIDATOR in package ZSD_ORDER"
```

**Flow** — type inference (Class / Interface / Program / FM / Table / Structure / Data Element / Domain / CDS / Service Def / Service Binding) → package + transport confirm → MCP `Create*` → initial implementation written → `GetAbapSemanticAnalysis` → activate.

> _Screenshot placeholder — create-object confirmation + activation_

---

### `/sc4sap:create-program`

Flagship program creation pipeline with Main + Include wrapping, OOP or Procedural, full ALV + Dynpro support.

```
/sc4sap:create-program
→ "Make an ALV report for open sales orders, selection screen by sales org + date range"
```

**Flow** — SAP version preflight (`.sc4sap/config.json`) → Socratic interview → planner spec → user confirm → executor writes Main program + conditional Includes (t/s/c/a/o/i/e/f/_tst) + Screen + GUI Status + Text Elements → qa-tester writes ABAP Unit → code-reviewer gate → activate. Branches by platform (ECC / S4 On-Prem / Cloud Public forbids classical Dynpro → auto-redirect to `if_oo_adt_classrun` / SALV / RAP).

> _Screenshot placeholder — program pipeline with ALV output_

---

### `/sc4sap:analyze-code`

Reads an existing ABAP object via MCP, runs `sap-code-reviewer` against Clean ABAP + performance + security, returns categorized findings with suggested fixes.

```
/sc4sap:analyze-code
→ "Review ZCL_SD_ORDER_VALIDATOR for Clean ABAP violations and SELECT * usage"
```

**Flow** — `ReadClass` / `GetProgFullCode` → `GetAbapSemanticAnalysis` + `GetWhereUsed` → sap-code-reviewer analysis → categorized report (Clean ABAP / Performance / Security / SAP Standard) → optional apply-fix loop.

> _Screenshot placeholder — review findings table_

---

### `/sc4sap:analyze-cbo-obj`

Customer Business Object (CBO) inventory scanner. Walks a Z-package and catalogues reusable Z tables / FMs / data elements / classes / structures / table types — then persists the list so downstream generators (`create-program`, `program-to-spec`) default to **reusing** instead of creating duplicates.

```
/sc4sap:analyze-cbo-obj
→ "Scan ZSD_ORDER package for MM module reuse candidates"
```

**Flow** — `GetPackageTree` on target Z-package → `GetObjectsByType` per CBO category → frequency + purpose heuristics → write `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`. `create-program` / `program-to-spec` load this JSON at plan time and add a reuse-first gate before any `Create*` call.

Ideal for brownfield systems with hundreds of existing Z-objects; run once per package, keep warm for weeks of downstream work.

> _Screenshot placeholder — CBO inventory output_

---

### `/sc4sap:analyze-symptom`

Step-by-step runtime / operational error investigation: dumps, logs, SAP Note candidates.

```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_POSTING at line 234 during F110"
```

**Flow** — `RuntimeListDumps` / `RuntimeGetDumpById` / `RuntimeAnalyzeDump` → stack trace parse → SAP Note candidate search → root cause hypothesis → remediation options (config / code / user action).

> _Screenshot placeholder — dump analysis and Note candidates_

---

### `/sc4sap:program-to-spec`

Reverse-engineer an existing ABAP program back into a Functional / Technical Spec — Markdown or Excel. Socratic scope narrowing prevents "document everything" bloat.

```
/sc4sap:program-to-spec
→ "Write a spec for ZSD_ORDER_RELEASE — focus on approval logic and BAdI hooks"
```

**Flow** — scope narrowing Q&A → `GetProgFullCode` / `ReadClass` / includes walk → `GetWhereUsed` + `GetEnhancements` → structured spec (purpose / selection screen / data flow / APIs / enhancements / authorization) → Markdown or Excel artifact.

> _Screenshot placeholder — generated spec artifact_

---

### `/sc4sap:autopilot`

Full autonomous pipeline from vague idea to activated, tested ABAP objects — runs `deep-interview` → `ralplan` → agent pipeline → `ralph` loop until clean.

```
/sc4sap:autopilot
→ "Build a custom Vendor Payment approval workflow"
```

**Flow** — deep-interview crystallizes scope → ralplan consensus plan → sap-planner WRICEF breakdown → sap-executor creates objects → sap-qa-tester runs unit tests → sap-code-reviewer gates → ralph loop retries until green.

> _Screenshot placeholder — autopilot progress stream_

---

### `/sc4sap:ralph`

Persistent self-correcting loop: runs until syntax is clean, activation succeeds, and unit tests pass. Drop-in for any "make it work" task.

```
/sc4sap:ralph
→ "Fix all activation errors in ZMM_GR_POSTING and its includes"
```

**Flow** — iterate: `GetAbapSemanticAnalysis` → identify error → edit via `UpdateProgram` / `UpdateClass` / `UpdateInclude` → activate → re-run unit test → stop when all three pass. Cancels on manual intervention or max iterations.

> _Screenshot placeholder — ralph iteration log_

---

### `/sc4sap:ralplan`

Consensus planning gate — multiple agent perspectives (analyst / architect / critic) converge on one plan before coding starts. Prevents autopilot from building the wrong thing.

```
/sc4sap:ralplan
→ "Plan the rewrite of legacy ZSD_ORDER_RELEASE to RAP-based workflow"
```

**Flow** — sap-analyst extracts requirements → sap-architect proposes technical design → sap-critic challenges design → convergence iterations → approved plan handed to autopilot / team.

> _Screenshot placeholder — ralplan convergence diff_

---

### `/sc4sap:deep-interview`

Socratic requirements gathering before any code is written. Surfaces hidden assumptions, edge cases, and module-cross-cutting effects.

```
/sc4sap:deep-interview
→ "I need a custom credit-limit check"
```

**Flow** — initial user intent → layered questions (what modules, what master data, what timing, what error UX, who approves) → specification summary → user confirm.

> _Screenshot placeholder — interview Q&A_

---

### `/sc4sap:team` / `/sc4sap:teams`

Coordinated parallel agent execution. `team` uses native Claude Code teams (in-process); `teams` uses tmux CLI panes (process-level parallelism).

```
/sc4sap:team
→ "Split this WRICEF list into 4 workers and build in parallel"
```

**Flow** — shared task list → N workers pick tasks → each runs create-object / program / ralph → merge-back via transport.

> _Screenshot placeholder — tmux pane view / team dashboard_

---

### `/sc4sap:release`

CTS transport release workflow — list, validate (no inactive objects, no syntax errors), release, and confirm import to next system.

```
/sc4sap:release
→ "Release transport DEVK900123"
```

**Flow** — `GetTransport` → validation checklist → release via STMS → monitor import status → post-import smoke check.

> _Screenshot placeholder — release checklist_

---

### `/sc4sap:ask`

Question routing to the right expert agent without committing to a full skill pipeline.

```
/sc4sap:ask
→ "Which BAdI fires on VA01 save after pricing?"
```

**Flow** — classify question (module / technical / config / error) → route to matching consultant agent (e.g. `sap-sd-consultant`) → answer with SPRO cache + MCP `GetEnhancementSpot` lookups.

> _Screenshot placeholder — routed answer_

---

### `/sc4sap:sap-doctor`

Plugin + MCP + SAP system diagnostics. First thing to run when something's off. (Renamed from `doctor` to avoid conflict with Claude Code's built-in `/doctor`.)

```
/sc4sap:sap-doctor
```

**Flow** — plugin install check → MCP server handshake → SAP RFC/ADT connectivity → SPRO cache freshness → hook registration → blocklist active → report with actionable fixes.

> _Screenshot placeholder — doctor report_

---

### `/sc4sap:mcp-setup`

Standalone guide to install / reconfigure `abap-mcp-adt-powerup` if `/sc4sap:setup` didn't run it (e.g., existing global MCP config).

```
/sc4sap:mcp-setup
```

### `/sc4sap:sap-option`

Interactively view and edit `.sc4sap/sap.env` — SAP connection credentials, TLS settings, and blocklist policy for row-extraction safety. Secrets are masked in the display; writes are preceded by a diff preview and create a `sap.env.bak` backup.

```
/sc4sap:sap-option
```

Common uses: rotate `SAP_PASSWORD`, switch `SAP_CLIENT`, change `MCP_BLOCKLIST_PROFILE` (`minimal` / `standard` / `strict` / `off`), add an audited `MCP_ALLOW_TABLE` entry, or append to `MCP_BLOCKLIST_EXTEND`. Reconnect MCP (`/mcp`) after saving.

## Tech Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![MCP](https://img.shields.io/badge/MCP_SDK-Protocol-FF6600)

## Acknowledgments

This project was inspired by [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode) by **허예찬 (Hur Ye-chan)**. The multi-agent orchestration patterns, Socratic deep-interview gating, ralph/autopilot pipelines, and the overall plugin philosophy here all trace back to that work. Huge thanks — sc4sap would not exist in this form without it.

## Author

- **paek seunghyun** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## Contributors

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## License

[MIT](LICENSE)
