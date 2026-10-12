*&---------------------------------------------------------------------*
*& Report ZGT_ORDER — synthetic fixture for the reference-graph tests
*& (invented names only). INCLUDE ZGT_IN_HEADER_COMMENT.
*&---------------------------------------------------------------------*
REPORT zgt_order MESSAGE-ID zgt.

INCLUDE zgt_ordertop.
INCLUDE zgt_orderf01.
*INCLUDE zgt_orderold.
INCLUDE <icon>.

START-OF-SELECTION.
  PERFORM main.
  PERFORM sql.
