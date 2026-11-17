# Program test — cases, expected values and the harness

Companion to [`SKILL.md`](SKILL.md) → Steps 2, 5, 6. Read by `sap-analyst` (Cases, Expected) and `sap-qa-tester` (Harness).

## Cases (`cases.json`)

```json
{ "program": "ZMMR0010",
  "cases": [
    { "id": "C01", "method": "C01_OPEN_ITEMS_ONLY", "title": "Only items with open quantity are listed",
      "rule": "spec 4.2 — open = ordered quantity > received quantity", "kind": "positive",
      "source": ["ZMMR0010_F01:142"], "tables": ["EKKO", "EKPO"], "double": "osql" },
    { "id": "C07", "rule": "spec 4.5 — authority check per plant", "kind": "negative", "testable": false,
      "not_testable_reason": "AUTHORITY-CHECK result cannot be doubled on 7.40" } ] }
```

- `id` `C01…`; `method` = test method name, starts with the id, ≤ 30 chars.
- `kind`: `positive`, `negative`, `empty` (no rows), `boundary` (equal values, limits, dates at period ends). At least one positive and one negative case.
- `rule`: spec section, or the source line when there is no spec. One rule per case.
- `source`: the **condition lines** (`IF` / `ELSEIF` / `CHECK` / `WHERE` / `CASE…WHEN`) the case exercises, as `INCLUDE:line` from `<run>/src/`. Mutants are planted there — a case that cites no condition line cannot prove it tests the rule.
- `double`: `osql`, `override` or `param` (below). No feasible double → `testable: false` with the reason. `NOT_TESTABLE` is reported as its own count and share; it never counts as passed.

Typical `NOT_TESTABLE` reasons: SELECT inside a FORM / method that cannot be overridden on a release without the OSQL test environment; `AUTHORITY-CHECK`; `CALL TRANSACTION` / `SUBMIT`; RFC to another system; screen dialog only (PBO / PAI with no callable logic); `COMMIT WORK` / update task in the tested path.

## Expected values (`expected.json`)

```json
{ "cases": { "C01": { "basis": "rows EKPO 00010 (10 > 4) and 00030 (5 > 0) are open; 00020 is fully received",
                      "values": [ { "what": "lines( lt_out )", "value": 2 },
                                  { "what": "lt_out[ 1 ]-ebelp", "value": "00010" } ] } } }
```

- Derived from the spec rule and the masked rows (`<run>/rows/*.json`) — what the spec says the result must be for those rows. Do not run the program, and do not copy the program's logic line by line to compute the value (a copied bug would pass).
- At least one concrete value per testable case: a count, a key, an amount, a status, a message number. "Not initial" alone is not a value.
- `basis` names the rows and the rule that give the value, so the independent check can recompute it.
- After `pt.mjs freeze` the file is fixed. A change needs a spec citation and the user's yes (`freeze --reason … --user-approved`); it is shown in the receipt.

## Harness

`pt.mjs harness` builds `<PROG>_PT` = the main program's own text with only the `REPORT` name changed, plus the test class. Includes stay `INCLUDE` statements — the real code runs, nothing is copied. Text symbols of the original are not in the harness's text pool; a case whose result depends on a text element value is `NOT_TESTABLE`.

### Test class rules (lint-enforced)

- One local class `FOR TESTING RISK LEVEL HARMLESS DURATION SHORT`; one method per testable case, named as in `cases.json`, declared `FOR TESTING`.
- Each method asserts with `cl_abap_unit_assert=>assert_equals` (or `assert_table_contains`, `assert_char_cp`, `assert_number_between`, `assert_differs`) and contains **every frozen expected value as a literal** (`exp = 2`, `exp = '00010'`). No `act` = `exp` same expression, no `assert=>skip`.
- No `COMMIT WORK`, no update task, no `INSERT` / `UPDATE` / `DELETE` on database tables (doubles only).
- Test data comes from `pt.mjs abap-rows --run <run> --table <T> [--fields …]` (masked VALUE rows). Never type values from the raw MCP response.
- Syntax must match `config.json` → `abapRelease` ([`../../common/abap-release-reference.md`](../../common/abap-release-reference.md)); below 7.40 replace `VALUE #( … )` with `APPEND` lines.

### Doubles

| Kind | Release | How |
|---|---|---|
| `osql` | ≥ 7.51 (S/4) | `class_setup`: `go_env = cl_osql_test_environment=>create( i_dependency_list = VALUE #( ( 'EKKO' ) ( 'EKPO' ) ) )`; `setup`: `go_env->clear_doubles( )` + `go_env->insert_test_data( lt_ekpo )` with the case's rows; `class_teardown`: `go_env->destroy( )`. Every planned table of an osql case is in the dependency list (lint). The program's own SELECTs then read the doubles. |
| `override` | any | The program reads through a local class method (e.g. `LCL_DATA->select_*`, create-program OOP pattern) that is not `FINAL` / private: a local test subclass redefines it to return the case's rows, and the test injects the subclass instance where the program takes it (constructor, attribute, factory). If the program creates the instance itself with no seam, it is `param` or `NOT_TESTABLE`. |
| `param` | any | The logic sits in a FORM / method that takes the rows as parameters (`USING it_in`, `IMPORTING it_data`): the test calls it with the case's rows (`PERFORM filter_open USING lt_rows CHANGING lt_out.` — FORMs of the harness itself are callable). |

`TEST-SEAM` needs 7.50 and changes the program, so it is not used.

### Skeleton (osql)

```abap
CLASS ltcl_pt DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    CLASS-DATA go_env TYPE REF TO if_osql_test_environment.
    CLASS-METHODS class_setup.
    CLASS-METHODS class_teardown.
    METHODS setup.
    METHODS c01_open_items_only FOR TESTING.
ENDCLASS.
CLASS ltcl_pt IMPLEMENTATION.
  METHOD class_setup.
    go_env = cl_osql_test_environment=>create( i_dependency_list = VALUE #( ( 'EKKO' ) ( 'EKPO' ) ) ).
  ENDMETHOD.
  METHOD class_teardown.
    go_env->destroy( ).
  ENDMETHOD.
  METHOD setup.
    go_env->clear_doubles( ).
  ENDMETHOD.
  METHOD c01_open_items_only.
    DATA lt_ekpo TYPE STANDARD TABLE OF ekpo WITH EMPTY KEY.
    lt_ekpo = VALUE #( ( ebeln = '4500000001' ebelp = '00010' menge = '10' wemng = '4' ) ).  " from pt.mjs abap-rows
    go_env->insert_test_data( lt_ekpo ).
    DATA(lo_data) = NEW lcl_data( ).
    lo_data->select_open_items( ).
    cl_abap_unit_assert=>assert_equals( act = lines( lo_data->mt_out ) exp = 2 msg = 'C01 open items' ).
  ENDMETHOD.
ENDCLASS.
```

## Upload

The main thread uploads `<run>/harness/<NAME>.abap` byte for byte (`UpdateProgram` `source_code`). The ledger records the hash of every upload; the verdict refuses a run whose uploaded source differs from the generated file, was not activated after the upload, or has no ABAP Unit result after it. The same holds for each mutant and the tamper copy.
