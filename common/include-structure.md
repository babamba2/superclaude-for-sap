# Include Structure Convention

Shared convention for sc4sap ABAP programs that wrap logic in a Main Program + conditional Includes. **Source of truth for Procedural programs: [`procedural-sample/main-program.abap`](procedural-sample/main-program.abap)**. OOP programs follow [`oop-sample/zrsc4sap_oop_ex.prog.abap`](oop-sample/zrsc4sap_oop_ex.prog.abap).

## Include Set

| Include | Suffix | Procedural | OOP | Content |
|---------|--------|------------|-----|---------|
| TOP | `{PROG}t` | Always | Always | `TYPES`, `DATA`, `CONSTANTS` declarations. **MUST declare `DATA: gv_okcode TYPE sy-ucomm.`** when a screen is present — full 3-step binding contract (TOP decl + screen OK_CODE NAME + PAI FORM routing) in [`ok-code-pattern.md`](ok-code-pattern.md); `CASE sy-ucomm` in PAI is a MAJOR Phase 6 finding. |
| Selection Screen | `{PROG}s` | Always | Always | `SELECTION-SCREEN`, `PARAMETERS`, `SELECT-OPTIONS` |
| FORM / Logic | `{PROG}f` | Always | Optional | `PERFORM` business logic |
| Class Definition | `{PROG}c` | **NEVER** | OOP | `LCL_DATA` — data extraction class |
| ALV Class | `{PROG}a` | **NEVER** | ALV present | `LCL_ALV` — screen/ALV display class |
| PBO | `{PROG}o` | Screen/GUI present | Screen/GUI present | Screen PBO modules (`MODULE status_0100 OUTPUT.`) |
| PAI | `{PROG}i` | Screen/GUI present | Screen/GUI present | Screen PAI modules (`MODULE user_command_0100 INPUT.`) |
| Event Handler | `{PROG}e` | **FORBIDDEN** | OOP + ALV events | ALV event handler class (`LCL_EVENT`). **In Procedural mode this include MUST NOT be created** — event blocks (`INITIALIZATION`, `AT SELECTION-SCREEN`, `AT SELECTION-SCREEN OUTPUT`, `START-OF-SELECTION`, `END-OF-SELECTION`) live in the Main program body, never in an include. |
| Test Class | `{PROG}_tst` | Optional | OOP (required) | `FOR TESTING` local test classes |

## Main Program Body

The main program contains ONLY:
- `REPORT` statement
- **6-field header comment block** (mandatory — see [`clean-code-procedural.md`](clean-code-procedural.md) § *Mandatory Main Program Header*)
- `INCLUDE` statements (Procedural order: t → s → c → a → o → i → f → _tst; `e` is NEVER in Procedural order)
- Event blocks: `INITIALIZATION`, `AT SELECTION-SCREEN`, `AT SELECTION-SCREEN OUTPUT`, `AT SELECTION-SCREEN OUTPUT FOR FIELD <p>`, `START-OF-SELECTION`, `END-OF-SELECTION`

All declarations and business logic live inside the includes, not the main program. Event blocks delegate to FORMs: `START-OF-SELECTION. PERFORM get_data_0100.`

## Conditional Generation Rule

- **Procedural, no Screen, no ALV**: generate `t` / `s` / `f` only.
- **Procedural, with Screen + ALV**: generate `t` / `s` / `a` / `o` / `i` / `f` (6 — `c` may be skipped if no local classes are used). **Never add `e`.**
- **OOP, with Screen + ALV**: generate `t` / `s` / `c` / `a` / `o` / `i` / `e` / `f` / `_tst` (`e` only for `LCL_EVENT` — ALV event handler class).

## Activation Protocol — MANDATORY (matches every skill that creates includes)

**`UpdateProgram(activate=true)` activates ONLY the main program. It does NOT cascade to sub-includes.** Skills that generate a main program + N includes MUST:

1. Create each include (`CreateInclude`) and upload its body (`UpdateInclude`).
2. After every include is uploaded, either:
   - Call `UpdateInclude` with `activate=true` for each include **in dependency order** (typically `t → s → a → o → i → f` because later includes reference earlier declarations), OR
   - Call `ActivateObjects` once with the full list `[main + every include + screen + gui_status]`.
3. **Verify with `GetInactiveObjects`** — if any program-scoped include appears in the result, the skill has FAILED regardless of what individual tool responses reported.

Agents that report "5/5 프로그램 활성화 OK" without a `GetInactiveObjects=0` check are producing **false positives** and are a MAJOR finding in Phase 6 review.

## Anti-patterns (each is a MAJOR Phase 6 finding)

- **`{PROG}e` include exists in a Procedural program** — event blocks moved out of Main body into `e` include. This is an invalid structure that hides control flow.
- **Event blocks (`START-OF-SELECTION` / `END-OF-SELECTION` / `AT SELECTION-SCREEN`) placed in `f` or `e` include instead of Main** — same control-flow hiding.
- **Main program missing the 6-field header comment block** — violates `clean-code-procedural.md` § *Mandatory Main Program Header*.
- **Includes left inactive after "successful" build** — `GetInactiveObjects` returns any `{PROG}<suffix>` entry.
- **`c` / `a` include missing when spec declares local classes or ALV** — silently skipped.
- **Inferring suffix meaning from the suffix list in `naming-conventions.md` alone** — that file only enumerates suffixes. Their conditions (OOP vs Procedural, ALV vs none) live **here** and in the sample files. Always cross-check this table + the sample before generating.
