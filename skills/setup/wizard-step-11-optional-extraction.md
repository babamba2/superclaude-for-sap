# Wizard Steps 11 & 11b — Optional SPRO and Customization Extraction

Referenced by [`wizard-steps.md`](wizard-steps.md) — both prompts are optional and skippable.

## Step 11 — SPRO Config Extraction (optional)

Prompt whether to run SPRO extraction now:

```
Would you like to extract SPRO config now? (y/N)
- Optional. You can run `/sc4sap:setup spro` anytime later.
- 🔺 Initial download consumes significant tokens (dozens to hundreds of tables per module).
- ✅ Once cached locally, future development sessions use the local cache
   (.sc4sap/work/<activeAlias>/spro-config.json), dramatically reducing token usage.
- ⏭️  Skipping is fine — the plugin works with static configs/ references by default.
```

- If user answers yes: proceed to run SPRO extraction (see [`spro-auto-generation.md`](spro-auto-generation.md))
- If user answers no or skips: confirm "Skipped SPRO extraction. Run `/sc4sap:setup spro` later if needed." and continue to step 11b.

## Step 11b — Customization Inventory (optional)

Prompt whether to inventory the customer's `Z*`/`Y*` enhancements and extensions now:

```
Would you like to inventory Z*/Y* customizations now? (y/N)
- Optional. You can run `/sc4sap:setup customizations` anytime later.
- 🔺 Initial scan runs several hundred MCP calls per module (one per
   standard exit + one per base table).
- ✅ Once cached, `/sc4sap:create-program` and `/sc4sap:analyze-symptom`
   will reuse existing BAdI implementations, CMOD exits, and custom
   fields instead of creating duplicates or losing the standard-exit
   origin when analyzing dumps.
- ⏭️  Skipping is fine — consuming skills fall back to "create new" behaviour.
```

Persistence rules:
- **BAdI / Enhancement Spot** → record only when ≥ 1 `Z*`/`Y*` implementation exists
- **SMOD enhancement** → record only when a `Z*`/`Y*` CMOD project includes it
- **Form-based user exit** → record only when the include has noticeably more meaningful (non-comment) lines than a pristine SAP include
- **Append Structures / Custom Fields** → written to a **separate** `extensions.json` per module

- If user answers yes: proceed to run customization extraction (see [`customization-auto-generation.md`](customization-auto-generation.md)). Launch `node scripts/extract-customizations.mjs <MODULE>` per module in parallel with `run_in_background: true`.
- If user answers no or skips: confirm "Skipped customization extraction. Run `/sc4sap:setup customizations` later if needed." and continue to step 12.
