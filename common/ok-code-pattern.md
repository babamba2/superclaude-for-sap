# OK_CODE Pattern for Procedural Screens

Authoritative wiring rule for screen user commands in a Procedural ABAP program that uses classical Dynpro (`CALL SCREEN {num}`). Non-negotiable — this pattern is enforced by Phase 6 review.

## Why — what goes wrong with `CASE sy-ucomm`

`sy-ucomm` is a system field that every dialog step clears + re-populates. Reading it in PAI works for a simple single-screen program, but the moment the program:

- opens a popup dialog (confirmation, F4 help, message-with-selection),
- chains screens (`CALL SCREEN 0100 STARTING AT …`),
- or dispatches an asynchronous control event (ALV toolbar, drag/drop, editable grid),

…the popup runtime overwrites `sy-ucomm` with its own function code before the outer CASE runs, and the original command is lost. The bug ships silently — smoke tests on a single main screen pass, the first real popup flow breaks.

The binding pattern below gives the PAI FORM a local copy of the function code that the dynpro runtime populated specifically for the current screen, BEFORE any popup / control event can touch `sy-ucomm`.

## The 3-step contract — ALL required when a screen is present

### Step 1 — Declare `gv_okcode` in the TOP include

```abap
" In {PROG}T
DATA: gv_okcode TYPE sy-ucomm.
```

- Fixed name `gv_okcode` (project-wide consistency — do not use `ok_code`, `lv_cmd`, `g_ucomm`, etc.).
- Type `sy-ucomm` (short function codes like `BACK` / `SAVE` / custom `ZXYZ`).
- Declared once in the TOP include; never re-declared inside a FORM or MODULE.

### Step 2 — Bind the screen's OK_CODE field to `GV_OKCODE`

Classical Dynpro requires an OK_CODE element on the screen, and the **name** you give that element is what the runtime populates before PAI fires.

**SE51 manual path**: Screen {num} → Element List → General attributes → **OK_CODE field** = `GV_OKCODE`.

**ADT / `UpdateScreen` (sc4sap MCP) path**: the screen's `fields_to_containers[]` entry with `TYPE=OKCODE` MUST have `NAME=GV_OKCODE`. A screen whose OKCODE field has the default placeholder (`TEXT=____________________`) and no NAME causes the code to land in `sy-ucomm` only — defeating the whole pattern.

Example `UpdateScreen` payload fragment:
```json
{
  "fields_to_containers": [
    {
      "CONT_TYPE": "SCREEN",
      "CONT_NAME": "SCREEN",
      "TYPE": "OKCODE",
      "NAME": "GV_OKCODE",
      "LENGTH": 20,
      "VISLENGTH": 20,
      "INPUT_FLD": "X"
    }
  ]
}
```

### Step 3 — Read `gv_okcode` in PAI, clear it, act on a local copy

```abap
" In {PROG}I — PAI include (thin dispatcher)
MODULE user_command_0100 INPUT.
  PERFORM user_command_0100.
ENDMODULE.

" In {PROG}F — FORM include (logic)
FORM user_command_0100.
  DATA lv_fcode TYPE sy-ucomm.
  lv_fcode = gv_okcode.
  CLEAR gv_okcode.             " prevent stale code re-firing on next PAI
  CASE lv_fcode.
    WHEN gc_fcode_back OR gc_fcode_exit OR gc_fcode_canc.
      PERFORM leave_0100.
    WHEN gc_fcode_save.
      PERFORM save_0100.
    WHEN OTHERS.
      " no-op — defensive; unknown codes silently ignored
  ENDCASE.
ENDFORM.
```

Three rules inside the FORM (each is non-negotiable):
1. **Copy `gv_okcode` into a local `lv_fcode` before branching.** The CASE runs on the local — protects against popups changing the global mid-branch.
2. **`CLEAR gv_okcode` immediately after the copy.** Prevents the same function code re-firing on a redraw PAI that doesn't carry a fresh user action.
3. **Compare against CONSTANTS declared in TOP**, not string literals. See [`constant-rule.md`](constant-rule.md). Typical constants: `gc_fcode_back / _exit / _canc / _save / _refresh TYPE sy-ucomm VALUE 'BACK' / 'EXIT' / 'CANC' / 'SAVE' / 'REFRESH'.`

## Anti-patterns — each is a MAJOR Phase 6 finding

- **PAI FORM reads `sy-ucomm` directly** — `CASE sy-ucomm.` or `IF sy-ucomm = 'BACK'.` anywhere inside a `user_command_xxxx` FORM. Fix: route through `gv_okcode`.
- **TOP missing `gv_okcode` while a screen is present** — the screen has nowhere to deposit its code. Breaks on popup flows; SAP does NOT error at activation, so the defect lands in production.
- **Screen OK_CODE field has no NAME** — `UpdateScreen` payload's OKCODE field has only TYPE and placeholder TEXT, no NAME attribute. Same failure mode as the missing TOP declaration.
- **Multiple OK_CODE globals** (`gv_okcode` + `ok_code` + `lv_cmd` co-existing in the same program) — pick one (`gv_okcode`) and delete the others.
- **Copying `sy-ucomm` into a local instead of `gv_okcode`** — same value on the simple path, different value as soon as the popup runtime steps in. Looks right in review, breaks in production.

## Integration points

- `common/include-structure.md` TOP include row — mandates the `DATA: gv_okcode TYPE sy-ucomm.` declaration when a screen is present; this file is the "why + full contract + anti-pattern" companion.
- `common/clean-code-procedural.md` § PBO / PAI Module — references this pattern as the source of truth for PAI user-command routing.
- `skills/create-program/phase4-parallel.md` Wave 4 — `UpdateScreen` payload for any screen with an OKCODE field MUST set `NAME=GV_OKCODE`. An OKCODE field with no NAME is a MAJOR Phase 6 finding.
- `skills/create-program/phase6-review.md` §1 — reviewer verifies the 3-step contract: TOP declaration exists, screen OKCODE field NAME=`GV_OKCODE`, PAI FORM uses `gv_okcode` not `sy-ucomm`.

## Applicability

- **REQUIRED**: Procedural programs with at least one `CALL SCREEN {num}`.
- **N/A**: OOP programs using RAP / BOPF / SALV popup only (no classical Dynpro).
- **N/A**: Selection-screen-only reports (no `CALL SCREEN` — user commands on the selection screen flow through `AT SELECTION-SCREEN`, not PAI MODULE).
- **Follows elsewhere**: if the program has multiple classical screens (e.g., 0100 + 0200 dialog), declare `gv_okcode` once in TOP and reuse on every screen — do NOT declare a per-screen `gv_okcode_0100`.
