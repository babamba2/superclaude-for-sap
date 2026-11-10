INTERFACE zif_mcp_biz_sys PUBLIC.
* System-family dependent reads of the business-action handlers.
* ECC: ZCL_MCP_BIZ_SYS_ECC (installed on every system).
* S/4HANA: ZCL_MCP_BIZ_SYS_S4 (abap/biz/s4/, installed on S/4HANA only) - may use
* S/4-only objects statically (ACDOCA, PRCD_ELEMENTS, UKM_*, ...).
* Get the instance with ZCL_MCP_BIZ_SYS=>get( ). Types here use objects that exist on
* both families. Written in 7.31 syntax.

  CONSTANTS:
    c_family_ecc TYPE string VALUE `ECC`,
    c_family_s4  TYPE string VALUE `S4`.

  " Credit status of a customer. ECC: KNKK + S066 / S067 (credit control area).
  " S/4: FSCM Credit Management (business partner, credit segment). Amounts in waers.
  TYPES:
    BEGIN OF ty_credit,
      kkber    TYPE t001-kkber,
      segment  TYPE c LENGTH 10,
      knkli    TYPE knkk-knkli,
      klimk    TYPE knkk-klimk,
      skfor    TYPE knkk-skfor,
      ssobl    TYPE knkk-ssobl,
      oeikw    TYPE knkk-klimk,
      olikw    TYPE knkk-klimk,
      ofakw    TYPE knkk-klimk,
      exposure TYPE knkk-klimk,
      waers    TYPE t014-waers,
      ctlpc    TYPE knkk-ctlpc,
      crblb    TYPE knkk-crblb,
      source   TYPE c LENGTH 4,
    END OF ty_credit.

  METHODS family
    RETURNING VALUE(rv_family) TYPE string.

  " ---- SD document status (ECC: VBUK / VBUP; S/4: status fields in VBAK / VBAP / LIKP / LIPS / VBRK)

  "! FROM clause: base table (VBAK / LIKP = header, VBAP / LIPS = item) as iv_alias joined to its status as alias u
  METHODS sd_status_from
    IMPORTING iv_base        TYPE string
              iv_alias       TYPE string
    RETURNING VALUE(rv_from) TYPE string.

  "! Column list; u~ status columns are named as in VBUK / VBUP and mapped where the family differs
  METHODS sd_status_cols
    IMPORTING iv_base        TYPE string
              iv_cols        TYPE string
    RETURNING VALUE(rv_cols) TYPE string.

  "! Header status as VBUK. iv_table = VBAK / LIKP / VBRK when known; empty = find the document
  METHODS sd_read_vbuk
    IMPORTING iv_vbeln TYPE vbuk-vbeln
              iv_table TYPE string OPTIONAL
    EXPORTING es_vbuk  TYPE vbuk
              ev_found TYPE abap_bool.

  "! Item status as VBUP. iv_table = VBAP / LIPS when known; empty = find the document
  METHODS sd_read_vbup
    IMPORTING iv_vbeln TYPE vbup-vbeln
              iv_posnr TYPE vbup-posnr
              iv_table TYPE string OPTIONAL
    EXPORTING es_vbup  TYPE vbup
              ev_found TYPE abap_bool.

  "! Delivery-related billing status of an order item (S/4: the order item carries none):
  "! C = delivered completely and every delivery item billed completely, B = billed partly,
  "! space = not billed. Both families read the delivery items (flow J): the order item
  "! never carries the delivery-related billing status (ECC VBUP-FKSTA, S/4 LIPS-FKSTA).
  METHODS sd_item_dlv_billing
    IMPORTING iv_vbeln        TYPE vbap-vbeln
              iv_posnr        TYPE vbap-posnr
              iv_lfsta        TYPE vbup-lfsta
    RETURNING VALUE(rv_fksta) TYPE vbup-fksta.

  "! Same for the order header, from all its items not rejected.
  METHODS sd_order_dlv_billing
    IMPORTING iv_vbeln        TYPE vbak-vbeln
    RETURNING VALUE(rv_fkstk) TYPE vbuk-fkstk.

  " ---- Credit management

  "! Credit data of a customer in the credit control area. Checks display authorization
  "! itself (ECC F_KNKA_KKB, S/4 F_UKM_SGMT). ev_text explains a not-found or refused read.
  METHODS credit_read
    IMPORTING iv_kunnr  TYPE knkk-kunnr
              iv_kkber  TYPE t001-kkber
    EXPORTING es_credit TYPE ty_credit
              ev_found  TYPE abap_bool
              ev_denied TYPE abap_bool
              ev_text   TYPE string.

  " ---- FI / CO ledger reads (ECC: BSIS / BSAS / BSEG / COSP / COSS; S/4: ACDOCA, leading ledger)

  TYPES:
    BEGIN OF ty_co_tot,
      kstar TYPE cosp-kstar,
      plan  TYPE p LENGTH 15 DECIMALS 2,
      act   TYPE p LENGTH 15 DECIMALS 2,
    END OF ty_co_tot,
    ty_co_tots TYPE STANDARD TABLE OF ty_co_tot WITH DEFAULT KEY.

  "! G/L account line items open at iv_date (posted up to it, not cleared or cleared after it).
  "! Amounts unsigned with shkzg, as in BSIS. At most iv_fetch rows of each kind.
  METHODS fi_gl_open_items
    IMPORTING iv_bukrs TYPE bkpf-bukrs
              iv_hkont TYPE bseg-hkont
              iv_date  TYPE sy-datum
              iv_fetch TYPE i
    EXPORTING et_open  TYPE zif_mcp_biz_action=>ty_fi_opens.

  "! Line item text as the ledger holds it (ECC BSEG; S/4 ACDOCA leading ledger) - read back after a change.
  METHODS fi_ledger_text
    IMPORTING iv_bukrs       TYPE bkpf-bukrs
              iv_belnr       TYPE bkpf-belnr
              iv_gjahr       TYPE bkpf-gjahr
              iv_buzei       TYPE bseg-buzei
    RETURNING VALUE(rv_text) TYPE bseg-sgtxt.

  "! Cost element totals of a CO object, periods iv_from..iv_to, CO area currency:
  "! actual (value type 04, version 000) and plan (value type 01, version iv_versn).
  "! S/4: actual from ACDOCA; plan from COSP / COSS (classic plan data).
  METHODS co_totals
    IMPORTING iv_kokrs TYPE tka01-kokrs
              iv_objnr TYPE cosp-objnr
              iv_gjahr TYPE cosp-gjahr
              iv_from  TYPE i
              iv_to    TYPE i
              iv_versn TYPE cosp-versn
    EXPORTING et_tot   TYPE ty_co_tots.

  " ---- Output (S/4 Output Control; ECC has none - NAST is read by the handler on both families)

  TYPES:
    BEGIN OF ty_output,
      output_type TYPE string,
      channel     TYPE string,
      status      TYPE string,
      form        TYPE string,
      changed     TYPE string,
    END OF ty_output,
    ty_outputs TYPE STANDARD TABLE OF ty_output WITH DEFAULT KEY.

  "! S/4 Output Control requests of an application object (e.g. PURCHASE_ORDER + PO number).
  "! ev_active = Output Control is active for the object type. ECC: never active, no rows.
  METHODS output_requests
    IMPORTING iv_object_type TYPE string
              iv_object_id   TYPE string
    EXPORTING et_out         TYPE ty_outputs
              ev_active      TYPE abap_bool.

ENDINTERFACE.
