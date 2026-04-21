# Customization Extraction (`/sc4sap:setup customizations`)

Referenced by `SKILL.md` — this file holds the full enhancement/extension
extraction workflow. Runs **after** SPRO extraction (step 11) and **before**
the blocklist-hook step (step 12).

> **Multi-profile artifact path**: outputs are written under `<project>/.sc4sap/work/<activeAlias>/customizations/` (read [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). `<activeAlias>` comes from `<project>/.sc4sap/active-profile.txt`. Legacy mode (no pointer) falls back to `<project>/.sc4sap/customizations/`. `extract-customizations.mjs` is expected to resolve the write path itself.

Reads each module's `configs/{MODULE}/enhancements.md`, identifies the
*standard* exits (SMOD/CMOD, BAdI, Enhancement Spot, form-based user exits,
Append Structures), then queries the live SAP system through the MCP server
to find which of them the customer has actually customized with `Z*` / `Y*`
objects. Results are written to `.sc4sap/work/<activeAlias>/customizations/{MODULE}/…` so later
skills (`/sc4sap:create-program`, `/sc4sap:analyze-symptom`) can prefer
**reusing** the existing customization over creating a new one.

> **Token Usage Notice**
> - 🔺 **Initial extraction** runs several hundred MCP calls per module
>   (one per standard exit + one per base table for append discovery).
> - ✅ **Subsequent development** reads the local JSON cache — no SAP round-trip.
> - ⏭️ Skipping is fine — the plugin works without it; the consuming skills
>   simply fall back to "create new" behaviour.

## Persistence Rules (hard)

| Kind | Written to JSON only when … |
|---|---|
| **BAdI / Enhancement Spot** | at least one `Z*`/`Y*` implementation class exists |
| **SMOD enhancement** | a `Z*`/`Y*` CMOD project includes it (proof that the customer turned it on) |
| **Form-based user exit** | the include (`MV45AFZZ`, `RV60AFZZ`, `ZXRSRU01`, …) contains noticeably more non-comment lines than a pristine SAP include (heuristic: > 150 meaningful lines) |
| **Append Structure / Custom Field** | any `Z*`/`Y*`/`CI_*` append or `ZZ*`/`YY*` field exists on the base table — **written to the separate `extensions.json`** |

## File Layout

```
.sc4sap/
├── active-profile.txt                          # "KR-DEV"
└── work/
    └── KR-DEV/                                 # = active alias
        ├── spro-config.json                    # existing SPRO cache
        └── customizations/
            ├── SD/
            │   ├── enhancements.json           # BAdI impl, SMOD→CMOD, form-based exits
            │   └── extensions.json             # Append Structures + Custom Fields
            ├── MM/
            │   ├── enhancements.json
            │   └── extensions.json
            └── …
```

Legacy fallback (no `active-profile.txt`) writes under `.sc4sap/customizations/` directly, same as pre-0.6.0.

### `enhancements.json` schema

```json
{
  "timestamp": "2026-04-17T12:34:56Z",
  "module": "SD",
  "smodExits": [
    {
      "standardName": "V45A0001",
      "description": "Sales order: update data",
      "customs": [{ "name": "ZCMOD_SALES_ORDER", "type": "CMOD" }]
    }
  ],
  "badiImplementations": [
    {
      "standardName": "BADI_SD_SALES",
      "description": "Sales document customer logic",
      "customs": [
        { "name": "ZCL_IM_SD_SALES_HEADER", "type": "CLAS" },
        { "name": "ZCL_IM_SD_SALES_ITEM",   "type": "CLAS" }
      ]
    }
  ],
  "formBasedExits": [
    {
      "include": "MV45AFZZ",
      "routines": "USEREXIT_SAVE_DOCUMENT, USEREXIT_CHECK_VBAK, …",
      "lineCount": 420
    }
  ]
}
```

### `extensions.json` schema

```json
{
  "timestamp": "2026-04-17T12:34:56Z",
  "module": "SD",
  "appendStructures": [
    {
      "baseTable": "VBAK",
      "appendStructures": ["CI_VBAK", "ZAVBAK_EXT"],
      "customFields": ["ZZAPPROVER", "ZZSOURCE_CHANNEL"]
    }
  ]
}
```

## Step 1: Module Selection

Same prompt as SPRO extraction — accept comma-separated module names or `all`.
Modules are the subdirectories of `configs/` (excluding `common`).

## Step 2: Execute Extraction Script (Module-Parallel)

Run `scripts/extract-customizations.mjs` per module, each as a separate
background process, same pattern as SPRO:

```bash
node scripts/extract-customizations.mjs SD   # background
node scripts/extract-customizations.mjs MM   # background
node scripts/extract-customizations.mjs FI   # background
```

**Execution rules:**
- **MUST** run each module as a separate `Bash` call with `run_in_background: true`
- **MUST** launch all modules simultaneously in a single message
- Each module process opens its own MCP client, parses `configs/{MODULE}/enhancements.md`, and writes to `.sc4sap/work/<activeAlias>/customizations/{MODULE}/…`
- Wait for all background processes to complete before advancing

## Step 3: Report

- Print per-module counts: `SMOD: n · BAdI: n · FormExit: n · TableExt: n`
- If a module wrote zero rows, say so explicitly (legitimate greenfield state)
- Point the user at the two consumer skills that benefit most:
  - `/sc4sap:create-program` — will reuse discovered BAdI impl / extension fields
  - `/sc4sap:analyze-symptom` — can reverse-lookup dump sources to their standard-exit origin

## Re-running

Safe to re-run at any time (`/sc4sap:setup customizations` or directly
`node scripts/extract-customizations.mjs all`). Output files are fully
overwritten, so a re-run picks up any Z-objects added since the last run.
