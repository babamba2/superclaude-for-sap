# manual.json — Schema and Writing Rules

Input of `scripts/manual/build-manual.mjs`. A complete example: [`example-manual.json`](example-manual.json).

## 1. Top level

| Key | Type | Notes |
|---|---|---|
| `program` | string | Program name — file names and headers |
| `tcode` | string | T-Code the user starts it with (`SA38` form if none) |
| `title` | string | Business title in the manual language ("3PL goods receipt results") — not the program name |
| `module` | string | `SD`, `MM`, … (cover kicker) |
| `lang` | `ko` \| `en` \| `ja` | One language for all prose |
| `menuPath` | string? | SAP menu / role menu path, if known |
| `cbo` | boolean? | `false` for a standard transaction; default shows the CBO badge |
| `changeNote` | string | What this version changes — goes into the revision history |
| `theme` | string \| object? | Screen theme: `signature` (default), `signature-pink`, `modern` or `{ base, …colours }`. The default comes from the profile `config.json` `screenTheme`. See [`../program-to-spec/selection-schema.md`](../program-to-spec/selection-schema.md) § Screen theme |
| `meta` | object? | Overrides the config.json cover values for this manual only (`author`, `team`, `company`, `confidentiality`) |
| `intro` | object | `purpose`, `background?`, `businessRules[]`, `users?`, `unverified[]` |
| `processFlow` | graph \| string[]? | Business flow: `{ nodes, edges }` (program-to-spec `spec-templates.md` § Image Replacement) or a linear list (`?` = decision, `!` = end). After a user edits the flow in the page it comes back as a free graph (`"layout":"free"`, nodes with `x`,`y`) — keep it as imported |
| `screens` | object | Screen catalog: key → screen spec (§2) |
| `scenarios` | array | §3 |
| `fields` | object | `selection[]`: `{ name, label, required?, f4?, example?, description }`; `output[]`: `{ name, header, description }` |
| `messages` | array | `{ code, type, text, cause, action }` — `text` is the T100 text as is |
| `glossary` | array | `{ term, description }` |

`intro.unverified` lists statements (copied **exactly** as written in `purpose` / `background` / `users` / `businessRules[]`) that the interview did not confirm; each gets a "to be confirmed" badge.

## 2. Screens

The catalog holds every screen a step shows. Key `selection` is the selection screen; any other key (use the dynnr: `"0100"`, `"0200"`) is an output screen or popup.

- **Selection screen** — [`../program-to-spec/selection-schema.md`](../program-to-spec/selection-schema.md): `blocks[]` of `param` / `range` / `checkbox` / `radioGroup` / `checkboxGroup` / `pushbutton` / `comment`, optional `toolbar`. A second selection-like screen can use any key with `"kind": "selection"`.
- **Output screen / popup / second ALV** — the `alv` shape of [`../program-to-spec/alv-buttons-schema.md`](../program-to-spec/alv-buttons-schema.md) §2: `screen { title, status, buttons[], fields[] }`, `toolbar[]`, `standardToolbar`, `columns[]`, `sampleRows[]`, or `panes[]`. A popup without a grid is `screen` + `fields` only. `gridTitle` draws the grid title bar; a popup with `screen` but no `columns` is drawn without a grid (confirmations). No `buttonFlows` here — the manual's callouts replace the flow badges.
- **Excel worksheet** (`"kind": "excel"`) — for steps done inside an upload template, drawn as Excel, not as an SAP grid: `file` (title bar), `sheet?` (tab, default `Sheet1`), `note?` (text of A1; the header row then defaults to 2), `headerRow?`, `activeCell?` (default first data cell), `emptyRows?` (default 2), `columns[] { name, header, width?, align?, headerFill?, headerColor? }` in template column order (A, B, …), `sampleRows[]`. Copy the header texts and header fill colours from the real template file.
- `sampleRows` are **invented** illustrative values — never business data, never real customer / vendor / company names.

## 3. Scenarios and steps

```json
{ "title": "Check missing goods receipts",
  "goal": "When a delivery arrived but no receipt shows in stock",
  "tcode": "ZMM_GR3PL",
  "steps": [
    { "title": "Enter the plant and choose the option",
      "screen": "selection",
      "values": { "P_WERKS": "KR01", "R_MISS": true },
      "callouts": [
        { "anchor": "sel:P_WERKS", "text": "Enter the **plant**." },
        { "anchor": "sel:R_MISS", "text": "Choose **Missing GR**.", "details": ["Log: receipts already posted"] }
      ],
      "note": "Press Execute (F8).",
      "result": "The list of POs without a receipt opens." },
    { "title": "Read the result", "screen": "0100",
      "patch": { "sampleRows": [ { "EBELN": "4500000015", "STATUS": "E" } ] },
      "callouts": [ { "anchor": "col:STATUS", "text": "**E** means the receipt failed." } ] }
  ],
  "checkpoints": [ { "text": "Send only POs arriving within the next days.", "source": "business rule (interview)" } ] }
```

