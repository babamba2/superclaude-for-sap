---
name: sc4sap:setup
description: Plugin setup + MCP connection + SPRO config auto-generation from S/4HANA
level: 2
---

# SC4SAP Setup

Use `/sc4sap:setup` as the unified setup and configuration entrypoint for SuperClaude for SAP.

## Usage

```bash
/sc4sap:setup                  # full setup wizard
/sc4sap:setup doctor           # diagnose installation and SAP connection
/sc4sap:setup mcp              # configure mcp-abap-adt MCP server
/sc4sap:setup spro             # auto-generate SPRO config from S/4HANA system
```

## Routing

Process the request by the **first argument only**:

- No argument, `wizard`, or `--force` -> run the full setup wizard (install plugin, configure MCP, test SAP connection)
- `doctor` -> route to `/sc4sap:doctor` with remaining args
- `mcp` -> route to `/sc4sap:mcp-setup` with remaining args
- `spro` -> run SPRO config auto-generation workflow (see below)

## Setup Wizard Steps

1. Verify Claude Code version compatibility
2. Check if `mcp-abap-adt` MCP server is configured (guide to `/sc4sap:mcp-setup` if not)
3. Test SAP system connection via `GetSession`
4. Confirm connected system info (system ID, client, user)
5. Run `GetInactiveObjects` to confirm ADT access rights
6. Write plugin config to `.sc4sap/config.json`

## SPRO Config Auto-Generation (`/sc4sap:setup spro`)

Reads S/4HANA configuration tables to generate a local SPRO reference config.

### Step 1: Module Selection

1. Scan the `configs/` folder under the plugin directory to discover available modules
   - Available modules: the subdirectory names (e.g., `SD`, `MM`, `FI`, `CO`, `PP`, `PM`, `QM`, `WM`, `HCM`, `BW`, `TR`, `TM`, `Ariba`)
2. Present the module list to the user and ask which modules to extract SPRO config for
   - Example prompt: "다음 모듈 중 SPRO Config를 추출할 모듈을 선택해주세요 (쉼표로 구분, 'all'로 전체 선택):\n SD, MM, FI, CO, PP, PM, QM, WM, HCM, BW, TR, TM, Ariba"
   - Accept: comma-separated module names, or `all` for every module
3. Wait for user selection before proceeding

### Step 2: Parse SPRO Table Lists

For each selected module:

1. Read `configs/{MODULE}/spro.md` from the plugin directory
2. Parse every markdown table row to extract the **Table/View** column values
   - These are SAP config table/view names (e.g., `V_TVKO`, `V_T001W`, `V_T685`, `V_T003O`)
3. Collect all unique table/view names across all selected modules
4. Deduplicate tables that appear in multiple modules (e.g., `V_T001W` in both MM and PP)

### Step 3: Extract Config Data via SQL

For each unique table/view name:

1. Use `GetSqlQuery` (preferred over `GetTableContents`) to query the config data
   - Query format: `SELECT * FROM {TABLE_NAME}` (use the exact table/view name from spro.md)
   - If a `V_` prefixed view fails, retry with the base table name (e.g., `V_T001W` → `T001W`)
   - If a query returns an error or empty result, log it and continue with the next table
2. Process tables in batches to avoid overwhelming the SAP system (5-10 tables per batch)

### Step 4: Write Results

1. Write results to `.sc4sap/spro-config.json` organized by module:
   ```json
   {
     "timestamp": "2026-04-13T...",
     "system": "{SID}",
     "modules": {
       "SD": {
         "V_TVKO": { "description": "판매 조직 정의", "data": [...] },
         "V_TVTW": { "description": "유통 채널 정의", "data": [...] }
       },
       "MM": { ... }
     },
     "errors": [
       { "table": "V_EXAMPLE", "module": "SD", "error": "Table not found" }
     ]
   }
   ```
2. Report summary: modules processed, tables read (success/fail), total records, config file location

## Notes

- `/sc4sap:doctor`, `/sc4sap:mcp-setup` remain valid direct entrypoints
- Prefer `/sc4sap:setup` in documentation and user guidance
- Config is stored in `.sc4sap/` in the project root

Task: {{ARGUMENTS}}
