CLASS zcl_zmcp_adt_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zmcp_adt_dpc
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~execute_action REDEFINITION.

  PROTECTED SECTION.
  PRIVATE SECTION.

    TYPES:
      BEGIN OF ty_result,
        ev_result  TYPE string,
        ev_subrc   TYPE i,
        ev_message TYPE string,
      END OF ty_result,
      BEGIN OF ty_wl_result,
        ev_result   TYPE string,
        ev_subrc    TYPE i,
        ev_message  TYPE string,
        ev_coverage TYPE i,
        ev_sysid    TYPE string,
      END OF ty_wl_result,
      BEGIN OF ty_wl_job_result,
        ev_result  TYPE string,
        ev_subrc   TYPE i,
        ev_message TYPE string,
        ev_oldest  TYPE string,
      END OF ty_wl_job_result.

    METHODS exec_dispatch
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_textpool
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_tabl
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_dtel
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_doma
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_ttyp
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_activate
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_badi
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_tabl_read
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_dtel_read
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_ddic_doma_read
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_result.

    METHODS exec_wl_tcode_usage
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_wl_result.

    METHODS exec_wl_job_usage
      IMPORTING it_parameter     TYPE /iwbep/t_mgw_name_value_pair
      RETURNING VALUE(rs_result) TYPE ty_wl_job_result.

ENDCLASS.


