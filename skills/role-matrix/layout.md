# role-matrix — Company layout

Referenced by `SKILL.md` and `workflow.md`. Every company keeps its role & authorization document in its own form. The default workbook stays the standard; a **layout** lays the company's form over it: sheet titles and order, columns and their headers, the company's own columns, level codes, cover fields, colours, font and logo. One model, one engine — editing, paging, search, CSV, paste, checks and SoD work the same on every layout.

Source code: `scripts/role/role-layout.mjs` (`columnCatalog`, `checkLayout`, `loadLayout`), drawing in `role-render.mjs` (`labelsFor(lang, layout)`, `sheetColumns`, `sheetsOf`), form reader `read-template.mjs` (+ `xlsx-read.mjs`), workbook content `import-form.mjs`.

## Where layouts live

`<RM>/_layouts/<name>.json` (+ a logo image next to it). A layout belongs to the customer: never copy it, its titles or its column names into the plugin. One layout serves every document of that company; `layout --file` copies it into the model (`model.layout`), so the page and `import` carry it.

## Steps (user hands over a company form)

1. Accepted: `.xlsx`, `.docx`, `.html` / `.htm` (a page saved from Word or Excel as "Web page" counts). An old `.doc` / `.xls`, a PDF or an image → ask the user to save it as `.xlsx` / `.docx` or `.html` first.
2. `<B> template <form> --out <RM>/_layouts/<name>-media` → tables in order (first rows with text, colspan, fill, text colour, bold), the text before each table (its title), page header / footer texts, colours and fonts by frequency, pictures (`inHeader` marks a header logo). An `.xlsx` gives one table per sheet (`sheet` = its name); rows carry `r` (row number), cells `c` (column letter) and `rows` (vertical merge).
3. `<B> columns` → every sheet, its column keys and default headers, `@roles`, cover keys.
4. Map the form onto the sheets — your judgment, then **one table to the user** (form table / column → sheet / key, "own column", "not used"), ask once to confirm:
   - each form table → one sheet key (`broles`, `troles`, `tcodes`, `users`, `auths`, `sod`, `revisions`); a header row of role IDs over level marks = `tcodes`, over X / O marks = `users`
   - each form column → a key from `columns`; role columns → `@roles` at their place; a column with no counterpart → `e:<name>` (stored per row in `ext`, edited like any text column)
   - level marks in the form (legend lines such as "● create, ◐ change, ○ display", or the values in the matrix) → `levels`; one sign only (no create / change / display split) → `levelMark`; the assignment mark → `mark`
   - a band over several header cells ("Scope" over Global / Local) → `groups`; a header fill of the role columns of its own → `theme.mxHead`
   - a table of document facts (doc no., date, project, approval boxes) → `cover.fields` (`project`, `system`, `author`, `date`, `version`, `reviewer`, `source`, or `e_<name>` for its own field)
   - header fill → `theme.head`, header text colour → `theme.headFg`, border colour → `theme.line`, the most used font → `theme.font`, the header logo → `theme.logo`
   - model sheets the form does not have → leave them out (hidden; their data and checks stay). Keep `revisions` unless the user says otherwise.
5. `Write` `<RM>/_layouts/<name>.json`, then `<B> layout --code <CODE> --file <RM>/_layouts/<name>.json`. Errors stop it; print the warnings (≤ 5 lines). Open the page and compare it with the form side by side; adjust and run `layout` again.
6. Back to the default workbook: `<B> layout --code <CODE> --file none`.
7. The form is a **filled-in** workbook (`.xlsx`) the user wants as the document → add a `form` block to each sheet of the layout (sheet name, first data row, column letter → key, the row of role IDs over the marks), then `<B> import-form <file.xlsx> --code <CODE> --layout <RM>/_layouts/<name>.json --project "…"` (an existing document only with `--force`; `.bak` kept). Print `read` (rows per sheet) and the warnings; the checks show what the workbook itself has (duplicate T-codes, roles without T-codes, shared user IDs).

