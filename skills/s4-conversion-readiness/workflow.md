# s4-conversion-readiness — Workflow

Referenced by `SKILL.md`. `<B>` = `node "<PLUGIN_ROOT>/scripts/conversion/build-readiness-doc.mjs"`; scripts that read SAP run from the project root (`SC4SAP_MCP_BRIDGE` set when the plugin's bridge is used). Each step prints `Step X/6 · <label>`.

## Step 1 — Scope and question [1]

1. Confirm the active profile in one line (alias, SID, `SAP_VERSION`, `ABAP_RELEASE`). Already on S/4HANA → say the report then covers an upgrade (same items, fewer hits) and go on.
2. Study code: letters, digits, `_` `-` (default `<SID>-S4`). An existing `<CV>/<CODE>/` → offer to rebuild it (new version) or start a new code.
3. **Question [1]** — one `AskUserQuestion` (single select): **S/4HANA 2025 (on-premise / private cloud)** · **S/4HANA 2023 (on-premise / private cloud)** · **S/4HANA Cloud Public Edition** · **Not decided — compare**. → `--target 2025 | 2023 | public | compare`.

## Step 2 — Inputs present?

The scan reads what sc4sap already collected. Check each and print one line per input (found / missing, date):

| Input | Where | When missing |
|---|---|---|
| Measured usage | `<artifactBase>/usage/tcode-usage-*-all.json`, `-STD.json` | Usage step of `/sc4sap:module-to-process` (GetTcodeUsage on the productive RFC destination), or a user export via `scripts/graph/import-usage.mjs` |
| CBO graphs | `<artifactBase>/cbo/<M>/_USED*/graph.json` | `/sc4sap:analyze-cbo-obj` or the stocking Step G of module-to-process for the modules in scope |
| Saved source | `<artifactBase>/mcp-output/src` | Written by the same stocking runs (GetProgFullCode output:file) |
| Exits / appends | `<artifactBase>/customizations/<M>/` | `node "<PLUGIN_ROOT>/scripts/extract-customizations.mjs" <modules>` (read-only) |

Missing inputs → say what the report will lack, ask once whether to collect them now (name the step and its cost) or go on without. Never collect without that yes.

## Step 3 — Read the system and question [2]

1. `<B> facts --code <CODE>` — read-only reads of configuration tables only: CVERS (components / add-ons), T001, T001W, T300 (WM warehouses), T001K (Material Ledger per valuation area), T014 (credit control areas), TNAPR (customer output programs / forms), EDP13 / EDP21 (message types of the IDoc partner profiles), SWETYPECOU (event linkages), DD03L (customer fields, appends and CI includes of every table in `tableExtensions`, `appends` and `cds` of the knowledge base). Errors → note them, go on.
2. `<B> evidence --code <CODE> --target <T>` → per extension `{ evidence: [...], recommend }`.
3. **Question [2]** — one `AskUserQuestion` (multiSelect): up to 4 options, recommended ones first, each description = its evidence in one line (e.g. "29 WM warehouses, LT03 in use, 21 related CBO objects", written in the user's language). Default set: the four with the most evidence among **EWM**, **RAP / Fiori elements**, **Fiori launchpad**, **Output management**, **Integration Suite** (PI / PO successor), **Event Mesh**; the rest and TM, GTS, settlement management, BTP stand in "Other" (name them in the question text when their evidence is not empty). → `--ext EWM,RAP,…`.

## Step 4 — Scan

`<B> scan --code <CODE> --target <T> --ext <list> --project "<name>" --alias <alias> --sap-version <ECC|S4> [--lang ko|en]` — deterministic. Prints objects, findings by severity, exits, appends, usage hits, indicator, rough days. Large systems take tens of seconds (source patterns).

## Step 5 — Narrative (main thread, judgment)

Read `<CV>/<CODE>/<CODE>-readiness.json` `totals`, `extEvidence`, `checklist` and the top objects. `Write` `<CV>/<CODE>/_narrative.json`:

```json
{ "summary": ["3–6 bullets: overall picture, biggest areas, what blocks, what to decide first, effort caveat"],
  "extensions": { "EWM": "1–3 sentences for this system", "RAP": "…" } }
```

Rules: numbers only from the model; no customer names beyond the system; never claim a result of Readiness Check / SI-Check / ATC (they were not run). Korean in the polite haeyo style, short sentences. Then `<B> narrative --code <CODE> --file <CV>/<CODE>/_narrative.json`.

## Step 6 — Build and report

`<B> build --code <CODE>` (new version; `--same-version` to redraw). Print the Output_Format block (SKILL.md). Offer: open the page, filter a table (filter row under each header), CSV per table.

## Operations

| Request | Do |
|---|---|
| Other target (compare with the public cloud) | `scan --target public` (or `compare`) on the same code → `build` |
| More modules collected later | `scan` again (inputs are re-read) → `build` |
| Change the extension choice | `scan --ext …` → `narrative` (update notes) → `build` |
| Knowledge base gap found | Extend `configs/conversion/simplification.json` per [`knowledge-base.md`](knowledge-base.md); never put customer object names in it |

## Rules

- Read-only on SAP; only the configuration tables above. No application data, no USR* / credential tables.
- The report never states that SAP's checks passed. Every report lists Readiness Check, SI-Check and ATC as to-dos.
- Customer object names stay in the report under the artifact base; the knowledge base and skill files carry none.
