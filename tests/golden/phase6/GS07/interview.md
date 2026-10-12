# Phase 1B Interview — ZSC4SAP_GS07

**Ambiguity**: 0% (golden-set fixture)

| # | Dimension | Decision |
|---|-----------|----------|
| 1 | Purpose-type | ALV List |
| 2 | Paradigm | **Procedural** |
| 3 | Display mode | Full CL_GUI_ALV_GRID (Docking Container) |
| 4 | Screen/GUI | Screen 0100 (Docking Container, full-screen grid) + GUI status STATUS_0100 (BACK / EXIT / CANC / REFRESH) + title TITLE_0100 |
| 5 | Data source | Standard tables SFLIGHT, SCARR (inner join) |
| 6 | Package + Transport | `$TMP`, no transport (local golden-set object) |
| 7 | Testing scope | none — Procedural, no unit tests (Phase 5 skipped) |

Platform: ECC 7.40 and S/4HANA (same source on both) — `abapRelease` floor = 740, `abapSp` unset.
