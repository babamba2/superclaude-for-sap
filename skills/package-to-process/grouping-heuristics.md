# Grouping Heuristics — Auto Process Detection

Referenced by `workflow.md` § Step 4 and by `dispatch-analyst.md` § Step 4 — Auto Process Grouping. The `sap-analyst` agent loads this file to seed cluster labels with **module-specific business-document patterns**.

## Algorithm (used by sap-analyst in Step 4)

1. **Seed** — every confirmed entry-point program is a candidate group leader.
2. **Reference graph** — for each entry, fetch `GetWhereUsed` 1-hop callers + callees in-package, plus 1-hop standard/external callers as **boundary only** (not group members).
3. **Core-table set** — for each program/FM, extract its main DB-touching tables (header + line) via source scan + `GetAbapSemanticAnalysis`. Drop CDS aliases that fan out to many standard tables (e.g., `I_*`).
4. **Cluster** — Jaccard similarity on core-table sets between entry-point neighborhoods. Threshold `≥ 0.35` joins the cluster. Threshold tuned conservatively to bias toward more, narrower groups (easier to merge in user-review than to split).
5. **Label match** — compare each cluster's core-table set against the **module document-flow dictionary** below; if a known pattern matches (`≥ 60%` table overlap), use its canonical label (e.g., "PR→PO→GR→IR"). Otherwise use a descriptive auto-label (e.g., "VBAK-centric flow").
6. **Confidence score** — `0.0–1.0`: `0.3 × jaccard_min_within_cluster + 0.4 × dictionary_overlap + 0.3 × shared_actors_ratio (TCode/user-exit)`.
7. **Residue** — programs left unclustered after the pass go into a `Misc / utility programs` group with confidence = 0.0 (always presented to the user for manual decision).

---

## Module Document-Flow Dictionary

For each module, the **canonical end-to-end document flow** plus its **anchor tables**. When a cluster's core-table set overlaps these anchors ≥ 60%, the cluster is auto-labeled with the canonical name.

### MM (Materials Management — Procure-to-Pay)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| PR → PO | `EBAN`, `EBKN`, `EKKO`, `EKPO`, `EKBE` | ME51N, ME21N |
| PO → GR | `EKKO`, `EKPO`, `MSEG`, `MKPF` | ME21N, MIGO |
| GR → IR | `MSEG`, `RBKP`, `RSEG`, `BKPF`, `BSEG` | MIGO, MIRO |
| Source list / Vendor master | `EORD`, `LFA1`, `LFB1`, `LFM1` | ME01, XK01 |

### SD (Sales & Distribution — Order-to-Cash)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Inquiry → Quote → Order | `VBAK`, `VBAP`, `VBKD`, `VBPA` | VA11, VA21, VA01 |
| Order → Delivery | `VBAK`, `VBAP`, `LIKP`, `LIPS` | VL01N |
| Delivery → Billing | `LIKP`, `LIPS`, `VBRK`, `VBRP` | VF01 |
| Pricing condition | `KONV` (ECC) / `PRCD_ELEMENTS` (S/4), `A***` access tables | VK11 |

### PP (Production Planning)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| MRP → Planned Order | `MDVM`, `PLAF`, `MDKP`, `MDTB` | MD01, MD04 |
| Planned → Production Order | `PLAF`, `AFKO`, `AFPO`, `AFVC` | CO40, CO01 |
| Production Confirmation | `AFRU`, `AFVV`, `MSEG`, `MKPF` | CO11N, MIGO |
| BOM / Routing master | `MAST`, `STKO`, `STPO`, `PLKO`, `PLPO` | CS01, CA01 |

### PM (Plant Maintenance)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Notification → Work Order | `QMEL`, `QMIH`, `AUFK`, `AFKO`, `AFPO` | IW21, IW31 |
| Order Execution → Confirmation | `AFKO`, `AFRU`, `AFVV`, `MSEG` | IW41 |
| Equipment master | `EQUI`, `EQUZ`, `IFLOT` | IE01, IL01 |

