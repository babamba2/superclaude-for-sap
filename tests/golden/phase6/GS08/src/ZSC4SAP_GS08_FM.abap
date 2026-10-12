FUNCTION zsc4sap_gs08_fm
  " You can use the template 'functionModuleParameter' to add here the signature!
.
  DATA lv_iv_carrid   TYPE scarr-carrid.
  DATA lv_ev_carrname TYPE scarr-carrname.

  IF lv_iv_carrid IS INITIAL.
    RETURN.
  ENDIF.

  SELECT SINGLE carrname
    FROM scarr
    INTO lv_ev_carrname
    WHERE carrid = lv_iv_carrid.
  IF sy-subrc <> 0.
    CLEAR lv_ev_carrname.
  ENDIF.
ENDFUNCTION.
