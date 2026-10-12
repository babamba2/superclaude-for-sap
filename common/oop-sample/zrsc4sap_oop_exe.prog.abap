*&---------------------------------------------------------------------*
*& Include          ZRSC4SAP_OOP_EXE
*&---------------------------------------------------------------------*
"alvFramework = s4sap-cm: grid / tree events of ZCL_S4SAP_CM_OALV / _OTREE,
"registered by name from the LCL_ALV constructor (E follows C).
"none: FOR EVENT ... OF CL_GUI_ALV_GRID; LCL_ALV creates the receiver with
"CREATE OBJECT mo_event TYPE ('LCL_EVENT_ALV') - see common/oop-pattern.md.



CLASS LCL_EVENT_ALV      DEFINITION DEFERRED.
CLASS LCL_EVENT_TREE     DEFINITION DEFERRED.

*---------------------------------------------------------------------*
*       CLASS LCL_EVENT_RECEIVER DEFINITION
*---------------------------------------------------------------------*


CLASS LCL_EVENT_ALV DEFINITION.

  PUBLIC SECTION.
    CLASS-METHODS:
      HANDLE_TOOLBAR FOR EVENT TOOLBAR OF ZCL_S4SAP_CM_OALV
        IMPORTING E_OBJECT E_INTERACTIVE SENDER,

      HANDLE_USER_COMMAND FOR EVENT USER_COMMAND OF ZCL_S4SAP_CM_OALV
        IMPORTING E_UCOMM SENDER,

      HANDLE_DATA_CHANGED FOR EVENT DATA_CHANGED OF ZCL_S4SAP_CM_OALV
        IMPORTING ER_DATA_CHANGED
                  E_ONF4 E_ONF4_BEFORE E_ONF4_AFTER E_UCOMM SENDER,

      HANDLE_DATA_CHANGED_FINISHED FOR EVENT DATA_CHANGED_FINISHED
                  OF ZCL_S4SAP_CM_OALV
        IMPORTING E_MODIFIED ET_GOOD_CELLS SENDER,

      HANDLE_HOTSPOT_CLICK FOR EVENT HOTSPOT_CLICK OF ZCL_S4SAP_CM_OALV
        IMPORTING E_ROW_ID E_COLUMN_ID ES_ROW_NO SENDER,

      HANDLE_DOUBLE_CLICK FOR EVENT DOUBLE_CLICK OF ZCL_S4SAP_CM_OALV
        IMPORTING E_ROW E_COLUMN ES_ROW_NO SENDER,

      HANDLE_ON_F4 FOR EVENT ONF4 OF CL_GUI_ALV_GRID
        IMPORTING E_FIELDNAME
                  E_FIELDVALUE
                  ES_ROW_NO
                  ER_EVENT_DATA
                  ET_BAD_CELLS
                  E_DISPLAY
                  SENDER,

      HANDLE_TOP_OF_PAGE FOR EVENT TOP_OF_PAGE OF CL_GUI_ALV_GRID
        IMPORTING E_DYNDOC_ID
                  SENDER.

  PRIVATE SECTION.

ENDCLASS. "LCL_EVENT_RECEIVER DEFINITION


*---------------------------------------------------------------------*
* LOCAL CLASSES: IMPLEMENTATION                                       *
*---------------------------------------------------------------------*


CLASS LCL_EVENT_ALV IMPLEMENTATION.
  METHOD HANDLE_TOOLBAR       . "Create Icon

*    PERFORM handle_toolbar USING e_object
*                                e_interactive
*                                sender.
  ENDMETHOD.                    "HANDLE_TOOLBAR

  METHOD HANDLE_USER_COMMAND  .



*    PERFORM handle_user_command USING e_ucomm
*                                     sender.
  ENDMETHOD.                    "HANDLE_USER_COMMAND

  METHOD HANDLE_DATA_CHANGED.

    GO_ALV->EVENT_CHANGED( IR_DATA_CHANGED = ER_DATA_CHANGED
                            I_ONF4 = E_ONF4
                            I_ONF4_BEFORE = E_ONF4_BEFORE
                            I_ONF4_AFTER = E_ONF4_AFTER
                            I_UCOMM = E_UCOMM
                            SENDER = SENDER ).
*    PERFORM EVENT_DATA_CHANGED USING ER_DATA_CHANGED
*                                     E_ONF4
*                                     E_ONF4_BEFORE
*                                     E_ONF4_AFTER
*                                     E_UCOMM
*                                     SENDER.
  ENDMETHOD.                    "HANDLE_DATA_CHANGED

  METHOD HANDLE_DATA_CHANGED_FINISHED.
