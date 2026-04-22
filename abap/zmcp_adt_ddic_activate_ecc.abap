FUNCTION zmcp_adt_ddic_activate
  IMPORTING
    VALUE(iv_type) TYPE string
    VALUE(iv_name) TYPE string
  EXPORTING
    VALUE(ev_subrc)   TYPE i
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_ADT_DDIC_ACTIVATE - ECC 7.40 DDIC activation helper (ECC-only).
*
* Scope: activates an inactive DDIC object staged by one of the
* ZMCP_ADT_DDIC_TABL / DTEL / DOMA FMs. S/4HANA uses ADT's native
* activation and does NOT install this FM.
*
* Parameters:
*   iv_type - TABL / DTEL / DOMA
*   iv_name - object name (e.g. ZTAB_FOO)
*
* Delegates to DDIF_TABL_ACTIVATE / DDIF_DTEL_ACTIVATE /
* DDIF_DOMA_ACTIVATE. AUTH_CHK='X', PRID=-1 (dictionary-only log).
*
* Result JSON: {"activated":true,"type":"<type>","name":"<name>","rc":0}

  DATA: lv_name TYPE ddobjname,
        lv_type TYPE string,
        lv_rc   TYPE sy-subrc.

  CLEAR: ev_subrc, ev_message, ev_result.

  lv_name = to_upper( iv_name ).
  lv_type = to_upper( iv_type ).

  TRY.
      CASE lv_type.

        WHEN 'TABL'.
          CALL FUNCTION 'DDIF_TABL_ACTIVATE'
            EXPORTING
              name        = lv_name
              auth_chk    = 'X'
              prid        = -1
              excommit    = 'X'
            IMPORTING
              rc          = lv_rc
            EXCEPTIONS
              not_found   = 1
              put_failure = 2
              OTHERS      = 3.

        WHEN 'DTEL'.
          CALL FUNCTION 'DDIF_DTEL_ACTIVATE'
            EXPORTING
              name        = lv_name
              auth_chk    = 'X'
              prid        = -1
            IMPORTING
              rc          = lv_rc
            EXCEPTIONS
              not_found   = 1
              put_failure = 2
              OTHERS      = 3.

        WHEN 'DOMA'.
          CALL FUNCTION 'DDIF_DOMA_ACTIVATE'
            EXPORTING
              name        = lv_name
              auth_chk    = 'X'
              prid        = -1
            IMPORTING
              rc          = lv_rc
            EXCEPTIONS
              not_found   = 1
              put_failure = 2
              OTHERS      = 3.

        WHEN OTHERS.
          ev_subrc   = 4.
          ev_message = |Unknown iv_type: { iv_type }. Use TABL / DTEL / DOMA.|.
          RETURN.
      ENDCASE.

      IF sy-subrc <> 0.
        ev_subrc   = sy-subrc.
        ev_message = |DDIF_{ lv_type }_ACTIVATE raised sy-subrc={ sy-subrc } (1=not_found,2=put_failure)|.
        RETURN.
      ENDIF.

      " lv_rc > 0 means activation warnings/errors reported via return code
      IF lv_rc <> 0.
        ev_subrc   = lv_rc.
        ev_message = |{ lv_type } { lv_name } activation returned rc={ lv_rc } (non-zero: activation did not complete cleanly)|.
        ev_result  = |\{"activated":false,"type":"{ lv_type }","name":"{ lv_name }","rc":{ lv_rc }\}|.
      ELSE.
        ev_subrc   = 0.
        ev_message = |{ lv_type } { lv_name } activated|.
        ev_result  = |\{"activated":true,"type":"{ lv_type }","name":"{ lv_name }","rc":0\}|.
      ENDIF.

    CATCH cx_root INTO DATA(lx_root).
      ev_subrc   = 8.
      ev_message = lx_root->get_text( ).
  ENDTRY.

ENDFUNCTION.
