<p align="center">
  <img src="sc4sap.png" alt="SuperClaude for SAP" width="720"/>
</p>

<p align="center">
  English | <a href="README.ko.md">한국어</a> | <a href="README.ja.md">日本語</a> | <a href="README.de.md">Deutsch</a>
</p>

# SuperClaude for SAP (sc4sap)

> Claude Code plugin for SAP ABAP development — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)

**Website:** [sc4sap.dev](https://sc4sap.dev)

[![Website](https://img.shields.io/badge/website-sc4sap.dev-0A66C2)](https://sc4sap.dev)
[![MCP server on npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![Plugin version](https://img.shields.io/github/package-json/v/babamba2/superclaude-for-sap/main?label=sc4sap&color=6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What is sc4sap?

SuperClaude for SAP transforms Claude Code into a full-stack SAP development assistant. It connects to your SAP system via the [MCP ABAP ADT server](https://github.com/babamba2/abap-mcp-adt-powerup) (150+ tools) to create, read, update, and delete ABAP objects directly — classes, function modules, reports, CDS views, Dynpro, GUI status, and more.

## Core Capabilities

| Capability | What it does |
|------------|--------------|
| 🔌 **Auto MCP Install** | `abap-mcp-adt-powerup` is auto-installed, configured, and connection-tested during `/sc4sap:setup`. No manual MCP wiring. |
| 🌐 **Multi-Environment Profiles (Dev / QA / Prod)** | Register multiple SAP systems per company (e.g. `KR-DEV`, `KR-QA`, `KR-PRD`, `US-DEV`) and hot-switch between them in-session via `/sc4sap:sap-option`. **QA and Prod profiles are auto-protected**: a 2-layer defense (PreToolUse hook + MCP-server guard) blocks `Create*/Update*/Delete*`, `CreateTransport`, and runtime code execution tools — bypassing the hook does not bypass enforcement. Passwords are stored in the **OS keychain** (`@napi-rs/keyring` — Windows Credential Manager / macOS Keychain / libsecret) so `.sc4sap/` never leaks secrets to git. Artifacts (specs, CBO catalogs, audits) are isolated per profile with read-only cross-view so QA sessions can inspect Dev-produced specs without contaminating them. |
| 🏗️ **Formatted Auto Program Maker** | Builds ABAP programs end-to-end: Main + conditional Includes (OOP/Procedural), full ALV + Docking, Dynpro + GUI Status, mandatory Text Elements, ABAP Unit tests — platform-aware (ECC / S4 On-Prem / Cloud). |
| 🔍 **Program Analyze** | Read any ABAP object via MCP, run Clean ABAP / performance / security review, or reverse-engineer into Functional/Technical Spec (Markdown/Excel). |
| 🧪 **Analyze Code** | `/sc4sap:analyze-code` — dedicated static review pass (`sap-code-reviewer`): Clean ABAP, performance, security, SAP standard compliance. Severity-ranked findings with concrete fix suggestions. |
| 🔀 **Compare Programs** | `/sc4sap:compare-programs` — side-by-side business comparison of 2–5 ABAP programs that share the same scenario but split by module (MM/CO), country (KR/EU), or persona (controller/warehouse). Consultant-facing editable HTML report across 10 configurable dimensions — coloured verdict matrix with a *Differences only* switch, field-by-field differences, screens drawn side by side, decision guide, versions + English companion. |
| ⚙️ **Config → Document** | `/sc4sap:config-to-document` — one module's configuration documented as it is in the connected system (MM first). One offline HTML file that follows the IMG tree: per IMG activity the real table values drawn on an SM30-style screen, rows changed by customer transports with their transport history, configuration checks, SAP's IMG documentation, and consultant notes written by the module consultant agent and reviewed by `sap-critic`. Read-only on SAP; an in-page edit mode lets the consultant correct the notes, values and change history and hand the file back for the next version. |
| 🔌 **Interface Mapping Spec** | `/sc4sap:interface-mapping-spec` — interface mapping specification as one editable HTML page in the classic template layout: cover, revision history, Source → Target field grid with conversion-rule and MAPPING columns, synchronous response block, extraction condition, field guide. Built for new interfaces: scenario presets, SAP fields from a `TABLE-FIELD` list or the module consultant's proposal (checked against DDIC) — or read from an existing table, structure, view or RFC — with the counterpart side, DB types and conversion rules proposed. In-page checks (missing items, truncation, type and key mismatches, unmapped fields), Excel paste, versions with revision history, English companion, refresh when the SAP structure changes. |
| 🖨️ **SmartForm Preview** | `/sc4sap:smartform-preview` — the expected print of a SmartForm as a JPG, without a print program or test data: windows at their real mm positions, SmartStyle fonts, template grids with borders and shading, SE78 graphics (logo, signature), loops with sample rows. The `&fields&` get invented sample values sized to their DDIC types, and the report lists the cells and windows whose content is cut off. Read-only. → `smartforms/<FORM>/<FORM>-preview.{jpg,html}` |
| 📄 **SmartForm from PDF** | `/sc4sap:smartform-from-pdf` — builds a SmartForm from a PDF (or screenshot) of the printed form: ruled areas become templates, every text sits where the source has it in the closest format of an existing SmartStyle, then the values become `&fields&`, item lines a loop over an internal table and the interface is added — decided with you. Uploaded to the DEV system, printed there and scored against the source page. → `smartforms/<FORM>/` |
| 🗺️ **Package → Process** | `/sc4sap:package-to-process` — reverse-engineer a CBO package into an **end-to-end business-process** document: auto-detected TCode entry points → AI process grouping (PR→PO→GR→IR) → per-process narrative + Mermaid flowchart / sequence diagram + step tables. Auto-chains `sap-stocker` when CBO inventory is missing. → `.sc4sap/processes/<MODULE>/<PACKAGE>/`. |
| 🩺 **Maintenance Diagnosis** | Operational triage loop: ST22 dumps, SM02 system messages, /IWFND/ERROR_LOG, profiler traces, logs, where-used graphs — all from Claude. |
| ♻️ **CBO Reuse (Brownfield Accelerator)** | Inventory a Z-package once — `create-program` / `program-to-spec` prefer reusing existing CBO assets over duplicates. |
| 🧷 **CBO Extension Awareness (CMOD / GGB0·1 / BTE / VOFM / BAdI / APPEND)** | Inventories user-exits (CMOD), validations & substitutions (GGB0/GGB1), BTE function modules, VOFM routines (requirements / formulas / data transfer), BAdI implementations, and APPEND structures. `create-program` / BAPI flows prefer existing Extension fields (e.g. BAPI `EXTENSIONIN` / table appends) over new CBOs; dump & incident diagnosis inspects Extension points as first-class suspects. |
| 🏭 **Industry Context** | 14 industry reference files (retail, fashion, cosmetics, tire, automotive, pharma, F&B, chemical, electronics, construction, steel, utilities, banking, public-sector). |
| 🌏 **Country / Localization** | 15 per-country files + EU-common (KR/JP/CN/US/DE/GB/FR/IT/ES/NL/BR/MX/IN/AU/SG). e-invoicing, banking, payroll, tax localization. |
| 🧩 **Active-Module Awareness** | Cross-module integration hints: MM + PS active → auto-suggest WBS fields on MM CBOs; SD + CO active → CO-PA derivation. [Details →](common/active-modules.md) |
| 🤝 **Module Consultation** | `sap-analyst` / `sap-critic` / `sap-planner` / `sap-architect` delegate to 14 module consultants + 1 BC consultant when business judgement is needed. Users can also ask a module consultant directly via `/sc4sap:ask-consultant` — auto-routes SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC by keywords, answers against the configured SAP environment (version, industry, country, active modules), read-only. |
| ⚡ **Per-Phase Model Routing** | Every skill's main thread follows your session model (`model: inherit`) while delegating heavy work to specialized agents (Opus for novel ABAP generation, cross-module synthesis, and incident triage; Sonnet for facts extraction; Haiku for report rendering). No skill switches the main thread, so your model choice holds and the prompt cache is never re-written mid-session; per-phase `Agent()` dispatches run on their declared tier. Model choice is visible in every response prefix + per-phase banner (e.g. `▶ phase=3 (writer-spec) · agent=sap-writer · model=Opus`). Full matrix — per-skill, per-phase — in [docs/skill-model-architecture.md](docs/skill-model-architecture.md). |

## Documentation

- 📦 **[Installation & Setup →](docs/INSTALLATION.md)** — requirements, install options, wizard steps, blocklist configuration
- 🎯 **[Features Deep-Dive →](docs/FEATURES.md)** — 26 agents, 14 skills, MCP tools, RFC backends, hooks, data-extraction policy
- 🧠 **[Skill Model Architecture →](docs/skill-model-architecture.md)** — per-skill / per-phase model allocation (Haiku / Sonnet / Opus), model override patterns, escalation ladders, design rationale
- 📜 **[Changelog →](docs/CHANGELOG.md)** — version history and breaking changes

## Unleashed

<p align="center">
  <a href="sc4sap_unleashed.png">
    <img src="sc4sap_unleashed.png" alt="SC4SAP Unleashed" width="100%"/>
  </a>
</p>

## Author

- **paek seunghyun** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## Contributors

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## Acknowledgments

This project was inspired by [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode) by **허예찬 (Hur Ye-chan)**. The multi-agent orchestration patterns, Socratic deep-interview gating, persistent loop concepts, and overall plugin philosophy here all trace back to that work.

[**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt) by **fr0ster** was a major contribution to building our customized MCP server (`abap-mcp-adt-powerup`). The pioneering ADT-over-MCP work — request shaping, endpoint coverage, object I/O — provided the conceptual foundation we drew on while designing and extending our own server.

## License

[MIT](LICENSE)
