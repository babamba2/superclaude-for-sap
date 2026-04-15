# SAP Version Reference (ECC vs S/4HANA)

Comprehensive reference of the differences between **ECC 6.0** and **S/4HANA** that change agent behavior — tables, TCodes, BAPIs, Fiori apps, and development patterns.

Agents MUST check `SAP_VERSION` from `.sc4sap/config.json` (or `sap.env`) **before** recommending any TCode, table, BAPI, or pattern. Agents MUST also check `ABAP_RELEASE` before generating ABAP code — see `common/abap-release-reference.md` for release-by-release syntax.

If `SAP_VERSION` is unset, fail safe: ask the user to run `/sc4sap:setup` or `/sc4sap:sap-option` before proceeding.

---

## 1. Master Data

### 1.1 Business Partner (the most frequently misunderstood area)

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Model | Separate Customer (KNA1) + Vendor (LFA1) | Unified BP (BUT000 + roles) |
| Create TCode | XD01 (Customer) / XK01 (Vendor) / MK01 | BP (unified) |
| Change TCode | XD02 / XK02 / VD02 / MK02 | BP |
| Display TCode | XD03 / XK03 | BP |
| Core tables | KNA1, KNB1 (company code), KNVV (sales area) / LFA1, LFB1, LFM1 | BUT000, BUT020 (address), BUT100 (role), BUT0BK (bank); KNA1/LFA1 still kept in sync |
| Address | ADRC (via ADRNR) | ADRC (BUT020 via PARTNER_GUID) |
| BAPI | BAPI_CUSTOMER_CREATEFROMDATA1 / BAPI_VENDOR_CREATE | BUPA_CREATE_FROM_DATA, CVI_EI_INBOUND_MAIN |

**Agent guidance:**
- On S/4HANA, never recommend `BAPI_CUSTOMER_CREATEFROMDATA1` for new work — SAP has explicitly flagged it for removal (deprecated). Use the CVI/BUPA family or the OData `API_BUSINESS_PARTNER` instead.
- KNA1/LFA1 are retained on S/4HANA for compatibility, but **reference them read-only**; perform create/change exclusively through the BP transaction or the CVI APIs.

### 1.2 Material Master

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Length limit | MATNR 18 characters | MATNR 40 characters (1909+) |
| TCode | MM01 / MM02 / MM03 | MM01 / MM02 / MM03 (unchanged) |
| Tables | MARA, MARC (plant), MARD (storage), MVKE (sales), MBEW (valuation) | Same — MARA retained, only the MATNR field length is extended |
| Images/documents | DMS | DMS + Fiori "Manage Product Master Data" |

**Agent guidance:**
- When generating code for an ECC system, force `CHAR18` on `MATNR` declarations — declaring `CHAR40` risks truncation on the ECC 7.x runtime.
- On S/4HANA, reference the `MATNR` domain rather than hardcoding a length.

---

## 2. Logistics & Inventory

### 2.1 Material Movement Document

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Table structure | MKPF (header) + MSEG (item) | MATDOC (single unified table) |
| Backward compatibility | — | MKPF/MSEG are **reproduced via CDS views** (compatibility views) |
| TCode | MB01/MB1A/MB1B/MB1C, MIGO | MIGO only — many MB* transactions are obsolete |
| BAPI | BAPI_GOODS_CREATE_FROM_DATA, BAPI_GOODS_MVT_CREATE | Same BAPIs retained; internal logic routed through MATDOC |

**Agent guidance:**
- On S/4HANA, **do not SELECT directly from MKPF/MSEG** — performance suffers and results can be inaccurate. Use MATDOC or a released CDS view (e.g., `I_MaterialDocumentItem`).
- On ECC, an MKPF ∪ MSEG JOIN is the correct approach.

### 2.2 Sales Documents

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Create TCode | VA01 (Order) / VA21 (Quote) / VA11 (Inquiry) | VA01 + Fiori "Manage Sales Orders" (F1873) |
| Tables | VBAK (header), VBAP (item), VBEP (schedule), VBKD (business data) | Same — VBAK/VBAP structure retained |
| BAPI | BAPI_SALESORDER_CREATEFROMDAT2 | Same (+ API_SALES_ORDER_SRV OData) |
| Output | NACE (condition-based) | BRF+ Output Management (SAP S4 1809+) |

### 2.3 Purchasing

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Create PO | ME21N / ME21 | ME21N + Fiori "Manage Purchase Orders" (F0842A) |
| Create PR | ME51N | ME51N + Fiori "Manage Purchase Requisitions" |
| Tables | EKKO (header), EKPO (item), EKET (schedule), EKKN (acct assignment) | Same |
| Approval | Release Strategy (ME28/ME29N) | Flexible Workflow + legacy Release Strategy coexisting |

---

## 3. Financials

