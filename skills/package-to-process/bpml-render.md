# package-to-process — BPML Render Contract

Referenced by `SKILL.md` / `workflow-render.md` (Step 6 + 6b) / `dispatch-writer.md`. Defines how the BPML
(Business Process Master List) deliverable is assembled and rendered.

**Who does what** (single source of truth): the **6b `sap-writer`** (Sonnet,
dispatched in parallel with the process-document writer) authors the spec JSON
from the `_state/` files; the **main thread** only runs the builder once per
format and relays its one-line result. The analyst does not author BPML.

## Builder

`<PLUGIN_ROOT>/scripts/spec/build-bpml.mjs` — zero-dep OOXML/Markdown builder. CLI:

```
node "<PLUGIN_ROOT>/scripts/spec/build-bpml.mjs" <bpml.json> <out.xlsx>   # styled workbook
node "<PLUGIN_ROOT>/scripts/spec/build-bpml.mjs" <bpml.json> <out.md>     # same data as Markdown
node "<PLUGIN_ROOT>/scripts/spec/build-bpml.mjs" <bpml.json> <out.html>   # md content as one self-contained page
```

Output formats are chosen by the user in Step 1 (multi-select: `md` /
`html` / `xlsx`). Run the CLI once per selected format — the extension picks
the mode. HTML mode builds the md content in memory (no `.md` is left behind
unless `md` was also selected), inlines the flow SVGs, and uses
`<PLUGIN_ROOT>/scripts/spec/md-to-html.mjs` for the page.

## Output paths

`<PROC_DIR>` = `<ARTIFACT_BASE>/processes/<MODULE>/<PACKAGE>` (absolute — see `paths-and-state.md`).

```
<PROC_DIR>/bpml-<YYYYMMDD>-<lang>.xlsx
<PROC_DIR>/bpml-<YYYYMMDD>-<lang>.md
<PROC_DIR>/bpml-<YYYYMMDD>-<lang>.html
```

Spec JSON (intermediate, kept for regeneration):
`<PROC_DIR>/_img/bpml-<YYYYMMDD>-<lang>.json`

## Language rules

- `meta.language` = the language selected in Step 1 — always `ko`, `en` or
  `ja` (the skill accepts no other language). The builder's built-in
  dictionaries cover exactly these three; `meta.labels` overrides exist in the
  builder for other callers and are not used by this skill.
- Sheet 1 name is localized by the builder. **Sheet 2 is ALWAYS named `BPML`**
  (English, lingua franca) — never localize it.
- Row content (`l1..l5`, `task_desc`, `io`, …) must be written in the selected
  language by the 6b writer — the builder localizes labels only, never data.

## BPML JSON contract

```jsonc
{
  "meta": {
    "package": "ZMM_PAEK4", "module": "MM",
    "sap_version": "…", "abap_release": "…",
    "industry": "…", "country": "…",
    "active_modules": ["MM", "FI"],
    "generated_at": "YYYY-MM-DD HH:mm", "language": "en",
    "entry_points": [{ "program", "tcode", "short", "persona" }],
    "wricef_legend": { "R": "Report", "…": "…" }
  },
  "rows": [
    // STAIRCASE: every level gets its OWN row, in document order
    { "lv": 1, "code": "1",     "l1": "Purchasing",                 "task_desc": "…" },
    { "lv": 2, "code": "1.1",   "l2": "Purchase requisition (PR)",  "task_desc": "…" },
    { "lv": 3, "code": "1.1.1", "l3": "…", "task_desc": "…" },
    { "lv": 4, "code": "1.1.1.1", "l4": "…", "task_desc": "…" },
    // leaf (lv 5) carries program attributes:
    { "lv": 5, "code": "1.1.1.1.1", "l5": "…",
      "program": "…", "tcode": "…", "std_cbo": "Standard|CBO (in <lang>)",
      "task_desc": "…", "io": "Input: … / Output: …", "wricef": "R",
      "dept": "… <estimated marker>", "legacy": "… <TBD marker>", "note": "-" }
  ]
}
```

Per-row fields for md mode (`desc` optional, `seq` REQUIRED for L2–L5):

