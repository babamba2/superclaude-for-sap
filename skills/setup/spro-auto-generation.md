# SPRO Config Auto-Generation (`/sc4sap:setup spro`)

Referenced by `SKILL.md` — this file holds the full SPRO extraction workflow.

Reads S/4HANA configuration tables to generate a local SPRO reference config using the extraction script `scripts/extract-spro.mjs`.

> **Multi-profile artifact path**: outputs are written under `<project>/.sc4sap/work/<activeAlias>/` (read [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). `<activeAlias>` comes from `<project>/.sc4sap/active-profile.txt`. Legacy mode (no active-profile pointer) falls back to `<project>/.sc4sap/` directly. `extract-spro.mjs` is expected to read the pointer itself and resolve the write path accordingly.

> **Token Usage Notice**
> - 🔺 **Initial extraction** consumes significant tokens (queries dozens–hundreds of tables per module via MCP).
> - ✅ **Subsequent development** reads the local cache (`.sc4sap/work/<activeAlias>/spro-config.json`), dramatically reducing token usage.
> - 💡 No need to re-query the SAP system for the same config on every session — cost-efficient for repeated work.
> - ⚙️  Re-extract only when SAP customizing changes, using `--force` or per-module refresh.

## Step 1: Module Selection

1. Scan the `configs/` folder under the plugin directory to discover available modules
   - Available modules: the subdirectory names (e.g., `SD`, `MM`, `FI`, `CO`, `PP`, `PS`, `PM`, `QM`, `WM`, `HCM`, `BW`, `TR`, `TM`, `Ariba`)
2. Present the module list to the user and ask which modules to extract SPRO config for
   - Example prompt: "Select modules to extract SPRO Config (comma-separated, or `all`):\n SD, MM, FI, CO, PP, PS, PM, QM, WM, HCM, BW, TR, TM, Ariba"
   - Accept: comma-separated module names, or `all` for every module
3. Wait for user selection before proceeding

## Step 2: Execute Extraction Script (Module-Parallel)

Run `scripts/extract-spro.mjs` per module, **each as a separate background process** for parallel execution:

```bash
# Launch each module in parallel using run_in_background
node scripts/extract-spro.mjs SD   # background
node scripts/extract-spro.mjs MM   # background
node scripts/extract-spro.mjs FI   # background
node scripts/extract-spro.mjs CO   # background
```

**Execution rules:**
- **MUST** run each module as a separate `Bash` call with `run_in_background: true`
- **MUST** launch all modules simultaneously in a single message (parallel tool calls)
- Each module process independently connects to the MCP server, queries all tables from `configs/{MODULE}/spro.md`, and writes results to `.sc4sap/work/<activeAlias>/spro-config-{MODULE}.json`
- The script automatically sets `row_number: 9999` to retrieve ALL rows
- Wait for all background processes to complete before proceeding

## Step 3: Merge & Report

After all modules complete:

1. Read each `.sc4sap/work/<activeAlias>/spro-config-{MODULE}.json` and merge into a single `.sc4sap/work/<activeAlias>/spro-config.json`:
   ```json
   {
     "timestamp": "2026-04-13T...",
     "system": "S4HANA",
     "modules": {
       "SD": { ... },
       "MM": { ... }
     },
     "errors": [...],
     "summary": { "modules_processed": 4, "tables_success": 105, "tables_failed": 60 }
   }
   ```
2. Report summary to user: modules processed, tables read (success/fail), total records, config file location
3. Clean up individual module files if merge succeeded
