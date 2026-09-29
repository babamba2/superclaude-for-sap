# Selection-screen schema — `image-spec.json.selection`

Companion to [`spec-templates.md`](spec-templates.md) § image-spec.json schema. **sap-writer MUST read this file before writing `selection`.** The renderer (`scripts/spec/screen-image-renderer.mjs`, v14) draws exactly what this object describes — anything left out never appears in the Selection PNG (xlsx Sheet 3 and MD §3.1 alike).

## Transcription rule — 1:1 with the ABAP source

Walk the program's selection-screen declarations (`SELECTION-SCREEN` / `PARAMETERS` / `SELECT-OPTIONS`, plus `INITIALIZATION` for defaults and the `SSCRFIELDS-FUNCTXT_nn` assignments for toolbar buttons) in source order and emit:

| ABAP source | image-spec |
|---|---|
| `SELECTION-SCREEN BEGIN OF BLOCK b1 … WITH FRAME TITLE text-001` | one entry in `blocks[]`, `label` = the translated frame title |
| `PARAMETERS p_x TYPE …` | `{ "name": "P_X", "label": …, "required"?, "default"? }` |
| `SELECT-OPTIONS s_x FOR …` | `{ "type": "range", "name": "S_X", … }` |
| `SELECT-OPTIONS … NO INTERVALS` | add `"noIntervals": true` (single box + multi-select button) |
| `SELECT-OPTIONS … NO-EXTENSION` | add `"noExtension": true` (no multi-select button) |
| `PARAMETERS p_x AS CHECKBOX` | `{ "type": "checkbox", "name": "P_X", "label": …, "checked"? }` |
| `PARAMETERS r_a RADIOBUTTON GROUP g1` (every member) | **one** `{ "type": "radioGroup", "group": "G1", "options": [ … ] }` item |
| radio members inside `BEGIN OF LINE … END OF LINE` | `"layout": "horizontal"` (default is vertical) |
| `SELECTION-SCREEN COMMENT` that opens such a line (before the radios / checkboxes) | the group's `"label"` — options start right after the widest group label |
| `BEGIN OF LINE` + `COMMENT … FOR FIELD p` + `PARAMETERS p AS CHECKBOX` | checkbox with `"labelLeft": true` (text left, box in the input column) |
| `BEGIN OF LINE` + `COMMENT … FOR FIELD p` + `PARAMETERS p TYPE …` | plain `param`; `label` = the comment text (resolve the text symbol set in INITIALIZATION) |
| several `AS CHECKBOX` parameters on one `BEGIN OF LINE` | **one** `{ "type": "checkboxGroup", "layout": "horizontal", "options": [{ name, label, checked }] }` item |
| `SELECTION-SCREEN PUSHBUTTON /1(30) b_x USER-COMMAND …` | `{ "type": "pushbutton", "label": <button text> }` |
| `SELECTION-SCREEN COMMENT …` | `{ "type": "comment", "text": … }` |
| `sscrfields-functxt_01 = …` (+ `SELECTION-SCREEN FUNCTION KEY n`) | `toolbar: [ <button text>, … ]` |
| `OBLIGATORY` | `"required": true` |
| `DEFAULT` / value set in `INITIALIZATION` | `"default"` (`"defaultHigh"` for a range HIGH) — dates as a sample value, e.g. today |
| several values APPENDed to one SELECT-OPTIONS at INITIALIZATION | first value in `"default"`, the full list in `"note"` |
| `GET PARAMETER ID` default | no `default`; `"note"`: "user parameter <PID>" |

Rules:
- **Never merge fields.** One ABAP field = one item. Do not collapse `S_KUNNR`, `S_KUNWE`, `S_KUNRG` into one "Sold-to / Ship-to / Payer" row.
- **Never turn a radio group into checkboxes**, and never mix members of different groups into one item.
- A `COMMENT … FOR FIELD f` disappears together with `f` when `f` is hidden (observed on a real screen) — omit both.
- Fields that are shown or hidden dynamically (`LOOP AT SCREEN` / `MODIF ID`) stay in the image. Put the condition in `note` (e.g. "shown only when in condition-table key"). Fields that are always hidden may be omitted, but must still appear in the Parameters table.
- Labels come from the selection texts (translated into the spec `lang`). `name` is the bare ABAP identifier.
- Keep the source order within each block.
- Defaults often live outside the selection include: follow `INITIALIZATION` into any method it calls (e.g. `GO_DATA->INITIALIZATION( )` in the class include) before concluding a field has none. Computed dates (e.g. today − 1 month) are drawn as sample dates with the formula in `note`.

## Shape

```jsonc
"selection": {
  "toolbar": ["Download Excel Template", "Conversion Master"],
  "blocks": [
    { "label": "Selection 1", "items": [
      { "name": "P_KSCHL", "label": "Condition Type", "default": "ZNP0" },
      { "type": "pushbutton", "label": "Select Key Combination", "note": "condition-table popup" }
    ]},
    { "label": "Selection 2", "items": [
      { "name": "P_VKORG", "label": "Sales Org.", "required": true },
      { "type": "range", "name": "S_VTWEG", "label": "Distr. Channel", "default": "D2", "noIntervals": true },
      { "type": "range", "name": "S_MATNR", "label": "Material" }
    ]},
    { "label": "Execution Mode", "items": [
      { "type": "radioGroup", "group": "G1", "layout": "horizontal", "options": [
        { "name": "R_DISP", "label": "Display", "selected": true },
        { "name": "R_CREA", "label": "Create Request" }
      ]}
    ]}
  ]
}
```

## Item reference

| `type` | Keys | Drawn as |
|---|---|---|
| `param` (default when `type` is omitted) | `name`, `label`, `required?`, `default?`, `note?` | label + one input box (no multi-select button) |
| `range` | + `defaultHigh?`, `noIntervals?`, `noExtension?` | LOW ~ HIGH + ▼ multi-select; `noIntervals` → one box; `noExtension` → no ▼ |
| `checkbox` | `name`, `label`, `checked?`, `labelLeft?`, `note?` | checkbox at the label column + text; `labelLeft` → text left, box at input column |
| `radioGroup` | `group`, `label?`, `options[{ name, label, selected? }]`, `layout?`, `note?` | radio circles; the `selected` option (else the first) is filled; `label` in the label column |
| `checkboxGroup` | `label?`, `options[{ name, label, checked? }]`, `layout?`, `note?` | checkboxes laid out like a radio group |
| `pushbutton` | `label`, `name?`, `note?` | yellow push button |
| `comment` | `text` | plain text line |

Block: `{ "label": string, "items": item[] }`. An empty `label` draws a frame without a title chip (`BEGIN OF BLOCK … WITH FRAME` without `TITLE`). `NO-DISPLAY` fields are never drawn — list them only in the Parameters table.

## Legacy shape (read-only)

`{ blockLabel, fields[], optionBlockLabel, optionFields[] }` still renders: it becomes two blocks, with `optionFields` drawn as checkboxes. It **cannot** express pushbuttons, radio groups or more than two blocks. `build-spec.mjs` and `render-md-images.mjs` print a `⚠` warning when they see it. Do not write it in new specs.
