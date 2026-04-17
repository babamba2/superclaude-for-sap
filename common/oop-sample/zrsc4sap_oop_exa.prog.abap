*&---------------------------------------------------------------------*
*&  Include           Y_DEV2401_04A
*&---------------------------------------------------------------------*

CLASS LCL_ALV DEFINITION DEFERRED.
DATA GO_ALV TYPE REF TO LCL_ALV.

CLASS LCL_ALV DEFINITION INHERITING FROM ZCL_S4SAP_CM_ALV.

    PUBLIC SECTION.
    METHODS :
      CONSTRUCTOR,
      DISPLAY
        IMPORTING IT_DATA TYPE ANY TABLE OPTIONAL,
      SET_ALV_0100,
      SET_ALV_0200,
      SET_TREE_0200
        RAISING ZCX_S4SAP_EXCP,
      SET_NODE_0200,
      SET_GRID_0200
        RAISING ZCX_S4SAP_EXCP,
      EVENT_HOTSPOT
        IMPORTING I_ROW_ID    TYPE LVC_S_ROW
                  I_COLUMN_ID TYPE LVC_S_COL
                  IS_ROW_NO   TYPE  LVC_S_ROID
                  SENDER      TYPE REF TO ZCL_S4SAP_CM_OALV OPTIONAL,
     EVENT_HOTSPOT_TREE
        IMPORTING FIELDNAME TYPE LVC_FNAME
                  NODE_KEY  TYPE LVC_NKEY
                  SENDER      TYPE REF TO ZCL_S4SAP_CM_OTREE OPTIONAL,
      EVENT_CHANGED
        IMPORTING
          IR_DATA_CHANGED TYPE REF TO	CL_ALV_CHANGED_DATA_PROTOCOL
          I_ONF4          TYPE  CHAR01
          I_ONF4_BEFORE   TYPE  CHAR01
          I_ONF4_AFTER    TYPE  CHAR01
          I_UCOMM         TYPE  SY-UCOMM
          SENDER          TYPE REF TO ZCL_S4SAP_CM_OALV,
      EVENT_CHANGED_MENGE
        IMPORTING
          IR_DATA_CHANGED TYPE REF TO CL_ALV_CHANGED_DATA_PROTOCOL
          IS_MOD_CELLS    TYPE LVC_S_MODI,
      EVENT_NODE_DOUBLE_CLICK
        IMPORTING NODE_KEY TYPE LVC_NKEY.
    PRIVATE SECTION.
      DATA : MT_NKEY TYPE TABLE OF ty_node.

ENDCLASS.

CLASS LCL_ALV IMPLEMENTATION.

  METHOD constructor.

    FIELD-SYMBOLS <FS_EVENTLIST> TYPE ZCL_S4SAP_CM_ALV_EVENT=>TY_EVENTLIST.

    SUPER->CONSTRUCTOR( ).

    "Event 등록
    ME->MO_ALV_EVENT = NEW #( IV_LOCAL_CLASS_DEFINITION = 'LCL_EVENT_ALV' ).
    IF ME->MO_ALV_EVENT IS NOT INITIAL.

      LOOP AT ME->MO_ALV_EVENT->MT_EVENTLIST ASSIGNING <FS_EVENTLIST>.
        IF <FS_EVENTLIST>-EVENT = C_HANDLE_HOTSPOT_CLICK.
          <FS_EVENTLIST>-METHOD = <FS_EVENTLIST>-EVENT.
        ENDIF.

        IF <FS_EVENTLIST>-EVENT = C_HANDLE_DATA_CHANGED.
          <FS_EVENTLIST>-METHOD = <FS_EVENTLIST>-EVENT.
        ENDIF.

      ENDLOOP.
    ENDIF.

    ME->MO_TREE_EVENT = NEW #( IV_LOCAL_CLASS_DEFINITION = 'LCL_EVENT_TREE' ).
    IF ME->MO_TREE_EVENT IS NOT INITIAL.

      LOOP AT ME->MO_TREE_EVENT->MT_EVENTLIST ASSIGNING <FS_EVENTLIST>.

        IF <FS_EVENTLIST>-EVENT = C_HANDLE_LINK_CLICK.
          <FS_EVENTLIST>-METHOD = <FS_EVENTLIST>-EVENT.
        ENDIF.

        IF <FS_EVENTLIST>-EVENT = C_HANDLE_NODE_DOUBLE_CLICK.
          <FS_EVENTLIST>-METHOD = <FS_EVENTLIST>-EVENT.
        ENDIF.

      ENDLOOP.
    ENDIF.




  ENDMETHOD.


  METHOD DISPLAY.

    CASE 'X'.
      WHEN P_01.
        ME->MV_DYNNR = '0100'.
      WHEN P_02.
        ME->MV_DYNNR = '0200'.
