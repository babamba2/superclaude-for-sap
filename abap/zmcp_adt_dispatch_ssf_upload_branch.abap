* ZMCP_ADT_DISPATCH - action SSF_UPLOAD_XML (MCP tool CreateSmartForm).
*
* NOT a standalone object. A snippet to paste into the LIVE dispatcher of
* the target system - never deploy the repo copies of the dispatchers.
* Read and back up the live source first.
*
* Prerequisite: FM ZMCP_SSF_UPLOAD (abap/zmcp_ssf_upload.abap) active in
* function group ZMCP_ADT_UTILS. ECC / BASIS 7.40 only (/UI2/CL_JSON).
* WRITES: DEV systems only.
*
* params: form_name, xml (base64 part), gzip (X = raw deflate), upload_id,
*         part, parts, devclass, transport, overwrite, activate (- = no)
* result: EV_RESULT of ZMCP_SSF_UPLOAD, or {"part","parts"} for a kept part
* subrc : 0 ok, 4 refused, 8 other error - EV_MESSAGE says why


*======================================================================*
* 1. In the CASE iv_action of FUNCTION zmcp_adt_dispatch, insert before
*    WHEN OTHERS:
*
*        WHEN 'SSF_UPLOAD_XML'.  PERFORM ssf_upload_xml  USING iv_params CHANGING ev_subrc ev_message ev_result.
*
* 2. Append at the end of the function group include:
*======================================================================*


*&---------------------------------------------------------------------*
*& Form SSF_UPLOAD_XML - create / replace a SmartForm from Form Builder XML
*&---------------------------------------------------------------------*
* The XML (base64, optionally gzip) may come in parts: the OData Dispatch
* function import carries IV_PARAMS in the URL. Parts 1..n-1 are kept in
* INDX (area ZM, id SSFUP<upload_id><part>) and committed; the last part
* joins them, deletes them and calls ZMCP_SSF_UPLOAD.
FORM ssf_upload_xml USING iv_params TYPE string CHANGING ev_subrc TYPE i ev_message TYPE string ev_result TYPE string.
  DATA: BEGIN OF ls_input,
          form_name TYPE string,
          xml       TYPE string,
          gzip      TYPE string,
          upload_id TYPE string,
          part      TYPE i,
          parts     TYPE i,
          devclass  TYPE string,
          transport TYPE string,
          overwrite TYPE string,
          activate  TYPE string,
        END OF ls_input.
  DATA: lv_subrc TYPE sysubrc,
        lv_ow    TYPE char1,
        lv_gz    TYPE char1,
        lv_act   TYPE char1 VALUE 'X',
        lv_id    TYPE indx-srtfd,
        lv_uid   TYPE c LENGTH 12,
        lv_part  TYPE n LENGTH 4,
        lv_chunk TYPE string,
        lv_all   TYPE string,
        lv_i     TYPE i,
        ls_indx  TYPE indx.

  /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = ls_input ).
  IF ls_input-overwrite = 'X' OR ls_input-overwrite = 'true'. lv_ow = 'X'. ENDIF.
  IF ls_input-gzip = 'X' OR ls_input-gzip = 'true'. lv_gz = 'X'. ENDIF.
  IF ls_input-activate = '-' OR ls_input-activate = 'false'. CLEAR lv_act. ENDIF.
  IF ls_input-devclass IS INITIAL. ls_input-devclass = '$TMP'. ENDIF.

  lv_all = ls_input-xml.
  IF ls_input-parts > 1.
    lv_uid = to_upper( condense( ls_input-upload_id ) ).
    IF lv_uid IS INITIAL OR ls_input-part < 1 OR ls_input-part > ls_input-parts.
      ev_subrc = 8. ev_message = 'SSF_UPLOAD_XML: bad upload_id / part / parts'. ev_result = '{}'.
      RETURN.
    ENDIF.
    IF ls_input-part < ls_input-parts.
      lv_part = ls_input-part.
      CONCATENATE 'SSFUP' lv_uid lv_part INTO lv_id.
      ls_indx-aedat = sy-datum. ls_indx-usera = sy-uname.
      EXPORT chunk = ls_input-xml TO DATABASE indx(zm) FROM ls_indx ID lv_id.
      COMMIT WORK.
      ev_subrc = 0. ev_message = |part { ls_input-part } of { ls_input-parts } kept|.
      ev_result = |\{"part":{ ls_input-part },"parts":{ ls_input-parts }\}|.
      RETURN.
    ENDIF.
    CLEAR lv_all.
    DO ls_input-parts - 1 TIMES.
      lv_i = sy-index.
      lv_part = lv_i.
      CONCATENATE 'SSFUP' lv_uid lv_part INTO lv_id.
      CLEAR lv_chunk.
      IMPORT chunk = lv_chunk FROM DATABASE indx(zm) ID lv_id.
      IF sy-subrc <> 0.
        ev_subrc = 8. ev_message = |SSF_UPLOAD_XML: part { lv_i } of upload { lv_uid } missing|. ev_result = '{}'.
        RETURN.
      ENDIF.
      DELETE FROM DATABASE indx(zm) ID lv_id.
      CONCATENATE lv_all lv_chunk INTO lv_all.
    ENDDO.
    CONCATENATE lv_all ls_input-xml INTO lv_all.
  ENDIF.

  CALL FUNCTION 'ZMCP_SSF_UPLOAD'
    EXPORTING iv_formname  = CONV tdsfname( to_upper( condense( ls_input-form_name ) ) )
              iv_xml       = lv_all
              iv_devclass  = CONV devclass( to_upper( condense( ls_input-devclass ) ) )
              iv_transport = CONV trkorr( to_upper( condense( ls_input-transport ) ) )
              iv_overwrite = lv_ow
              iv_activate  = lv_act
              iv_gzip      = lv_gz
    IMPORTING ev_subrc     = lv_subrc
              ev_message   = ev_message
              ev_result    = ev_result.
  ev_subrc = lv_subrc.
  IF ev_result IS INITIAL. ev_result = '{}'. ENDIF.
ENDFORM.
