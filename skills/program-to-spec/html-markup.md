# Program → Spec — Markup for the HTML View

Referenced by `spec-templates.md`. The `.md` stays the source of truth; `scripts/spec/md-to-html.mjs` builds the HTML page from it. Most of the page is derived from structure the templates already produce. The rules below add the few things it cannot infer. Every rule is invisible or renders cleanly in plain Markdown (GitHub, VS Code preview), so the `.md` loses nothing.

## What the converter derives on its own — keep the structure it reads

| Page feature | Read from | Writer's duty |
|---|---|---|
| Contents sidebar + section folding | `##` / `###` headings | Number every `##` (`## 2. Data model`) and `###` (`### 2.1 Reads`) |
| Cover fact card | The `- **Label**: value` list right under the `#` title | Every item `**Label**: value`; chain pairs on one line with ` · ` |
| Section chips with row counts | Tables inside each `##` section | — |
| Cross-reference links + tooltips | The key column of each table: the first or second column that holds SAP names (tables, parameters, BAPIs, FMs, routines, message numbers) | Put the SAP name at the **start** of its cell (`**VBAK / VBAP**`, `VBFA (SAP standard)`); put its description in the same row. Spell the name identically everywhere else |
| `§n` links | `§2`, `§4.1` in the text | Refer to sections as `§<number>` |
| Figures with captions | A paragraph holding only `![Caption](_assets/…/x.png)` | Give every image a meaningful alt text — it becomes the caption |
| Folded long code | Fenced blocks over 30 lines | — |

## Callouts — GitHub alert syntax

Use for findings the reader must not miss. Renders as a coloured box in HTML and as the same alert on GitHub.

```markdown
> [!WARNING]
> No AUTHORITY-CHECK before the update in `SAVE_DATA` (L1204).
```

| Kind | Use for |
|---|---|
| `[!NOTE]` | Scope statements, reading conventions (`L` numbers refer to …) |
| `[!TIP]` | Reuse hints, faster alternatives |
| `[!IMPORTANT]` | Business rules the logic depends on |
| `[!WARNING]` | Risks: missing authority checks, hard-coded values, dead code with side effects |
| `[!CAUTION]` | Data-loss or posting risks (DELETE on standard tables, COMMIT inside loops) |

A quote that starts with `⚠` is also shown as a warning. Prefer the alert form in new specs.

## Technical detail — for the page's "Functional" view

The HTML toolbar offers **All / Functional**. Functional hides what is marked technical, so a business reader gets a clean narrative from the same file.

- **Inline** — wrap the ABAP anchor that follows a business step:
  `3. Checks the credit limit per sold-to party. <span class="tech">(FORM check_credit, L812–870)</span>`
  Place the span **after** the business text on the same line. A line that *starts* with `<span` is passed through as raw HTML and its Markdown is not rendered.
- **Whole section** — put this comment on the line right after a `##` or `###` heading:
  `<!-- audience: technical -->`
  Use it for §9 Routines, method signature lists, and line-range inventories. `<!-- audience: functional -->` marks the opposite case and is shown in both views.

Do not mark business content as technical to shorten the Functional view. Only ABAP mechanics (events, FORMs, methods, line numbers, internal tables) qualify.

## Do not

- Do not add HTML layout (`<div>`, inline styles, custom classes other than `tech`). The page styles itself.
- Do not repeat the title or fact list further down. The cover is built from them once.
- Do not use a table only to lay out text. Tables become sortable and filterable, and their first SAP-name column becomes a glossary.
