CLASS zcl_zmcp_adt_mpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zmcp_adt_mpc
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS define REDEFINITION.

  PROTECTED SECTION.
  PRIVATE SECTION.
    METHODS define_dispatch_result
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_textpool_result
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_dispatch_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_textpool_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_result
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_tabl_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_dtel_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_doma_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_ttyp_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_activate_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_badi_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_tabl_read_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_dtel_read_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_ddic_doma_read_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_wl_result
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_wl_tcode_usage_action
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_wl_job_result
      RAISING /iwbep/cx_mgw_med_exception.
    METHODS define_wl_job_usage_action
      RAISING /iwbep/cx_mgw_med_exception.
ENDCLASS.


CLASS zcl_zmcp_adt_mpc_ext IMPLEMENTATION.

  METHOD define.
    super->define( ).
    define_dispatch_result( ).
    define_textpool_result( ).
    define_dispatch_action( ).
    define_textpool_action( ).
    define_ddic_result( ).
    define_ddic_tabl_action( ).
    define_ddic_dtel_action( ).
    define_ddic_doma_action( ).
    define_ddic_ttyp_action( ).
    define_ddic_activate_action( ).
    define_ddic_badi_action( ).
    define_ddic_tabl_read_action( ).
    define_ddic_dtel_read_action( ).
    define_ddic_doma_read_action( ).
    define_wl_result( ).
    define_wl_tcode_usage_action( ).
    define_wl_job_result( ).
    define_wl_job_usage_action( ).
  ENDMETHOD.

  METHOD define_dispatch_result.
    DATA lo_cmplx TYPE REF TO /iwbep/if_mgw_odata_cmplx_type.

    lo_cmplx = model->create_complex_type( iv_cplx_type_name = 'DispatchResult' ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_RESULT'
      iv_abap_fieldname = 'EV_RESULT' )->set_type_edm_string( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_SUBRC'
      iv_abap_fieldname = 'EV_SUBRC' )->set_type_edm_int32( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_MESSAGE'
      iv_abap_fieldname = 'EV_MESSAGE' )->set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_textpool_result.
    DATA lo_cmplx TYPE REF TO /iwbep/if_mgw_odata_cmplx_type.

    lo_cmplx = model->create_complex_type( iv_cplx_type_name = 'TextpoolResult' ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_RESULT'
      iv_abap_fieldname = 'EV_RESULT' )->set_type_edm_string( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_SUBRC'
      iv_abap_fieldname = 'EV_SUBRC' )->set_type_edm_int32( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_MESSAGE'
      iv_abap_fieldname = 'EV_MESSAGE' )->set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_dispatch_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'Dispatch' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DispatchResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_PARAMS'
      iv_abap_fieldname = 'IV_PARAMS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_textpool_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'Textpool' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'TextpoolResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_PROGRAM'
      iv_abap_fieldname = 'IV_PROGRAM' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_LANGUAGE'
      iv_abap_fieldname = 'IV_LANGUAGE' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_TEXTPOOL_JSON'
      iv_abap_fieldname = 'IV_TEXTPOOL_JSON' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_result.
    DATA lo_cmplx TYPE REF TO /iwbep/if_mgw_odata_cmplx_type.

    lo_cmplx = model->create_complex_type( iv_cplx_type_name = 'DdicResult' ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_RESULT'
      iv_abap_fieldname = 'EV_RESULT' )->set_type_edm_string( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_SUBRC'
      iv_abap_fieldname = 'EV_SUBRC' )->set_type_edm_int32( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_MESSAGE'
      iv_abap_fieldname = 'EV_MESSAGE' )->set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_tabl_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicTabl' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_DEVCLASS'
      iv_abap_fieldname = 'IV_DEVCLASS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_TRANSPORT'
      iv_abap_fieldname = 'IV_TRANSPORT' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_PAYLOAD_JSON'
      iv_abap_fieldname = 'IV_PAYLOAD_JSON' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_ttyp_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicTtyp' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_DEVCLASS'
      iv_abap_fieldname = 'IV_DEVCLASS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_TRANSPORT'
      iv_abap_fieldname = 'IV_TRANSPORT' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_PAYLOAD_JSON'
      iv_abap_fieldname = 'IV_PAYLOAD_JSON' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_dtel_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicDtel' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_DEVCLASS'
      iv_abap_fieldname = 'IV_DEVCLASS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_TRANSPORT'
      iv_abap_fieldname = 'IV_TRANSPORT' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_PAYLOAD_JSON'
      iv_abap_fieldname = 'IV_PAYLOAD_JSON' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_doma_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicDoma' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTION'
      iv_abap_fieldname = 'IV_ACTION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_DEVCLASS'
      iv_abap_fieldname = 'IV_DEVCLASS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_TRANSPORT'
      iv_abap_fieldname = 'IV_TRANSPORT' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_PAYLOAD_JSON'
      iv_abap_fieldname = 'IV_PAYLOAD_JSON' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_activate_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicActivate' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_TYPE'
      iv_abap_fieldname = 'IV_TYPE' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_badi_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicBadi' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_BADI_DEFINITION'
      iv_abap_fieldname = 'IV_BADI_DEFINITION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_CUSTOMER_ONLY'
      iv_abap_fieldname = 'IV_CUSTOMER_ONLY' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_ACTIVE_ONLY'
      iv_abap_fieldname = 'IV_ACTIVE_ONLY' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_INCLUDE_METHODS'
      iv_abap_fieldname = 'IV_INCLUDE_METHODS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_tabl_read_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicTablRead' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_VERSION'
      iv_abap_fieldname = 'IV_VERSION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_dtel_read_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicDtelRead' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_VERSION'
      iv_abap_fieldname = 'IV_VERSION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_ddic_doma_read_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'DdicDomaRead' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'DdicResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_NAME'
      iv_abap_fieldname = 'IV_NAME' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_VERSION'
      iv_abap_fieldname = 'IV_VERSION' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_wl_result.
    DATA lo_cmplx TYPE REF TO /iwbep/if_mgw_odata_cmplx_type.

    lo_cmplx = model->create_complex_type( iv_cplx_type_name = 'WlResult' ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_RESULT'
      iv_abap_fieldname = 'EV_RESULT' )->set_type_edm_string( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_SUBRC'
      iv_abap_fieldname = 'EV_SUBRC' )->set_type_edm_int32( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_MESSAGE'
      iv_abap_fieldname = 'EV_MESSAGE' )->set_type_edm_string( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_COVERAGE'
      iv_abap_fieldname = 'EV_COVERAGE' )->set_type_edm_int32( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_SYSID'
      iv_abap_fieldname = 'EV_SYSID' )->set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_wl_tcode_usage_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.
    DATA lo_param  TYPE REF TO /iwbep/if_mgw_odata_parameter.

    lo_action = model->create_action( iv_action_name = 'WlTcodeUsage' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'WlResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_TCODES'
      iv_abap_fieldname = 'IV_TCODES' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_MONTHS'
      iv_abap_fieldname = 'IV_MONTHS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    " optional - callers that do not send it read the connected system
    lo_param = lo_action->create_input_parameter(
      iv_parameter_name = 'IV_RFCDEST'
      iv_abap_fieldname = 'IV_RFCDEST' ).
    lo_param->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
    lo_param->/iwbep/if_mgw_odata_property~set_nullable( abap_true ).
  ENDMETHOD.

  METHOD define_wl_job_result.
    DATA lo_cmplx TYPE REF TO /iwbep/if_mgw_odata_cmplx_type.

    lo_cmplx = model->create_complex_type( iv_cplx_type_name = 'WlJobResult' ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_RESULT'
      iv_abap_fieldname = 'EV_RESULT' )->set_type_edm_string( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_SUBRC'
      iv_abap_fieldname = 'EV_SUBRC' )->set_type_edm_int32( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_MESSAGE'
      iv_abap_fieldname = 'EV_MESSAGE' )->set_type_edm_string( ).

    lo_cmplx->create_property(
      iv_property_name  = 'EV_OLDEST'
      iv_abap_fieldname = 'EV_OLDEST' )->set_type_edm_string( ).
  ENDMETHOD.

  METHOD define_wl_job_usage_action.
    DATA lo_action TYPE REF TO /iwbep/if_mgw_odata_action.

    lo_action = model->create_action( iv_action_name = 'WlJobUsage' ).
    lo_action->set_return_complex_type( iv_complex_type_name = 'WlJobResult' ).
    lo_action->set_return_multiplicity( iv_cardinality = '1' ).
    lo_action->set_http_method( iv_method_name = 'POST' ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_PROGRAMS'
      iv_abap_fieldname = 'IV_PROGRAMS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).

    lo_action->create_input_parameter(
      iv_parameter_name = 'IV_MONTHS'
      iv_abap_fieldname = 'IV_MONTHS' )->/iwbep/if_mgw_odata_property~set_type_edm_string( ).
  ENDMETHOD.

ENDCLASS.