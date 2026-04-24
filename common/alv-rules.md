# ALV Rules

Shared ALV display rules for sc4sap programs.

## Display Mode Selection

**Full ALV** → `CL_GUI_ALV_GRID`
- Custom Screen (e.g. 0100) created via `CreateScreen`
- GUI Status via `CreateGuiStatus` (standard BACK/EXIT/CANCEL + application toolbar)
- Container: **Docking Container** (`CL_GUI_DOCKING_CONTAINER`) — not custom container
- Field catalog type: `LVC_T_FCAT`

**Simple popup display** → `CL_SALV_TABLE` (SALV) allowed
- No screen / GUI status needed
- Use `cl_salv_table=>factory` then `display( )`

## Field Catalog Construction Standard

Reference: `sc4sap/common/alv-sample/field-catalog-guide.abap`.

### Step 1 — Auto-Extract via SALV Factory

Use this pattern **even when `CL_GUI_ALV_GRID` is the final display target** — let SALV generate the base catalog, then transform to `LVC_T_FCAT`.

```abap
FORM convert_fcat_data_grid USING pt_table TYPE STANDARD TABLE
                         CHANGING pt_fieldcat TYPE lvc_t_fcat.
  DATA lo_table TYPE REF TO data.
  CREATE DATA lo_table LIKE pt_table.
  ASSIGN lo_table->* TO FIELD-SYMBOL(<fo_table>).
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(salv_table)
                              CHANGING  t_table      = <fo_table> ).
      pt_fieldcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
        r_columns      = salv_table->get_columns( )
        r_aggregations = salv_table->get_aggregations( ) ).
    CATCH cx_root.
  ENDTRY.
ENDFORM.
```

### Step 2 — Modify Per-Screen Catalog Attributes

Adjust per-field properties (examples: `coltext`, `qfieldname`, `cfieldname`, `do_sum`, `no_out`, `outputlen`, `hotspot`) via `CASE` on `FIELDNAME`. See `field-catalog-guide.abap` for a worked example.
