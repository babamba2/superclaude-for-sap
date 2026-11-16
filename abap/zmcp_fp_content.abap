FUNCTION zmcp_fp_content
  IMPORTING
    VALUE(iv_part)     TYPE string
    VALUE(iv_name)     TYPE fpname
    VALUE(iv_language) TYPE spras OPTIONAL
    VALUE(iv_params)   TYPE string OPTIONAL
  EXPORTING
    VALUE(ev_subrc)   TYPE sysubrc
    VALUE(ev_message) TYPE string
    VALUE(ev_result)  TYPE string.

* ZMCP_FP_CONTENT - read-only: an Adobe form (SFP) for preview and checks.
*
* Function group ZMCP_FP (package $TMP on a DEV system), NOT remote-enabled -
* ZMCP_ADT_DISPATCH actions FP_CONTENT (FORM, LAYOUT, INTERFACE) and
* FP_RENDER (RENDER) call it. BASIS 7.40 or later (/UI2/CL_JSON for RENDER
* parameters).
*
* Guards: runs only in a development-type client - T000-CCCATEGORY 'C'
* (customizing), 'D' (demo) or 'E' (training); production 'P', test 'T' and
* SAP reference 'S' clients are refused, and so is a client T000 cannot
* tell. Names: letters, digits, _ and / only. RENDER: only the SAP example
* forms of package SFPT listed in LV_RENDER_ALLOWED (exact names; Z / Y /
* namespace forms are refused), active forms only, IV_PARAMS at most
* 200 000 characters.
*
* IV_PART
*   FORM       the form as one XML (CL_FP_HELPER=>CONVERT_FORM_TO_XSTRING:
*              header, context tree, texts, layout - the SFP download
*              format) plus its header fields.
*              Result {"form","interface","formType","formTech","layoutType",
*              "xml"} - xml in base64.
*   LAYOUT     the layout alone: the XDP / XFA template
*              (IF_FP_LAYOUT->GET_LAYOUT_DATA). Result {"form","xdp"} - xdp
*              in base64.
*   INTERFACE  the form interface as XML (CONVERT_INTERFACE_TO_XSTRING:
*              parameters, global definitions, types). IV_NAME = interface.
*              Result {"interface","xml"} - xml in base64.
*   RENDER     the PDF as ADS produces it, for invented interface values:
*              FP_FUNCTION_MODULE_NAME -> generated FM, FP_JOB_OPEN with
*              GETPDF = 'X' / NODIALOG = 'X' (the PDF comes back to the
*              caller; no dialog, no print), FP_JOB_CLOSE.
*              IV_PARAMS JSON array [{"name":"IS_HEADER","json":"{...}"}] -
*              internal values in /UI2/CL_JSON format; parameters not listed
*              are passed initial. The form's own program lines (context
*              coding) run as in a real print and may read the database:
*              pass invented values only.
*              Result {"form","fm","pages","pdf"} - pdf in base64.
*
* Objects are loaded in display mode (no lock) and freed again. FORM,
* LAYOUT and INTERFACE write nothing. RENDER: (1) FP_FUNCTION_MODULE_NAME
* generates the form's function module (/1BCDWB/..., FPCONTEXTI) when it is
* missing or older than the form - exactly as a real print does; that is the
* only repository write, and SAP example forms are normally generated
* already. (2) The form's own context coding runs; whatever it changed
* without a COMMIT is undone by ROLLBACK WORK after FP_JOB_CLOSE - an
* explicit COMMIT inside the form's code cannot be undone, which is why
* RENDER is limited to SAP example forms. No spool request (GETPDF returns
* the PDF to the caller, REQNEW / REQIMM off, no archiving).
*
*   EV_SUBRC  0 ok, 4 not found, 8 other error (EV_MESSAGE)

  TYPES: BEGIN OF ty_in,
           name TYPE string,
           json TYPE string,
         END OF ty_in.
  DATA: lv_part    TYPE string,
        lv_nm      TYPE string,
        lv_cat     TYPE t000-cccategory,
        lo_wbf     TYPE REF TO if_fp_wb_form,
        lo_form    TYPE REF TO if_fp_form,
        lo_layout  TYPE REF TO if_fp_layout,
        lo_wbi     TYPE REF TO if_fp_wb_interface,
        lo_if      TYPE REF TO if_fp_interface,
        lv_x       TYPE xstring,
        lv_ifname  TYPE fpname,
        lv_ftype   TYPE string,
        lv_ftech   TYPE string,
        lv_ltype   TYPE string,
        lv_b64     TYPE string,
        lx_repo    TYPE REF TO cx_fp_api_repository,
        lx_root    TYPE REF TO cx_root.
  " RENDER
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
        ls_outpar  TYPE sfpoutputparams,
        ls_docpar  TYPE sfpdocparams,
        ls_output  TYPE fpformoutput,
        lv_jobopen TYPE abap_bool,
        lv_rc      TYPE i.
  FIELD-SYMBOLS: <lv_any> TYPE any.
  " SAP example forms (package SFPT) that RENDER may run - checked on an S/4HANA
  " system 2026-11-17; blanks around every name for the NS test.
  DATA lv_render_allowed TYPE string.
  lv_render_allowed = ` FP_EXAMPLE_01 FP_TEST_00 FP_TEST_01 FP_TEST_02 FP_TEST_03 ` &&
                      ` FP_TEST_03_TABLE FP_TEST_03_TABLE_DUPLEX FP_TEST_05 ` &&
                      ` FP_TEST_CONDITION1 FP_TEST_CONDITION2 FP_TEST_CONDITION3 ` &&
                      ` FP_TEST_CONDITION4 FP_TEST_CONDITION5 FP_TEST_COUNT FP_TEST_DATE ` &&
                      ` FP_TEST_DYN_GRAPHIC FP_TEST_NESTED_TABLE FP_TEST_PAGE_BREAK `.

  CLEAR: ev_subrc, ev_message.
  ev_result = '{}'.

  " Development-type clients only (customizing, demo, training).
  SELECT SINGLE cccategory FROM t000 INTO lv_cat WHERE mandt = sy-mandt.
  IF sy-subrc <> 0 OR ( lv_cat <> 'C' AND lv_cat <> 'D' AND lv_cat <> 'E' ).
    ev_subrc = 8.
    ev_message = |FP_CONTENT: refused in client { sy-mandt } (role "{ lv_cat }") - development clients only|.
    RETURN.
  ENDIF.

  lv_part = iv_part.
  TRANSLATE lv_part TO UPPER CASE.
  CONDENSE lv_part NO-GAPS.
  IF iv_name IS INITIAL.
    ev_subrc = 8. ev_message = |FP_CONTENT: IV_NAME is required|.
    RETURN.
  ENDIF.
  " The name goes into the result JSON unescaped: letters, digits, _ and / only.
  lv_nm = iv_name.          " string: no trailing blanks of the CHAR 30 field
  FIND REGEX '^[A-Z0-9_/]+$' IN lv_nm.
  IF sy-subrc <> 0.
    ev_subrc = 8. ev_message = |FP_CONTENT: invalid form name|.
    RETURN.
  ENDIF.
  " RENDER runs the form's own code: SAP example forms of package SFPT only (exact names).
  IF lv_part = 'RENDER' AND lv_render_allowed NS | { lv_nm } |.
    ev_subrc = 8.
    IF lv_nm CP 'Z*' OR lv_nm CP 'Y*' OR lv_nm CP '/*'.
      ev_message = |FP_CONTENT: RENDER refuses customer form { lv_nm } - only the SAP example forms of package SFPT are allowed|.
    ELSE.
      ev_message = |FP_CONTENT: RENDER is not allowed for { lv_nm } - only the SAP example forms of package SFPT|.
    ENDIF.
    RETURN.
  ENDIF.

  TRY.
      CASE lv_part.
        WHEN 'FORM' OR 'LAYOUT'.
          lo_wbf = cl_fp_wb_form=>load( i_name = iv_name i_language = iv_language ).
          lo_form ?= lo_wbf->get_object( ).
          lo_layout = lo_form->get_layout( ).
          IF lv_part = 'FORM'.
            lv_ifname = lo_form->get_interface_name( ).
            lv_ftype = lo_form->get_form_type( ).
            lv_ftech = lo_layout->get_form_tech( ).
            lv_ltype = lo_layout->get_layout_type( ).
            lv_x = cl_fp_helper=>convert_form_to_xstring( lo_form ).
            lv_b64 = cl_http_utility=>encode_x_base64( lv_x ).
            ev_result = |\{"form":"{ iv_name }","interface":"{ lv_ifname }","formType":"{ lv_ftype }",| &&
                        |"formTech":"{ lv_ftech }","layoutType":"{ lv_ltype }","xml":"{ lv_b64 }"\}|.
          ELSE.
            lv_x = lo_layout->get_layout_data( ).
            lv_b64 = cl_http_utility=>encode_x_base64( lv_x ).
            ev_result = |\{"form":"{ iv_name }","xdp":"{ lv_b64 }"\}|.
          ENDIF.
          lo_wbf->free( ).
          CLEAR lo_wbf.

        WHEN 'INTERFACE'.
          lo_wbi = cl_fp_wb_interface=>load( i_name = iv_name i_language = iv_language ).
          lo_if ?= lo_wbi->get_object( ).
          lv_x = cl_fp_helper=>convert_interface_to_xstring( lo_if ).
          lv_b64 = cl_http_utility=>encode_x_base64( lv_x ).
          ev_result = |\{"interface":"{ iv_name }","xml":"{ lv_b64 }"\}|.
          lo_wbi->free( ).
          CLEAR lo_wbi.

        WHEN 'RENDER'.
          IF strlen( iv_params ) > 200000.
            ev_subrc = 8. ev_message = |FP_CONTENT: IV_PARAMS longer than 200 000 characters|.
            RETURN.
          ENDIF.
          " Active forms only: the generated function module belongs to the active version.
          lo_wbf = cl_fp_wb_form=>load( i_name = iv_name ).
          IF lo_wbf->get_state( ) <> if_fp_wb_object=>c_state_active.
            lo_wbf->free( ).
            ev_subrc = 8. ev_message = |FP_CONTENT: form { iv_name } is not active|.
            RETURN.
          ENDIF.
          lo_wbf->free( ).
          CLEAR lo_wbf.

          CALL FUNCTION 'FP_FUNCTION_MODULE_NAME'
            EXPORTING
              i_name     = iv_name
            IMPORTING
              e_funcname = lv_fm.

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
            ev_subrc = 8. ev_message = |FP_CONTENT: interface of { lv_fm } not readable|.
            RETURN.
          ENDIF.

          IF iv_params IS NOT INITIAL.
            /ui2/cl_json=>deserialize( EXPORTING json = iv_params CHANGING data = lt_in ).
          ENDIF.
          LOOP AT lt_in INTO ls_in.
            TRANSLATE ls_in-name TO UPPER CASE.
            MODIFY lt_in FROM ls_in.
          ENDLOOP.

          IF iv_language IS NOT INITIAL.
            ls_docpar-langu = iv_language.
          ELSE.
            ls_docpar-langu = sy-langu.
          ENDIF.

          LOOP AT lt_imp INTO ls_imp.
            CLEAR ls_parm.
            ls_parm-name = ls_imp-parameter.
            ls_parm-kind = abap_func_exporting.
            IF ls_imp-parameter = '/1BCDWB/DOCPARAMS'.
              GET REFERENCE OF ls_docpar INTO ls_parm-value.
            ELSE.
              CLEAR ls_in.
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
            ENDIF.
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
            CLEAR ls_in.
            READ TABLE lt_in INTO ls_in WITH KEY name = ls_tab-parameter.
            IF sy-subrc = 0 AND ls_in-json IS NOT INITIAL.
              /ui2/cl_json=>deserialize( EXPORTING json = ls_in-json CHANGING data = <lv_any> ).
            ENDIF.
            ls_parm-value = lr_data.
            INSERT ls_parm INTO TABLE lt_ptab.
          ENDLOOP.

          CLEAR ls_parm.
          ls_parm-name = '/1BCDWB/FORMOUTPUT'.
          ls_parm-kind = abap_func_importing.
          GET REFERENCE OF ls_output INTO ls_parm-value.
          INSERT ls_parm INTO TABLE lt_ptab.

          ls_excp-name = 'USAGE_ERROR'.    ls_excp-value = 1. INSERT ls_excp INTO TABLE lt_etab.
          ls_excp-name = 'SYSTEM_ERROR'.   ls_excp-value = 2. INSERT ls_excp INTO TABLE lt_etab.
          ls_excp-name = 'INTERNAL_ERROR'. ls_excp-value = 3. INSERT ls_excp INTO TABLE lt_etab.
          ls_excp-name = 'OTHERS'.         ls_excp-value = 4. INSERT ls_excp INTO TABLE lt_etab.

          " The PDF comes back to the caller: no dialog, no preview, no print.
          ls_outpar-nodialog = 'X'.
          ls_outpar-getpdf   = 'X'.
          ls_outpar-preview  = space.
          ls_outpar-dest     = space.   " no output device
          ls_outpar-reqnew   = space.   " no spool request ...
          ls_outpar-reqimm   = space.   " ... and no immediate print
          ls_outpar-arcmode  = '1'.     " print only - nothing archived
          CALL FUNCTION 'FP_JOB_OPEN'
            CHANGING
              ie_outputparams = ls_outpar
            EXCEPTIONS
              cancel          = 1
              usage_error     = 2
              system_error    = 3
              internal_error  = 4
              OTHERS          = 5.
          IF sy-subrc <> 0.
            ev_subrc = 8. ev_message = |FP_CONTENT: FP_JOB_OPEN failed (rc { sy-subrc }) - is ADS reachable?|.
            RETURN.
          ENDIF.
          lv_jobopen = abap_true.

          CALL FUNCTION lv_fm
            PARAMETER-TABLE lt_ptab
            EXCEPTION-TABLE lt_etab.
          lv_rc = sy-subrc.
          IF lv_rc <> 0 AND sy-msgid IS NOT INITIAL.
            MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
              WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO ev_message.
          ENDIF.

          CALL FUNCTION 'FP_JOB_CLOSE'
            EXCEPTIONS
              usage_error    = 1
              system_error   = 2
              internal_error = 3
              OTHERS         = 4.
          lv_jobopen = abap_false.
          " Undo whatever the form's own code changed without a COMMIT.
          ROLLBACK WORK.                                  "#EC CI_ROLLBACK

          IF lv_rc <> 0.
            ev_subrc = 8. ev_message = |FP_CONTENT: { lv_fm } ended with exception { lv_rc }: { ev_message }|.
            RETURN.
          ENDIF.
          IF ls_output-pdf IS INITIAL.
            ev_subrc = 8. ev_message = |FP_CONTENT: { lv_fm } returned no PDF|.
            RETURN.
          ENDIF.
          lv_b64 = cl_http_utility=>encode_x_base64( ls_output-pdf ).
          ev_result = |\{"form":"{ iv_name }","fm":"{ lv_fm }","pages":{ ls_output-pages },"pdf":"{ lv_b64 }"\}|.

        WHEN OTHERS.
          ev_subrc = 8.
          ev_message = |FP_CONTENT: unknown part "{ iv_part }" (FORM, LAYOUT, INTERFACE, RENDER)|.
      ENDCASE.
    CATCH cx_fp_api_repository INTO lx_repo.
      ev_subrc = 4. ev_message = |FP_CONTENT: { lx_repo->get_text( ) }|. ev_result = '{}'.
    CATCH cx_root INTO lx_root.
      ev_subrc = 8. ev_message = |FP_CONTENT: { lx_root->get_text( ) }|. ev_result = '{}'.
  ENDTRY.

  IF lv_jobopen = abap_true.
    CALL FUNCTION 'FP_JOB_CLOSE'
      EXCEPTIONS
        OTHERS = 1.
    ROLLBACK WORK.                                        "#EC CI_ROLLBACK
  ENDIF.
  IF lo_wbf IS BOUND.
    TRY.
        lo_wbf->free( ).
      CATCH cx_root.                                   "#EC NO_HANDLER
    ENDTRY.
  ENDIF.
  IF lo_wbi IS BOUND.
    TRY.
        lo_wbi->free( ).
      CATCH cx_root.                                   "#EC NO_HANDLER
    ENDTRY.
  ENDIF.
ENDFUNCTION.
