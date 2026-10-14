# Phase 1B Interview — ZSC4SAP_GS02

**Ambiguity**: 0% (golden-set fixture)

| # | Dimension | Decision |
|---|-----------|----------|
| 1 | Purpose-type | ALV List |
| 2 | Paradigm | **OOP** (house skeleton; profile `alvFramework` = `none`) |
| 3 | Display mode | Full CL_GUI_ALV_GRID (Docking Container) |
| 4 | Screen/GUI | Screen 0100 (Docking Container, full-screen grid, row double-click) + GUI status STATUS_0100 (BACK / EXIT / CANC / REFRESH) + title TITLE_0100 |
| 5 | Data source | Standard tables SFLIGHT |
| 6 | Package + Transport | `$TMP`, no transport (local golden-set object) |
| 7 | Testing scope | `LCL_DATA->CALCULATE_OCCUPANCY` (2 methods: normal ratio, zero capacity) in `LCL_TEST` (`{PROG}CT`) |

Platform: ECC 7.40 and S/4HANA (same source on both) — `abapRelease` floor = 740, `abapSp` unset.