| Step key | Notes |
|---|---|
| `title` | The action, in the imperative ("Enter the plant and run") |
| `screen` | Catalog key; omit for a text-only step |
| `values` | Selection screen only — `{ PARAM: "value" }`, `{ S_RANGE: ["low", "high"] }`, `{ CHECKBOX: true }`, `{ RADIO_OPTION: true }` selects that radio |
| `patch` | Shallow override of top-level screen keys for this step (other `sampleRows`, `columns`). Shallow: `{ "screen": { "title": "…" } }` replaces the whole `screen` object — repeat its `buttons` and `fields` |
| `callouts[]` | Numbered in order (1, 2, 3 …); `anchor` optional (a callout without one has a number but no mark); `details[]` = sub-bullets, e.g. what each option means |
| `caption` | Small text under the screen image |
| `note` / `result` | What to press next / what the user sees afterwards |
| `tcode` | Overrides the scenario / manual T-Code in the step header |
| `image` | `{ src, width, height }` — a real screenshot (data URI) the user pasted in the page's edit mode; drawn instead of `screen`, anchors are not checked. Keep it on rebuilds |

Callouts may also carry `offset: [dx, dy]` (badge moved away from its anchor, drawn with a leader line) and `pos: [x, y]` (badge with no anchor, e.g. on a screenshot) — both in screen-image units and written by the edit mode; keep them when rewriting a callout. A manual saved from the edit mode has a top-level `edited: { at }`.

## 4. Anchor keys

The renderer wraps these screen elements in `<g data-anchor="…">`; a callout's `anchor` must be one of them. The build warns when an anchor is not on the step's screen and lists the ones that are.

| Key | Element |
|---|---|
| `sel:<NAME>` | Selection row by `name` (param / range / checkbox), by `group` (whole radio group) or a radio / checkbox option by its `name`; a row without a name (pushbutton, comment) falls back to its `label` or `text` |
| `block:<label>` | Selection block title |
| `frame:<label>` | Block nested inside a block (selection item `type: "frame"`) |
| `tb:<code or label>` | Selection-screen toolbar button |
| `title` | Title bar of an output screen or popup |
| `gridtitle` | ALV grid title bar (`gridTitle` of a single-grid screen) |
| `pai:<CODE>` | GUI status button (function code) |
| `alv:<CODE>` | ALV toolbar button; standard icons are `alv:std-detail`, `alv:std-sort`, `alv:std-filter`, `alv:std-sum`, `alv:std-export` |
| `fld:<name, code or label>` | Dynpro element above the grid (input, checkbox, push button) |
| `col:<FIELDNAME>` | ALV column header |
| `pane:<title>` | Title of one grid in a multi-pane screen |
| `col:<name>` · `row:<n>` · `note` · `sheet` · `title` | Excel screen: header cell of a column, row number, the A1 note, the sheet tab, the title bar |

The same key twice on one screen (two grids with a `MATNR` column) → append `#2` for the second one: `col:MATNR#2`.

## 5. Writing rules

1. **Instructional, user voice.** "Enter the plant", "Press Send" — not "The program reads EKKO". ABAP names appear only as identifiers in code format (`` `P_WERKS` ``), never as the subject of a sentence.
2. **One language.** Every prose string in `lang`; only SAP identifiers, T-Codes, function codes and T100 texts stay as they are. The build flags English prose in a `ko` / `ja` manual.
3. **One step = one screen state.** A popup is its own step; a follow-up ALV is its own step. At most 6 callouts per step — split the step instead.
4. **Every scenario has check points**, each with a `source` (`AT SELECTION-SCREEN`, `AUTHORITY-CHECK M_MSEG_WMB`, `popup 0200`, `business rule (interview)`). A scenario with truly none → one check point saying what the user should verify in the result.
5. **Messages** — `cause` in business terms ("The posting date is in a closed period"), `action` as what the user does ("Ask FI to open the period, then reprocess"). Messages the user never sees (internal `MESSAGE … INTO`) are left out.
6. **No invented facts.** A business rule the source does not show and the interview did not confirm goes into `intro.unverified`.
7. **Numbers and dates** in the mockups use neutral invented values; plant / company codes use ISO-country style (`KR01`, `DE10`), never initials that read as real companies.
8. **Inline markup** in every prose string: `**bold**`, `==highlight==` (red emphasis — for what must not be missed), `` `code` ``, `\n` line break, a line starting with `- ` is a bullet. The page's edit mode reads and writes the same markup, so keep it when rewriting a user-edited manual.
