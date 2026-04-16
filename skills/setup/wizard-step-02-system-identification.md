# Wizard Step 2 — System Identification (SAP Version, ABAP Release, Industry)

Referenced by [`wizard-steps.md`](wizard-steps.md) — this file holds the full Step 2 content (three sub-questions asked one at a time).

## 2a. SAP System Type

Ask user to select their SAP system type:
- **S/4HANA** (S4) — Business Partner (BP), MATDOC, ACDOCA, Fiori, CDS-based
- **ECC 6.0** (ECC) — Vendor/Customer separate (XK01/XD01/FK01/FD01), MKPF/MSEG, BKPF/BSEG

## 2b. ABAP Release

Ask for **ABAP Release version** (e.g., `750`, `751`, `756`, `757`, `758`):
- Can be checked via `GetSession` or TCode `SE38` → System → Status after connection
- Or ask user directly

This choice is **critical** — it determines:
- Which SPRO config tables, BAPIs, TCodes, and workflows are referenced from `configs/`
- How consultant agents (sap-sd-consultant, sap-mm-consultant, etc.) generate code and recommendations
- Which tables/views agents query (e.g., ECC: `MKPF`+`MSEG` vs S4: `MATDOC`, ECC: `KNA1`+`LFA1` vs S4: `BUT000`)
- Which ABAP syntax features agents can use in generated code (see ABAP Release Reference below)
- Store as `SAP_VERSION` (`S4` or `ECC`) and `ABAP_RELEASE` (e.g., `756`) in `.sc4sap/sap.env` and `.sc4sap/config.json`

## 2c. Industry

Present a numbered selection menu. Ask **one question** and wait; do NOT dump descriptions inline:

```
Select your industry:
   1) retail          — Retail/Distribution (Article, Store, POS, Assortment)
   2) fashion         — Fashion/Apparel (Style × Color × Size, Season, AFS/FMS)
   3) cosmetics       — Cosmetics (Batch, Shelf Life, Channel Pricing)
   4) tire            — Tire (OE/RE, Mixed Mfg, Mold, Recall)
   5) automotive      — Automotive (JIT/JIS, Scheduling Agreement, PPAP)
   6) pharmaceutical  — Pharmaceutical (GMP, Serialization, Batch Status)
   7) food-beverage   — Food & Beverage (Catch Weight, FEFO, TPM)
   8) chemical        — Chemical (Process, DG, Formula Pricing)
   9) electronics     — Electronics / High-Tech (VC/AVC, Serial, RMA)
  10) construction    — Construction (PS, POC Billing, Subcontracting)
  11) steel           — Steel / Metals (Characteristic, Coil, Heat)
  12) utilities       — Utilities — Power/Gas/Water (IS-U, FI-CA, Device)
  13) banking         — Banking / Finance (FS-CD, FS-BP, Parallel Ledger)
  14) public-sector   — Public Sector (FM, GM, Budget Control)
  15) other           — Other / Industry not specified (applies generic standards)
```

This choice determines which `industry/*.md` reference file SAP consultant agents load when doing config analysis, business process design, Fit-Gap, or requirement interpretation. It is **important context**, not just metadata — consultants will ask the user to set it later if it is missing.

- Accept either the number (1–15) or the canonical key (e.g. `retail`, `fashion`).
- Store as `SAP_INDUSTRY=<key>` in `.sc4sap/sap.env` (step 4) **and** as `industry: "<key>"` in `.sc4sap/config.json` (step 10). Keep both in sync when changed via `/sc4sap:sap-option`.
- If the user is unsure, accept `other` and tell them they can change it anytime via `/sc4sap:sap-option`.
- Validate against the 15 keys listed in `industry/README.md`. If a new industry MD is added later, this list must be updated here and in `sap-option`.
