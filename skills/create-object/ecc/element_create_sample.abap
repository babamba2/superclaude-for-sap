*&---------------------------------------------------------------------*
*& Report  YCREATE_DTEL_ZMME_MMINPTYPE
*&---------------------------------------------------------------------*
*& Purpose : Programmatically create DDIC data element ZDTEL_MMINPTYPE
*&           (references domain ZDOM_MMINPTYPE) on ECC systems where
*&           ADT DDIC REST API is not available.
*& Method  : DDIF_DTEL_PUT only (inactive version).
*&           Activation and CTS assignment are done manually in SE11.
*& Notes   : DDIF_* family is SAP-internal (unreleased). Use at own risk.
*&           The referenced domain must exist and be active beforehand.
*&---------------------------------------------------------------------*
REPORT ycreate_dtel_zmme_mminptype.

CONSTANTS: gc_rollname TYPE rollname VALUE 'ZMMD_MMINPTYPE',
           gc_domname  TYPE domname  VALUE 'ZMME_MMINPTYPE'.

PARAMETERS: p_dryrun AS CHECKBOX DEFAULT 'X'.

DATA: ls_dd04v TYPE dd04v.

*-- Data element header ------------------------------------------------*
ls_dd04v-rollname   = gc_rollname.
ls_dd04v-ddlanguage = sy-langu.
ls_dd04v-domname    = gc_domname.          " reference to domain
ls_dd04v-headlen    = 55.
ls_dd04v-scrlen1    = 10.                  " short field label
ls_dd04v-scrlen2    = 20.                  " medium field label
ls_dd04v-scrlen3    = 40.                  " long field label

ls_dd04v-reptext    = 'Material Input Type'.
ls_dd04v-scrtext_s  = 'InpType'.
ls_dd04v-scrtext_m  = 'Input Type'.
ls_dd04v-scrtext_l  = 'Material Input Type'.
ls_dd04v-ddtext     = 'Material Input Type'.

*-- Preview ------------------------------------------------------------*
WRITE: / '--- YCREATE_DTEL_ZMME_MMINPTYPE ---',
       / 'Data element :', gc_rollname,
       / 'Domain ref   :', gc_domname,
       / 'Dry-run      :', p_dryrun.
ULINE.
WRITE: / 'Header       :', ls_dd04v-reptext,
       / 'Short label  :', ls_dd04v-scrtext_s,
       / 'Medium label :', ls_dd04v-scrtext_m,
       / 'Long label   :', ls_dd04v-scrtext_l.
ULINE.

IF p_dryrun = 'X'.
  WRITE: / 'Dry-run flag ON - nothing written to DDIC.'.
  WRITE: / 'Uncheck p_dryrun and re-run to create the data element.'.
  RETURN.
ENDIF.

*-- Put (inactive). Activate manually in SE11. ------------------------*
CALL FUNCTION 'DDIF_DTEL_PUT'
  EXPORTING  name              = gc_rollname
             dd04v_wa          = ls_dd04v
  EXCEPTIONS dtel_not_found    = 1
             name_inconsistent = 2
             dtel_inconsistent = 3
             put_failure       = 4
             put_refused       = 5
             OTHERS            = 6.
IF sy-subrc <> 0.
  WRITE: / 'DDIF_DTEL_PUT failed. Subrc =', sy-subrc.
  RETURN.
ENDIF.

WRITE: / 'Data element', gc_rollname, 'written (inactive).'.
WRITE: / 'Next steps: open SE11 -> activate -> assign to transport.'.