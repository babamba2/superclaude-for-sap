# Adobe preview — supported XFA subset and measured ADS rules

Companion of [`SKILL.md`](SKILL.md). What `scripts/adobe/adobe-layout.mjs` lays out, the rules measured on SAP's own ADS
PDFs (S/4HANA, 2026-11), and what is drawn approximately or not at all. Every approximation the build meets is listed
in its report.

## Data (generated function module → data XML)

| Context node | Preview |
|---|---|
| structure, data (`FIELD` = `PARAM-COMP`, system fields `SFPSY-*`) | value from the sample, converted by DDIC type |
| loop (+ WHERE, first / last line), loop data (`DATA` per row) | one `DATA` element per row that passes the WHERE |
| single record (+ key condition / line) | the first row matching the key |
| text module / include text | lines from `STXFTXT` + SmartStyle paragraph formats → rich text (`/` = line break, `=` = no blank) |
| graphic content (xstring field) / graphic URL | content: the base64 sample; URL: not fetched (empty) |
| node conditions | AND inside a group, OR between groups; `INITIAL`, quoted literals, numbers |
| inactive nodes (state I) | left out |

Conversions: NUMC padded / cut to its length, DEC / QUAN / P with their decimals, CURR shifted by 10^(DDIC decimals −
currency decimals) and printed with the currency's decimals (TCURX defaults: JPY / KRW 0, KWD / BHD 3), LANG → ISO
(`E` → `EN`), CHAR cut at its length, dates `YYYY-MM-DD`, times `HH:MM:SS`.

## Merge (template + data)

- Bindings `dataRef` (`$record.…`, `$data.data.…`, `$.…`, relative, `[*]`, `[n]`), `once` by name, `none`, `global`.
- `occur` min / max / initial; a repeatable subform without its own binding takes one instance per `[*]` match of
  its descendants (the nearest repeatable ancestor only).
- `use="#id"` prototypes (own attributes and properties win).

## Layout

- Page sets: page areas in order with their `occur` max (unlimited when absent), content area, medium (portrait /
  landscape), master content on every page bound to `$record`.
- Subforms: `position` (x / y / anchorType), `tb`, `table` (columnWidths, colSpan, cells stretched to the row
  height), `row`; `subformSet` is transparent; `lr-tb` / `rl-tb` flow as `tb` (approximation).
- Pagination: flowed content splits between the children of `tb` / `table` subforms; `keep intact` keeps a subform
  whole; `break` before / after `pageArea` / `contentArea`; overflow leader (`#id`) repeated on each new page.
- Fields / draws: `font` (typeface, size, weight, posture, underline, color), `margin`, `para` (hAlign left / right /
  center / radix with radixOffset, vAlign top / middle / bottom, spaceAbove / spaceBelow, margins, textIndent,
  lineHeight), `caption` (placement left / right / top / bottom, reserve, own font / para / margin), `border` (four
  edges, fill, rounded corners), `ui` multiLine, `value` maxChars, presence hidden / invisible / inactive.
- Values: `format/picture` (date, time, num, text, alternatives with `|`), defaults per locale (en_US: `MMM D, YYYY`,
  `h:MM:SS A`, grouping `,`); decimal `fracDigits` (-1 keeps the data's digits, otherwise trailing zeros drop).
- Rich text (`exData` xhtml): p / div / br / span / b / i, CSS font-size / weight / style / family / color /
  text-align / margins / text-decoration, `xfa-spacerun:yes`, embedded fields (`xfa:embed="#id"`, raw).
- Images: base64 in the template or data, aspect fit (top-left) / width / height / none / actual; JPEG, PNG, BMP, GIF.

## Measured text rules

| Rule | XFA 2.4 and later | XFA 2.1 (Designer 6 forms) |
|---|---|---|
| Glyph widths | Helvetica / Helvetica-Bold AFM (= Arial) | same |
| Baseline, top-aligned | top + 0.728 em (typo ascent); a plain multi-line field: + 0.15 em line gap | top + 0.878 em |
| Middle / bottom | centred on ascent + descent (0.938 em); text taller than its box starts at the top | centred on 1.15 em line boxes; field value and caption + 0.125 em |
| Line pitch | 1.15 em for plain field values, 1.1376 em for draws, rich text and captions; Helvetica text (SmartStyle `HELVE`) 1.2 em | 1.15 em |
| Field value inset | — | 1 pt left and right |
| Grown height | text block (last line to its descent) + paragraph spacing | whole line boxes + paragraph spacing |
| Underline | 0.09 em below the baseline, 0.033 em thick | same |
| White space | collapses to one blank; a blank right before a spacerun blank goes; blanks at a line end do not count for alignment | same |

## Scripts

- FormCalc subset (`formcalc.mjs`): `var`, `if / elseif / else`, `for … upto / downto … step`, `while`, comparisons,
  arithmetic, `Concat`, `Len`, `Sum`, `Round`, …; SOM paths with `[i]`, `.all.length`, `.rawValue`, `.presence`,
  `.break.before` / `.startNew`, `.occur.min`, `.instanceManager.removeInstance(i)`. Events: initialize, calculate,
  ready `$form` (before layout), ready `$layout` (after pagination).
- JavaScript: only `this.rawValue = xfa.layout.page(this)` / `pageCount()`; any other script is listed and not run.

## Not supported (drawn approximately or not at all)

- Bar codes of the XFA `barcode` ui (drawn as their text), check boxes / radio buttons / choice lists (drawn as
  their value), signature fields, comb fields.
- `lr-tb` / `rl-tb` wrapping flows, right-to-left text, `overflowTrailer`, `bookend` leaders, nested page sets,
  `pageArea` selection by script, `keep next / previous`.
- Fragments and output-management templates (SFTE / SFLO), offline / interactive features, form calculations in
  JavaScript, `presence` changed by JavaScript.
- ADS's fallback fonts for characters outside the font's encoding; fonts other than Arial / Helvetica / Courier / Times.
- Two measured legacy cases are near but not exact: a legacy field whose text is taller than its box (0.8 mm low in
  the preview) and legacy rich text in a field (0.8 mm) — both within the 1 mm position tolerance.