### QM (Quality Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Inspection Lot → Result | `QALS`, `QAMR`, `QAMV`, `QAPP`, `QASE` | QA32, QE51N |
| Quality Notification | `QMEL`, `QMFE`, `QMUR`, `QMMA` | QM01 |
| Usage Decision | `QAVE`, `QAMB`, `MSEG` | QA11 |

### WM / EWM (Warehouse Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Inbound Delivery → Putaway | `LIKP`, `LIPS`, `LTAK`, `LTAP`, `LAGP` | VL31N, LT03 |
| Outbound Delivery → Picking | `LIKP`, `LIPS`, `LTAK`, `LTAP` | VL01N, LT03 |
| Bin / Stock | `LAGP`, `LQUA`, `LEIN` | LS24 |

### TM (Transportation Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Freight Order → Settlement | `/SCMTMS/D_TOR_ROOT`, `/SCMTMS/D_FREORD`, `/SCMTMS/D_FBINV` | /n/SCMTMS/TOR01 |

### FI (Financial Accounting)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Posting → Cleared | `BKPF`, `BSEG`, `BSAK`, `BSAD`, `BSAS` | FB01, FB60, F-28 |
| AR / AP master | `KNA1`, `KNB1`, `LFA1`, `LFB1` | FD01, FK01 |
| Asset accounting | `ANLA`, `ANLB`, `ANLC`, `ANEK`, `ANEP` | AS01, AB01 |

### CO (Controlling)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Cost Center → Posting | `CSKS`, `CSSL`, `COEP`, `COSP`, `COSS` | KS01, KB11N |
| Internal Order | `AUFK`, `COEP`, `COSP`, `COSS` | KO01, KO88 |
| Profitability (CO-PA) | `CE1XXXX`, `CE4XXXX` (operating concern-specific) | KE21N |

### PS (Project System)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| WBS → Network → Confirmation | `PROJ`, `PRPS`, `AUFK`, `AFKO`, `AFVC`, `AFRU` | CJ20N, CN21 |

### TR (Treasury)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Treasury deal → Posting | `VTBFHA`, `VTBFHAPO`, `BKPF`, `BSEG` | FTR_CREATE |
| Cash management | `FDSB`, `FDFI` | FF7A |

### HCM (Human Capital Management)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| Personnel master | `PA0000`, `PA0001`, `PA0002`, `PA0006` | PA30, PA40 |
| Time / Payroll | `PA2001`, `PA2002`, `PCL1`, `PCL2` | PT60, PC00_M99 |

### BW (Business Warehouse)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| InfoCube / DSO | `RSDCUBE`, `RSDODSO`, `RSDIOBJ` | RSA1 |

### Ariba (Procurement Network Integration)
| Canonical flow | Anchor tables | Typical entry TCodes |
|---|---|---|
| cXML / CIG integration | `/ARBA/*` Z-tables, `EKKO`, `EKPO`, `BBP_*` | (web-driven) |

---

## Edge Cases (analyst MUST handle)

- **Single-entry monolith** — one program implements the full flow internally. Confidence = 1.0, group = 1, label = canonical flow with `(monolithic)` suffix.
- **Multi-flow program** — one program serves >1 flow (e.g., consolidated MM+SD report). List the program under each matching cluster with a `(shared)` annotation; report a Cross-module Note.
- **Cross-module clusters** — when anchors span 2+ modules' dictionaries (e.g., `EKKO + BKPF` → MM→FI), label as `MM→FI (P2P-to-Accounting)` and flag in the report's `Cross-Module Notes` per [`../../common/active-modules.md`](../../common/active-modules.md).
- **Empty inventory** — if `inventory.json → objects[]` has no PROG with a TCode AND `key_programs[]` is empty, STOP with a request for manual entry-point input (Step 3 escape hatch).
