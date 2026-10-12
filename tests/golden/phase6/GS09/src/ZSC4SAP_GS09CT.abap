*& Include ZSC4SAP_GS09CT
CLASS lcl_test DEFINITION FOR TESTING
  RISK LEVEL HARMLESS
  DURATION SHORT.
  PRIVATE SECTION.
    DATA cut TYPE REF TO lcl_data.
    METHODS setup.
    METHODS free_is_50_when_150_of_200 FOR TESTING.
    METHODS free_is_0_when_overbooked FOR TESTING.
ENDCLASS.

CLASS lcl_test IMPLEMENTATION.
  METHOD setup.
    cut = NEW #( ).
  ENDMETHOD.

  METHOD free_is_50_when_150_of_200.
    cl_abap_unit_assert=>assert_equals(
      act = cut->calculate_free_seats( iv_seats_max = 200
                                       iv_seats_occ = 150 )
      exp = 50 ).
  ENDMETHOD.

  METHOD free_is_0_when_overbooked.
    cl_abap_unit_assert=>assert_equals(
      act = cut->calculate_free_seats( iv_seats_max = 100
                                       iv_seats_occ = 120 )
      exp = 0 ).
  ENDMETHOD.
ENDCLASS.