## Schema

```json
{
  "name": "form-a",
  "title": "SAP authorization definition",
  "theme": { "accent": "#1f3864", "head": "#1f3864", "headFg": "#ffffff", "line": "#8ea9db", "link": "#0b62c4", "font": "Malgun Gothic", "logo": "form-a-media/image1.png" },
  "levels": { "F": { "code": "●", "text": "create / change / delete" }, "C": { "code": "◐", "text": "change" }, "D": { "code": "○", "text": "display" } },
  "mark": "O",
  "levelMark": null,
  "cover": { "fields": [{ "k": "e_docNo", "h": "Doc no." }, { "k": "date", "h": "Date" }, { "k": "project", "h": "Project" }], "hide": ["sheets"] },
  "sheets": [
    { "key": "broles", "tab": "Roles", "title": "1. Roles", "sub": "", "cols": [{ "k": "id", "h": "Role code" }, { "k": "name", "h": "Role name" }, { "k": "e:approver", "h": "Business approver", "wrap": true }],
      "form": { "sheet": "1. Roles", "from": 5, "cols": { "A": "id", "B": "name", "C": "e:approver" } } },
    { "key": "tcodes", "tab": "T-code matrix", "title": "2. T-code matrix", "sub": "● create / change / delete, ◐ change, ○ display", "cols": [{ "k": "tcode" }, { "k": "text", "h": "T-code text" }, { "k": "@roles" }],
      "groups": [{ "h": "Roles", "cols": ["@roles"] }], "form": { "sheet": "2. Matrix", "from": 6, "cols": { "A": "tcode", "B": "text" }, "roles": { "row": 4, "cols": "C:K" } } },
    { "key": "revisions", "tab": "History" }
  ]
}
```

| Field | Meaning |
|---|---|
| `title` | Document title on the cover and in the browser tab |
| `theme` | `#hex` colours over the light theme (dark keeps its own); `font` = family name; `logo` = image file relative to the layout (≤ 300 KB, inlined at `layout`) |
| `levels` | Display code and legend text per level F / C / D; the codes must differ. The model keeps F / C / D; typing F / C / D still works when the codes are symbols |
| `levelMark` | `{ code, text }` — the form marks access with one sign: every level shows it, the value menu offers it and blank, typing it gives F (C / D typed stay); `levels` is then ignored |
| `mark` | Display of an assignment in the user sheet (model keeps X); X, O, 1 and the mark are accepted |
| `cover.fields` | Fields of the document box, in order; `date`, `version`, `source` are computed. `cover.hide`: `summary`, `checks`, `sheets`, `legend` |
| `groups` | Per sheet: `[{ h, cols: [keys or "@roles"] }]` — a header band over those columns (a row above the column headers) |
| `form` | Per sheet, for `import-form`: `sheet` (workbook sheet name), `from` / `to` (data rows), `cols` (column letter → key, or a list of keys), `roles` (`row` of role IDs, `cols` range), `set` (values for every row), `fill` (menu level keys, top first: the form writes a level once per block — a blank level takes the value above it until a higher level changes) |
| `sheets` | Shown sheets in order. `tab` (tab label), `title`, `sub` (line under the title — give the legend in the company's codes), `cols` (order and headers; `w` min width px, `wrap`, `type: "num"` for an own column). No `cols` = the default columns. The key column (`id`, `tcode`, `uid`, `trole`, `ver`) is always shown. `troles` may also name `_bname` / `_bdesc` (the business role's name / description, read-only) |

## Rules

- Never drop data for a layout: hidden sheets and columns keep their values; `sync` keeps `ext` values like other hand-written fields.
- The company's form is read, never stored in the plugin. Layout and media stay under `<RM>/_layouts/`.
- Old `.doc`, PDF, images: no reader — ask for `.docx` / `.html`.
