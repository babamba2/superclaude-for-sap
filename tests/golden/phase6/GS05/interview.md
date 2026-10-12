# Phase 1B Interview — ZSC4SAP_GS05

**Ambiguity**: 0% (golden-set fixture)

| # | Dimension | Decision |
|---|-----------|----------|
| 1 | Purpose-type | Report (list output) |
| 2 | Paradigm | **Procedural** |
| 3 | Display mode | SALV popup (CL_SALV_TABLE) |
| 4 | Screen/GUI | None — selection screen only; SALV popup needs no screen / GUI status |
| 5 | Data source | Standard tables SFLIGHT, SCARR (inner join) |
| 6 | Package + Transport | `$TMP`, no transport (local golden-set object) |
| 7 | Testing scope | none — Procedural, no unit tests (Phase 5 skipped) |

Platform: ECC 7.40 and S/4HANA (same source on both) — `abapRelease` floor = 740, `abapSp` unset.