CLASS zcl_zmcp_adt_dpc_ext IMPLEMENTATION.

  METHOD /iwbep/if_mgw_appl_srv_runtime~execute_action.

    CASE iv_action_name.
      WHEN 'Dispatch'.
        DATA(ls_d) = exec_dispatch( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_d CHANGING cr_data = er_data ).

      WHEN 'Textpool'.
        DATA(ls_t) = exec_textpool( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_t CHANGING cr_data = er_data ).

      WHEN 'DdicTabl'.
        DATA(ls_dt) = exec_ddic_tabl( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_dt CHANGING cr_data = er_data ).

      WHEN 'DdicTtyp'.
        DATA(ls_dy) = exec_ddic_ttyp( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_dy CHANGING cr_data = er_data ).

      WHEN 'DdicDtel'.
        DATA(ls_de) = exec_ddic_dtel( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_de CHANGING cr_data = er_data ).

      WHEN 'DdicDoma'.
        DATA(ls_dd) = exec_ddic_doma( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_dd CHANGING cr_data = er_data ).

      WHEN 'DdicActivate'.
        DATA(ls_da) = exec_ddic_activate( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_da CHANGING cr_data = er_data ).

      WHEN 'DdicBadi'.
        DATA(ls_db) = exec_ddic_badi( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_db CHANGING cr_data = er_data ).

      WHEN 'DdicTablRead'.
        DATA(ls_dtr) = exec_ddic_tabl_read( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_dtr CHANGING cr_data = er_data ).

      WHEN 'DdicDtelRead'.
        DATA(ls_der) = exec_ddic_dtel_read( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_der CHANGING cr_data = er_data ).

      WHEN 'DdicDomaRead'.
        DATA(ls_ddr) = exec_ddic_doma_read( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_ddr CHANGING cr_data = er_data ).

      WHEN 'WlTcodeUsage'.
        DATA(ls_wl) = exec_wl_tcode_usage( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_wl CHANGING cr_data = er_data ).

      WHEN 'WlJobUsage'.
        DATA(ls_wj) = exec_wl_job_usage( it_parameter ).
        copy_data_to_ref( EXPORTING is_data = ls_wj CHANGING cr_data = er_data ).

      WHEN OTHERS.
        RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception.
    ENDCASE.

  ENDMETHOD.

  METHOD exec_dispatch.
    DATA lv_action TYPE string.
    DATA lv_params TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_ACTION'. lv_action = <ls_p>-value.
        WHEN 'IV_PARAMS'. lv_params = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DISPATCH'
      EXPORTING
        iv_action  = lv_action
        iv_params  = lv_params
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_textpool.
    DATA lv_action   TYPE string.
    DATA lv_program  TYPE string.
    DATA lv_language TYPE string.
    DATA lv_tp_json  TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_ACTION'.        lv_action   = <ls_p>-value.
        WHEN 'IV_PROGRAM'.       lv_program  = <ls_p>-value.
        WHEN 'IV_LANGUAGE'.      lv_language = <ls_p>-value.
        WHEN 'IV_TEXTPOOL_JSON'. lv_tp_json  = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_TEXTPOOL'
      EXPORTING
        iv_action        = lv_action
        iv_program       = lv_program
        iv_language      = lv_language
        iv_textpool_json = lv_tp_json
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_tabl.
    DATA lv_action    TYPE string.
    DATA lv_name      TYPE string.
    DATA lv_devclass  TYPE string.
    DATA lv_transport TYPE string.
    DATA lv_payload   TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_ACTION'.       lv_action    = <ls_p>-value.
        WHEN 'IV_NAME'.         lv_name      = <ls_p>-value.
        WHEN 'IV_DEVCLASS'.     lv_devclass  = <ls_p>-value.
        WHEN 'IV_TRANSPORT'.    lv_transport = <ls_p>-value.
        WHEN 'IV_PAYLOAD_JSON'. lv_payload   = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_TABL'
      EXPORTING
        iv_action       = lv_action
        iv_name         = lv_name
        iv_devclass     = lv_devclass
        iv_transport    = lv_transport
        iv_payload_json = lv_payload
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_ttyp.
    DATA lv_action    TYPE string.
    DATA lv_name      TYPE string.
    DATA lv_devclass  TYPE string.
    DATA lv_transport TYPE string.
    DATA lv_payload   TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_ACTION'.       lv_action    = <ls_p>-value.
        WHEN 'IV_NAME'.         lv_name      = <ls_p>-value.
        WHEN 'IV_DEVCLASS'.     lv_devclass  = <ls_p>-value.
        WHEN 'IV_TRANSPORT'.    lv_transport = <ls_p>-value.
        WHEN 'IV_PAYLOAD_JSON'. lv_payload   = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_TTYP'
      EXPORTING
        iv_action       = lv_action
        iv_name         = lv_name
        iv_devclass     = lv_devclass
        iv_transport    = lv_transport
        iv_payload_json = lv_payload
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_dtel.
    DATA lv_action    TYPE string.
    DATA lv_name      TYPE string.
    DATA lv_devclass  TYPE string.
    DATA lv_transport TYPE string.
    DATA lv_payload   TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_ACTION'.       lv_action    = <ls_p>-value.
        WHEN 'IV_NAME'.         lv_name      = <ls_p>-value.
        WHEN 'IV_DEVCLASS'.     lv_devclass  = <ls_p>-value.
        WHEN 'IV_TRANSPORT'.    lv_transport = <ls_p>-value.
        WHEN 'IV_PAYLOAD_JSON'. lv_payload   = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_DTEL'
      EXPORTING
        iv_action       = lv_action
        iv_name         = lv_name
        iv_devclass     = lv_devclass
        iv_transport    = lv_transport
        iv_payload_json = lv_payload
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_doma.
    DATA lv_action    TYPE string.
    DATA lv_name      TYPE string.
    DATA lv_devclass  TYPE string.
    DATA lv_transport TYPE string.
    DATA lv_payload   TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_ACTION'.       lv_action    = <ls_p>-value.
        WHEN 'IV_NAME'.         lv_name      = <ls_p>-value.
        WHEN 'IV_DEVCLASS'.     lv_devclass  = <ls_p>-value.
        WHEN 'IV_TRANSPORT'.    lv_transport = <ls_p>-value.
        WHEN 'IV_PAYLOAD_JSON'. lv_payload   = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_DOMA'
      EXPORTING
        iv_action       = lv_action
        iv_name         = lv_name
        iv_devclass     = lv_devclass
        iv_transport    = lv_transport
        iv_payload_json = lv_payload
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_activate.
    DATA lv_type TYPE string.
    DATA lv_name TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_TYPE'. lv_type = <ls_p>-value.
        WHEN 'IV_NAME'. lv_name = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_ACTIVATE'
      EXPORTING
        iv_type    = lv_type
        iv_name    = lv_name
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_badi.
    DATA lv_def              TYPE string.
    DATA lv_customer_only    TYPE string.
    DATA lv_active_only      TYPE string.
    DATA lv_include_methods  TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_BADI_DEFINITION'. lv_def             = <ls_p>-value.
        WHEN 'IV_CUSTOMER_ONLY'.   lv_customer_only   = <ls_p>-value.
        WHEN 'IV_ACTIVE_ONLY'.     lv_active_only     = <ls_p>-value.
        WHEN 'IV_INCLUDE_METHODS'. lv_include_methods = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_BADI'
      EXPORTING
        iv_badi_definition = lv_def
        iv_customer_only   = lv_customer_only
        iv_active_only     = lv_active_only
        iv_include_methods = lv_include_methods
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_tabl_read.
    DATA lv_name    TYPE string.
    DATA lv_version TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_NAME'.    lv_name    = <ls_p>-value.
        WHEN 'IV_VERSION'. lv_version = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_TABL_READ'
      EXPORTING
        iv_name    = lv_name
        iv_version = lv_version
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_dtel_read.
    DATA lv_name    TYPE string.
    DATA lv_version TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_NAME'.    lv_name    = <ls_p>-value.
        WHEN 'IV_VERSION'. lv_version = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_DTEL_READ'
      EXPORTING
        iv_name    = lv_name
        iv_version = lv_version
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_ddic_doma_read.
    DATA lv_name    TYPE string.
    DATA lv_version TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_NAME'.    lv_name    = <ls_p>-value.
        WHEN 'IV_VERSION'. lv_version = <ls_p>-value.
      ENDCASE.
    ENDLOOP.

    CALL FUNCTION 'ZMCP_ADT_DDIC_DOMA_READ'
      EXPORTING
        iv_name    = lv_name
        iv_version = lv_version
      IMPORTING
        ev_subrc   = rs_result-ev_subrc
        ev_message = rs_result-ev_message
        ev_result  = rs_result-ev_result.
  ENDMETHOD.

  METHOD exec_wl_tcode_usage.
    DATA lv_tcodes TYPE string.
    DATA lv_months TYPE string.
    DATA lv_dest   TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_TCODES'.  lv_tcodes = <ls_p>-value.
        WHEN 'IV_MONTHS'.  lv_months = <ls_p>-value.
        WHEN 'IV_RFCDEST'. lv_dest   = <ls_p>-value.
      ENDCASE.
    ENDLOOP.
    IF lv_months IS INITIAL.
      lv_months = '12'.
    ENDIF.

    CALL FUNCTION 'ZMCP_WL_TCODE_USAGE'
      EXPORTING
        iv_tcodes   = lv_tcodes
        iv_months   = lv_months
        iv_rfcdest  = lv_dest
      IMPORTING
        ev_subrc    = rs_result-ev_subrc
        ev_message  = rs_result-ev_message
        ev_coverage = rs_result-ev_coverage
        ev_result   = rs_result-ev_result
        ev_sysid    = rs_result-ev_sysid.
  ENDMETHOD.

  METHOD exec_wl_job_usage.
    DATA lv_programs TYPE string.
    DATA lv_months   TYPE string.

    LOOP AT it_parameter ASSIGNING FIELD-SYMBOL(<ls_p>).
      CASE <ls_p>-name.
        WHEN 'IV_PROGRAMS'. lv_programs = <ls_p>-value.
        WHEN 'IV_MONTHS'.   lv_months   = <ls_p>-value.
      ENDCASE.
    ENDLOOP.
    IF lv_months IS INITIAL.
      lv_months = '12'.
    ENDIF.

    CALL FUNCTION 'ZMCP_WL_JOB_USAGE'
      EXPORTING
        iv_programs = lv_programs
        iv_months   = lv_months
      IMPORTING
        ev_subrc    = rs_result-ev_subrc
        ev_message  = rs_result-ev_message
        ev_oldest   = rs_result-ev_oldest
        ev_result   = rs_result-ev_result.
  ENDMETHOD.

ENDCLASS.