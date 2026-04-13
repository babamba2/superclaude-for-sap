English | [한국어](README.ko.md)

# SuperClaude for SAP (sc4sap)

> Claude Code plugin for SAP ABAP development on On-Premise S/4HANA

[![npm version](https://img.shields.io/npm/v/superclaude-for-sap?color=cb3837)](https://www.npmjs.com/package/superclaude-for-sap)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What is sc4sap?

SuperClaude for SAP transforms Claude Code into a full-stack SAP development assistant. It connects to your SAP system via the [MCP ABAP ADT server](https://github.com/babamba2/abap-mcp-adt-powerup) (150+ tools) to create, read, update, and delete ABAP objects directly — classes, function modules, reports, CDS views, and more.

## Requirements

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-Server_Required-FF6600)

| Requirement | Details |
|-------------|---------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI installed (Max/Pro subscription or API key) |
| **SAP System** | On-Premise S/4HANA with ADT enabled |
| **MCP Server** | [abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup) configured |

## Features

### 24 SAP-Specialized Agents

| Category | Agents |
|----------|--------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — system admin, transport management, diagnostics |
| **Modules (13)** | SD, MM, FI, CO, PP, PM, QM, TR, HCM, WM, TM, Ariba, BW |

### 14 Skills

| Skill | Description |
|-------|-------------|
| `sc4sap:setup` | Plugin setup + SPRO config auto-generation |
| `sc4sap:autopilot` | Full autonomous execution pipeline |
| `sc4sap:ralph` | Persistent loop with SAP verification |
| `sc4sap:ralplan` | Consensus-based planning |
| `sc4sap:team` | Coordinated parallel agent execution |
| `sc4sap:teams` | CLI team runtime (tmux-based) |
| `sc4sap:ask` | Question routing to appropriate agent |
| `sc4sap:deep-interview` | Socratic requirements gathering |
| `sc4sap:hud` | HUD display with SAP system status |
| `sc4sap:mcp-setup` | MCP ABAP ADT server setup guide |
| `sc4sap:doctor` | Plugin + MCP + SAP connection diagnostics |
| `sc4sap:release` | CTS transport release workflow |
| `sc4sap:create-object` | ABAP object creation (hybrid mode) |
| `sc4sap:analyze-code` | ABAP code analysis & improvement |

### SPRO Configuration Reference

Built-in reference data for all 13 SAP modules:

```
configs/{MODULE}/
  ├── spro.md       # SPRO configuration tables/views
  ├── tcodes.md     # Transaction codes
  ├── bapi.md       # BAPI/FM reference
  └── workflows.md  # Development workflows
```

**Modules**: SD, MM, FI, CO, PP, PM, QM, TR, HCM, WM, TM, Ariba, BW

### SAP-Specific Hooks

- **SPRO Auto-Injection** — Haiku LLM classifies user input and injects relevant module SPRO config
- **Transport Validation** — Checks transport exists before MCP ABAP Create/Update operations
- **Auto-Activation** — Triggers ABAP object activation after creation/modification
- **Syntax Checker** — Auto-runs semantic analysis on ABAP errors

## Installation

```bash
# Install from marketplace
claude plugin install sc4sap

# Or install from source
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

## Setup

```bash
# Run the setup skill to configure MCP connection and generate SPRO configs
/sc4sap:setup
```

This will:
1. Verify MCP ABAP ADT server connection
2. Auto-generate SPRO config files from your S/4HANA system
3. Configure hooks and agents

## Quick Start

```bash
# Create an ABAP class
/sc4sap:create-object

# Analyze existing code
/sc4sap:analyze-code

# Release a transport
/sc4sap:release

# Full autonomous development
/sc4sap:autopilot
```

## Example Use Cases

**ABAP Class Creation & Unit Testing**
```
Create a custom sales order validation class ZCL_SD_ORDER_VALIDATOR
with methods for credit check, delivery date validation, and pricing
verification. Include ABAP Unit tests for each method.
```

**Cross-Module Integration Analysis**
```
Analyze the integration points between SD billing (VF01) and FI
accounting document posting. Show me which BAPIs and user exits
are involved in the billing-to-accounting flow.
```

**Module Consultant Workflow**
```
As an FI consultant, help me configure automatic payment program
(F110) for vendor payments via bank transfer. What master data,
SPRO settings, and custom development are needed?
```

## Tech Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![MCP](https://img.shields.io/badge/MCP_SDK-Protocol-FF6600)

## Roadmap

- **v0.1.0** (current) — Core plugin with 24 agents, 14 skills, 13 module configs
- **v0.2.0** (planned) — RAP support, multi-system (Dev/QA/Prod)

## Author

paek seunghyun

## License

[MIT](LICENSE)
