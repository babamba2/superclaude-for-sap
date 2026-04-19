# SuperClaude for SAP (sc4sap) — Development Rules

This file is the **index** of development rules — NOT a payload to preload. Detailed rules live in `common/` and `exceptions/`. Consult files on demand per [`common/context-loading-protocol.md`](common/context-loading-protocol.md); every dispatch declares its minimal context kit. Everything referenced below is MANDATORY for every sc4sap session (agents, skills, direct user requests, pipelines).

## Development Standards — References

| Topic | Reference |
|---|---|
| Naming conventions (Z/Y prefixes, module prefix, includes, FGs, tables, DEs, DOs) | [`common/naming-conventions.md`](common/naming-conventions.md) |
| Field typing priority (Standard DE → CBO DE → new CBO DE → Data Type+Length; never `LIFNR CHAR 10`) | [`common/field-typing-rule.md`](common/field-typing-rule.md) |
| Function Module source convention (inline IMPORTING/EXPORTING/TABLES in FUNCTION statement; no placeholder, no shadow locals) | [`common/function-module-rule.md`](common/function-module-rule.md) |
| SAP version awareness (ECC vs S/4HANA — tables, TCodes, BAPIs, patterns) | [`common/sap-version-reference.md`](common/sap-version-reference.md) |
| ABAP release awareness (syntax availability per release, never emit newer features than `ABAP_RELEASE`) | [`common/abap-release-reference.md`](common/abap-release-reference.md) |
| Clean ABAP coding standards (paradigm-split) | shared baseline [`common/clean-code.md`](common/clean-code.md) + one of [`common/clean-code-oop.md`](common/clean-code-oop.md) or [`common/clean-code-procedural.md`](common/clean-code-procedural.md) chosen from the Phase 1B Paradigm dimension; also pulls in `constant-rule.md`, `text-element-rule.md`, `abap-release-reference.md` |
| Procedural FORM naming (screen-bound suffix) | [`common/procedural-form-naming.md`](common/procedural-form-naming.md) |
| OOP two-class split pattern | [`common/oop-pattern.md`](common/oop-pattern.md) |
| Include structure (Main + conditional includes) | [`common/include-structure.md`](common/include-structure.md) |
| ALV display rules | [`common/alv-rules.md`](common/alv-rules.md) |
| OK_CODE binding pattern (TOP decl + screen NAME + PAI FORM routing; never `CASE sy-ucomm`) | [`common/ok-code-pattern.md`](common/ok-code-pattern.md) |
| SPRO lookup protocol (consultant agents, IMG/Customizing) | [`common/spro-lookup.md`](common/spro-lookup.md) |
| Customization lookup protocol (existing Z*/Y* BAdI impl, CMOD, form-exits, appends — mandatory before recommending new enhancements/extensions) | [`common/customization-lookup.md`](common/customization-lookup.md) |
| Data extraction policy (blocklist rule, `acknowledge_risk` hard rule, refusal template) | [`common/data-extraction-policy.md`](common/data-extraction-policy.md) |
| Transport client rule (every `CreateTransport` must receive explicit `client` from `.sc4sap/sap.env` SAP_CLIENT — never an implicit default) | [`common/transport-client-rule.md`](common/transport-client-rule.md) |
| Blocklist (per-category table lists) | [`exceptions/table_exception.md`](exceptions/table_exception.md) (index) + `exceptions/*.md` section files |
| Industry business-context references (14 industries) | [`industry/README.md`](industry/README.md) + `industry/*.md` |
| Country / localization references (16 countries + EU common) | [`country/README.md`](country/README.md) + `country/*.md` |
| Active modules — cross-module integration matrix (MM↔PS, SD↔CO, QM↔PP, …) | [`common/active-modules.md`](common/active-modules.md) |
| Context loading protocol (CLAUDE.md is an index; every dispatch declares its minimal context kit) | [`common/context-loading-protocol.md`](common/context-loading-protocol.md) |
| Model routing (Sonnet for reads + repetitive bulk; Opus for novel code, cross-file reasoning, ambiguity) | [`common/model-routing-rule.md`](common/model-routing-rule.md) |

Before any work: verify `.sc4sap/config.json` exists and contains `sapVersion`, `abapRelease`, `industry`. Every recommendation, piece of generated code, and tool invocation must respect those fields.

## Critical Rules (summary — full text in referenced files)

