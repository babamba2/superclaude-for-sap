*&---------------------------------------------------------------------*
*& Report  YCREATE_DOMA_YMMD_MMINPTYPE
*&---------------------------------------------------------------------*
*& Purpose : Programmatically create DDIC domain ZMMD_MMINPTYPE on ECC
*&           systems where ADT DDIC REST API is not available.
*& Method  : DDIF_DOMA_PUT only (inactive version).
*&           Activation and CTS assignment are done manually in SE11.
*& Notes   : DDIF_* family is SAP-internal (unreleased). Use at own risk.
*&---------------------------------------------------------------------*
REPORT ycreate_doma_zmmd_mminptype.

CONSTANTS: gc_domname TYPE domname VALUE 'ZMMD_MMINPTYPE'.

PARAMETERS: p_dryrun AS CHECKBOX DEFAULT 'X'.

DATA: ls_dd01v TYPE dd01v,
      lt_dd07v TYPE STANDARD TABLE OF dd07v,
      ls_dd07v TYPE dd07v,
      lv_pos   TYPE i.

*-- Domain header -----------------------------------------------------*
ls_dd01v-domname    = gc_domname.
ls_dd01v-ddlanguage = sy-langu.
ls_dd01v-datatype   = 'CHAR'.
ls_dd01v-leng       = '000002'.
ls_dd01v-outputlen  = '000002'.
ls_dd01v-decimals   = '000000'.
ls_dd01v-valexi     = 'X'.           " fixed values exist
ls_dd01v-ddtext     = 'Material Input Type'.

*-- Fixed values -------------------------------------------------------*
DEFINE add_fixval.
  lv_pos = lv_pos + 1.
  CLEAR ls_dd07v.
  ls_dd07v-domname    = gc_domname.
  ls_dd07v-ddlanguage = sy-langu.
  ls_dd07v-valpos     = lv_pos.
  ls_dd07v-domvalue_l = &1.
  ls_dd07v-ddtext     = &2.
  APPEND ls_dd07v TO lt_dd07v.
END-OF-DEFINITION.

"            value  label
add_fixval 'PR' 'Production'.
add_fixval 'RW' 'Rework'.
add_fixval 'MO' 'Material Movement'.

*-- Preview -----------------------------------------------------------*
WRITE: / '--- YCREATE_DOMA_ZMMD_MMINPTYPE ---',
       / 'Domain      :', gc_domname,
       / 'Type/Length :', ls_dd01v-datatype, ls_dd01v-leng,
       / 'Dry-run     :', p_dryrun.
ULINE.
WRITE: / 'Pos', 'Value', 'Label'.
LOOP AT lt_dd07v INTO ls_dd07v.
  WRITE: / ls_dd07v-valpos, ls_dd07v-domvalue_l, ls_dd07v-ddtext.
ENDLOOP.
ULINE.

IF p_dryrun = 'X'.
  WRITE: / 'Dry-run flag ON - nothing written to DDIC.'.
  WRITE: / 'Uncheck p_dryrun and re-run to create the domain.'.
  RETURN.
ENDIF.

*-- Put (inactive). Activate manually in SE11. ------------------------*
CALL FUNCTION 'DDIF_DOMA_PUT'
  EXPORTING  name              = gc_domname
             dd01v_wa          = ls_dd01v
  TABLES     dd07v_tab         = lt_dd07v
  EXCEPTIONS doma_not_found    = 1
             name_inconsistent = 2
             doma_inconsistent = 3
             put_failure       = 4
             put_refused       = 5
             OTHERS            = 6.
IF sy-subrc <> 0.
  WRITE: / 'DDIF_DOMA_PUT failed. Subrc =', sy-subrc.
  RETURN.
ENDIF.

WRITE: / 'Domain', gc_domname, 'written (inactive).'.
WRITE: / 'Next steps: open SE11 -> activate -> assign to transport.'.