- `desc` — longer prose for the row's detail section (fallback: `task_desc`).
- `seq` — **the default diagram, REQUIRED**: v13 horizontal scenario sequence
  diagram, SAME style as the process document images.
  `{actors:[{id,label,kind:'actor'|'participant'}], items:[...]}` — items:
  `{m:[from,to], t:'text'}` sync call · `{m,t,r:true}` dashed return ·
  `{note, over:[ids]}` · `{alt|opt|loop:'label'}` + `{elselbl}` + `{end:true}`
  frames. `kind:'actor'` = humans/depts, `'participant'` = TCode/program/
  table/interface.
- `flow` — optional v12 vertical branching flowchart
  (`{nodes:[{id,type,label,lane?}], edges:[{from,to,label?}]}`) — used only
  when `seq` is absent.

**Diagram quality bar (the whole point of the deliverable):**

- **Scenario, not skeleton.** Every L2–L4 `seq`: 4–9 actors (real departments
  from `dept` + narrative as `kind:'actor'`; programs/tables as
  `'participant'`), 8–16 items covering the real hand-offs, with `alt`/`opt`
  (+`elselbl`) frames for the business branches (rejection / exception /
  override) and `loop` for recurring checks. L5 `seq`: that program's runtime
  scenario (person in charge → program → table → dashed return of the
  ALV/output).
- Keep SAP identifiers literal (`ZMMR00010`, `EBAN`); all prose in `lang`.
- Derive from the Step 5 narratives (`_state/step5.part-*.json`, listed in
  `step5.json`) + `task_desc`/`io` — same source of truth as the process
  document. Builder auto-derive (linear flowchart) is a LAST-RESORT fallback
  for rows the 6b writer genuinely cannot flesh out; a
  document full of skeletal diagrams is a defect, not an output.

md / html mode extras (builder-automatic — nothing to assemble; html carries the same sections with the SVGs inlined):

- After the BPML table, EVERY L2–L5 row gets a detail section: `[L<n>] <code>
  <label>` heading + description + business-process-flow **SVG** saved under
  `_img/bpml-flows-<lang>/`. L1 rows are excluded.
- Process-code cells in the table hyperlink to their section anchors; each
  section links back to the table.

xlsx mode extras (builder-automatic — nothing to assemble):

- **One process-flow sheet per L1 group** (sheets 3+, named `<seg>. <L1
  label>`): every L2–L5 row of the group gets a heading band (`[L<n>] <code>
  <label>`, L5 adds proc_id · program · tcode) with its diagram **PNG**
  embedded below (same seq→flow→auto pick order as md mode).
- **NO hyperlinks in the workbook** (user decision 2026-07-19: link behavior
  varies per viewer/Excel license — navigation is by sheet tab). Do not
  re-add intra-book links.
- PNGs rasterize via headless Edge/Chrome, cached in `_img/bpml-png-<lang>/`
  keyed by SVG content — rebuilds reuse unchanged diagrams; if the builder
  reports `failed > 0`, rerun the same command (only failures retry). With no
  headless browser the workbook falls back to the legacy 2-sheet layout.
  `--no-images` forces that fallback.

Hard rules:

- **NEVER supply `proc_id`** — the builder auto-numbers L5 rows as
  `[meta.module]-001, -002, …` in document order.
- Rows derive from the `_state/` files: L1 groups = `step4.json` processes
  (narrated only — skip `step5.json → failed_processes`), L5 leaves =
  entry-point programs (`entry_points.json`) + their sub-flows from the Step 5
  narratives.
- Values not extractable from ABAP (dept, legacy) carry the language's markers
  — exact builder tokens: en `(estimated)` / `(TBD)`, ko `(추정)` / `(확인필요)`,
  ja `(推定)` / `(要確認)`. The TBD-type token auto-highlights yellow (xlsx) /
  `⚠` (md).
- No row data from `GetTableContents`/`GetSqlQuery` — ever (same as the
  process document).

## Style (informative — encoded in the builder, do not restate elsewhere)

Shading L1·L2 only (5 color families cycling per L1 group), flat row height
16, dark title banner on the overview sheet, AutoFilter + frozen header on
BPML, auto-fit column widths with per-column caps. Style changes go in the
builder ONLY — this file and the builder are the single source of truth.
