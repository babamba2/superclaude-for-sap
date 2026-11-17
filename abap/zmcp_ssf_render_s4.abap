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

* ZMCP_SSF_RENDER (S/4 variant with guards) - SmartForm output as SAP
* prints it, without a spool.
*
* Function group ZMCP_SSFR ($TMP), NOT remote-enabled - ZMCP_ADT_DISPATCH
* action SSF_RENDER calls it. Same interface and result as the ECC source
* zmcp_ssf_render.abap; this variant adds the guards below.
*
* Calls the form's generated function module with sample values for its
* interface and CONTROL_PARAMETERS-GETOTF = 'X' / NO_DIALOG = 'X': nothing
* is printed, spooled or sent; the OTF comes back and is converted to PDF.
* The form's own program lines (code nodes, initialization) DO run - they
* may read the database like a real print does.
*
* Guards:
* - client role T000-CCCATEGORY C / D / E only (P, T, S and unreadable
*   T000 refused)
* - form name [A-Z0-9_] only, no namespace
* - allowed forms: SAP-delivered SmartForms (TADIR R3TR SSFO, source
*   system SAP) of the SAP example package SMART, the SAP forms listed in
*   lc_sap_extra, and own test forms ZSC4SAP_* in package $TMP; any other
*   customer form (Z / Y) is refused
* - the forms of lc_sap_extra are real business forms whose program lines
*   and text / address nodes read the database by the passed keys: for
*   them every document-number / partner / address key in the passed
*   values (component names in lc_key_re, e.g. BIL_NUMBER, VBELN*, OBJKY,
*   ADDR_NO, PAYER, *IBAN) must start with 'ZZ' when filled, and
*   IS_BIL_INVOICE-HD_GEN-BIL_NUMBER and IS_NAST-OBJKY must be filled with
*   'ZZ...' - such keys never match a real document (SD numbers are
*   numeric), so no real data reaches the PDF; refused otherwise
* - IV_PARAMS at most 200 000 characters
* - the standard SmartForm parameters (CONTROL_PARAMETERS, OUTPUT_OPTIONS,
*   USER_SETTINGS) are always set here; ARCHIVE_* / MAIL_* and the other
*   standard output parameters are always passed initial, whatever
*   IV_PARAMS says
* - generation: SSF_FUNCTION_MODULE_NAME generates the form's function
*   module when it is missing / stale, as a real print does. The generator
*   commits the new function group frame itself, so the rest of the
*   generation (TFDIR, STXFADMI, ...) is COMMITted right after the call -
*   a ROLLBACK there left an orphan /1BCDWB/SAPLSF* frame per render and
*   regenerated every time (S/4 816 DEV system 2026-11-17). That COMMIT runs before any
*   code of the form, and nothing else is in the LUW.
* - ROLLBACK WORK on every path after that COMMIT: undoes uncommitted
*   changes of the form's program lines (a failed generation is left as the
*   generator leaves it - no rollback, see there).
* This FM writes nothing itself; its one COMMIT is the generation's.
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
* IV_FAMILIES comma list of the font families the form uses: without
*            IV_DEVICE, the device type with printer fonts for most of them
*            is chosen (TFO03).
*
* EV_RESULT  {"form","fm","device","deviceType","pages","otf","pdf"}
* EV_SUBRC   0 ok, 4 form not found, 8 other error / refused (EV_MESSAGE)

  CONSTANTS: lc_max_params TYPE i VALUE 200000,
             " SAP forms outside package SMART that may be rendered
             lc_sap_extra  TYPE string VALUE ` LB_BIL_INVOICE `.

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
        lv_cccat   TYPE cccategory,
        lv_nm      TYPE string,
        lv_devcl   TYPE devclass,
        lv_srcsys  TYPE srcsystem,
        lv_fmrc    TYPE sysubrc,
        lx_root    TYPE REF TO cx_root,
        lv_keybad  TYPE string,
        lv_keyval  TYPE string.
  FIELD-SYMBOLS: <lv_any> TYPE any,
                 <ls_top> TYPE any,
                 <ls_sub> TYPE any,
                 <lv_key> TYPE any.

  CLEAR: ev_subrc, ev_message, ev_result.

  " --- guard: development-type clients only
  SELECT SINGLE cccategory FROM t000 INTO lv_cccat WHERE mandt = sy-mandt.
  IF sy-subrc <> 0.
    ev_subrc = 8. ev_message = |SSF_RENDER: client role not readable (T000) - refused|.
    RETURN.
  ENDIF.
  IF lv_cccat <> 'C' AND lv_cccat <> 'D' AND lv_cccat <> 'E'.
    ev_subrc = 8. ev_message = |SSF_RENDER: client role { lv_cccat } - render runs only in development-type clients (C / D / E)|.
    RETURN.
  ENDIF.

  " --- guard: form name and allow rules
  lv_nm = iv_formname.
  IF lv_nm IS INITIAL OR NOT matches( val = lv_nm regex = `[A-Z0-9_]+` ).
    ev_subrc = 8. ev_message = |SSF_RENDER: form name { lv_nm } refused (A-Z, 0-9, _ only)|.
    RETURN.
  ENDIF.
  SELECT SINGLE devclass srcsystem FROM tadir INTO (lv_devcl, lv_srcsys)
    WHERE pgmid = 'R3TR' AND object = 'SSFO' AND obj_name = lv_nm.
  IF sy-subrc <> 0.
    ev_subrc = 4. ev_message = |SSF_RENDER: form { lv_nm } not found (TADIR SSFO)|.
    RETURN.
  ENDIF.
  IF lv_nm(1) = 'Z' OR lv_nm(1) = 'Y'.
    IF NOT ( matches( val = lv_nm regex = `ZSC4SAP_[A-Z0-9_]+` ) AND lv_devcl = '$TMP' ).
      ev_subrc = 8. ev_message = |SSF_RENDER refuses customer form { lv_nm }: only own test forms ZSC4SAP_* in package $TMP|.
      RETURN.
    ENDIF.
  ELSEIF lv_srcsys <> 'SAP' OR ( lv_devcl <> 'SMART' AND lc_sap_extra NS | { lv_nm } | ).
    ev_subrc = 8. ev_message = |SSF_RENDER: form { lv_nm } not allowed - SAP example forms of package SMART only (package { lv_devcl }, source { lv_srcsys })|.
    RETURN.
  ENDIF.

  IF strlen( iv_params ) > lc_max_params.
    ev_subrc = 8. ev_message = |SSF_RENDER: params longer than { lc_max_params } characters - refused|.
    RETURN.
  ENDIF.

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
    lv_fmrc = sy-subrc.
    " No ROLLBACK: only the generator's writes are in this LUW, and a rollback
    " would orphan a frame it committed itself; the call's end commits it as a print would.
    ev_subrc = 4. ev_message = |SSF_RENDER: form { iv_formname } not found or not generated (rc { lv_fmrc })|.
    RETURN.
  ENDIF.
  " Keep the generation consistent (see header): only the generator's writes are in this LUW.
  COMMIT WORK.

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
    ROLLBACK WORK.
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
          WHEN 'ARCHIVE_INDEX' OR 'ARCHIVE_INDEX_TAB' OR 'ARCHIVE_PARAMETERS'
            OR 'MAIL_APPL_OBJ' OR 'MAIL_RECIPIENT' OR 'MAIL_SENDER'.
            " standard output parameters: never taken from IV_PARAMS
            CONTINUE.
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
        " TABLES p TYPE <table type> is already a table - only a structure /
        " LIKE parameter needs wrapping
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

      " Business forms of lc_sap_extra: impossible ('ZZ...') keys only.
      IF lc_sap_extra CS | { lv_nm } |.
        LOOP AT lt_ptab INTO ls_parm WHERE kind <> abap_func_importing.
          CASE ls_parm-name.
            WHEN 'CONTROL_PARAMETERS' OR 'OUTPUT_OPTIONS' OR 'USER_SETTINGS'.
              CONTINUE.
          ENDCASE.
          ASSIGN ls_parm-value->* TO <lv_any>.
          PERFORM ssf_key_guard USING <lv_any> ls_parm-name ls_parm-name CHANGING lv_keybad.
        ENDLOOP.
        " the two keys the form's program lines read by must be given
        CLEAR ls_parm.
        READ TABLE lt_ptab INTO ls_parm WITH KEY name = 'IS_BIL_INVOICE'.
        CLEAR lv_keyval.
        IF sy-subrc = 0.
          ASSIGN ls_parm-value->* TO <ls_top>.
          ASSIGN COMPONENT 'HD_GEN' OF STRUCTURE <ls_top> TO <ls_sub>.
          IF sy-subrc = 0.
            ASSIGN COMPONENT 'BIL_NUMBER' OF STRUCTURE <ls_sub> TO <lv_key>.
            IF sy-subrc = 0. lv_keyval = <lv_key>. ENDIF.
          ENDIF.
        ENDIF.
        IF strlen( lv_keyval ) < 2 OR lv_keyval(2) <> 'ZZ'.
          lv_keybad = |{ lv_keybad } IS_BIL_INVOICE-HD_GEN-BIL_NUMBER|.
        ENDIF.
        CLEAR ls_parm.
        READ TABLE lt_ptab INTO ls_parm WITH KEY name = 'IS_NAST'.
        CLEAR lv_keyval.
        IF sy-subrc = 0.
          ASSIGN ls_parm-value->* TO <ls_top>.
          ASSIGN COMPONENT 'OBJKY' OF STRUCTURE <ls_top> TO <lv_key>.
          IF sy-subrc = 0. lv_keyval = <lv_key>. ENDIF.
        ENDIF.
        IF strlen( lv_keyval ) < 2 OR lv_keyval(2) <> 'ZZ'.
          lv_keybad = |{ lv_keybad } IS_NAST-OBJKY|.
        ENDIF.
        IF lv_keybad IS NOT INITIAL.
          ev_subrc = 8.
          ev_message = |SSF_RENDER: { lv_nm } reads the database by its keys - these must start with 'ZZ' (impossible document keys):{ lv_keybad }|.
          ROLLBACK WORK.
          RETURN.
        ENDIF.
      ENDIF.

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
        lv_fmrc = sy-subrc.
        ev_subrc = 8.
        IF sy-msgid IS NOT INITIAL.
          MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
        ENDIF.
        ev_message = |SSF_RENDER: { lv_fm } ended with exception { lv_fmrc }: { ev_message }|.
        ROLLBACK WORK.
        RETURN.
      ENDIF.
    CATCH cx_root INTO lx_root.
      ev_subrc = 8. ev_message = |SSF_RENDER: { lx_root->get_text( ) }|.
      ROLLBACK WORK.
      RETURN.
  ENDTRY.

  " Undo whatever the form's program lines changed without a COMMIT.
  ROLLBACK WORK.

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
*& Form SSF_KEY_GUARD - filled key components must start with 'ZZ'
*&---------------------------------------------------------------------*
* Walks a passed value (structures, tables, nested) and lists every
* elementary component whose name matches lc_key_re, is filled and does
* not start with 'ZZ'. At most 10 paths are listed.
FORM ssf_key_guard USING is_data  TYPE any
                         iv_name  TYPE csequence
                         iv_path  TYPE csequence
                   CHANGING cv_bad TYPE string.
  CONSTANTS lc_key_re TYPE string
    VALUE `VBELN.*|BIL_NUMBER|OBJKY|ADDR_NO|ADRNR|ADDRNUMBER|ADDR_NUMB|PERS_NO|PERSNUMBER|DELIV_NUMB|ORDER_NUMB|PAYER|SOLD_TO|SHIP_TO|BILL_TO|KUNNR|KUNAG|KUNRG|KUNWE|PARTN_NUMB|PARNR|MNDID|.*IBAN`.
  DATA: lo_type  TYPE REF TO cl_abap_typedescr,
        lo_struc TYPE REF TO cl_abap_structdescr,
        ls_comp  TYPE abap_compdescr,
        lv_val   TYPE string,
        lv_path  TYPE string,
        lv_count TYPE i.
  FIELD-SYMBOLS: <ls_c>   TYPE any,
                 <lt_tab> TYPE ANY TABLE,
                 <ls_row> TYPE any.

  FIND ALL OCCURRENCES OF `/` IN cv_bad MATCH COUNT lv_count.
  IF lv_count >= 10.
    RETURN.
  ENDIF.
  lo_type = cl_abap_typedescr=>describe_by_data( is_data ).
  CASE lo_type->kind.
    WHEN cl_abap_typedescr=>kind_struct.
      lo_struc ?= lo_type.
      LOOP AT lo_struc->components INTO ls_comp.
        ASSIGN COMPONENT ls_comp-name OF STRUCTURE is_data TO <ls_c>.
        IF sy-subrc = 0.
          lv_path = |{ iv_path }-{ ls_comp-name }|.
          PERFORM ssf_key_guard USING <ls_c> ls_comp-name lv_path CHANGING cv_bad.
        ENDIF.
      ENDLOOP.
    WHEN cl_abap_typedescr=>kind_table.
      ASSIGN is_data TO <lt_tab>.
      LOOP AT <lt_tab> ASSIGNING <ls_row>.
        lv_path = |{ iv_path }[{ sy-tabix }]|.
        PERFORM ssf_key_guard USING <ls_row> iv_name lv_path CHANGING cv_bad.
      ENDLOOP.
    WHEN cl_abap_typedescr=>kind_elem.
      IF is_data IS NOT INITIAL AND matches( val = to_upper( iv_name ) regex = lc_key_re ).
        lv_val = is_data.
        CONDENSE lv_val.
        IF strlen( lv_val ) < 2 OR lv_val(2) <> 'ZZ'.
          cv_bad = |{ cv_bad } /{ iv_path }|.
        ENDIF.
      ENDIF.
  ENDCASE.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SSF_CHOOSE_DEVICE - output device for a SmartForm print
*&---------------------------------------------------------------------*
* Same logic as the ECC source zmcp_ssf_render.abap.
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
