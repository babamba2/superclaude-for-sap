REPORT zgt_reader.

START-OF-SELECTION.
  SELECT vbeln, status
    FROM zgt_log
    INTO TABLE @DATA(lt_log).
  zcl_gt_util=>static_call( ).
