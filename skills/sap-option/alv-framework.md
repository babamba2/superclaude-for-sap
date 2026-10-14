# ALV Framework and ABAP Support Package

Two code-generation settings in the active profile's `config.json` (`~/.sc4sap/profiles/<alias>/config.json`). Rules that consume them: [`../../common/oop-pattern.md`](../../common/oop-pattern.md) § ALV Framework and [`../../common/abap-release-reference.md`](../../common/abap-release-reference.md) § 1a.

## `alvFramework` — base for `LCL_ALV` in OOP programs

| Value | Generated `LCL_ALV` |
|---|---|
| `s4sap-cm` | `INHERITING FROM ZCL_S4SAP_CM_ALV` (plugin handlers, setup step 9b). Messages may use `S_UNIFIED_CON`. |
| `custom` | `INHERITING FROM <alvBaseClass>` — the customer's own ALV framework |
| `none` (default when unset) | plain `CL_GUI_DOCKING_CONTAINER` + `CL_GUI_ALV_GRID` / `CL_SALV_TABLE`, no framework dependency |

Companion keys:

- `alvBaseClass` — required for `custom`: the base class name.
- `alvGridClass` — optional for `custom`: the grid class whose events `LCL_EVENT_ALV` handles.
- `messageClass` — optional: message class for `REPORT … MESSAGE-ID`. Without it, programs use text symbols.

## `abapSp` — SAP_BASIS support package

Two digits (`"05"`, `"12"`) or unset. Only matters when `abapRelease = 740`: unset or < `05` → classic Open SQL (no `@`); < `08` → no `FOR` / `REDUCE` / `FILTER`.

## Flow

1. Read `config.json` and show the current values (`alvFramework: none (default)` when unset, `abapSp: (unset)`).
2. Ask with `AskUserQuestion` (`header: "ALV base"`): `none (default)` · `s4sap-cm` · `custom`. Mark the current value with ` (current)`.
3. `s4sap-cm` → `SearchObject` `ZCL_S4SAP_CM_ALV` (type `CLAS`). Missing → say "run `/sc4sap:setup` step 9b on DEV first" and keep the old value.
4. `custom` → ask for `alvBaseClass` (and optionally `alvGridClass`, `messageClass`), then `SearchObject` each. Missing → report and keep the old value.
5. If the class's package is `$TMP`, warn that programs in transportable packages will fail on QA/PRD import; recommend `none` for those.
6. `abapSp`: accept two digits; read it from `GetSession` / SAP GUI System → Status → Component information (`SAP_BASIS` support package) when the user does not know it.
7. Preview (`alvFramework: none → custom (alvBaseClass=<name>)`), confirm, then write: read-modify-write the JSON, keep every other key, write atomically (temp file + rename). Unsetting removes the key.
8. Report the path written. No restart needed — the next `/sc4sap:create-program` Phase 2 preflight reads the new value.

Class names entered here stay in the user's profile; never copy them into plugin files.

## Status snapshot row

`ALV framework: <alvFramework | none (default)>[ · base <alvBaseClass>] · ABAP SP <abapSp | unset>`, read from `config.json`.
