
 PERFORM convert_fcat_data_grid USING  gt_display_0100
                                CHANGING gt_fieldcat_01_0100.


 PERFORM modify_fcat_data_grid1_0100.

*&---------------------------------------------------------------------*
*&      Form  CONVERT_FCAT_DATA_GRID
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->P_GT_ZRMMT07064  text
*      <--P_GT_FIELDCAT_01_0100  text
*----------------------------------------------------------------------*
FORM convert_fcat_data_grid  USING pt_table    TYPE STANDARD TABLE
                             CHANGING pt_fieldcat TYPE lvc_t_fcat.

  DATA : lo_table TYPE REF TO data.
  CREATE DATA lo_table LIKE pt_table.
  ASSIGN lo_table->* TO FIELD-SYMBOL(<fo_table>).

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(salv_table)
                              CHANGING  t_table      = <fo_table> ).
      pt_fieldcat = cl_salv_controller_metadata=>get_lvc_fieldcatalog(
        r_columns      = salv_table->get_columns( )
        r_aggregations = salv_table->get_aggregations( ) ).
    CATCH cx_root.
  ENDTRY.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  MODIFY_FCAT_DATA_GRID1_0100
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM modify_fcat_data_grid1_0100.

  LOOP AT gt_fieldcat_01_0100 ASSIGNING FIELD-SYMBOL(<FS_FIELDCAT>).

    CASE <FS_FIELDCAT>-FIELDNAME.
      WHEN 'MATNR'.

      WHEN 'ZZDESCRIPTION1' OR 'ZZDESCRIPTION2'.
        <FS_FIELDCAT>-outputlen = 20.

      WHEN 'KUNNR'.
        CASE 'X'.
          WHEN p_all.
            <FS_FIELDCAT>-no_out = 'X'.
          WHEN p_group.
            <FS_FIELDCAT>-no_out = 'X'.
          WHEN OTHERS.
        ENDCASE.
      WHEN 'NAME1'.
        CASE 'X'.
          WHEN p_all.
            <FS_FIELDCAT>-no_out = 'X'.
          WHEN p_group.
            <FS_FIELDCAT>-no_out = 'X'.
          WHEN p_cust.
            <FS_FIELDCAT>-outputlen = 15.
          WHEN OTHERS.
        ENDCASE.

      WHEN 'VKGRP'.
        CASE 'X'.
          WHEN p_all.
            <FS_FIELDCAT>-no_out = 'X'.
          WHEN OTHERS.
        ENDCASE.

      WHEN 'BEZEI'.
        CASE 'X'.
          WHEN p_all.
            <FS_FIELDCAT>-no_out = 'X'.
          WHEN p_group.
            <FS_FIELDCAT>-outputlen = 15.
          WHEN p_cust.
            <FS_FIELDCAT>-outputlen = 15.
          WHEN OTHERS.
        ENDCASE.

      WHEN 'KWMENG'.
        <FS_FIELDCAT>-coltext = text-f01.
        <FS_FIELDCAT>-qfieldname = 'MEINS'.
        <FS_FIELDCAT>-do_sum = 'X'.
        <FS_FIELDCAT>-HOTSPOT = 'X'.
      WHEN 'NETWR'.
        <FS_FIELDCAT>-coltext = text-f02.
        <FS_FIELDCAT>-cfieldname = 'WAERK'.
        <FS_FIELDCAT>-do_sum = 'X'.
      WHEN 'LABST'.
        <FS_FIELDCAT>-coltext = text-f03.
        <FS_FIELDCAT>-qfieldname = 'MEINS'.
        <FS_FIELDCAT>-do_sum = 'X'.
      WHEN 'LABST_ATP'.
        <FS_FIELDCAT>-coltext = text-f04.
        <FS_FIELDCAT>-qfieldname = 'MEINS'.
        <FS_FIELDCAT>-do_sum = 'X'.
        <FS_FIELDCAT>-HOTSPOT = 'X'.
      WHEN 'MEINS' OR 'WAERK'.
        <FS_FIELDCAT>-no_out = 'X'.
    ENDCASE.


  ENDLOOP.


ENDFORM.