1. **Custom objects use `Z`/`Y` prefix.** Full rules: `common/naming-conventions.md`.
2. **Match SAP version and ABAP release.** Never use S/4-only tables on ECC or syntax newer than the configured `abapRelease`. Full rules: `common/sap-version-reference.md`, `common/abap-release-reference.md`.
3. **Transport discipline.** Every change goes on a transport. Description format: `[MODULE] [Action] [Object] - [brief]`. Never release with syntax errors or inactive objects. Every `CreateTransport` call must receive an explicit `client` parameter resolved from `.sc4sap/sap.env` SAP_CLIENT (full rule: `common/transport-client-rule.md`).
4. **Activate after every change.** Run `GetAbapSemanticAnalysis` for syntax, then `GetInactiveObjects` to confirm no leftovers. Follow Clean ABAP conventions: `common/clean-code.md` (shared) + the paradigm-specific companion (`clean-code-oop.md` OR `clean-code-procedural.md`).
5. **Data extraction is gated.** Before any `GetTableContents` / `GetSqlQuery`: consult `exceptions/table_exception.md` and `common/data-extraction-policy.md`. Schema/DDIC (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`) is always allowed.
6. **`acknowledge_risk` requires explicit user affirmative** (`yes` / `승인` / `authorize` / `approve` / `proceed` / `confirmed`). Ambiguous commands (`뽑아봐`, `try it`, `pull it`, `my mistake`) are NOT authorization. Per-call, per-table, per-session — never carries over. Full protocol: `common/data-extraction-policy.md` → "The `acknowledge_risk` Parameter — HARD RULE".
7. **Industry context matters.** For config analysis / business process design / Fit-Gap: load the project's `industry/<key>.md` (from `config.json` → `industry` or `sap.env` → `SAP_INDUSTRY`). If unset, ask the user.
8. **Country / localization context matters.** For tax, e-invoicing, banking, statutory reporting, date/number formats: load the project's `country/<iso>.md` (from `config.json` → `country` or `sap.env` → `SAP_COUNTRY`, ISO alpha-2 lowercase: `kr`, `us`, `de`, `eu-common`, …). Multi-country projects load every relevant file and flag cross-country touchpoints (intercompany, intra-EU VAT, transfer pricing). If unset, ask the user.

Enforcement: L1 agent instructions → L2 this file → L3 `PreToolUse` hook (`scripts/hooks/block-forbidden-tables.mjs`) → L4 MCP server upstream guard.

## Plugin Usage

### Skills (`/sc4sap:` prefix)
- `/sc4sap:setup` — Initial plugin setup + SPRO config generation (auto-invokes `trust-session`)
- `/sc4sap:create-program` — Full ABAP program pipeline (Phase 0–8) with execution-mode gate (auto/manual/hybrid) and parallel Phase 4/6; auto-invokes `trust-session` at Phase 1
- `/sc4sap:create-object` — Single ABAP object creation (auto-invokes `trust-session`)
- `/sc4sap:program-to-spec` — Reverse-engineer a program into a spec artifact
- `/sc4sap:analyze-code` — Static code review (auto-invokes `trust-session`)
- `/sc4sap:compare-programs` — Business-angle side-by-side comparison of 2–5 ABAP programs sharing the same scenario but differing by module / country / persona (reader = consultant) → `.sc4sap/comparisons/*.md` (auto-invokes `trust-session`)
- `/sc4sap:analyze-symptom` — Dump/error root-cause analysis (auto-invokes `trust-session`)
- `/sc4sap:analyze-cbo-obj` — Inventory a CBO package → save frequently-used Z objects to `.sc4sap/cbo/<MODULE>/<PACKAGE>/` for reuse by `create-program` / `program-to-spec` (auto-invokes `trust-session`)
- `/sc4sap:team` — Parallel multi-agent orchestration
- `/sc4sap:deep-interview` — Socratic interview to crystallize a spec before code generation
- `/sc4sap:release` — CTS transport release workflow
- `/sc4sap:mcp-setup` — MCP ABAP ADT server configuration guide
- `/sc4sap:sap-option` — View and edit `.sc4sap/sap.env` (credentials, industry, blocklist profile, HUD limits)
- `/sc4sap:sap-doctor` — Diagnose plugin / MCP / SAP connection health
- `/sc4sap:trust-session` — INTERNAL-ONLY — session-wide MCP permission bootstrap; direct invocation is rejected

### Agents
- Core: `sap-analyst`, `sap-architect`, `sap-code-reviewer`, `sap-critic`, `sap-debugger`, `sap-doc-specialist`, `sap-executor`, `sap-planner`, `sap-qa-tester`, `sap-writer`
- Basis: `sap-bc-consultant`
- Module consultants: `sap-sd-`, `sap-mm-`, `sap-pp-`, `sap-pm-`, `sap-qm-`, `sap-wm-`, `sap-tm-`, `sap-tr-`, `sap-fi-`, `sap-co-`, `sap-hcm-`, `sap-bw-`, `sap-ps-`, `sap-ariba-consultant`

### SPRO Config Reference
`configs/{MODULE}/` contains `spro.md`, `tcodes.md`, `bapi.md`, `tables.md`, `enhancements.md`, `workflows.md` per module. Consultant agents consult these + `common/spro-lookup.md` before IMG answers.

### MCP Server (mcp-abap-adt)
All SAP interactions go through the MCP ABAP ADT server (150+ tools):
- CRUD: `CreateClass` / `UpdateClass` / `GetClass` / `DeleteClass` (and every DDIC/runtime object type)
- Analysis: `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetWhereUsed`
- Runtime: `RunUnitTest`, `GetUnitTestResult`, `RuntimeAnalyzeDump`
- System: `GetTableContents`, `GetSqlQuery` (gated — see rule 5/6 above)
- Transport: `CreateTransport`, `GetTransport`, `ListTransports`
