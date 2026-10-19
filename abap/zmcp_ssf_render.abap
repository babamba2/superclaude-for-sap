FUNCTION zmcp_ssf_render
  IMPORTING
    VALUE(iv_formname) TYPE tdsfname
    VALUE(iv_params)   TYPE string OPTIONAL
    VALUE(iv_language) TYPE spras OPTIONAL
    VALUE(iv_device)   TYPE rspopname OPTIONAL
    VALUE(iv_families) TYPE string OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_SSF_RENDER - SmartForm output as SAP prints it, without a spool.
*
* Function group ZMCP_ADT_UTILS, NOT remote-enabled - ZMCP_ADT_DISPATCH
* action SSF_RENDER calls it. ECC / BASIS 7.40 (/UI2/CL_JSON).
*
* Calls the form's generated function module with sample values for its
* interface and CONTROL_PARAMETERS-GETOTF = 'X' / NO_DIALOG = 'X': nothing
* is printed, spooled or sent; the OTF comes back and is converted to PDF.
* The form's own program lines (code nodes, initialization) DO run - they
* may read the database like a real print does. This FM itself never writes.
*
* IV_PARAMS  JSON array, one entry per interface parameter to fill:
*            [{"name":"IS_HEADER","json":"{\"VKORG\":\"1000\",...}"}, ...]
*            json = the value in /UI2/CL_JSON format (internal values,
*            dates 2026-10-16, times 14:00:00, numbers as numbers);
*            a TABLES parameter or table type takes a JSON array.
*            Parameters not listed are passed initial.
* IV_DEVICE  output device (its device type decides fonts and character
*            widths). Default: the user's default device, else the first
*            device with type SAPWIN / SWINCF / PDF1 / PDFUC, else any.
* IV_FAMILIES comma list of the font families the form uses (KPDODUM,
*            TIMES, ...): without IV_DEVICE, the device type with printer
*            fonts for most of them is chosen (TFO03), so the output uses the
*            fonts the form was made for instead of a device fallback.
*
* EV_RESULT  {"form","fm","pages","otf":"<base64 of OTF lines, one per
*            line: 2-char command + parameters>","pdf":"<base64>"}
* EV_SUBRC   0 ok, 4 form not found, 8 other error (EV_MESSAGE)

  TYPES: BEGIN OF ty_in,
           name TYPE string,
           json TYPE string,
         END OF ty_in.
  DATA: lt_in      TYPE STANDARD TABLE OF ty_in,
        ls_in      TYPE ty_in,
        lv_fm      TYPE rs38l_fnam,
        lt_imp     TYPE STANDARD TABLE OF rsimp,
        ls_imp     TYPE rsimp,
        lt_tab     TYPE STANDARD TABLE OF rstbl,
        ls_tab     TYPE rstbl,
        lt_exp     TYPE STANDARD TABLE OF rsexp,
        lt_chg     TYPE STANDARD TABLE OF rscha,
        lt_exc     TYPE STANDARD TABLE OF rsexc,
        lt_ptab    TYPE abap_func_parmbind_tab,
        ls_parm    TYPE abap_func_parmbind,
        lt_etab    TYPE abap_func_excpbind_tab,
        ls_excp    TYPE abap_func_excpbind,
        lv_type    TYPE string,
        lr_data    TYPE REF TO data,
        lo_tdescr  TYPE REF TO cl_abap_typedescr,
        ls_ctrl    TYPE ssfctrlop,
        ls_outopt  TYPE ssfcompop,
        lv_userset TYPE tdbool,
        ls_jobinfo TYPE ssfcrescl,
        ls_otf     TYPE itcoo,
        lt_lines   TYPE STANDARD TABLE OF tline,
        lv_binsize TYPE i,
        lv_pdf     TYPE xstring,
        lv_otfstr  TYPE string,
        lv_otfx    TYPE xstring,
        lv_b64otf  TYPE string,
        lv_b64pdf  TYPE string,
        lv_pages   TYPE i,
        lv_spld    TYPE rspopname,
        lo_conv    TYPE REF TO cl_abap_conv_out_ce,
        lv_devtype TYPE rspoptype,
        lx_root    TYPE REF TO cx_root.
  FIELD-SYMBOLS: <lv_any> TYPE any.

  CLEAR: ev_subrc, ev_message, ev_result.

  CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
    EXPORTING
      formname           = iv_formname
    IMPORTING
      fm_name            = lv_fm
    EXCEPTIONS
      no_form            = 1
      no_function_module = 2
      OTHERS             = 3.
  IF sy-subrc <> 0.
    ev_subrc = 4. ev_message = |SSF_RENDER: form { iv_formname } not found or not generated (rc { sy-subrc })|.
    RETURN.
  ENDIF.

  CALL FUNCTION 'FUNCTION_IMPORT_INTERFACE'
    EXPORTING
      funcname           = lv_fm
    TABLES
      exception_list     = lt_exc
      export_parameter   = lt_exp
      import_parameter   = lt_imp
      changing_parameter = lt_chg
      tables_parameter   = lt_tab
    EXCEPTIONS
      OTHERS             = 1.
  IF sy-subrc <> 0.
    ev_subrc = 8. ev_message = |SSF_RENDER: interface of { lv_fm } not readable|.
    RETURN.
  ENDIF.

  TRY.
      IF iv_params IS NOT INITIAL.
        /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = lt_in ).
      ENDIF.
      LOOP AT lt_in INTO ls_in.
        TRANSLATE ls_in-name TO UPPER CASE.
        MODIFY lt_in FROM ls_in.
      ENDLOOP.

      " Output control: OTF back to the caller, no dialog, no spool.
      PERFORM ssf_choose_device USING iv_device iv_families CHANGING lv_spld lv_devtype.
      ls_ctrl-no_dialog = 'X'.
      ls_ctrl-getotf    = 'X'.
      ls_ctrl-preview   = space.
      ls_ctrl-device    = 'PRINTER'.
      IF iv_language IS NOT INITIAL.
        ls_ctrl-langu = iv_language.
      ELSE.
        ls_ctrl-langu = sy-langu.
      ENDIF.
      ls_outopt-tddest   = lv_spld.
      ls_outopt-tdnoprev = 'X'.
      ls_outopt-tdimmed  = space.
      ls_outopt-tdnewid  = space.
      lv_userset = space.

      LOOP AT lt_imp INTO ls_imp.
        CLEAR ls_parm.
        ls_parm-name = ls_imp-parameter.
        ls_parm-kind = abap_func_exporting.
        CASE ls_imp-parameter.
          WHEN 'CONTROL_PARAMETERS'. GET REFERENCE OF ls_ctrl INTO ls_parm-value.
          WHEN 'OUTPUT_OPTIONS'.     GET REFERENCE OF ls_outopt INTO ls_parm-value.
          WHEN 'USER_SETTINGS'.      GET REFERENCE OF lv_userset INTO ls_parm-value.
          WHEN OTHERS.
            READ TABLE lt_in INTO ls_in WITH KEY name = ls_imp-parameter.
            IF sy-subrc <> 0 AND ls_imp-optional = 'X'.
              CONTINUE.
            ENDIF.
            lv_type = ls_imp-typ.
            IF lv_type IS INITIAL.
              lv_type = ls_imp-dbfield.
            ENDIF.
            IF lv_type IS INITIAL.
              CONTINUE.
            ENDIF.
            CREATE DATA lr_data TYPE (lv_type).
            ASSIGN lr_data->* TO <lv_any>.
            IF ls_in-name = ls_imp-parameter AND ls_in-json IS NOT INITIAL.
              /ui2/cl_json=>deserialize( EXPORTING json = ls_in-json CHANGING data = <lv_any> ).
            ENDIF.
            ls_parm-value = lr_data.
        ENDCASE.
        CLEAR ls_in.
        INSERT ls_parm INTO TABLE lt_ptab.
      ENDLOOP.

      LOOP AT lt_tab INTO ls_tab.
        CLEAR ls_parm.
        ls_parm-name = ls_tab-parameter.
        ls_parm-kind = abap_func_tables.
        lv_type = ls_tab-dbstruct.
        IF lv_type IS INITIAL.
          lv_type = ls_tab-typ.
        ENDIF.
        IF lv_type IS INITIAL.
          CONTINUE.
        ENDIF.
        " TABLES p TYPE <table type> (ZNA_B2B_FORM_01 GT_ITEM TYPE ZFI_TT_...) is
        " already a table - only a structure / LIKE parameter needs wrapping
        CLEAR lo_tdescr.
        cl_abap_typedescr=>describe_by_name(
          EXPORTING  p_name         = lv_type
          RECEIVING  p_descr_ref    = lo_tdescr
          EXCEPTIONS type_not_found = 1
                     OTHERS         = 2 ).
        IF sy-subrc = 0 AND lo_tdescr IS BOUND AND lo_tdescr->kind = cl_abap_typedescr=>kind_table.
          CREATE DATA lr_data TYPE (lv_type).
        ELSE.
          CREATE DATA lr_data TYPE STANDARD TABLE OF (lv_type).
        ENDIF.
        ASSIGN lr_data->* TO <lv_any>.
        READ TABLE lt_in INTO ls_in WITH KEY name = ls_tab-parameter.
        IF sy-subrc = 0 AND ls_in-json IS NOT INITIAL.
          /ui2/cl_json=>deserialize( EXPORTING json = ls_in-json CHANGING data = <lv_any> ).
        ENDIF.
        ls_parm-value = lr_data.
        INSERT ls_parm INTO TABLE lt_ptab.
      ENDLOOP.

      CLEAR ls_parm.
      ls_parm-name = 'JOB_OUTPUT_INFO'.
      ls_parm-kind = abap_func_importing.
      GET REFERENCE OF ls_jobinfo INTO ls_parm-value.
      INSERT ls_parm INTO TABLE lt_ptab.

      ls_excp-name = 'FORMATTING_ERROR'. ls_excp-value = 1. INSERT ls_excp INTO TABLE lt_etab.
      ls_excp-name = 'INTERNAL_ERROR'.   ls_excp-value = 2. INSERT ls_excp INTO TABLE lt_etab.
      ls_excp-name = 'SEND_ERROR'.       ls_excp-value = 3. INSERT ls_excp INTO TABLE lt_etab.
      ls_excp-name = 'USER_CANCELED'.    ls_excp-value = 4. INSERT ls_excp INTO TABLE lt_etab.
      ls_excp-name = 'ERROR_MESSAGE'.    ls_excp-value = 5. INSERT ls_excp INTO TABLE lt_etab.
      ls_excp-name = 'OTHERS'.           ls_excp-value = 6. INSERT ls_excp INTO TABLE lt_etab.

      CALL FUNCTION lv_fm
        PARAMETER-TABLE lt_ptab
        EXCEPTION-TABLE lt_etab.
      IF sy-subrc <> 0.
        ev_subrc = 8.
        IF sy-msgid IS NOT INITIAL.
          MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
        ENDIF.
        ev_message = |SSF_RENDER: { lv_fm } ended with exception { sy-subrc }: { ev_message }|.
        RETURN.
      ENDIF.
    CATCH cx_root INTO lx_root.
      ev_subrc = 8. ev_message = |SSF_RENDER: { lx_root->get_text( ) }|.
      RETURN.
  ENDTRY.

  " OTF as text: one line per record, 2-char command + parameters.
  LOOP AT ls_jobinfo-otfdata INTO ls_otf.
    CONCATENATE lv_otfstr ls_otf-tdprintcom ls_otf-tdprintpar cl_abap_char_utilities=>newline
      INTO lv_otfstr RESPECTING BLANKS.
    IF ls_otf-tdprintcom = 'EP'.
      lv_pages = lv_pages + 1.
    ENDIF.
  ENDLOOP.
  IF lv_otfstr IS INITIAL.
    ev_subrc = 8. ev_message = |SSF_RENDER: { lv_fm } returned no OTF|.
    RETURN.
  ENDIF.
  " Bitmap records hold characters UTF-8 cannot carry - replace, don't fail.
  lo_conv = cl_abap_conv_out_ce=>create( encoding = 'UTF-8' replacement = '?' ignore_cerr = abap_true ).
  lo_conv->convert( EXPORTING data = lv_otfstr IMPORTING buffer = lv_otfx ).
  lv_b64otf = cl_http_utility=>encode_x_base64( lv_otfx ).

  CALL FUNCTION 'CONVERT_OTF'
    EXPORTING
      format                = 'PDF'
    IMPORTING
      bin_filesize          = lv_binsize
      bin_file              = lv_pdf
    TABLES
      otf                   = ls_jobinfo-otfdata
      lines                 = lt_lines
    EXCEPTIONS
      err_max_linewidth     = 1
      err_format            = 2
      err_conv_not_possible = 3
      err_bad_otf           = 4
      OTHERS                = 5.
  IF sy-subrc = 0.
    lv_b64pdf = cl_http_utility=>encode_x_base64( lv_pdf ).
  ELSE.
    ev_message = |SSF_RENDER: CONVERT_OTF failed (rc { sy-subrc }) - OTF only|.
  ENDIF.

  ev_result = |\{"form":"{ iv_formname }","fm":"{ lv_fm }","device":"{ lv_spld }","deviceType":"{ lv_devtype }","pages":{ lv_pages },"otf":"{ lv_b64otf }","pdf":"{ lv_b64pdf }"\}|.
