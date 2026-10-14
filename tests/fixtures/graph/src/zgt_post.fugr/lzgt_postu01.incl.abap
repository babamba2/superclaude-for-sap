FUNCTION z_gt_post_order
  IMPORTING
    VALUE(is_head) TYPE zgt_head.

  DATA ls_log TYPE zgt_log.

  ls_log-vbeln = is_head-vbeln.
  MODIFY zgt_log FROM ls_log.
  APPEND ls_log TO gt_queue.
  MODIFY gt_queue FROM ls_log INDEX 1.
  PERFORM notify.
ENDFUNCTION.

FORM notify.
  CALL FUNCTION 'Z_GT_NOTIFY'.
ENDFORM.