*      WHEN P_03.
*        ME->MV_DYNNR = '0300'.
    ENDCASE.
    CALL SCREEN ME->MV_DYNNR.

  ENDMETHOD.

  METHOD SET_ALV_0100.

    TRY.
        DATA(GO_DOCK) = ME->CREATE_DOCK_CONTAINER( ).
        ME->CREATE_ALV_GRID( IO_PARENT_DOCK = GO_DOCK ).
        ME->SET_LAYOUT( VALUE #( STYLEFNAME = 'CELLSTYL' CTAB_FNAME = 'CELLSCOL' SEL_MODE = 'A'  ) ).
        DATA(LT_FCAT) = ME->GET_FIELDCAT( IT_DATA = GO_DATA->MT_DATA ).

        LOOP AT LT_FCAT ASSIGNING FIELD-SYMBOL(<FS_FCAT>).

          IF <FS_FCAT>-FIELDNAME = 'EBELN' .
            <FS_FCAT>-HOTSPOT = 'X'.
          ELSEIF <FS_FCAT>-FIELDNAME = 'MENGE'.
            <FS_FCAT>-EDIT = 'X'.
            <FS_FCAT>-QFIELDNAME = 'MEINS'.
          ENDIF.

        ENDLOOP.


        ME->SET_FIELDCAT( IT_FCAT = LT_FCAT ).
        ME->SET_REGISTER_EVENT( IV_MODIFIED = 'X' IV_ENTER = 'X' ).
        ME->SET_EVENT_HANDLER( IO_EVENT = ME->MO_ALV_EVENT ).
        ME->DISPLAY_ALV( CHANGING IT_DATA = GO_DATA->MT_DATA ).

      CATCH ZCX_S4SAP_EXCP INTO DATA(LO_ERROR).
        MESSAGE LO_ERROR->GET_TEXT( ) TYPE 'I' DISPLAY LIKE 'E'.
    ENDTRY.

  ENDMETHOD.

  METHOD SET_ALV_0200.
    TRY.
        ME->CREATE_SPLIT_CONTAINER( IV_ROWS = 1 IV_COLUMNS = 2 ).
        ME->SET_CONTAINER_WIDTH( IV_WIDTH = 15 ).

        SET_TREE_0200( ).
        SET_GRID_0200( ).


      CATCH ZCX_S4SAP_EXCP INTO DATA(LO_ERROR).
        MESSAGE LO_ERROR->GET_TEXT( ) TYPE 'I' DISPLAY LIKE 'E'.
        LEAVE LIST-PROCESSING.
    ENDTRY.


  ENDMETHOD.

  METHOD SET_TREE_0200.
    ME->CREATE_ALV_TREE( IV_COLUMN = 1
                         IV_ITEM_SELECTION = 'X' ).

    ME->SET_TREE_HEADER( IS_HIERARCHY_HEADER = VALUE #( HEADING = 'PO'
                                                        TOOLTIP = 'PO'
                                                        WIDTH   = 30
                                                        WIDTH_PIX = 'X')
                         IT_LIST_COMMENTARY  = VALUE #(
                                               ( TYP = 'H' INFO = 'Header' )
                                               ( TYP = 'S' INFO = 'Selection' )
                                               ( TYP = 'A' INFO = 'Action' )
                                                      )
                        ).
    ME->SET_TREE_FIELDCAT( IT_FCAT = VALUE #(
                                     ( FIELDNAME = 'EBELN'
                                       COLTEXT   = 'Purchase Order'
*                                       HOTSPOT   = 'X'
                                       DOMNAME   = 'EBELN' )
                                     ( FIELDNAME = 'BSART'
                                       COLTEXT   = 'Order Type'
*                                       HOTSPOT   = 'X'
                                       DOMNAME   = 'BSART' )
                                            )
                          ).

    ME->DISPLAY_TREE( CHANGING IT_DATA = GO_DATA->MT_HEADER ).
    SET_NODE_0200( ).
    ME->SET_TREE_EVENT_HANDLER( IO_EVENT = ME->MO_TREE_EVENT ).

    ME->REFRESH_TREE( IV_COLUMNOPTIMIZATION = SPACE ).

  ENDMETHOD.
  METHOD SET_NODE_0200.

    LOOP AT GO_DATA->MT_DATA ASSIGNING FIELD-SYMBOL(<MS_DATA>)
                    GROUP BY ( EBELN = <MS_DATA>-EBELN
                               BSART = <MS_DATA>-BSART )
                    ASSIGNING FIELD-SYMBOL(<FS_GROUP>).

      DATA(LV_KEY) =
      ME->SET_TREE_ADD_NODE( IV_RELAT_NODE_KEY = SPACE
                             IV_NODE_TEXT      = CONV #( <FS_GROUP>-EBELN )
                             IS_OUTTAB_LINE    = VALUE TY_HEADER(
                                                       EBELN = <FS_GROUP>-EBELN
                                                       BSART = <FS_GROUP>-BSART )
                             IT_ITEM_LAYOUT    = VALUE #( ( FIELDNAME = CL_GUI_ALV_TREE=>C_HIERARCHY_COLUMN_NAME
                                                            CLASS     = CL_GUI_COLUMN_TREE=>ITEM_CLASS_LINK ) )
                           ).
      APPEND VALUE #( EBELN = <FS_GROUP>-EBELN
                      NODE_KEY = LV_KEY
                      ) TO MT_NKEY.

      LOOP AT GROUP <FS_GROUP> ASSIGNING FIELD-SYMBOL(<FS_ITEM>).

        LV_KEY =
        ME->SET_TREE_ADD_NODE( IV_RELAT_NODE_KEY = LV_KEY
                               IV_NODE_TEXT      = CONV #( <FS_ITEM>-EBELP )
                               IS_OUTTAB_LINE    = VALUE TY_HEADER(
                                                         EBELN = <FS_GROUP>-EBELN
                                                         EBELP = <FS_ITEM>-EBELP
                                                         BSART = <FS_ITEM>-BSART )
                               IT_ITEM_LAYOUT    = VALUE #( ( FIELDNAME = 'EBELN'
                                                              CLASS     = CL_GUI_COLUMN_TREE=>ITEM_CLASS_LINK ) )
                             ).

      APPEND VALUE #( EBELN = <FS_GROUP>-EBELN
                      NODE_KEY = LV_KEY
                      ) TO MT_NKEY.

      ENDLOOP.


    ENDLOOP.

  ENDMETHOD.
  METHOD SET_GRID_0200.
    ME->CREATE_ALV_GRID( IV_COLUMN = 2 ).
    ME->SET_LAYOUT( VALUE #( STYLEFNAME = 'CELLSTYL' CTAB_FNAME = 'CELLSCOL' SEL_MODE = 'A'  ) ).
    DATA(LT_FCAT) = ME->GET_FIELDCAT( IT_DATA = GO_DATA->MT_DATA ).

    LOOP AT LT_FCAT ASSIGNING FIELD-SYMBOL(<FS_FCAT>).

      IF <FS_FCAT>-FIELDNAME = 'EBELN' .
        <FS_FCAT>-HOTSPOT = 'X'.
      ELSEIF <FS_FCAT>-FIELDNAME = 'MENGE'.
        <FS_FCAT>-EDIT = 'X'.
        <FS_FCAT>-QFIELDNAME = 'MEINS'.
      ENDIF.

    ENDLOOP.

    ME->SET_FIELDCAT( IT_FCAT = LT_FCAT ).
    ME->SET_REGISTER_EVENT( IV_MODIFIED = 'X' IV_ENTER = 'X' ).
    ME->SET_EVENT_HANDLER( IO_EVENT = ME->MO_ALV_EVENT ).
    ME->DISPLAY_ALV( CHANGING IT_DATA = GO_DATA->MT_DATA ).


  ENDMETHOD.


  METHOD EVENT_HOTSPOT.

    CHECK SENDER IS BOUND.

    CASE SENDER->MV_DYNNR.
      WHEN '0100' OR '0200'.
        READ TABLE GO_DATA->MT_DATA INDEX IS_ROW_NO-ROW_ID ASSIGNING FIELD-SYMBOL(<FS_DATA>).

        CHECK <FS_DATA> IS NOT INITIAL.

        CASE I_COLUMN_ID.
          WHEN 'EBELN'.

            SET PARAMETER ID 'BES' FIELD <FS_DATA>-EBELN.
            CALL TRANSACTION 'ME23N' AND SKIP FIRST SCREEN.
        ENDCASE.
      WHEN OTHERS.
    ENDCASE.


  ENDMETHOD.
  METHOD EVENT_HOTSPOT_TREE.

    CASE SENDER->MV_DYNNR.
      WHEN '0100' OR '0200'.
        READ TABLE MT_NKEY WITH KEY NODE_KEY = NODE_KEY ASSIGNING FIELD-SYMBOL(<FS_DATA>).

        CHECK <FS_DATA> IS NOT INITIAL.

        CASE FIELDNAME.
          WHEN 'EBELN' OR CL_GUI_ALV_TREE=>C_HIERARCHY_COLUMN_NAME.

            SET PARAMETER ID 'BES' FIELD <FS_DATA>-EBELN.
            CALL TRANSACTION 'ME23N' AND SKIP FIRST SCREEN.
        ENDCASE.
      WHEN OTHERS.
    ENDCASE.


  ENDMETHOD.
  METHOD EVENT_CHANGED.

    IF SENDER = VALUE #( ME->MT_OALV[ DYNNR = '0100' ]-GRID OPTIONAL ).

      LOOP AT IR_DATA_CHANGED->MT_GOOD_CELLS ASSIGNING FIELD-SYMBOL(<FS_GCELL>).
        CASE <FS_GCELL>-FIELDNAME.
          WHEN 'MENGE'.
            EVENT_CHANGED_MENGE( IR_DATA_CHANGED = IR_DATA_CHANGED
                                 IS_MOD_CELLS = <FS_GCELL> ).
        ENDCASE.
      ENDLOOP.
    ELSEIF SENDER = VALUE #( ME->MT_OALV[ DYNNR = '0200' ]-GRID OPTIONAL ).

    ENDIF.
  ENDMETHOD.
  METHOD EVENT_CHANGED_MENGE.

    READ TABLE GO_DATA->MT_DATA INDEX IS_MOD_CELLS-ROW_ID ASSIGNING FIELD-SYMBOL(<FS_DATA>).

    CHECK SY-SUBRC = 0.

    IF CONV MENGE_D( IS_MOD_CELLS-VALUE ) IS INITIAL.

      CALL METHOD IR_DATA_CHANGED->ADD_PROTOCOL_ENTRY
        EXPORTING
          I_MSGID     = 'S_UNIFIED_CON'
          I_MSGTY     = 'E'
          I_MSGNO     = '000'
          I_MSGV1     = 'Not allowed 0 !'
          I_FIELDNAME = 'MENGE'
          I_ROW_ID    = IS_MOD_CELLS-ROW_ID.

    ELSE.
*      CALL METHOD IR_DATA_CHANGED->MODIFY_CELL
*        EXPORTING
*          I_ROW_ID    = IS_MOD_CELLS-ROW_ID
*          I_FIELDNAME = 'MENGE'
*          I_VALUE     = <FS_DATA>-MENGE.
    ENDIF.


  ENDMETHOD.
  METHOD EVENT_NODE_DOUBLE_CLICK.

    READ TABLE MT_NKEY WITH KEY NODE_KEY = NODE_KEY ASSIGNING FIELD-SYMBOL(<FS_DATA>).

    CHECK <FS_DATA> IS NOT INITIAL.

    DATA(lt_data) = VALUE TT_LIST( FOR LS IN GO_DATA->MT_DATA
                                   WHERE ( EBELN = <FS_DATA>-EBELN )
                                   ( CORRESPONDING #( LS ) ) ).

  ENDMETHOD.

ENDCLASS.
