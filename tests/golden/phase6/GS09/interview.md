# Phase 1B Interview — ZSC4SAP_GS09

**Ambiguity**: 0% (golden-set fixture)

| # | Dimension | Decision |
|---|-----------|----------|
| 1 | Purpose-type | ALV List (two lists on tabs) |
| 2 | Paradigm | **OOP** (house skeleton; profile `alvFramework` = `none`) |
| 3 | Display mode | Tabstrip screen 0200; subscreens 0210 / 0220 each with a CL_GUI_ALV_GRID in a custom control |
| 4 | Screen/GUI | Screens 0200 (tabstrip), 0210, 0220 (subscreens) + GUI status STATUS_0200 (BACK / EXIT / CANC / REFRESH) + title TITLE_0200 |
| 5 | Data source | Standard tables SFLIGHT, SCARR |
| 6 | Package + Transport | `$TMP`, no transport (local golden-set object) |
| 7 | Testing scope | `LCL_DATA->CALCULATE_FREE_SEATS` (2 methods: normal, overbooked) in `LCL_TEST` (`{PROG}CT`) |

Platform: ECC 7.40 and S/4HANA (same source on both) — `abapRelease` floor = 740, `abapSp` unset.
