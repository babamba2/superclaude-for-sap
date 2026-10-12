# Procedural FORM Naming

When paradigm = Procedural and the FORM is bound to a dynpro of this program (called from that screen's PBO/PAI, or builds controls / GUI status / field catalog for it), the FORM name **must end with `_{screen_no}`**.

## Examples

- ✅ `MODIFY_FCAT_DATA_GRID1_0100`
- ✅ `BUILD_LAYOUT_0100`
- ✅ `HANDLE_DOUBLE_CLICK_0200`
- ❌ `MODIFY_FCAT_DATA_GRID1` (missing screen suffix)

## Exception

Screen-independent utility FORMs (e.g. `CONVERT_FCAT_DATA_GRID`) do **not** require the suffix.

- FORMs that show a `CL_SALV_TABLE` (popup or full screen) without a custom dynpro have no screen number and take no suffix (e.g. `DISPLAY_DATA`). Selection screen 1000 events do not count as a dynpro binding.
- OOP uses the same criterion for screen-bound methods (`SET_ALV_0100`) — see `oop-pattern.md`.

## Enforcement

`sap-code-reviewer` enforces this convention during Phase 6 review.
