# Active SAP Modules — Cross-Module Integration Context

## Purpose
When multiple SAP modules are active in a landscape, integration points
between them affect how custom objects should be designed. Before generating
code, proposing configuration, or analyzing existing CBOs, consult the user's
active module set and factor in cross-module concerns.

**Example**: MM purchase order creation in a landscape where **PS is active** must
consider account assignment category **P (Project)** with field `PS_POSID` (WBS
element). Without PS, the PO design would miss project cost tracking. With PS
active and the field missing, project controlling breaks.

## Data source

### `sap.env`
```
# Comma-separated. Canonical codes: FI, CO, MM, SD, PP, PM, QM, WM, HCM,
# PS, TR, TM, BW, Ariba. Unset = "assume all standard modules active".
SAP_ACTIVE_MODULES=FI,CO,MM,SD,PP,QM,HCM
```

### `config.json`
```json
{
  "activeModules": ["FI", "CO", "MM", "SD", "PP", "QM", "HCM"]
}
```

Keep `sap.env` and `config.json` in sync (both updated by `/sc4sap:setup` and
`/sc4sap:sap-option`). If one is missing or empty, fall back to the other.

## Canonical module codes

| Code   | Full name                        | Config folder |
|--------|----------------------------------|---------------|
| FI     | Financial Accounting             | `configs/FI/` |
| CO     | Controlling                      | `configs/CO/` |
| MM     | Materials Management             | `configs/MM/` |
| SD     | Sales & Distribution             | `configs/SD/` |
| PP     | Production Planning              | `configs/PP/` |
| PM     | Plant Maintenance                | `configs/PM/` |
| QM     | Quality Management               | `configs/QM/` |
| WM     | Warehouse Management (incl. EWM) | `configs/WM/` |
| HCM    | Human Capital Management         | `configs/HCM/` |
| PS     | Project System                   | `configs/PS/` |
| TR     | Treasury                         | `configs/TR/` |
| TM     | Transportation Management        | `configs/TM/` |
| BW     | Business Warehouse               | `configs/BW/` |
| Ariba  | SAP Ariba (procurement cloud)    | `configs/Ariba/` |

## Module interaction matrix

Each row lists integration concerns that arise when a **companion** module is
active alongside a **primary** module.

| Primary | Active companion | Integration concern |
|---------|------------------|---------------------|
| MM      | PS               | PR/PO line can carry WBS (`PS_POSID`/`PROJ`/`PRPS-PSPNR`); acct.assg.cat `P`/`Q`; cost posted to WBS not cost center |
| MM      | CO               | Cost center derivation, commitment update, CO-PA characteristic derivation on GR |
| MM      | QM               | GR creates inspection lot (QALS); quality block (LIKP-Q); vendor evaluation (ELBK) |
| MM      | WM / EWM         | Storage location ↔ warehouse mapping; TO / warehouse task; HU management if active |
| MM      | FI               | MIRO → BKPF/BSEG; payment term → F110; tax code derivation |
| MM      | Ariba            | PR/PO sync via CIG; supplier qualification; sourcing event |
| SD      | PS               | Sales order item can reference WBS (milestone billing, project revenue `PS_POSID` on VBAP) |
| SD      | CO               | COGS cost element, CO-PA characteristics (customer, material, region) |
| SD      | QM               | Delivery inspection, quality certificate (SD-Q integration) |
| SD      | WM / EWM         | Pick list from WM bin, wave management, outbound delivery WHTASK |
| SD      | FI / TR          | Customer invoice → BKPF; payment run F110; bank account integration |
| PP      | PS               | MTO production order ← WBS; consumption posted to project; `AUFK-PSPEL` |
| PP      | QM               | In-process inspection, GR inspection for semi-finished |
| PP      | CO               | Actual cost flow (AFRU), variance settlement to CO-PA or WBS |
| PP      | MM               | BOM explosion, reservation (RESB), stock determination |
| PM      | CO               | Maintenance order cost on internal order / cost center; settlement |
| PM      | HCM              | Work center ↔ employee, time confirmation (CATS) |
| QM      | HCM              | Inspector qualification, certificate issuance |
| FI      | TR               | Cash management (CM), bank integration, liquidity forecast |
| FI      | CO               | Reconciliation ledger (BSEG-ACDOCA), primary/secondary cost element |
| HCM     | PS / MM / SD     | Requisitioner, sales rep, project team member derived from P-plan (HR master) |
| BW      | All              | Datasource extraction; delta queue needs RSA6 registration for custom tables |
| TM      | SD / MM          | Freight order from delivery; carrier selection; freight cost settlement to FI |

Multi-module rules (three-way):
- **MM + PS + CO**: PO with WBS → commitment on WBS + cost center shadow; settlement profile needed.
- **SD + PS + CO-PA**: Project billing → CO-PA characteristic `WERKS`/`KUNAG` carried via WBS settlement rule.
- **PP + MM + QM + WM**: Production GR → inspection lot → usage decision → WM putaway.

## How skills apply this

### `create-program` / `create-object` / `program-to-spec`
**Before proposing table fields**:
- Load `SAP_ACTIVE_MODULES`.
- For each active companion of the primary module, add the integration fields from the matrix (e.g., MM CBO with PS active → `PS_POSID`, `KDAUF`/`KDPOS`, `AUFNR`, `KOSTL`).

**Before proposing logic**:
- Add derivation hooks for active modules (CO cost elem from `CSKB`; PS from `PROJ`/`PRPS`; WM bin from `LAGP`).
- Pull-in validation: if WBS supplied but PS not in `SAP_ACTIVE_MODULES` → warn user.

### `analyze-cbo-obj`
- When surveying CBO fields, flag **expected-but-missing** integration fields per active module combo.
- Output section: "Cross-module gap analysis — modules active but no integration field found".

### Module consultant agents (`sap-mm-consultant`, `sap-sd-consultant`, …)
- On every design/config question: read `SAP_ACTIVE_MODULES` first.
- Mention relevant companion-module integration without prompting (e.g., MM question + PS active → mention WBS integration).
- If user's question assumes an inactive module, flag the mismatch.

## Preflight hook (pseudo-code)

```
function loadActiveModules():
    from sap.env SAP_ACTIVE_MODULES (comma-split, trim, uppercase)
    OR from config.json activeModules[]
    if both empty → ask user or default ['FI','CO','MM','SD','PP','QM','HCM']
    return set

function crossModuleAdvisory(primary, context):
    active = loadActiveModules()
    companions = MATRIX[primary] ∩ active
    for each companion in companions:
        yield concern_text(primary, companion)
```

Skills consuming this: `create-program`, `create-object`, `program-to-spec`,
`analyze-cbo-obj`, `analyze-code`, all consultant agents.