### 3.1 Accounting Document (Universal Journal)

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Document storage | BKPF (header) + BSEG (item, CLUSTER TABLE) | **ACDOCA** (Universal Journal — transparent, single table) |
| Totals | GLT0 / FAGLFLEXT (new GL) | ACDOCA unified — no separate totals table required |
| Sub-ledger | BSID/BSIK/BSAD/BSAK (index tables) | Delivered as ACDOCA-based CDS views |
| TCode | FB01, FB50, FBL3N, FBL5N | FB01/FB50 retained; new Fiori "Post General Journal Entries" (F0718) |
| Asset accounting | ANLA + ANLP (classic) | ACDOCA-integrated (new asset accounting, mandatory) |
| New G/L | FAGLFLEXA (optional) | None — ACDOCA replaces it |

**Agent guidance:**
- On S/4HANA, **do not SELECT directly from BSEG** — although it moved from cluster to transparent, ACDOCA is the actual source of truth. BSEG is kept for legacy compatibility only.
- For reporting, use ACDOCA (+ released CDS view `I_JournalEntryItem`) on S/4, and the BSEG ∪ BKPF combination on ECC.
- On ECC, first check whether new G/L is active via `T881`/`T882G`.

### 3.2 G/L Master

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Chart of accounts | SKA1 (chart level) + SKB1 (company code) | Same + **FINS_FIN_GLA** (extensions) |
| TCode | FS00 | FS00 + Fiori "Manage G/L Account Master Data" |

### 3.3 Credit Management

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Implementation | FI-AR-CR (classic) | SAP Credit Management (FSCM, UKM*) — mandatory |
| Tables | KNKK, KNKA | UKMBP_CMS_SGM, UKMBP_CMS (BP-based) |
| TCode | FD32, F.28 (rebuild) | UKM_BP, UKM_COMMITMENTS |

---

## 4. Costing & Controlling

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Key tables | COEP (line items), COSP/COSS (totals) | ACDOCA (CO documents unified) + COEP (retained) |
| Internal Order | KO01/KO02/KO03 | Same |
| Cost Center Master | KS01 | KS01 + Fiori "Manage Cost Centers" |
| Profitability Analysis | CE1xxxx/CE4xxxx (costing-based) | ACDOCA (account-based CO-PA, default) |

**Agent guidance:**
- Account-based CO-PA is the S/4 standard — only recommend the CE1/CE4 tables after confirming that costing-based CO-PA is in use.

---

## 5. Planning & Execution

### 5.1 MRP

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Classic MRP | MD01 / MD02 / MD03 | Retained (compatibility) |
| MRP Live | None | **MD01N** (HANA-based, in-memory, 10x+ faster) — recommended default |
| Tables | MDKP, MDTB (obsolete in S4) | PPH_DBVM (HANA-optimized) |

### 5.2 Production Order

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| TCode | CO01/CO02/CO03 | Same + Fiori "Manage Production Orders" |
| Tables | AUFK (header), AFKO (order), AFPO (item) | Same |

---

## 6. Output Management

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Approach | NACE (condition-based), SmartForms / SAPscript | **BRF+** Output Management (S4 1809+) + Adobe Forms recommended; NACE compatibility retained |
| New development | NACE-based condition records | BRF+ conditions + determination |

**Agent guidance:**
- Do not create SAPscript for new S/4 projects. SmartForms is acceptable, but Adobe Forms is preferred.

---

## 7. Development Model

| Area | ECC 6.0 | S/4HANA |
|------|---------|---------|
| Recommended model | Classic Dynpro + Module Pool + BAPI | **RAP** (ABAP RESTful Application Programming, 754+) |
| Client | SAPGUI + WebDynpro | SAPGUI (legacy) + **Fiori** (standard) |
| DB access | Open SQL + SELECT on tables | **CDS views + Released APIs** (clean core) |
| Extensibility | User-exits, BAdI, customer includes | **Key User Extensibility** (in-app) + BAdI + CDS extensions |
| Cloud readiness | N/A | ABAP Cloud Development Model (released APIs only) — 756+ |

---

## 8. Enforcement Rules

- Agents MUST check `SAP_VERSION` from config before recommending TCodes, tables, BAPIs, or development patterns.
- Agents MUST check `ABAP_RELEASE` from config before generating ABAP code — using unsupported syntax causes activation errors.
- If `SAP_VERSION` is unset, fail safe: ask the user to run `/sc4sap:setup` or `/sc4sap:sap-option` before proceeding.
- When migrating ECC→S/4HANA scripts, never assume compatibility views alone are enough — verify with `GetView` before SELECT.
- For S/4HANA ABAP Cloud tier (`SAP_SYSTEM_TYPE=cloud`), only released APIs (C1 tier) are callable — consult `common/spro-lookup.md` and SAP Note guidance before recommending classic FMs/BAPIs.
