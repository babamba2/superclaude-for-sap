# Customization Extraction (`/sc4sap:setup customizations`)

Referenced by `SKILL.md` — this file holds the full enhancement/extension
extraction workflow. Runs **after** SPRO extraction (step 11) and **before**
the blocklist-hook step (step 12).

> **Multi-profile artifact path**: outputs are written under `<project>/.sc4sap/work/<activeAlias>/customizations/` (read [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). `<activeAlias>` comes from `<project>/.sc4sap/active-profile.txt`. Legacy mode (no pointer) falls back to `<project>/.sc4sap/customizations/`. `extract-customizations.mjs` is expected to resolve the write path itself.

Reads each module's `configs/{MODULE}/enhancements.md`, identifies the
*standard* exits (SMOD/CMOD, BAdI, Enhancement Spot, form-based user exits,
Append Structures), then queries the live SAP system through the MCP server
to find which of them the customer has actually customized with `Z*` / `Y*`
objects. It also collects customer GGB0/GGB1 validation / substitution rules
(GB93 / GB92), BTE function modules (TBE34 / TPS34) and customer VOFM routines
(TFRM) for every module. Only exits
listed in the catalog are checked — an exit missing from `enhancements.md` is
never found. Results are written to `.sc4sap/work/<activeAlias>/customizations/{MODULE}/…` so later
skills (`/sc4sap:create-program`, `/sc4sap:analyze-symptom`) can prefer
**reusing** the existing customization over creating a new one.

> **Token Usage Notice**
> - 🔺 **Initial extraction** runs several hundred MCP calls per module
>   (one per standard exit + one per base table for append discovery).
> - ✅ **Subsequent development** reads the local JSON cache — no SAP round-trip.
> - ⏭️ Skipping is fine — the plugin works without it; the consuming skills
>   simply fall back to "create new" behaviour.

## Persistence Rules (hard)

| Kind | How it is read | Written to JSON only when … |
|---|---|---|
| **BAdI** | `GetBadiImplementations` (classic BAdI: SXC_EXIT / SXC_ATTR / SXC_CLASS) → `source: "classic"`; otherwise (kernel BAdI / Enhancement Spot) a scan of `GetEnhancementSpot` → `source: "spot-scan"`, each hit `confidence: "low"` | at least one active `Z*`/`Y*` implementation |
| **SMOD enhancement** | MODATTR (active Z/Y CMOD projects) + MODACT (their members), read once | an **active** `Z*`/`Y*` CMOD project includes it |
| **Form-based user exit** | `GetInclude` on the include (`MV45AFZZ`, `RV60AFZZ`, …) | a FORM has code lines, the include declares FORMs of its own, or it pulls in `INCLUDE Z…` / `Y…` |
| **GGB0 / GGB1 rule** | GB93 (validation) / GB92 (substitution): creator ≠ SAP (any name); application area via GB31; FI company-code assignment via T001D / T001Q | a customer rule exists for the module |
| **BTE** | TBE34 (P/S) + TPS34 (Process), Z/Y function modules, split by application (APPLK); product active flag from TBE24 | a customer FM is registered |
| **VOFM routine** | TFRM, customer number range only (600–999; PSTK / TDAT 50–99; FOFU 900–999 — the ranges of transaction VOFM), description from TFRMT; module from KAPPL (V…/F → SD, M…/E… → MM, TX → FI) or the group; `GetInclude` on the routine include (`RV61A` + number, `RV45C` + number, …) | the routine is registered and its include exists (missing include → `notPresent[]`). SAP routines below the range — even modified ones — are never reported |
| **Append Structure / Custom Field** | `GetTable` on the catalog's base tables | a `Z*`/`Y*`/`CI_*` append, or a field named `Z*`/`Y*` or typed with a `Z*`/`Y*` data element — **written to the separate `extensions.json`** |

**Unreadable is not "none".** A check that could not run is listed in `enhancements.json → unavailable[]` (`check`, `source`, `reason`) and in the summary as `NOT READ: …` (repeats counted, e.g. `FORMEXIT ×3`); its kind then says nothing about the system. A catalog include the system does not have (HTTP 404) goes to `notPresent[]` instead — absent, not unread.

**ECC (BASIS < 7.50).** The ADT data preview does not exist there, so the MCP server answers the table reads (MODATTR, MODACT, GB93, GB92, GB31, T001D, T001Q, TBE34, TPS34, TBE24, TFRM, TFRMT) through the `ZMCP_ADT_DISPATCH` action `TABLE_READ` (allow-listed, read-only). Without that action installed they show as `NOT READ: SQL is not available on this release`. On ECC, `GetTable` returns fields but not append-structure names, so `appendStructures` stays empty with a `note` and `customFields` carries the result.

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
      "source": "classic",
      "customs": [
        { "name": "ZIM_SD_SALES_HEADER", "type": "BADI_IMPL", "class": "ZCL_IM_SD_SALES_HEADER" }
      ]
    }
  ],
  "formBasedExits": [
    {
      "include": "RV60AFZZ",
      "catalogRoutines": "USEREXIT_NUMBER_RANGE, USEREXIT_PRICING_PREPARE_TKOMP, …",
      "routines": [{ "form": "USEREXIT_NUMBER_RANGE", "lines": 12 }],
      "customerForms": ["CHECK_LIMIT_AND_ADJUST"],
      "zIncludes": ["ZSDU50110", "ZSDU52020"],
      "codeLines": 240
    }
  ],
  "ggbRules": [],
  "bteImplementations": [],
  "vofmRoutines": [
    {
      "group": "PBED", "groupText": "Pricing requirements", "number": "905",
      "description": "Exclude free-of-charge items", "application": "V", "active": true,
      "include": "RV61A905", "forms": ["KOBED_905", "KOBEV_905"], "codeLines": 18
    }
  ],
  "unavailable": [
    { "check": "formExit", "source": "MV45AFZZ", "reason": "Request failed with status code 400" }
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

- Print per-module counts: `SMOD: n · BAdI: n · FormExit: n · GGB: n · BTE: n · VOFM: n · TableExt: n`, and every `NOT READ: …` line
- If a module wrote zero rows, say so explicitly (legitimate greenfield state) — but only when nothing is listed as `NOT READ`; otherwise say which checks could not run and why
- Point the user at the two consumer skills that benefit most:
  - `/sc4sap:create-program` — will reuse discovered BAdI impl / extension fields
  - `/sc4sap:analyze-symptom` — can reverse-lookup dump sources to their standard-exit origin

## Re-running

Safe to re-run at any time (`/sc4sap:setup customizations` or directly
`node scripts/extract-customizations.mjs all`). Output files are fully
overwritten, so a re-run picks up any Z-objects added since the last run.
