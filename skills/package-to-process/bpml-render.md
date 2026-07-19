# package-to-process — BPML Render Contract

Referenced by `SKILL.md` / `workflow.md` (Step 6b). Defines how the BPML
(Business Process Master List) deliverable is assembled and rendered.

## Builder

`scripts/spec/build-bpml.mjs` — zero-dep OOXML/Markdown builder. CLI:

```
node scripts/spec/build-bpml.mjs <bpml.json> <out.xlsx>   # styled workbook
node scripts/spec/build-bpml.mjs <bpml.json> <out.md>     # same data as Markdown
```

Output format is chosen by the user in Step 1 (`xlsx` / `md` / `both`).
`both` = run the CLI twice, once per extension.

## Output paths

```
.sc4sap/processes/<MODULE>/<PACKAGE>/bpml-<YYYYMMDD>-<lang>.xlsx
.sc4sap/processes/<MODULE>/<PACKAGE>/bpml-<YYYYMMDD>-<lang>.md
```

Spec JSON (intermediate, kept for regeneration):
`.sc4sap/processes/<MODULE>/<PACKAGE>/_img/bpml-<YYYYMMDD>-<lang>.json`

## Language rules

- `meta.language` = the language selected in Step 1 (ISO 639-1).
- Builder has built-in dictionaries **ko / en / ja**; any other code falls
  back to **en**. For a language outside ko/en/ja, pass localized strings via
  `meta.labels` (`{overviewSheet?, title?, headers?{}, ov?{}}`) — the analyst
  supplies these when assembling the JSON.
- Sheet 1 name is localized (개요 / Overview / 概要). **Sheet 2 is ALWAYS
  named `BPML`** (English, lingua franca) — never localize it.
- Row content (`l1..l5`, `task_desc`, `io`, …) must be written in the selected
  language by the analyst — the builder localizes labels only, never data.

## BPML JSON contract

```jsonc
{
  "meta": {
    "package": "ZMM_PAEK4", "module": "MM",
    "sap_version": "…", "abap_release": "…",
    "industry": "…", "country": "…",
    "active_modules": ["MM", "FI"],
    "generated_at": "YYYY-MM-DD HH:mm", "language": "ko",
    "entry_points": [{ "program", "tcode", "short", "persona" }],
    "wricef_legend": { "R": "Report", "…": "…" }
    // "labels": { … }   ← only for languages outside ko/en/ja
  },
  "rows": [
    // STAIRCASE: every level gets its OWN row, in document order
    { "lv": 1, "code": "1",     "l1": "구매관리",          "task_desc": "…" },
    { "lv": 2, "code": "1.1",   "l2": "구매요청(PR) 관리", "task_desc": "…" },
    { "lv": 3, "code": "1.1.1", "l3": "…", "task_desc": "…" },
    { "lv": 4, "code": "1.1.1.1", "l4": "…", "task_desc": "…" },
    // leaf (lv 5) carries program attributes:
    { "lv": 5, "code": "1.1.1.1.1", "l5": "…",
      "program": "…", "tcode": "…", "std_cbo": "표준|CBO",
      "task_desc": "…", "io": "입력: … / 출력: …", "wricef": "R",
      "dept": "…(추정)", "legacy": "…(확인필요)", "note": "-" }
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
  (+`elselbl`) frames for the business branches (반려/예외/오버라이드) and
  `loop` for recurring checks. L5 `seq`: that program's runtime scenario
  (담당자 → 프로그램 → 테이블 → dashed return of the ALV/output).
- Keep SAP identifiers literal (`ZMMR00010`, `EBAN`); all prose in `lang`.
- Derive from Step 5 narratives + `task_desc`/`io` — same source of truth as
  the process document. Builder auto-derive (linear flowchart) is a
  LAST-RESORT fallback for rows the analyst genuinely cannot flesh out; a
  document full of skeletal diagrams is a defect, not an output.

md mode extras (builder-automatic — nothing to assemble):

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
- The BPML sheet's **L1 label cell hyperlinks to its group sheet's A1** (blue
  underline, group fill kept); each flow sheet has an `↑ BPML` back-link.
- PNGs rasterize via headless Edge/Chrome, cached in `_img/bpml-png-<lang>/`
  keyed by SVG content — rebuilds reuse unchanged diagrams; if the builder
  reports `failed > 0`, rerun the same command (only failures retry). With no
  headless browser the workbook falls back to the legacy 2-sheet layout (no
  dead links). `--no-images` forces that fallback.

Hard rules:

- **NEVER supply `proc_id`** — the builder auto-numbers L5 rows as
  `[meta.module]-001, -002, …` in document order.
- Rows derive from Steps 3–5 state: L1 groups = Step 4 process groups,
  L5 leaves = entry-point programs + their sub-flows from Step 5 narratives.
- Values not extractable from ABAP (dept, legacy) are marked `(추정)` /
  `(확인필요)` (or the language's equivalent: `(estimated)`/`(TBD)`,
  `(推定)`/`(要確認)`) — warn markers auto-highlight yellow (xlsx) / `⚠` (md).
- No row data from `GetTableContents`/`GetSqlQuery` — ever (same as the
  process document).

## Style (informative — encoded in the builder, do not restate elsewhere)

Shading L1·L2 only (5 color families cycling per L1 group), flat row height
16, dark title banner on the overview sheet, AutoFilter + frozen header on
BPML, auto-fit column widths with per-column caps. Style changes go in the
builder ONLY — this file and the builder are the single source of truth.
