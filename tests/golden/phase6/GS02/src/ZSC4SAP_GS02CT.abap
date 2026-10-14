*& Include ZSC4SAP_GS02CT
CLASS lcl_test DEFINITION FOR TESTING
  RISK LEVEL HARMLESS
  DURATION SHORT.
  PRIVATE SECTION.
    DATA cut TYPE REF TO lcl_data.
    METHODS setup.
    METHODS pct_is_25_when_50_of_200_seats FOR TESTING.
    METHODS pct_is_0_when_no_seats_max FOR TESTING.
ENDCLASS.

CLASS lcl_test IMPLEMENTATION.
  METHOD setup.
    cut = NEW #( ).
  ENDMETHOD.

  METHOD pct_is_25_when_50_of_200_seats.
    DATA(lv_pct) = cut->calculate_occupancy(
      iv_seats_max = 200
      iv_seats_occ = 50 ).

    cl_abap_unit_assert=>assert_equals(
      act = lv_pct
      exp = CONV ty_occupancy( 25 ) ).
  ENDMETHOD.

  METHOD pct_is_0_when_no_seats_max.
    DATA(lv_pct) = cut->calculate_occupancy(
      iv_seats_max = 0
      iv_seats_occ = 10 ).

    cl_abap_unit_assert=>assert_equals(
      act = lv_pct
      exp = CONV ty_occupancy( 0 ) ).
  ENDMETHOD.
ENDCLASS.
