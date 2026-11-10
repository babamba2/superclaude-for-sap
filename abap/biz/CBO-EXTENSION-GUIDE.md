# CBO extension fields in PO actions (ZMCP_BIZ)

The PO change actions (`MM.PO.SET_DELIVERY_COMPLETE`, `UNSET_DELIVERY_COMPLETE`,
`SET_FINAL_INVOICE`, `CHANGE_DELIVERY_DATE`, `CHANGE_QUANTITY`, `DELETE_ITEM`)
handle the customer include fields of the purchase order:

- `CI_EKKODB`: header fields (EKKO), carried by `BAPI_TE_MEPOHEADER`.
- `CI_EKPODB`: item fields (EKPO), carried by `BAPI_TE_MEPOITEM`.

`ZCL_MCP_BIZ_MM` (static methods `collect` / `apply` / `verify`, formerly class `ZCL_MCP_BIZ_PO_CBO`) reads these includes from the DDIC at run time. No
customer field or object name is written in the source.

## What the user sees

1. PREVIEW returns `cbo_fields`. This is one row per field: level (`H` / `I`), item, field, text,
   type, length, current value, `settable`, `note`.
2. The `assist` skill shows the list once and asks: *"Must any of these
   fields change together with this action?"*
3. If yes, the new values go in the `cbo` parameter, one string per field:
   - `H.<FIELD>=<value>`: header field
   - `I.<ebelp>.<FIELD>=<value>`: item field
   - Write dates as `YYYY-MM-DD` and numbers with `.` as the decimal separator, without grouping.
4. PREVIEW runs again with the values (BAPI TESTRUN). The changes show as
   `CBO:<FIELD>` rows in `changes`. EXECUTE sends the same EXTENSIONIN rows.

Fields with `settable = false` can only be shown. The `note` says why.

## When the standard layout is enough

The value part of EXTENSIONIN must have the same layout as the BAPI
structure, and the `STRUCTURE` name must stay `BAPI_TE_MEPOHEADER` /
`BAPI_TE_MEPOITEM`. Function group 2012 (`move_extensionin`) drops rows with
any other name.

If every field of the include is character-like (CHAR, NUMC, DATS, TIMS),
the standard conversion works and no setup is needed. Most systems are like this.

Check it in SE11 → `CI_EKKODB` / `CI_EKPODB`. Any QUAN, CURR, DEC, INT or FLTP
field makes the include non-character-like.

## When the include has a numeric field

Standard code (FG 2012, `move_container_in` / `move_container_out`) does two
things in this case:

- It raises warning **ME 887** "Error transferring ExtensionIn data for enhancement
  CI_EKKODB" on every PO BAPI call. It does this even without EXTENSIONIN rows, because of the
  EXTENSIONOUT mapping. ZMCP_BIZ hides this warning and keeps it in `suppressed`.
- It skips its own conversion and calls BAdI **ME_BAPI_PO_CUST**, method
  **MAP2I_EXTENSIONIN**. Only that BAdI can then fill the fields.

So the header (or item) fields can be set only when the system has these three things:

1. **A character-only copy structure**. Create it in SE11, for example `ZBAPI_TE_MEPOHEADER_C`:
   - The same field names in the same order as `BAPI_TE_MEPOHEADER`, starting with `PO_NUMBER` and then the CI fields.
   - Every numeric field as CHAR, long enough for the text form. Example: QUAN 13,3 → CHAR 17.
   - The other fields keep their type.
2. **A BAdI implementation** of `ME_BAPI_PO_CUST`, method `MAP2I_EXTENSIONIN`.
   It reads the value part into the copy and moves it into `CH_STRUC`.
   Check the method signature in SE18 for your release. The template below
   follows the ECC 6.0 interface (`IM_CONTAINER`, `IM_NAME`, `IM_ERROR`, `CH_STRUC`):

   ```abap
   METHOD if_ex_me_bapi_po_cust~map2i_extensionin.
     DATA ls_copy TYPE zbapi_te_mepoheader_c.   " your copy structure

     CHECK im_name = 'CI_EKKODB'.
     cl_abap_container_utilities=>read_container_c(
       EXPORTING  im_container = im_container
       IMPORTING  ex_value     = ls_copy
       EXCEPTIONS illegal_parameter_type = 1
                  OTHERS                 = 2 ).
     CHECK sy-subrc = 0.
     TRY.
         MOVE-CORRESPONDING ls_copy TO ch_struc.   " CHAR '12.500' -> QUAN
       CATCH cx_sy_conversion_error.
         " leave ch_struc unchanged; optionally raise a message here
     ENDTRY.
   ENDMETHOD.
   ```

   If the system already has such an implementation, reuse it (SE19, look for
   implementations of `ME_BAPI_PO_CUST` with code in `MAP2I_EXTENSIONIN`) and
   check that it is active.
3. **The TVARVC entry** that tells ZMCP_BIZ which layout to send. In STVARV,
   create a parameter (type P):

   | Variable | Value |
   |---|---|
   | `ZMCP_BIZ_TE_MEPOHEADER` | the copy structure, e.g. `ZBAPI_TE_MEPOHEADER_C` |
   | `ZMCP_BIZ_TE_MEPOITEM` | only if `CI_EKPODB` is non-character-like too |

At run time `ZCL_MCP_BIZ_MM` checks the copy:

- It must have the same field names in the same order as the BAPI structure.
- Every field must be character-like.

If either check fails, the fields stay `settable = false` and the `note` names the mismatch.

## Setup step (per system, confirmed by the user)

Planned for the `/sc4sap:setup` business actions step (P4). Until then, run them by hand. The user confirms
the result before anything is written:

1. Are `CI_EKKODB` / `CI_EKPODB` present and character-like? If yes, nothing to do.
2. If they are not:
   - Is there a `ME_BAPI_PO_CUST` implementation with `MAP2I_EXTENSIONIN` code?
   - Is there a character-only structure that matches `BAPI_TE_MEPOHEADER` field by field?
   - Show both to the user.
3. If the user confirms, set the TVARVC entry, then run one PREVIEW. Every `settable` must be `true`.
4. If either is missing:
   - Show this guide.
   - Header CBO fields stay read-only until the customer builds the copy and the BAdI.
   - The actions themselves still work.

## Keep in sync

When a field is added to `CI_EKKODB`, add it to the copy structure as well.
Otherwise the runtime check fails, and the fields become read-only again.
A typical BAdI implementation that checks names raises its own error in this case.
