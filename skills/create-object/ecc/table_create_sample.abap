*&---------------------------------------------------------------------*
*& Report  YCREATE_ZMMT44021
*&---------------------------------------------------------------------*
*& Purpose : Programmatically create DDIC table ZMMT44021
*&           (Raw Material Input History) on ECC systems where
*&           ADT DDIC REST API is not available.
*& Method  : DDIF_TABL_PUT only (inactive version).
*&           Activation and CTS assignment are done manually in SE11.
*& Notes   : DDIF_* family is SAP-internal (unreleased). Use at own risk.
*&---------------------------------------------------------------------*
REPORT ycreate_zmmt44021.

CONSTANTS: gc_tabname TYPE tabname VALUE 'ZMMT44021'.

PARAMETERS: p_dryrun AS CHECKBOX DEFAULT 'X'.

*---------------------------------------------------------------------*
* Build DD02V (header), DD09L (tech. settings), DD03P (fields)
*---------------------------------------------------------------------*
DATA: ls_dd02v TYPE dd02v,
      ls_dd09l TYPE dd09l,
      lt_dd03p TYPE STANDARD TABLE OF dd03p,
      ls_dd03p TYPE dd03p,
      lv_pos   TYPE i.

*-- Header -------------------------------------------------------------
ls_dd02v-tabname    = gc_tabname.
ls_dd02v-ddlanguage = sy-langu.
ls_dd02v-tabclass   = 'TRANSP'.
ls_dd02v-mainflag   = 'X'.
ls_dd02v-contflag   = 'A'.
ls_dd02v-exclass    = '1'.
ls_dd02v-ddtext     = 'Raw Material Input History'.

*-- Technical settings -------------------------------------------------
ls_dd09l-tabname  = gc_tabname.
ls_dd09l-as4local = 'A'.
ls_dd09l-tabkat   = '0'.
ls_dd09l-tabart   = 'APPL1'.
ls_dd09l-bufallow = 'N'.

*-- Fields -------------------------------------------------------------
DEFINE add_field.
  lv_pos = lv_pos + 1.
  CLEAR ls_dd03p.
  ls_dd03p-tabname    = gc_tabname.
  ls_dd03p-fieldname  = &1.
  ls_dd03p-position   = lv_pos.
  ls_dd03p-keyflag    = &2.
  ls_dd03p-rollname   = &3.
  ls_dd03p-ddlanguage = sy-langu.
  APPEND ls_dd03p TO lt_dd03p.
END-OF-DEFINITION.

"              fieldname     key   data element
add_field 'MANDT'        'X' 'MANDT'.
add_field 'DOC_NO'       'X' 'BELNR_D'.
add_field 'ITEM_NO'      'X' 'POSNR'.
add_field 'MATNR'        ' ' 'MATNR'.
add_field 'WERKS'        ' ' 'WERKS_D'.
add_field 'LGORT'        ' ' 'LGORT_D'.
add_field 'CHARG'        ' ' 'CHARG_D'.
add_field 'MENGE'        ' ' 'MENGE_D'.
add_field 'MEINS'        ' ' 'MEINS'.
add_field 'BUDAT'        ' ' 'BUDAT'.
add_field 'USNAM'        ' ' 'USNAM'.
add_field 'CPUDT'        ' ' 'CPUDT'.
add_field 'CPUTM'        ' ' 'CPUTM'.

*---------------------------------------------------------------------*
* Preview
*---------------------------------------------------------------------*
WRITE: / '--- YCREATE_ZMMT44021 ---',
       / 'Table       :', gc_tabname,
       / 'Dry-run     :', p_dryrun,
       / 'Field count :', lines( lt_dd03p ).
ULINE.
WRITE: / 'Pos', 'Field', 'Key', 'Data element'.
LOOP AT lt_dd03p INTO ls_dd03p.
  WRITE: / ls_dd03p-position, ls_dd03p-fieldname,
           ls_dd03p-keyflag, ls_dd03p-rollname.
ENDLOOP.
ULINE.

IF p_dryrun = 'X'.
  WRITE: / 'Dry-run flag ON - nothing written to DDIC.'.
  WRITE: / 'Uncheck p_dryrun and re-run to create the table.'.
  RETURN.
ENDIF.

*---------------------------------------------------------------------*
* Put (inactive). Activate and assign to CTS manually in SE11.
*---------------------------------------------------------------------*
CALL FUNCTION 'DDIF_TABL_PUT'
  EXPORTING  name              = gc_tabname
             dd02v_wa          = ls_dd02v
             dd09l_wa          = ls_dd09l
  TABLES     dd03p_tab         = lt_dd03p
  EXCEPTIONS tabl_not_found    = 1
             name_inconsistent = 2
             tabl_inconsistent = 3
             put_failure       = 4
             put_refused       = 5
             OTHERS            = 6.
IF sy-subrc <> 0.
  WRITE: / 'DDIF_TABL_PUT failed. Subrc =', sy-subrc.
  RETURN.
ENDIF.

WRITE: / 'Table', gc_tabname, 'written (inactive).'.
WRITE: / 'Next steps: open SE11 -> activate -> assign to transport.'.