*    PERFORM EVENT_DATA_CHANGED_FINISHED USING E_MODIFIED
*                                             ET_GOOD_CELLS
*                                             SENDER.
  ENDMETHOD.                    "HANDLE_DATA_CHANGED_FINISHED

  METHOD HANDLE_HOTSPOT_CLICK.

    GO_ALV->EVENT_HOTSPOT( I_ROW_ID = E_ROW_ID
                            I_COLUMN_ID = E_COLUMN_ID
                            IS_ROW_NO = ES_ROW_NO
                            SENDER = SENDER
                    ).

  ENDMETHOD.                    "HANDLE_HOTSPOT_CLICK

  METHOD HANDLE_DOUBLE_CLICK.
*    PERFORM EVENT_DOUBLE_CLICK USING E_ROW
*                                     E_COLUMN
*                                     ES_ROW_NO
*                                     SENDER.

  ENDMETHOD.                    "HANDLE_DOUBLE_CLICK

  METHOD HANDLE_ON_F4.
*    PERFORM EVENT_HELP_ON_F4 USING E_FIELDNAME
*                                   E_FIELDVALUE
*                                   ES_ROW_NO
*                                   ER_EVENT_DATA
*                                   ET_BAD_CELLS
*                                   E_DISPLAY
*                                   SENDER.
  ENDMETHOD.                    "HANDLE_ON_F4

  METHOD HANDLE_TOP_OF_PAGE.
*    PERFORM handle_top_of_page USING e_dyndoc_id
*                                     sender.
  ENDMETHOD.

ENDCLASS. "LCL_EVENT_RECEIVER IMPLEMENTATION


*--------------------------------------------------------------------*
"SALV
*--------------------------------------------------------------------*

CLASS LCL_SALV_EVENT_HANDLER DEFINITION.

  PUBLIC SECTION.

    CLASS-METHODS ON_BEFORE_SALV_FUNCTION         " BEFORE_SALV_FUNCTION
      FOR EVENT IF_SALV_EVENTS_FUNCTIONS~BEFORE_SALV_FUNCTION
                OF CL_SALV_EVENTS_TABLE
      IMPORTING E_SALV_FUNCTION.

    CLASS-METHODS ON_AFTER_SALV_FUNCTION          " AFTER_SALV_FUNCTION
      FOR EVENT IF_SALV_EVENTS_FUNCTIONS~BEFORE_SALV_FUNCTION
                OF CL_SALV_EVENTS_TABLE
      IMPORTING E_SALV_FUNCTION.

    CLASS-METHODS ON_ADDED_FUNCTION               " ADDED_FUNCTION
      FOR EVENT IF_SALV_EVENTS_FUNCTIONS~ADDED_FUNCTION
                OF CL_SALV_EVENTS_TABLE
      IMPORTING E_SALV_FUNCTION.

    CLASS-METHODS ON_TOP_OF_PAGE                  " TOP_OF_PAGE
      FOR EVENT IF_SALV_EVENTS_LIST~TOP_OF_PAGE
                OF CL_SALV_EVENTS_TABLE
      IMPORTING R_TOP_OF_PAGE
                PAGE
                TABLE_INDEX.

    CLASS-METHODS ON_END_OF_PAGE                  " END_OF_PAGE
      FOR EVENT IF_SALV_EVENTS_LIST~END_OF_PAGE
                OF CL_SALV_EVENTS_TABLE
      IMPORTING R_END_OF_PAGE
                PAGE.

    CLASS-METHODS ON_DOUBLE_CLICK                 " DOUBLE_CLICK
      FOR EVENT IF_SALV_EVENTS_ACTIONS_TABLE~DOUBLE_CLICK
                OF CL_SALV_EVENTS_TABLE
      IMPORTING ROW
                COLUMN.

    CLASS-METHODS ON_LINK_CLICK                   " LINK_CLICK
      FOR EVENT IF_SALV_EVENTS_ACTIONS_TABLE~LINK_CLICK
                OF CL_SALV_EVENTS_TABLE
      IMPORTING ROW
                COLUMN.
ENDCLASS.                    "cl_event_handler DEFINITION

CLASS LCL_SALV_EVENT_HANDLER IMPLEMENTATION.

  METHOD ON_BEFORE_SALV_FUNCTION.

  ENDMETHOD.                    "on_before_salv_function

  METHOD ON_AFTER_SALV_FUNCTION.

  ENDMETHOD.                    "on_after_salv_function

  METHOD ON_ADDED_FUNCTION.
*    IF e_salv_function = 'REFRESH'.  "&TEST IS THE BUTTON FUNCTION CODE
*      PERFORM salv_refresh.
*    ENDIF.
  ENDMETHOD.                    "on_added_function

  METHOD ON_TOP_OF_PAGE.

  ENDMETHOD.                    "on_top_of_page

  METHOD ON_END_OF_PAGE.

  ENDMETHOD.                    "on_end_of_page

  METHOD ON_DOUBLE_CLICK.

  ENDMETHOD.                    "on_double_click

  METHOD ON_LINK_CLICK.
