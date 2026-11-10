INTERFACE zif_mcp_biz_action
  PUBLIC.

* ZIF_MCP_BIZ_ACTION - business action handler contract for ZMCP_BIZ_EXECUTE.
*
* One handler class per module: ZCL_MCP_BIZ_MM, _PP, _SD, _FI, _CO, _OUT, _LE, _WM, _PM, _EWM.
* The executor (ZCL_MCP_BIZ_EXEC) owns JSON, the production block, the
* preview token and the log; handlers own the business logic only.
*
* Written in 7.31 syntax so the same source runs on ECC 7.31, ECC 7.40
* and S/4HANA. Every scalar parameter arrives as a string; handlers
* convert and validate.

  TYPES:
    BEGIN OF ty_params,
      ebeln              TYPE string,
      ebelp              TYPE string_table,
      etenr              TYPE string,
      new_date           TYPE string,
      new_quantity       TYPE string,
      quantity           TYPE string,
      lgort              TYPE string,
      charg              TYPE string,
      posting_date       TYPE string,
      rel_code           TYPE string,
      date_basis         TYPE string,
      ekgrp              TYPE string,
      lifnr              TYPE string,
      werks              TYPE string,
      include_unreleased TYPE string,
      max_rows           TYPE string,
      cbo                TYPE string_table,
      " Production orders (ZCL_MCP_BIZ_PP_ORD).
      aufnr              TYPE string,
      vornr              TYPE string,
      yield              TYPE string,
      scrap              TYPE string,
      final_conf         TYPE string,
      new_start          TYPE string,
      new_finish         TYPE string,
      status             TYPE string,
      dispo              TYPE string,
      matnr              TYPE string,
      " Sales and distribution (ZCL_MCP_BIZ_SD_*). vbeln = order, delivery or
      " billing document; items = "MATNR:QTY[:WERKS]" (order create) or "POSNR:QTY" (delivery).
      vbeln              TYPE string,
      posnr              TYPE string,
      sched_line         TYPE string,
      vkorg              TYPE string,
      vtweg              TYPE string,
      spart              TYPE string,
      auart              TYPE string,
      doc_category       TYPE string,
      created_from       TYPE string,
      vstel              TYPE string,
      ship_point         TYPE string,
      due_date           TYPE string,
      reason             TYPE string,
      cond_type          TYPE string,
      new_price          TYPE string,
      currency           TYPE string,
      sold_to            TYPE string,
      ship_to            TYPE string,
      cust_po            TYPE string,
      req_date           TYPE string,
      unit               TYPE string,
      items              TYPE string_table,
      ref_doc            TYPE string,
      billing_date       TYPE string,
      billing_type       TYPE string,
      billing_date_to    TYPE string,
      pick_all           TYPE string,
      " PRECHECK (ZCL_MCP_BIZ_PRECHECK): TABLE-FIELD names and exists queries.
      fields             TYPE string_table,
      exists             TYPE string_table,
      " FI / CO (ZCL_MCP_BIZ_FI, ZCL_MCP_BIZ_CO). aufnr, status, max_rows, posting_date, reason and
      " currency are shared with other handlers. lines = one encoded row per element: name=value pairs separated by
      " semicolons, values percent-encoded for % ; = (flat strings so that 7.31 can parse them).
      bukrs              TYPE string,
      belnr              TYPE string,
      gjahr              TYPE string,
      buzei              TYPE string,
      kokrs              TYPE string,
      kostl              TYPE string,
      hkont              TYPE string,
      saknr              TYPE string,
      doc_type           TYPE string,
      doc_date           TYPE string,
      header_text        TYPE string,
      reference          TYPE string,
      exchange_rate      TYPE string,
      fis_period         TYPE string,
      block_key          TYPE string,
      text               TYPE string,
      key_date           TYPE string,
      target             TYPE string,
      order_type         TYPE string,
      fiscal_year        TYPE string,
      from_period        TYPE string,
      to_period          TYPE string,
      version            TYPE string,
      lines              TYPE string_table,
      " Step 5 (2026-11-10): GR stock type, customer of the credit status, BOM usage.
      stock_type         TYPE string,
      kunnr              TYPE string,
      stlan              TYPE string,
      " Output (ZCL_MCP_BIZ_OUT): output type; document via doc_category + ebeln / vbeln.
      kschl              TYPE string,
      " Shipping / transportation (ZCL_MCP_BIZ_LE, ECC only): shipment, shipment cost, handling unit.
      " dlv_list = delivery numbers; items (shared) = "POSNR:QTY" rows; vbeln / posnr / quantity shared.
      tknum              TYPE string,
      shtyp              TYPE string,
      tplst              TYPE string,
      tdlnr              TYPE string,
      route              TYPE string,
      exti1              TYPE string,
      exti2              TYPE string,
      dlv_list           TYPE string_table,
      fknum              TYPE string,
      exidv              TYPE string,
      vhilm              TYPE string,
      " Warehouse management (ZCL_MCP_BIZ_WM, classic LE-WM, ECC only). matnr / werks / lgort / charg /
      " quantity / vbeln / items / posting_date shared; src_* / dst_* = storage type and bin of the move.
      lgnum              TYPE string,
      tanum              TYPE string,
      tapos              TYPE string,
      tbnum              TYPE string,
      ivnum              TYPE string,
      lgtyp              TYPE string,
      lgpla              TYPE string,
      bwlvs              TYPE string,
      src_lgtyp          TYPE string,
      src_lgpla          TYPE string,
      dst_lgtyp          TYPE string,
      dst_lgpla          TYPE string,
      " Plant maintenance (ZCL_MCP_BIZ_PM). werks = planning plant; aufnr / vornr / auart / text /
      " new_start / new_finish / unit / final_conf / posting_date / status / max_rows shared.
      qmnum              TYPE string,
      qmart              TYPE string,
      equnr              TYPE string,
      tplnr              TYPE string,
      warpl              TYPE string,
      priok              TYPE string,
      arbpl              TYPE string,
      eqtyp              TYPE string,
      act_work           TYPE string,
      " EWM queries (ZCL_MCP_BIZ_EWM, S/4HANA only): confirmation period, warehouse order. lgnum / tanum /
      " lgtyp / lgpla / matnr / vbeln / exidv / doc_category / max_rows shared.
      date_from          TYPE string,
      date_to            TYPE string,
      who                TYPE string,
    END OF ty_params.

  TYPES:
    BEGIN OF ty_action_def,
      id   TYPE string,
      kind TYPE string,
      risk TYPE string,
    END OF ty_action_def,
    ty_action_defs TYPE STANDARD TABLE OF ty_action_def WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_message,
      type    TYPE c LENGTH 1,
      id      TYPE string,
      number  TYPE string,
      message TYPE string,
    END OF ty_message,
    ty_messages TYPE STANDARD TABLE OF ty_message WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_change,
      ebelp     TYPE ekpo-ebelp,
      etenr     TYPE eket-etenr,
      field     TYPE string,
      old_value TYPE string,
      new_value TYPE string,
    END OF ty_change,
    ty_changes TYPE STANDARD TABLE OF ty_change WITH DEFAULT KEY.

  " Customer include fields (CI_EKKODB / CI_EKPODB) shown in PREVIEW so the
  " user can review them; settable = the value can go through EXTENSIONIN.
  TYPES:
    BEGIN OF ty_cbo_field,
      level     TYPE c LENGTH 1,
      ebelp     TYPE ekpo-ebelp,
      field     TYPE string,
      text      TYPE string,
      datatype  TYPE string,
      length    TYPE i,
      value     TYPE string,
      new_value TYPE string,
      settable  TYPE abap_bool,
      values    TYPE string,
      note      TYPE string,
    END OF ty_cbo_field,
    ty_cbo_fields TYPE STANDARD TABLE OF ty_cbo_field WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_open_item,
      ebeln    TYPE ekko-ebeln,
      ebelp    TYPE ekpo-ebelp,
      etenr    TYPE eket-etenr,
      lifnr    TYPE ekko-lifnr,
      ekgrp    TYPE ekko-ekgrp,
      frgrl    TYPE ekko-frgrl,
      matnr    TYPE ekpo-matnr,
      txz01    TYPE ekpo-txz01,
      werks    TYPE ekpo-werks,
      lgort    TYPE ekpo-lgort,
      eindt    TYPE eket-eindt,
      menge    TYPE eket-menge,
      wemng    TYPE eket-wemng,
      open_qty TYPE eket-menge,
      meins    TYPE ekpo-meins,
    END OF ty_open_item,
    ty_open_items TYPE STANDARD TABLE OF ty_open_item WITH DEFAULT KEY.

  TYPES:
    ty_po_items     TYPE STANDARD TABLE OF bapimepoitem WITH DEFAULT KEY,
    ty_po_schedules TYPE STANDARD TABLE OF bapimeposchedule WITH DEFAULT KEY,
    ty_po_history   TYPE STANDARD TABLE OF bapiekbe WITH DEFAULT KEY,
    ty_po_totals    TYPE STANDARD TABLE OF bapiekbes WITH DEFAULT KEY,
    ty_rel_codes    TYPE STANDARD TABLE OF bapirlcopo WITH DEFAULT KEY.

  " Production order list row (PP.ORD.LIST_OPEN).
  TYPES:
    BEGIN OF ty_pp_order,
      aufnr  TYPE aufk-aufnr,
      auart  TYPE aufk-auart,
      werks  TYPE aufk-werks,
      matnr  TYPE afpo-matnr,
      gamng  TYPE afko-gamng,
      gmein  TYPE afko-gmein,
      igmng  TYPE afko-igmng,
      wemng  TYPE afpo-wemng,
      gstrp  TYPE afko-gstrp,
      gltrp  TYPE afko-gltrp,
      dispo  TYPE afko-dispo,
      status TYPE string,
    END OF ty_pp_order,
    ty_pp_orders     TYPE STANDARD TABLE OF ty_pp_order WITH DEFAULT KEY,
    ty_pp_operations TYPE STANDARD TABLE OF bapi_order_operation1 WITH DEFAULT KEY,
    ty_pp_components TYPE STANDARD TABLE OF bapi_order_component WITH DEFAULT KEY.

  " Sales and distribution rows. Never customer, partner or address data.
  " date1: requested delivery date (order), planned goods issue date (delivery),
  " billing date (billing document); date2: actual goods issue date (delivery).
  TYPES:
    BEGIN OF ty_sd_doc,
      vbeln    TYPE vbak-vbeln,
      vbtyp    TYPE vbak-vbtyp,
      doc_type TYPE c LENGTH 4,
      vkorg    TYPE vbak-vkorg,
      vtweg    TYPE vbak-vtweg,
      spart    TYPE vbak-spart,
      vstel    TYPE likp-vstel,
      erdat    TYPE vbak-erdat,
      date1    TYPE d,
      date2    TYPE d,
      netwr    TYPE vbak-netwr,
      waerk    TYPE vbak-waerk,
      lifsk    TYPE vbak-lifsk,
      faksk    TYPE vbak-faksk,
      lfstk    TYPE vbuk-lfstk,
      wbstk    TYPE vbuk-wbstk,
      fkstk    TYPE vbuk-fkstk,
      abstk    TYPE vbuk-abstk,
      gbstk    TYPE vbuk-gbstk,
      kostk    TYPE vbuk-kostk,
      cmgst    TYPE vbuk-cmgst,
      uvall    TYPE vbuk-uvall,
      fksto    TYPE vbrk-fksto,
      sfakn    TYPE vbrk-sfakn,
      rfbsk    TYPE vbrk-rfbsk,
      belnr    TYPE vbrk-belnr,
      items    TYPE i,
      status   TYPE string,
    END OF ty_sd_doc,
    ty_sd_docs TYPE STANDARD TABLE OF ty_sd_doc WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_sd_item,
      vbeln    TYPE vbap-vbeln,
      posnr    TYPE vbap-posnr,
      matnr    TYPE vbap-matnr,
      arktx    TYPE vbap-arktx,
      werks    TYPE vbap-werks,
      lgort    TYPE vbap-lgort,
      qty      TYPE vbap-kwmeng,
      open_qty TYPE vbap-kwmeng,
      vrkme    TYPE vbap-vrkme,
      pstyv    TYPE vbap-pstyv,
      abgru    TYPE vbap-abgru,
      netwr    TYPE vbap-netwr,
      netpr    TYPE vbap-netpr,
      bwart    TYPE lips-bwart,
      ref_doc  TYPE vbak-vbeln,
      ref_item TYPE vbap-posnr,
      lfsta    TYPE vbup-lfsta,
      wbsta    TYPE vbup-wbsta,
      fksta    TYPE vbup-fksta,
      gbsta    TYPE vbup-gbsta,
      absta    TYPE vbup-absta,
      kosta    TYPE vbup-kosta,
    END OF ty_sd_item,
    ty_sd_items TYPE STANDARD TABLE OF ty_sd_item WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_sd_sched,
      posnr TYPE vbep-posnr,
      etenr TYPE vbep-etenr,
      edatu TYPE vbep-edatu,
      wmeng TYPE vbep-wmeng,
      bmeng TYPE vbep-bmeng,
    END OF ty_sd_sched,
    ty_sd_scheds TYPE STANDARD TABLE OF ty_sd_sched WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_sd_flow,
      vbelv   TYPE vbfa-vbelv,
      posnv   TYPE vbfa-posnv,
      vbeln   TYPE vbfa-vbeln,
      posnn   TYPE vbfa-posnn,
      vbtyp_n TYPE vbfa-vbtyp_n,
      rfmng   TYPE vbfa-rfmng,
      meins   TYPE vbfa-meins,
    END OF ty_sd_flow,
    ty_sd_flows TYPE STANDARD TABLE OF ty_sd_flow WITH DEFAULT KEY.

  " PRECHECK facts: one document field value per row. level H = header,
  " I = item (item = ebelp / posnr). Dates stay YYYYMMDD, numbers use '.'.
  " Initial values and error are dropped from the JSON (compressed).
  TYPES:
    BEGIN OF ty_pc_fact,
      level TYPE c LENGTH 1,
      item  TYPE string,
      name  TYPE string,
      value TYPE string,
      error TYPE string,
    END OF ty_pc_fact,
    ty_pc_facts TYPE STANDARD TABLE OF ty_pc_fact WITH DEFAULT KEY.

  " PRECHECK answer to one exists query (found = false is dropped from the JSON).
  TYPES:
    BEGIN OF ty_pc_answer,
      query TYPE string,
      found TYPE abap_bool,
      error TYPE string,
    END OF ty_pc_answer,
    ty_pc_answers TYPE STANDARD TABLE OF ty_pc_answer WITH DEFAULT KEY.

  " FI document header / line (whitelisted fields, no vendor / customer / bank master data).
  TYPES:
    BEGIN OF ty_fi_head,
      bukrs TYPE bkpf-bukrs,
      belnr TYPE bkpf-belnr,
      gjahr TYPE bkpf-gjahr,
      blart TYPE bkpf-blart,
      bldat TYPE bkpf-bldat,
      budat TYPE bkpf-budat,
      monat TYPE bkpf-monat,
      waers TYPE bkpf-waers,
      kursf TYPE bkpf-kursf,
      xblnr TYPE bkpf-xblnr,
      bktxt TYPE bkpf-bktxt,
      stblg TYPE bkpf-stblg,
      stjah TYPE bkpf-stjah,
      bstat TYPE bkpf-bstat,
      usnam TYPE bkpf-usnam,
      cpudt TYPE bkpf-cpudt,
      awtyp TYPE bkpf-awtyp,
    END OF ty_fi_head.

  TYPES:
    BEGIN OF ty_fi_line,
      buzei TYPE bseg-buzei,
      bschl TYPE bseg-bschl,
      koart TYPE bseg-koart,
      shkzg TYPE bseg-shkzg,
      umskz TYPE bseg-umskz,
      hkont TYPE bseg-hkont,
      kostl TYPE bseg-kostl,
      aufnr TYPE bseg-aufnr,
      prctr TYPE bseg-prctr,
      gsber TYPE bseg-gsber,
      dmbtr TYPE bseg-dmbtr,
      wrbtr TYPE bseg-wrbtr,
      pswsl TYPE bseg-pswsl,
      mwskz TYPE bseg-mwskz,
      zlspr TYPE bseg-zlspr,
      zlsch TYPE bseg-zlsch,
      augbl TYPE bseg-augbl,
      augdt TYPE bseg-augdt,
      sgtxt TYPE bseg-sgtxt,
      zuonr TYPE bseg-zuonr,
    END OF ty_fi_line,
    ty_fi_lines TYPE STANDARD TABLE OF ty_fi_line WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_fi_open,
      belnr TYPE bsis-belnr,
      gjahr TYPE bsis-gjahr,
      buzei TYPE bsis-buzei,
      budat TYPE bsis-budat,
      blart TYPE bsis-blart,
      shkzg TYPE bsis-shkzg,
      dmbtr TYPE bsis-dmbtr,
      wrbtr TYPE bsis-wrbtr,
      waers TYPE bsis-waers,
      zuonr TYPE bsis-zuonr,
      sgtxt TYPE bsis-sgtxt,
    END OF ty_fi_open,
    ty_fi_opens TYPE STANDARD TABLE OF ty_fi_open WITH DEFAULT KEY.

  " CO: internal order, cost center and amount rows (whitelisted, no responsible person).
  TYPES:
    BEGIN OF ty_co_order,
      aufnr  TYPE aufk-aufnr,
      auart  TYPE aufk-auart,
      ktext  TYPE aufk-ktext,
      kokrs  TYPE aufk-kokrs,
      bukrs  TYPE aufk-bukrs,
      waers  TYPE aufk-waers,
      erdat  TYPE aufk-erdat,
      status TYPE string,
    END OF ty_co_order,
    ty_co_orders TYPE STANDARD TABLE OF ty_co_order WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_co_cc,
      kokrs TYPE csks-kokrs,
      kostl TYPE csks-kostl,
      datab TYPE csks-datab,
      datbi TYPE csks-datbi,
      bukrs TYPE csks-bukrs,
      kosar TYPE csks-kosar,
      waers TYPE csks-waers,
      ktext TYPE cskt-ktext,
      bkzkp TYPE csks-bkzkp,
      bkzks TYPE csks-bkzks,
      bkzer TYPE csks-bkzer,
      bkzob TYPE csks-bkzob,
      prctr TYPE csks-prctr,
      pkzkp TYPE csks-pkzkp,
      pkzks TYPE csks-pkzks,
      pkzer TYPE csks-pkzer,
    END OF ty_co_cc.

  " Amount row: kstar = cost element, period 0 = total over the requested periods.
  TYPES:
    BEGIN OF ty_co_amount,
      kostl  TYPE string,
      kstar  TYPE string,
      period TYPE string,
      plan   TYPE string,
      actual TYPE string,
    END OF ty_co_amount,
    ty_co_amounts TYPE STANDARD TABLE OF ty_co_amount WITH DEFAULT KEY.

  " Settlement rule line of an order (COBRB); receiver = category + key, e.g. "KS 4711".
  TYPES:
    BEGIN OF ty_co_settle,
      konty    TYPE cobrb-konty,
      receiver TYPE string,
      prozs    TYPE cobrb-prozs,
      perbz    TYPE cobrb-perbz,
      gabja    TYPE cobrb-gabja,
      gabpe    TYPE cobrb-gabpe,
      gbisj    TYPE cobrb-gbisj,
      gbisp    TYPE cobrb-gbisp,
    END OF ty_co_settle,
    ty_co_settles TYPE STANDARD TABLE OF ty_co_settle WITH DEFAULT KEY.

  " Generic record of the smaller query actions: one name / value pair per field, row = record number.
  TYPES:
    BEGIN OF ty_kv,
      row   TYPE i,
      name  TYPE string,
      value TYPE string,
    END OF ty_kv,
    ty_kvs TYPE STANDARD TABLE OF ty_kv WITH DEFAULT KEY.

  TYPES:
    BEGIN OF ty_result,
      action            TYPE string,
      mode              TYPE string,
      failed            TYPE abap_bool,
      irreversible      TYPE abap_bool,
      summary           TYPE string,
      actions           TYPE ty_action_defs,
      open_items        TYPE ty_open_items,
      truncated         TYPE abap_bool,
      hidden_no_auth    TYPE i,
      po_header         TYPE bapimepoheader,
      po_items          TYPE ty_po_items,
      po_schedules      TYPE ty_po_schedules,
      po_history        TYPE ty_po_history,
      po_history_totals TYPE ty_po_totals,
      rel_info          TYPE bapirlgnpo,
      rel_prereq        TYPE bapirlcopo,
      rel_posted        TYPE bapirlcopo,
      rel_final         TYPE ty_rel_codes,
      rel_status_new    TYPE string,
      changes           TYPE ty_changes,
      mat_doc           TYPE mblnr,
      mat_doc_year      TYPE mjahr,
      messages          TYPE ty_messages,
      cbo_fields        TYPE ty_cbo_fields,
      suppressed        TYPE ty_messages,
      pp_orders         TYPE ty_pp_orders,
      pp_header         TYPE bapi_order_header1,
      pp_operations     TYPE ty_pp_operations,
      pp_components     TYPE ty_pp_components,
      pp_status         TYPE string,
      pp_status_new     TYPE string,
      conf_no           TYPE afru-rueck,
      conf_cnt          TYPE afru-rmzhl,
      sd_docs           TYPE ty_sd_docs,
      sd_header         TYPE ty_sd_doc,
      sd_items          TYPE ty_sd_items,
      sd_sched          TYPE ty_sd_scheds,
      sd_flow           TYPE ty_sd_flows,
      sd_new_docs       TYPE string_table,
      sd_status_new     TYPE string,
      precheck_facts    TYPE ty_pc_facts,
      precheck_answers  TYPE ty_pc_answers,
      " FI / CO
      fi_header         TYPE ty_fi_head,
      fi_lines          TYPE ty_fi_lines,
      fi_open_items     TYPE ty_fi_opens,
      gl_detail         TYPE bapi3006_2,
      doc_bukrs         TYPE bkpf-bukrs,
      doc_belnr         TYPE bkpf-belnr,
      doc_gjahr         TYPE bkpf-gjahr,
      co_doc_no         TYPE string,
      co_order          TYPE ty_co_order,
      co_orders         TYPE ty_co_orders,
      co_allowed        TYPE string_table,
      co_status_new     TYPE string,
      co_cc             TYPE ty_co_cc,
      co_amounts        TYPE ty_co_amounts,
      co_settle         TYPE ty_co_settles,
      rows              TYPE ty_kvs,
    END OF ty_result.

  METHODS get_actions
    RETURNING
      VALUE(rt_actions) TYPE ty_action_defs.

  METHODS query
    IMPORTING
      iv_action        TYPE string
      is_params        TYPE ty_params
    RETURNING
      VALUE(rs_result) TYPE ty_result.

  METHODS preview
    IMPORTING
      iv_action        TYPE string
      is_params        TYPE ty_params
    RETURNING
      VALUE(rs_result) TYPE ty_result.

  METHODS execute
    IMPORTING
      iv_action        TYPE string
      is_params        TYPE ty_params
    RETURNING
      VALUE(rs_result) TYPE ty_result.

ENDINTERFACE.