ENDFUNCTION.

*&---------------------------------------------------------------------*
*& Form SSF_CHOOSE_DEVICE - output device for a SmartForm print
*&---------------------------------------------------------------------*
* Also used by ZMCP_SSF_CONTENT (part FONTS), so the preview and the
* SAP render assume the same printer.
*   iv_device    given device - taken as is
*   iv_families  comma list of the form's font families: the device type
*                with printer fonts (TFO03) for most of them
*   else the user's default device, else a SAPWIN / PDF device, else any.
FORM ssf_choose_device USING iv_device   TYPE rspopname
                             iv_families TYPE string
                       CHANGING cv_spld    TYPE rspopname
                                cv_devtype TYPE rspoptype.
  DATA: lt_fam TYPE STANDARD TABLE OF tdfamily,
        lv_fam TYPE tdfamily,
        BEGIN OF ls_devfam,
          tddevtype TYPE rspoptype,
          tdfamily  TYPE tdfamily,
        END OF ls_devfam,
        lt_devfam LIKE STANDARD TABLE OF ls_devfam,
        BEGIN OF ls_cnt,
          devtype TYPE rspoptype,
          hits    TYPE i,
          pref    TYPE i,
        END OF ls_cnt,
        lt_cnt LIKE STANDARD TABLE OF ls_cnt.

  CLEAR: cv_spld, cv_devtype.
  cv_spld = iv_device.
  IF cv_spld IS INITIAL AND iv_families IS NOT INITIAL.
    SPLIT iv_families AT ',' INTO TABLE lt_fam.
    LOOP AT lt_fam INTO lv_fam.
      CONDENSE lv_fam.
      TRANSLATE lv_fam TO UPPER CASE.
      MODIFY lt_fam FROM lv_fam.
    ENDLOOP.
    DELETE lt_fam WHERE table_line IS INITIAL.
    IF lt_fam IS NOT INITIAL.
      SELECT tdprinter tdfamily FROM tfo03 INTO TABLE lt_devfam
        FOR ALL ENTRIES IN lt_fam WHERE tdfamily = lt_fam-table_line.
      SORT lt_devfam BY tddevtype tdfamily.
      DELETE ADJACENT DUPLICATES FROM lt_devfam COMPARING tddevtype tdfamily.
      LOOP AT lt_devfam INTO ls_devfam.
        ls_cnt-devtype = ls_devfam-tddevtype.
        ls_cnt-hits = 1.
        COLLECT ls_cnt INTO lt_cnt.
      ENDLOOP.
      " on a tie: Unicode PDF / Windows device types first (any language prints),
      " KPPDF only when it covers more of the families (Korean fonts)
      LOOP AT lt_cnt INTO ls_cnt.
        CASE ls_cnt-devtype.
          WHEN 'PDFUC'.  ls_cnt-pref = 0.
          WHEN 'SAPWIN'. ls_cnt-pref = 1.
          WHEN 'SWINCF'. ls_cnt-pref = 2.
          WHEN 'PDF1'.   ls_cnt-pref = 3.
          WHEN 'KPPDF'.  ls_cnt-pref = 4.
          WHEN OTHERS.   ls_cnt-pref = 9.
        ENDCASE.
        MODIFY lt_cnt FROM ls_cnt.
      ENDLOOP.
      SORT lt_cnt BY hits DESCENDING pref ASCENDING devtype.
      LOOP AT lt_cnt INTO ls_cnt.
        SELECT padest FROM tsp03d INTO cv_spld UP TO 1 ROWS
          WHERE patype = ls_cnt-devtype ORDER BY padest.
        ENDSELECT.
        IF cv_spld IS NOT INITIAL.
          EXIT.
        ENDIF.
      ENDLOOP.
    ENDIF.
  ENDIF.
  IF cv_spld IS INITIAL.
    SELECT SINGLE spld FROM usr01 INTO cv_spld WHERE bname = sy-uname.
  ENDIF.
  IF cv_spld IS INITIAL.
    SELECT padest FROM tsp03d INTO cv_spld UP TO 1 ROWS
      WHERE patype IN ('SAPWIN','SWINCF','PDF1','PDFUC') ORDER BY padest.
    ENDSELECT.
  ENDIF.
  IF cv_spld IS INITIAL.
    SELECT padest FROM tsp03d INTO cv_spld UP TO 1 ROWS ORDER BY padest.
    ENDSELECT.
  ENDIF.
  SELECT SINGLE patype FROM tsp03d INTO cv_devtype WHERE padest = cv_spld.
ENDFORM.