*    PERFORM salv_hotspot USING row column.
  ENDMETHOD.                    "on_link_click
ENDCLASS.                    "cl_event_handler IMPLEMENTATION


*--------------------------------------------------------------------*
" TREE
*--------------------------------------------------------------------*
CLASS LCL_EVENT_TREE DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS:
      HANDLE_SELECTION_CHANGED FOR EVENT SELECTION_CHANGED
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING NODE_KEY,
      HANDLE_NODE_DOUBLE_CLICK FOR EVENT NODE_DOUBLE_CLICK
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING NODE_KEY,
      HANDLE_ITEM_DOUBLE_CLICK FOR EVENT ITEM_DOUBLE_CLICK
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING FIELDNAME  NODE_KEY,
      HANDLE_CHECKBOX_CHANGE   FOR EVENT CHECKBOX_CHANGE
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING CHECKED  FIELDNAME NODE_KEY,
      HANDLE_FUNCTION_SELECTED FOR EVENT FUNCTION_SELECTED
                  OF  CL_GUI_TOOLBAR
        IMPORTING FCODE,
      HANDLE_NODE_CM_REQ       FOR EVENT NODE_CONTEXT_MENU_REQUEST
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING NODE_KEY MENU SENDER,
      HANDLE_NODE_CM_SEL       FOR EVENT NODE_CONTEXT_MENU_SELECTED
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING NODE_KEY FCODE SENDER,
      HANDLE_RIGHT_CLICK       FOR EVENT RIGHT_CLICK
        OF  CL_GUI_CONTROL,
      HANDLE_ITEM_CM_REQ       FOR EVENT ITEM_CONTEXT_MENU_REQUEST
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING FIELDNAME NODE_KEY MENU SENDER,
      HANDLE_ITEM_CM_SEL       FOR EVENT ITEM_CONTEXT_MENU_SELECTED
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING FIELDNAME NODE_KEY FCODE SENDER,

      HANDLE_LINK_CLICK       FOR EVENT LINK_CLICK
                  OF ZCL_S4SAP_CM_OTREE
        IMPORTING FIELDNAME NODE_KEY SENDER.
ENDCLASS.                    "LCL_APPLICATION_TREE DEFINITION
*----------------------------------------------------------------------*
*       CLASS LCL_APPLICATION_TREE IMPLEMENTATION
*----------------------------------------------------------------------*
*
*----------------------------------------------------------------------*
CLASS LCL_EVENT_TREE IMPLEMENTATION.
  METHOD HANDLE_FUNCTION_SELECTED.
  ENDMETHOD.                    "HANDLE_FUNCTION_SELECTED
  METHOD HANDLE_CHECKBOX_CHANGE.
  ENDMETHOD.                    "HANDLE_CHECKBOX_CHANGE
  METHOD   HANDLE_SELECTION_CHANGED.
*    PERFORM handle_dbl_click USING node_key.
  ENDMETHOD.                    "HANDLE_SELECTION_CHANGED
  METHOD  HANDLE_NODE_DOUBLE_CLICK.
    GO_ALV->EVENT_NODE_DOUBLE_CLICK( NODE_KEY = NODE_KEY ).
*    PERFORM handle_dbl_click USING node_key.
  ENDMETHOD.                    "HANDLE_NODE_DOUBLE_CLICK
  METHOD  HANDLE_ITEM_DOUBLE_CLICK.
*    PERFORM handle_dbl_click USING node_key.
  ENDMETHOD.                    "HANDLE_ITEM_DOUBLE_CLICK
  METHOD  HANDLE_RIGHT_CLICK.
*    PERFORM handle_right_click_bar.
  ENDMETHOD.
  METHOD  HANDLE_NODE_CM_REQ.

*    PERFORM set_context_menu USING node_key menu sender.

  ENDMETHOD.
  METHOD HANDLE_NODE_CM_SEL.

*    PERFORM run_context_menu USING fcode node_key sender.
*
  ENDMETHOD.
  METHOD HANDLE_ITEM_CM_REQ.
*    PERFORM set_context_menu USING node_key menu sender.
  ENDMETHOD.
  METHOD HANDLE_ITEM_CM_SEL.
*    PERFORM run_context_menu USING node_key fcode sender.
  ENDMETHOD.
  METHOD HANDLE_LINK_CLICK.
    GO_ALV->EVENT_HOTSPOT_TREE( FIELDNAME = FIELDNAME
                                 NODE_KEY  = NODE_KEY
                                 SENDER    = SENDER ).
  ENDMETHOD.
ENDCLASS.                    "LCL_APPLICATION_TREE IMPLEMENTATION
