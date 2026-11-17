# Features Deep-Dive

← [Back to README](../README.md) · [Installation →](INSTALLATION.md)

## Table of Contents

- [26 SAP-Specialized Agents](#26-sap-specialized-agents)
- [14 Skills](#14-skills)
- [Skills — Examples & Workflow](#skills--examples--workflow)
- [Multi-Environment Profiles (Dev / QA / Prod)](#-multi-environment-profiles-dev--qa--prod)
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

## 26 SAP-Specialized Agents

| Category | Agents |
|----------|--------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — system admin, transport management, diagnostics |
| **Discovery (1)** | CBO Stocker — CBO package inventory, where-used graph, reusable-object catalog |
| **Modules (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**Delegation map (Module Consultation Protocol):**
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` → `sap-{module}-consultant` (business semantics) or `sap-bc-consultant` (system-level)
- `sap-architect` → `## Consultation Needed` → `sap-bc-consultant` (transport strategy, authorization, performance, sizing, patching) or module consultant
- `sap-analyst` / `sap-critic` / `sap-planner` additionally have mandatory **Country Context** block (loads `country/<iso>.md`)
- **Direct MCP read access** for Core agents — package / DDIC / class / program / where-used / runtime-dump tools carry read-only access; write CRUD stays on `sap-executor` / `sap-planner` / `sap-writer` / `sap-qa-tester` / `sap-debugger`

## 14 Skills

| Skill | Description |
|-------|-------------|
| `sc4sap:setup` | Plugin setup — auto-installs MCP server, generates SPRO config, installs blocklist hook |
| `sc4sap:mcp-setup` | Standalone MCP ABAP ADT server install / reconfigure guide |
| `sc4sap:sap-option` | View / edit SAP profiles (credentials, RFC backend, blocklist, active modules), **manage multi-environment profiles** (Dev/QA/Prod switch/add/remove), and HUD usage limits |
| `sc4sap:sap-doctor` | Plugin + MCP + SAP diagnostics (6 layers) |
| `sc4sap:create-object` | ABAP object creation (hybrid mode — transport + package confirm, create, activate) |
| `sc4sap:create-program` | Full ABAP program pipeline — Main+Include, OOP/Procedural, ALV, Dynpro, Text Elements, ABAP Unit |
| `sc4sap:program-to-spec` | Reverse-engineer an ABAP program into a Functional/Technical Spec (Markdown / Excel) |
| `sc4sap:program-to-manual` | End-user manual for one program (single HTML) — scenario steps on drawn screens with numbered callouts, check points, messages & actions |
| `sc4sap:compare-programs` | Side-by-side business comparison of 2–5 ABAP programs that split the same scenario by module / country / persona — consultant-facing editable HTML report (verdict matrix, field differences, screens side by side, decision guide; versioned, English companion) |
| `sc4sap:config-to-document` | One module's configuration documented from the live system (MM first) — single HTML along the IMG tree: real table values on SM30-style screens, customer-changed rows with transports, configuration checks, SAP IMG documentation, consultant notes reviewed by `sap-critic`, in-page edit mode for notes, values and change history (`--import` carries edits into the next version) |
| `sc4sap:interface-mapping-spec` | Interface mapping specification — one editable HTML page in the template layout (cover, revision history, Source → Target grid with R / MAPPING, response block, conversion rules, extraction SQL, field guide); SAP side from DDIC / RFC signature or a field list / consultant proposal for new interfaces; proposed counterpart side and conversion rules; in-page checks; versioned, English companion |
| `sc4sap:smartform-preview` | Expected print of a SmartForm as JPG + HTML — windows in mm, SmartStyle fonts, template grids, SE78 graphics, loops with sample rows; invented sample values sized to the DDIC types; cut-off cells and windows reported (read-only) |
| `sc4sap:smartform-from-pdf` | SmartForm built from a PDF (or screenshot) of the printed form — templates from the rules, texts in existing SmartStyle formats, fields / item loops / interface decided with the user; uploaded to DEV, printed there and scored against the source page |
| `sc4sap:project-dashboard` | SAP project dashboard — one editable HTML page per project (summary, KPIs, milestones, WBS / Gantt, risks & decisions, team, history) plus a portfolio page and a one-page weekly status with Q-gate check; WRICEF stages per module / development consultant; actuals read from SAP (transports, package objects, dumps) |
| `sc4sap:role-matrix` | Role & authorization workbook — business roles, PFCG roles, role × T-code F/C/D, user × role, authorization objects, SoD conflict check; new design or read from SAP (user IDs only); paged sheets for large systems |
| `sc4sap:analyze-code` | ABAP code analysis (Clean ABAP / performance / security) |
| `sc4sap:stock-cbo` | Customer Business Object (CBO) inventory scanner with cross-module gap analysis |
| `sc4sap:cbo-relation-map` | Relation map of one or more packages' customer objects as one HTML page, drawn from the `stock-cbo` graph — hubs, usage, named groups, Obsidian-style neighbourhood view, impact up to TCodes, paths, table CRUD, field-level CRUD (Fields tab, incl. customer appends of standard tables), source snippets, PNG / CSV; collects the graph when missing (whole package or used TCodes; eco = map-only) |
| `sc4sap:analyze-symptom` | Step-by-step SAP operational error/symptom analysis (dumps, logs, SAP Note candidates) |
| `sc4sap:ops-health-check` | Operations report (HTML for the customer or PMO: summary, KPIs vs the previous period, dump trend, issues & actions) — dumps grouped and compared with the previous period, the transports that changed a dumping program, aborted jobs, update errors, IDocs in error; verdict + next steps (read-only) |
| `sc4sap:transport-readiness` | CTS check of transport requests before QA / PRD — open tasks, inactive objects, local packages, shared objects (import order), unreleased DDIC dependencies, optional target merge check over an SM59 destination; verdict per request (read-only) |
| `sc4sap:program-test` | Test a program on DEV with DEV or QA rows as test doubles (production refused until MCP-side masking) — expected values frozen first, masked data, ABAP Unit verdict per case, mutants + tamper check, NOT_TESTABLE share (no transport, program untouched) |
| `sc4sap:uat-scenarios` | UAT or integration test (SIT) scenario set — consultant draft, item-by-item proposals, T-code check, per-cycle progress, Excel export in two layouts (read-only on SAP) |
| `sc4sap:ask-consultant` | Direct user-facing Q&A with a module consultant agent (SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC). Read-only — honors the configured SAP environment. |
| `sc4sap:module-to-process` | One editable HTML process map per module from the TCodes users actually run (productive ST03N): standard L1–L4 backbone with CBO tasks, variants, owners, systems; L3 scenario swimlanes; PDD-style task sheet per L4 with sourced business rules, steps, interfaces and S/4 conversion notes; optional consultant review, BPH reconciliation, English companion |
| `sc4sap:trust-session` | INTERNAL-ONLY — session-wide MCP permission bootstrap |

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

### `/sc4sap:stock-cbo`
Walks a Z-package, catalogs reusable assets, runs cross-module gap analysis.
```
/sc4sap:stock-cbo
→ "Scan ZSD_ORDER package for MM module reuse candidates"
```
Flow: `GetPackageTree` → category walk → frequency heuristics → cross-module gap check → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`.

### `/sc4sap:cbo-relation-map`
Draws the reference graph that `stock-cbo` builds (`graph.json`) as one self-contained HTML page per package, Korean plus English companion. Only customer objects appear — in-package members and Z / Y / namespace objects outside the package; standard targets are left out. Relations: DDIC typing, check tables, search helps, value tables, row types, view bases, collective search helps, and from source includes, calls, submits, transactions, reads and writes — each marked stated in DDIC, stated in source or inferred, with its DD* row or source line. Includes are folded into their program or function group; descriptions (walk / inventory), usage (`usage-result.json`) and standard check tables (DD08L, shown as text only) are added when the inventory folder has them. The overview lists the hubs by business relations (typing hubs apart), usage counts and auto-named Louvain groups; the explore view is drawn like Obsidian's graph (canvas, hover lights the neighbours, names fade in on zoom) with relation presets and filters by kind, type, basis, usage and package; the side panel shows the impact of a change up to the TCodes and every relation with a ±10-line source snippet; paths run in any direction or along the arrows with up to three alternatives; a Table CRUD tab lists who creates, reads, updates and deletes each table; PNG and CSV export. Several packages merge into one page (colour by package). When the graph is missing the skill collects it — whole package (standard: full `stock-cbo`; eco: Haiku walk + Step G only) or the TCodes users actually run (`usage-scope.mjs`). The page itself makes no SAP call. `build-relation-map.mjs find --base <dir> … --packages <list>` locates the graphs offline (one folder per package and scope, missing and ambiguous packages named), so a hosted run (the web app) can build the page in one step; `--src` (repeatable), `--max-bytes` (rebuild without snippets, else exit 3) and `--sid` serve that run.

### `/sc4sap:analyze-symptom`
```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_DEMO_POSTING at line 234 during F110"
```
Flow: `RuntimeListDumps` → `RuntimeAnalyzeDump` → stack trace → SAP Note candidates → remediation options.

### `/sc4sap:program-to-spec`
Reverse-engineer an ABAP program into a spec (Markdown/Excel) with Socratic scope narrowing.

### `/sc4sap:program-to-manual`
Writes the manual a business user follows: one scenario per task ("send POs", "check missing receipts"), each step on a drawn picture of the screen — selection screen, output ALV, popups and follow-up screens — with numbered callouts, plus check points taken from the source validations, a field reference, messages with the action to take, a glossary and an automatic revision history. One self-contained HTML file: a web document on screen, one step per A4 landscape page when printed. Author, team, company and the confidentiality notice come from the profile `config.json` → `manual`.

### `/sc4sap:uat-scenarios`
Keeps the UAT scenarios of a module or process area — or the integration test (SIT) of an end-to-end flow across modules, where every step carries its module and each hand-off must check what arrived — as one JSON set (`scripts/uat/build-uat.mjs`) that is edited over the test cycles instead of rewritten: scenarios carry their process chain, process and task, and STEP rows with activity, system (SAP or the interfacing system), T-code, check points, input data, expected output, test user ID, a result per cycle (pass / fail / blocked), status, follow-up and issue. The module consultant drafts the set and later proposes changes as patch operations (`set-scenario`, `set-step`, `add-step`, `remove-step`, `add-scenario`) that are listed and applied only for the numbers the user accepts — an operation that names a missing step is skipped with its reason. Every SAP step's T-code is checked with `GetTransaction`; `check` lists gaps (steps without T-code or expected result, failed steps without follow-up) and the progress per cycle. Exports: layout A (schedule, activities, one sheet per scenario with overview and test procedure) and layout B (flat list with a header row per scenario and a test-user sheet of IDs), written without a spreadsheet library.

**Defects and fixes** (`build-uat.mjs defects`). Each issue names the requests that fix it (`transports`, any `<SID>K<6>`) and its retest cycle; with the `model.json` of a CTS check the page shows per defect the requests' CTS state and a status — no fix request, fix not checked, fix in progress, ready to move (CTS ready or released; import into QA is not read), retest due, retest passed / failed. Request texts that name `ISS-0003` or `<SET>/ISS-0003` come back as a proposed patch, never as links. `<ID>-defects.json` is the KPI feed the project dashboard reads (`uat-defects-open`, `uat-defects-no-fix`, `uat-fix-ready`, `uat-retest-due`, `uat-retest-pass-rate`).

### `/sc4sap:transport-readiness`
Answers "can these requests go tonight, and in which order?" before anyone opens STMS. `scripts/transport/build-tr-check.mjs collect` reads the requests (by number, by owner, or by a text pattern such as `[SD]%`), their tasks and objects (E070 / E07T / E071, task objects folded into their request), the same objects in other open requests, the objects' packages (TADIR) and activation (DWINACTV where the system reads it, otherwise ADT's inactive list for the connection user — reported as partial), and, for customer DDIC objects in other unreleased requests of the last 90 days, whether this request's code uses them (`GetWhereUsed`). With `--target-dest <SM59 destination>` it also reads the target system through `GetRemoteTableContents` (RFC_READ_TABLE, ≤ 200 objects): TADIR (does the object exist, which package), VRSD (the request of the last change to each part — a target-side transport of copies only exports and is passed over; a request number the source does not know, or knows with another date, is a change made in the target or by another route) and, for the customer DDIC objects the code uses (dependency rows and D010TAB), target TADIR. New findings: *changed in the target* and *missing in the target* block, *older than the target* (roll-back) and *target not read* warn. `build` gives each request a verdict — blocked (open task, inactive object, local package, unreleased DDIC dependency), check (shared objects, partial inactive list), ready — and the first fix.

**CAB change notes** (cab mode). `collect --cab` adds one read — scheduled and released jobs (TBTCO status S / P) with their step programs (TBTCP). `scripts/transport/build-cab-notes.mjs prepare` (offline) gives every request a card: the objects, what they affect — the reverse reach over the CBO graph of `stock-cbo` with the relation map's impact rule (first step over every relation, then code relations, up to 6 steps) up to the TCodes with their ST03N usage, and the scheduled jobs that run an affected program — test evidence only from what is named — a project dashboard (WRICEF request or objects), UAT sets given or listed by that dashboard (a linked issue, or a step on an affected T-code marked as a guess), each with its set id, a risk level H / M / L by fixed rules, and fact-only rollback notes that always start with "no automatic rollback" (previous target version from VRSD — restore it into a new request, never import the old request again; new object; table data; customizing; *target unchecked* when the target was not read). A package without a graph shows *impact not collected*, never "none". `sap-writer` drafts two or three business sentences per request; `save` refuses a sentence that names an object, T-code or number not in its input. The page (ko / en, A4 landscape) marks the text *AI draft* until a person edits it; the CAB decision and comments are typed by people; Save → `import` keeps the edits.

### `/sc4sap:ops-health-check`
The morning check of SM / AMS operations. `scripts/ops/build-ops-check.mjs collect` reads, for a period (default since yesterday) and the period of the same length before it: the short dumps (`RuntimeListDumps` — the ADT feed and, on ECC, the ST22 list), the transport requests from a week before the period on with their texts and code objects (E070 / E07T / E071), aborted jobs (TBTCO status A with the first step's program), update requests with an error (VBHDR) and IDocs in an error status (EDIDC). `build` groups the dumps by runtime error and program, marks the groups that are new against the previous period, lists next to a group the requests that changed its program, include, function group or class before its last dump, and gives a verdict (red / amber / green) with the next step for each finding — `/sc4sap:analyze-symptom` for a dump group, SM37 / SM13 / BD87 for the rest. On BASIS < 7.50 the reads go through the `ZMCP_ADT_DISPATCH` action `TABLE_READ`, which lists the job, update and IDoc header tables by name (job logs, update data and IDoc data stay closed); an older dispatcher refuses them, and they show as *not readable — check in SM37 / SM13 / WE02*, never as empty. No business document contents are read; user names are counted, never listed. One self-contained HTML page (ko / en / ja, light and dark, A4 landscape print) under `ops-check/<to>/` of the profile artifact base.

### `/sc4sap:smartform-preview`
Draws the expected print of a SmartForm without running its print program: `GetSmartFormContent` reads the form, its SmartStyles and its SE78 graphics; the windows are drawn at their mm positions with template grids (borders, shading), loops with sample rows and the graphics at their printed size, then saved as JPG by headless Chrome / Edge. Every `&field&` gets an invented sample value sized to its DDIC type (no business data), so the picture shows the real cut-offs — the report lists the cells and windows whose content does not fit.

### `/sc4sap:smartform-from-pdf`
The reverse direction: builds a SmartForm from a PDF of the printed form (or a screenshot, positions estimated). `read-pdf.mjs` reads the page — every text with its position, font and size, the rules and the images — without dependencies; `plan-form.mjs` turns ruled areas into templates and puts each text in its cell or its own window, in the paragraph and character format of an **existing** SmartStyle that prints its font (no style is created); the main thread decides with the user which texts are fields, which grid rows are item lines (a loop over an internal table) and the DDIC types of the interface (`shape-form.mjs`); `write-form.mjs` writes the Form Builder XML. The form is uploaded to the DEV system (`CreateSmartForm`), printed there (`RenderSmartForm`) and the print is scored against the source page (`compare-layout.mjs`).

### `/sc4sap:project-dashboard`
One editable page per SAP project and a portfolio page over all of them. The plan comes from a template for the project type (new implementation on SAP Activate, S/4 conversion, rollout, AMS release, small project); progress comes from the PM in edit mode and from the connected system, read-only: transport requests split into customizing (configuration work) and workbench (development work), package objects, inactive objects and dumps after go-live. Every WRICEF item moves through its stages with a module consultant and a development consultant, so the hand-off queue between them is visible. Team members join and leave by date; open items of leavers are flagged for reassignment. Spreadsheet-style editing with a fixed header row, also on mobile.

Weekly status: `build-project-doc.mjs status --project <CODE> [--week-end] [--gate] [--evidence <file>]…` writes a one-page status (A4, at most two printed pages, phone layout) — overall and workstream RAG with the PM's own call, what moved since the last status run, KPI changes, top risks, decisions needed, milestones of the next two weeks — and keeps the week in the model (`statusLog`, 26 weeks), so the dashboard page carries next week's baseline. With a gate, each exit criterion is checked against the evidence handed over (CTS check, UAT page or set, operations report, UAT defect feed) through an optional rule tag (`[cts-blocked<=0]`, `[uat-pass:2nd>=95]`, `[defects-open<=3]`, `[wricef>=ut:80]` …) and a verdict is suggested; the PM's milestone status stays. Risks and decisions are model lists, edited in their own tab. Offline unless `--refresh`.

### `/sc4sap:role-matrix`
The role & authorization document as one editable workbook: cover with checks, business roles, PFCG roles, business role × T-code matrix (F full / C change / D display), user × role assignment, authorization objects, SoD rules with an automatic conflict check per user and inside a role, change history. New design: the module consultant proposes roles, T-codes, authorization objects and SoD rules, narrowed to the T-codes users run when ST03N usage is available. From SAP: the PFCG role tables are read (levels estimated from ACTVT and marked "?"); user assignment by user ID and validity only — user master, logon and password tables are never read, names and departments are typed by hand. Role names are read in ranges past the 5,000-row limit of one read, and long sheets are paged (rows and 50 role columns), while search, CSV and paste work on the whole sheet.

**Triage mode** — one user gets "no authorization" in one T-code: the SU53 checks (or, from the message only, the T-code start checks and the SU24 proposals as an estimate) are evaluated per authorization instance against the user's roles, with one of four verdicts — A missing, B held but not in effect (profile generation / user comparison), C assignment not valid today (ended or not started yet), D unclear. Up to five candidate roles are proposed least-privilege first, each with the T-code level SoD conflicts it would add. One HTML page plus a short ticket summary; read-only; only that user's role assignments are read, a PRD run asks first, and the user ID stays out of file names and titles.

### `/sc4sap:sap-doctor`
Plugin + MCP + SAP connectivity diagnostics. First thing to run when something's off.

### `/sc4sap:sap-option`
View and edit `.sc4sap/sap.env` — credentials, RFC backend, blocklist policy, active modules. Secrets masked.

## 🌐 Multi-Environment Profiles (Dev / QA / Prod)

**Multinational SAP customers run a 3-tier landscape per legal entity** (Sandbox / Dev / QA / Prod; often several legal entities: KR, US, DE…). sc4sap supports managing all of them from a single Claude Code session, with **automatic safety rails on non-Dev tiers.**

### Profile storage

| Where | What |
|---|---|
| `~/.sc4sap/profiles/<alias>/sap.env` | User-level profile definition (connection, tier, industry, modules). Shared across all repos. |
| `~/.sc4sap/profiles/<alias>/config.json` | User-level per-profile config (naming convention, systemInfo, activeTransport history). |
| `~/.sc4sap/profiles/.trash/` | Soft-deleted profiles, auto-purged 7 days after removal. |
| `<project>/.sc4sap/active-profile.txt` | Project-level pointer — which profile this repo talks to right now. |
| `<project>/.sc4sap/work/<alias>/` | Project artifacts (specs, CBO catalogs, audits) per profile. Read-only cross-view: a QA session can see Dev-produced specs, but writes always land under the active profile. |

### Tier-based readonly enforcement (Strict policy)

`SAP_TIER` is an enum: `DEV` | `QA` | `PRD`. Non-canonical tiers (Sandbox, Staging, Pre-Prod, Training) map to the safer equivalent (e.g. Staging → PRD).

| Tool family | DEV | QA | PRD |
|---|---|---|---|
| `Create*` / `Update*` / `Delete*` (DDIC, ABAP, CDS, BO, SB, MDE, Screen, GUI, Package) | ✓ | ✗ | ✗ |
| `CreateTransport` | ✓ | ✗ | ✗ |
| `RunUnitTest` | ✓ | ✓ | ✗ |
| `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` | ✓ | ✗ | ✗ |
| `Get*` / `Read*` / `Search*` / `RuntimeAnalyze*` / `RuntimeList*` / `ValidateServiceBinding` | ✓ | ✓ | ✓ |

Two-layer defense:
- **Layer 1 — PreToolUse hook** (`scripts/hooks/tier-readonly-guard.mjs`) installed via `scripts/install-hooks.mjs`. Fires before the tool request is sent; emits a clear deny reason the LLM can explain to the user.
- **Layer 2 — MCP server guard** (`abap-mcp-adt-powerup/src/lib/readonlyGuard.ts`) — uncircumventable. Even if the user disables hooks or skips the plugin install, the server rejects mutation tools on QA/PRD with `ERR_READONLY_TIER`. `ReloadProfile` is always allowed so users can switch back to Dev without an escape hatch debate.

### OS keychain for passwords (`@napi-rs/keyring`)

Profiles store `SAP_PASSWORD=keychain:sc4sap/<alias>/<user>` — a reference, not the secret. The real value lives in the OS credential store:

| OS | Backend |
|---|---|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret (GNOME Keyring / KWallet) |

Implementation uses `@napi-rs/keyring` — Rust + N-API prebuilt binaries (no `node-gyp` compilation on install, no rebuild on Node version bumps). Declared as `optionalDependencies`; headless environments (Docker, CI) gracefully fall back to `SAP_PASSWORD_STORAGE=file` (plaintext with a prominent warning). Existing plaintext `.sc4sap/sap.env` files are migrated into the keychain on first upgrade.

### Switching, adding, removing profiles

All via `/sc4sap:sap-option`:

- **Switch** — interactive picker (native `AskUserQuestion` UI) with per-profile preview panel showing connection details + the tools-allowed matrix. Writes `active-profile.txt`, calls `mcp__sap__ReloadProfile` on the MCP server (no Claude Code restart needed), and the HUD re-renders with the new `alias [tier] 🔒` badge.
- **Add** — wizard captures alias, tier, host/client/user, password (streamed directly to keychain, never shown on-screen). Same-company auto-detection: adding `KR-QA` while `KR-DEV` exists offers to copy `SAP_INDUSTRY`, `SAP_ACTIVE_MODULES`, `ABAP_RELEASE`, and the `namingConvention` block.
- **Remove** — requires the user to type the alias verbatim for confirmation. Archives to `.trash/{alias}-{timestamp}/` instead of hard-deleting. Refuses if the alias is the active profile.
- **Edit** — modifies non-tier fields (tier is immutable through this path to prevent accidental PRD → DEV downgrades). Password edits rewrite the keychain entry.
- **Purge** — permanently deletes `.trash/*` older than 7 days (or `--all` for immediate full clear).

### Migration from legacy single-profile `sap.env`

Existing users upgrading to the multi-profile release see a SessionStart banner (`scripts/legacy-migration-banner.mjs`) the first time they start Claude Code in a project with `.sc4sap/sap.env` but no `active-profile.txt`. The banner points them to `/sc4sap:sap-option` which drives a two-question migration wizard (alias, tier). The legacy file is renamed to `sap.env.legacy` for rollback; no data is deleted.

### HUD

Line 2 of the statusline shows `{alias} [{tier}]` with a 🔒 when `tier != DEV`. Color is not used — the lock icon is the single, theme-independent signal.

```
 KR-DEV [DEV]       SID S4H · client 100 · user DEVELOPER · CTS DEVK904224
 KR-PRD [PRD] 🔒    SID S4P · client 400 · user READER
```

### Related files

- Design: [`multi-profile-design.md`](multi-profile-design.md)
- Implementation plan: [`multi-profile-implementation-plan.md`](multi-profile-implementation-plan.md)
- CLI: `scripts/sap-profile-cli.mjs` (list / switch / add / remove / migrate / purge / keychain-set / keychain-delete)
- Skill companions: `skills/sap-option/profile-management.md`, `skills/sap-option/migration.md`

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
| `include-structure.md` | Main program + conditional include set (t/s/c/ct/e/o/i/a/f) |
| `oop-pattern.md` | Two-class OOP split (`LCL_DATA` + `LCL_ALV` in `c`, `LCL_EVENT_ALV` in `e`) |
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
| `model-routing-rule.md` | Sonnet / Opus / Haiku routing + Response Prefix Convention + Phase Banner Convention. See **[`skill-model-architecture.md`](skill-model-architecture.md)** for per-skill / per-phase model allocation (design intent — frontmatter `model:` is declarative). |
| `ok-code-pattern.md` | Screen OK_CODE contract (one TOP variable → screen NAME → PAI dispatch; never CASE sy-ucomm) |
| `field-typing-rule.md` | DDIC field typing priority (Standard DE → CBO DE → new DE → primitive) |
| `function-module-rule.md` | FM source convention (inline IMPORTING/EXPORTING/TABLES signature) |
| `transport-client-rule.md` | Every `CreateTransport` requires explicit client from `sap.env` |
| `ecc-ddic-fallback.md` | ECC DDIC creation: MCP tools via `ZMCP_ADT_DDIC_*` first, `$TMP` helper report as fallback |
| `cloud-abap-constraints.md` | Forbidden statements + Cloud-native API replacements for S/4 Cloud Public |
| `customization-lookup.md` | Existing Z*/Y* BAdI impl / CMOD / form-exit / append reuse gate |

## Context Loading Architecture (v0.5.2+)

sc4sap's rule corpus is large — 25+ `common/*.md` + 14 `configs/{MODULE}/*.md` + 30+ industry/country files. Loading every file on every agent dispatch wastes tokens and dilutes model attention. The **4-tier context loading model** (defined in [`common/context-loading-protocol.md`](../common/context-loading-protocol.md)) separates "always-load safety rails" from "role-specific baseline" from "condition-triggered" from "per-task kit".

| Tier | When loaded | Files |
|------|-------------|-------|
| **Tier 1 — Global Mandatory** | Every agent, every skill, every session start | `data-extraction-policy.md`, `sap-version-reference.md`, `naming-conventions.md` |
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
| **Module Consultant** | 14 module consultants (SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba) | `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, `configs/{MODULE}/*.md` (on demand — only the file the question needs) |
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
[Model: Opus]
— pure main-thread response, no sub-agent dispatches

[Model: Opus · Dispatched: Sonnet×2]
— main thread + two parallel Sonnet executors (Wave 2 G4-prep text bulk)

[Model: Opus · Dispatched: Opus×1 (planner)]
— Phase 2 planner dispatch

[Model: Opus · Dispatched: Sonnet×3 (B3a executor range α/β/γ)]
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

Configure via `/sc4sap:setup` (Step 4) or `/sc4sap:sap-option modules`. Consumed by `create-program`, `create-object`, `stock-cbo`, all consultant agents.

## SAP Platform Awareness (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program` runs a mandatory SAP Version Preflight, reading `.sc4sap/config.json` for `sapVersion` and `abapRelease`:

- **ECC** — no RAP/ACDOCA/BP; syntax gated by release
- **S/4HANA On-Premise** — classical Dynpro warned; extensibility-first, MATDOC + ACDOCA for finance
- **S/4HANA Cloud (Public)** — **classical Dynpro forbidden**; redirects to RAP + Fiori Elements, `if_oo_adt_classrun`, or SALV-only. Full list in `common/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — prefer CDS + AMDP + RAP + Business Partner APIs

### ECC / BASIS < 7.50 — MCP Tool Compatibility Matrix

On legacy systems the MCP server (`abap-mcp-adt-powerup`) automatically routes through `AdtClientLegacy` when any of the following is set on the active profile:

- `SAP_VERSION=ECC` — always marks the profile as legacy
- `ABAP_RELEASE` numeric `< 750` (e.g. `740`, `731`)
- `SAP_SYSTEM_TYPE=legacy` — explicit override (back-compat)

Legacy mode deliberately refuses a subset of endpoints that do not exist on BASIS < 7.50, returning a clear `"not supported on this SAP system"` message instead of a cryptic 404.

Matrix verified on ECC 7.40 (BASIS 7.40, SAP_SYSTEM_TYPE=onprem, SAP_VERSION=ECC, ABAP_RELEASE=740):

| Category | Tools | ECC 7.40 | Notes |
|---|---|---|---|
| Session, Search, Discovery | `GetSession`, `SearchObject`, `GetObjectInfo`, `GetObjectStructure`, `GetInactiveObjects` | ✅ | — |
| Package read | `GetPackageContents`, `GetPackageTree` | ✅ | — |
| Package metadata | `GetPackage` | ❌ | `/sap/bc/adt/packages` absent — use SE80/SE21 |
| DDIC read | `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain` | ❌ | `/sap/bc/adt/ddic/{tables,structures,dataelements,domains}` added in 7.50 |
| DDIC write (classic) | `Create/Update/Delete` of `Table`, `Structure`, `DataElement`, `Domain` | ❌ | Same gap — the MCP routes Create to the `ZMCP_ADT_DDIC_*` FMs (setup Step 9a.2, OData backend); otherwise the **$TMP helper-report fallback** in [`common/ecc-ddic-fallback.md`](../common/ecc-ddic-fallback.md) |
| Classic view (`VIEW/DV`) | `GetView` for V_T001_CORE-style classic views | ❌ | Classic view endpoint 404 on ECC 7.40 |
| CDS view (`DDLS/DF`) | `GetView`, `CreateView`, `UpdateView`, `DeleteView` | ✅ | `/sap/bc/adt/ddic/ddl/sources/` present from BASIS 7.40 SP05+; CDS DDL activates cleanly |
| ABAP source | `Get/Create/Update/Delete` for Program, Class, Interface, Include, FunctionGroup, FunctionModule | ✅ | Full R/W; `UpdateFunctionModule` auto-defaults `transport_request` to `"local"` for $TMP objects |
| Analysis | `GetAbapSemanticAnalysis`, `GetAbapAST` | ✅ | Client-side parse, no SAP call |
| WhereUsed | `GetWhereUsed` | ⚠️ | Classic objects only — `TABL` target reports "Unsupported object type" |
| Enhancements | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` | ❌ | `/sap/bc/adt/enhancements` 404 on BASIS < 7.50 — use SE18 / SE19 / CMOD / SMOD |
| Transport | `ListTransports`, `GetTransport`, `CreateTransport` | ✅ | — |
| Runtime / Dumps | `RuntimeListDumps`, `RuntimeAnalyzeDump`, `RuntimeGetDumpById` | ✅ | ST22 via ADT |
| Screen / GUI Status | `GetScreen`, `GetGuiStatus`, `GetTextElement` (+ Create/Update) | ℹ️ | RFC-dispatched — requires `SAP_RFC_BACKEND` preflight (odata / soap) |
| RAP / Behavior / Service / MetadataExt | all `*BehaviorDefinition`, `*BehaviorImplementation`, `*ServiceDefinition`, `*ServiceBinding`, `*MetadataExtension` | ❌ | S/4HANA-only — RAP stack does not exist on ECC |
| Table contents | `GetTableContents`, `GetSqlQuery` | ℹ️ | Works, but gated per-profile by the data-extraction blocklist (see §Data Extraction Blocklist) |

Legend: ✅ full · ⚠️ partial · ❌ refused with clear error (SAP platform limit) · ℹ️ works, but depends on prior setup / policy.

Upstream reference (same matrix, MCP-server canonical view): [`abap-mcp-adt-powerup` README → Legacy (ECC / BASIS < 7.50) Compatibility Matrix](https://github.com/babamba2/abap-mcp-adt-powerup#legacy-ecc--basis--750-compatibility-matrix).

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

Screen / GUI Status / Text Element operations dispatch through RFC-enabled FMs on SAP. 2 transport backends:

| `SAP_RFC_BACKEND` | How | When to use |
|---|---|---|
| `odata` (default) | HTTPS OData v2 `ZMCP_ADT_SRV` | Works on hardened Gateway installs; routes through standard Gateway auth (S_SERVICE). [docs/odata-backend.md](odata-backend.md) |
| `soap` | HTTPS `/sap/bc/soap/rfc` | Classic path when `/sap/bc/soap/rfc` ICF node is active (increasingly disabled in production) |

`native`, `gateway` and `zrfc` were removed in MCP 4.10.0 — the MCP server refuses to start with them. Switch to `odata` or `soap`.

Switch any time via `/sc4sap:sap-option`, reconnect MCP, verify with `/sc4sap:sap-doctor`.

---

← [Back to README](../README.md) · [Installation →](INSTALLATION.md) · [Changelog →](CHANGELOG.md)
