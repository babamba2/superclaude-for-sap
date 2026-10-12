# OK_CODE Pattern for Dynpro Screens

Authoritative wiring rule for screen user commands in any ABAP program (Procedural or OOP) that uses classical Dynpro (`CALL SCREEN {num}`). Enforced by Phase 6 review.

## Why — what goes wrong with `CASE sy-ucomm`

`sy-ucomm` is a system field that every dialog step clears + re-populates. Reading it in PAI works for a simple single-screen program, but the moment the program:

- opens a popup dialog (confirmation, F4 help, message-with-selection),
- chains screens (`CALL SCREEN 0100 STARTING AT …`),
- or dispatches an asynchronous control event (ALV toolbar, drag/drop, editable grid),

…the popup runtime overwrites `sy-ucomm` with its own function code before the outer CASE runs, and the original command is lost. The bug ships silently — smoke tests on a single main screen pass, the first real popup flow breaks.

The binding pattern below makes PAI read the OK_CODE field that the dynpro runtime filled for the current screen, not `sy-ucomm`.

## The contract — required when a screen is present

### Step 1 — Declare ONE OK_CODE global in the TOP include

```abap
" In {PROG}T — any one name is fine, e.g.
DATA ok_code TYPE sy-ucomm.        " house style
" or
DATA gv_okcode TYPE sy-ucomm.      " g-prefixed style
```

- Any name is allowed as long as it is declared **once**, at program level, in the TOP include (`{PROG}T`). Common names: `OK_CODE`, `GV_OKCODE`.
- Type `sy-ucomm`.
- Never re-declared inside a FORM, METHOD or MODULE; one variable serves every screen of the program.

### Step 2 — Bind the screen's OK_CODE field to that variable

Classical Dynpro requires an OK_CODE element on the screen, and the **name** you give that element is what the runtime populates before PAI fires.

**SE51 manual path**: Screen {num} → Element List → General attributes → **OK_CODE field** = the TOP variable name in upper case (e.g. `OK_CODE`).

**ADT / `UpdateScreen` (sc4sap MCP) path**: the screen's `fields_to_containers[]` entry with `TYPE=OKCODE` MUST have `NAME` equal to the TOP variable (upper case). A screen whose OKCODE field has the default placeholder (`TEXT=____________________`) and no NAME causes the code to land in `sy-ucomm` only — defeating the whole pattern.

Example `UpdateScreen` payload fragment (TOP declares `DATA ok_code TYPE sy-ucomm.`):
```json
{
  "fields_to_containers": [
    {
      "CONT_TYPE": "SCREEN",
      "CONT_NAME": "SCREEN",
      "TYPE": "OKCODE",
      "NAME": "OK_CODE",
      "LENGTH": 20,
      "VISLENGTH": 20,
      "INPUT_FLD": "X"
    }
  ]
}
```

### Step 3 — Dispatch on the OK_CODE variable in PAI

Allowed dispatch locations:

- **Procedural**: a `user_command_xxxx` FORM in `{PROG}F`, called from a one-line PAI module.
- **OOP**: the PAI module itself (`CASE ok_code.` inside `MODULE user_command_0100 INPUT.`) or an `LCL_ALV` method called from it (e.g. `go_alv->user_command_0100( )`).

```abap
" OOP, house style — dispatch directly in the PAI module ({PROG}I)
MODULE user_command_0100 INPUT.
  CASE ok_code.
    WHEN 'REFR'.
      go_alv->refresh_alv_0100( ).
    WHEN OTHERS.
  ENDCASE.
ENDMODULE.

" Procedural — thin module + FORM ({PROG}I + {PROG}F)
MODULE user_command_0100 INPUT.
  PERFORM user_command_0100.
ENDMODULE.

FORM user_command_0100.
  DATA lv_fcode TYPE sy-ucomm.
  lv_fcode = gv_okcode.
  CLEAR gv_okcode.
  CASE lv_fcode.
    WHEN gc_fcode_back OR gc_fcode_exit OR gc_fcode_canc.
      PERFORM leave_0100.
    WHEN OTHERS.
  ENDCASE.
ENDFORM.
```

Recommended hardening (MINOR when missing — reported, not gating):
1. **Copy the OK_CODE variable into a local and `CLEAR` it** before branching. Protects against a popup or a redraw PAI re-firing the same code. Programs that branch on the global without `CLEAR` work on simple flows; the reviewer adds a note when the screen opens popups.
2. **Compare against CONSTANTS declared in TOP** (`gc_fcode_*`) instead of literals. See [`constant-rule.md`](constant-rule.md). Function-code literals inside the `CASE` are tolerated (MINOR).

## Findings

MAJOR (blocks Phase 8):

- **PAI reads `sy-ucomm`** — `CASE sy-ucomm.` or `IF sy-ucomm = …` in a PAI module, a user-command FORM or a user-command method. Copying `sy-ucomm` into a local or into `GO_ALV->MV_UCOMM` and branching on that is the same defect. Fix: route through the OK_CODE variable.
- **No OK_CODE variable in TOP while a screen is present** — the screen has nowhere to deposit its code.
- **Screen OK_CODE field has no NAME**, or its NAME is not the TOP variable — same failure mode as the missing declaration.
- **Multiple OK_CODE globals** (`ok_code` + `gv_okcode` co-existing) — keep one.

MINOR (recommendation): no local copy + `CLEAR`; literal function codes instead of `gc_fcode_*` constants.

## Integration points

- `common/include-structure.md` TOP include row — requires one OK_CODE declaration when a screen is present; this file is the "why + contract + findings" companion.
- `common/clean-code-procedural.md` § FORM Body — references this pattern for PAI user-command routing.
- `skills/create-program/phase4-verify.md` Wave 4 assertion `a3` — the OKCODE field `NAME` equals the TOP variable.
- `skills/create-program/phase6-review.md` §1 — reviewer checks the contract above; `phase6-detect-judge.md` D1 detects `CASE sy-ucomm`.

## Applicability

- **REQUIRED**: Procedural and OOP programs with at least one `CALL SCREEN {num}`.
- **N/A**: programs that use only SALV (popup or full screen) or RAP / BOPF — no classical Dynpro.
- **N/A**: selection-screen-only reports (user commands on the selection screen flow through `AT SELECTION-SCREEN`, not a PAI MODULE).
- **Multiple screens** (e.g. 0100 + 0200): one OK_CODE variable in TOP, bound on every screen — no per-screen `ok_code_0100`.
