# Program → Spec — Templates

Referenced by `SKILL.md`. Use these templates in Step 4 (Render).

## Markdown — L2 Standard Spec skeleton

```markdown
# Specification: {OBJECT_NAME}

- **Type**: {Report | Class | FM | CDS | RAP BO}
- **Package**: {PKG} · **Transport (original)**: {TR}
- **Author / Changed**: {user} / {date}
- **Archetype**: {ALV report | Batch | BDC | ...}
- **Purpose (1–2 sentences)**: ...

## 1. Business Context
## 2. Data Model
| Table / CDS | Access | Key Fields | Notes |
## 3. Inputs & Screens
## 4. Main Logic (step-by-step)
## 5. Outputs
## 6. Authorizations
## 7. Exceptions & Messages
## 8. Dependencies (BAPIs, RFCs, enhancements)

### 8.1 Parameters
| Field | Type | Required | Default | Description |

(Report → `PARAMETERS` / `SELECT-OPTIONS` · FM/Class → `IMPORTING` · CDS → view params · RAP → action inputs.
 Always rendered, even when the object has no UI screens.)
### 8.2 Selection-Screen (only if screens exist) — ASCII wireframe in fenced block
### 8.3 Output — ALV / Dynpro 0100 (only if ALV/Dynpro output exists) — ASCII wireframe
### 8.4 Screen-flow (only if multi-screen) — Mermaid `flowchart LR`
## 9. Open Questions / Assumptions
```

## Excel — Template-clone (양식 보존) workflow

The Excel output is produced by cloning `asset/template_base.xlsx` byte-for-byte and swapping only `xl/sharedStrings.xml`. The clone helper is `scripts/spec/template-clone.mjs`. The sap-writer's deliverable is therefore a **TR (translation) map**, not a styled workbook.

### TR map schema

```jsonc
{
  "Program Overview (ZMMTEST003)": "프로그램 개요 (ZMMR1001)",
  "ZMMRTEST003":                   "ZMMR1001",
  "Object Type":                   "오브젝트 타입",
  "PROG/P (ABAP Report)":          "PROG/P (ABAP Report)",
  // … one entry per English source string in the template …
}
```

Flat object · key = English source string from `asset/template_base.xlsx` sharedStrings.xml · value = target-language replacement for THIS program. Persist to `.sc4sap/specs/_tr/{OBJECT}-{YYYYMMDD}.tr.json` (UTF-8, pretty-printed).

### Sheet layout (fixed by template_base — clone never reorders)

| # | Sheet (KO display) | Columns / rows in template |
|---|---|---|
| 1 | 프로그램 개요 | Field / Value (17 metadata rows) |
| 2 | 데이터 모델 | Table / Access / Key Fields / Join Type / Notes — 4 table slots + CDS / BAPI / BAdI trailer rows |
| 3 | 입력 및 화면 | Parameters (5 slots) · 5 ⚠ warning rows · 2 image anchors (C4 = Selection mockup, C19 = ALV mockup) |
| 4 | 처리 로직 | # / Event / Step — 12 step slots + `Process Flow Chart` heading |
| 5 | 출력 | Order / Field / Field Description / Length / Edit / Hidden — 10 column slots |
| 6 | 권한 | Check / Auth Object / Level / Implemented? / Notes — 5 rows |
| 7 | 예외 처리 | Trigger / Mechanism / Message / Recovery — 3 rows |

### Slot semantics

When the target program has fewer items than the template's fixed slot count, **fill unused slots with placeholders** so row counts (and therefore borders, fills, styles) stay identical:

| Section | Template count | Placeholder convention |
|---|---|---|
| Sheet 3 Parameters | 5 (S_VKORG..S_VBELN) | `— (해당 없음)` for the field name, `—` for type/required/default, short note in the description |
| Sheet 3 Warnings | 5 ⚠ rows | Use real findings; if fewer than 5, repeat the most important caveat or summarise into 5 buckets |
| Sheet 4 Steps | 12 numbered rows | **business-first** Step text (see § Business-process narrative); `Event / FORM` column carries the technical anchor |
| Sheet 5 Output columns | 10 ALV column rows | `— (해당 없음)` for unused field, `—` for length |
| Sheet 6 Auth | 5 rows | Use real auth objects + GAP rows; rewire the 양식 row labels semantically when needed (e.g. `Sales Org row-level` → `플랜트 단위`) |
| Sheet 7 Exceptions | 3 rows | Combine if target has only 2; split if it has 4+ — keep the 3-row template count |

### Business-process narrative (Sheet 4 처리 로직 + Process Flow PNG)

The reader of the spec is a **functional consultant**, not the original developer. The "처리 로직" sheet and the Process Flow chart must read like the md / `package-to-process` output: *what business step happens and why*, with the technical mechanism kept as a secondary annotation — **business-first + technical-annotated**.

- **`Event / FORM` column** = the technical anchor only (`INITIALIZATION`, `START-OF-SELECTION`, `FORM get_data`, `lcl_handler~on_link_click`). Keep it short.
- **`Step` column** = the business-process sentence FIRST, then the technical mechanism in a trailing clause / parentheses. Lead with the business intent, not the ABAP verb.
  - ❌ dev-only: `Single SELECT with 4-way JOIN: VBAK INNER VBAP · LEFT KNA1 · LEFT MAKT, INTO @gt_result.`
  - ✅ business-first: `판매오더 헤더·품목과 고객·자재 정보를 한 번에 조회한다 (VBAK×VBAP INNER + KNA1·MAKT LEFT JOIN → gt_result).`
- **`processFlow[]`** (the PNG boxes) = **business steps only**, short phrases that fit a 150–220 px box. Use the end-to-end business arc, NOT the ABAP event list.
  - ❌ `["INITIALIZATION", "START-OF-SELECTION", "FORM get_data", "FORM display_alv", "on_link_click"]`
  - ✅ `["!시작", "조회 조건 입력", "판매오더 데이터 조회", "고객·자재 정보 결합", "ALV 결과 표시", "? 오더 클릭?", "VA03 상세 이동", "!종료"]`
  - The box label is business; the technical detail for that step lives in the matching Sheet 4 Step row, not in the box.

This split keeps the document useful to both audiences without burying the business flow under ABAP minutiae.

### Language consistency (single-language output — no 한/영 혼용)

Every writer-produced string MUST be in the target `lang`. Mixing is the #1 reported defect.

- **Translate ALL prose** — sheet titles, field labels, value text, warnings, step text, ALV headers, pane titles/captions, processFlow boxes. The template ships in **English**, so a `ko`/`ja` spec needs a TR entry for *every* English prose string (the `template-clone` "NO TRANSLATION" list is your checklist — only bare SAP identifiers may remain).
- **Keep as-is (do NOT translate)** — SAP identifiers (`VBAK`, `S_VKORG`, `ZMMR00140`, `VA03`), ABAP keywords/snippets, and ABAP message literals already written in the program (e.g. `"조회된 데이터가 없습니다."`).
- **image-spec content** follows the same rule: `selection.fields[].label/note`, `alv.columns[].header`, `processFlow[]`, pane `title`/`interaction` must all be in `lang`; only `name` (identifiers) and `sampleRows` data codes stay literal. Set `image-spec.json.lang` correctly — the renderer localizes its built-in legend / block labels / flow heading from it.
- **Gate**: `build-spec.mjs` prints `⚠ LANGUAGE MIX detected` listing every leaked English string (TR + image-spec) when `lang` is `ko`/`ja`. A clean run prints `language check OK`. **Do not finalize until the report is clean** (or every remaining item is a genuine SAP identifier). Also add `"__lang": "<lang>"` to the TR map so text-only builds can run the check too.

### SAP identifier remapping

Identifiers in the template (`ZMMRTEST003`, `VBAK`, `VBELN`, `S_VKORG`, etc.) MUST appear as TR keys mapping to the target program's identifiers when they differ (`ZMMR1001`, `MARA`, `MATNR`, `P_WERKS`). Identifiers absent from TR remain in the cloned file unchanged — that's the desired behaviour when the target shares the identifier with the template.

### Quality gates (before declaring done)

1. `node scripts/spec/template-clone.mjs <tr-json> <out-xlsx>` exits 0.
2. Stdout shows `NO TRANSLATION:` for ONLY the SAP standard identifiers the target program genuinely reuses (table names, field names common to both specs). Any prose / label / sheet-title / warning string missing from TR is a bug — patch and re-run.
3. `unzip -l <out-xlsx>` lists 32 entries identical to `asset/template_base.xlsx` (same names, similar sizes — only `xl/sharedStrings.xml` size differs).
4. Output file ≈ 90 KB.
5. Open in Excel — every sheet renders with identical geometry to `asset/template_base.xlsx`.

## Image Replacement (always-on — part of the default pipeline)

Every Excel spec now ships with program-specific imagery on Sheet 3 (Selection + ALV mockups) and Sheet 4 (horizontal Process Flow chart). The image pipeline runs from a single `image-spec.json` produced by sap-writer and consumed by `scripts/spec/build-spec.mjs`. No trigger keywords required — image rendering is part of every Excel build.

| Slot | xlsx path | Sheet | Anchor | Ext | Source |
|---|---|---|---|---|---|
| `selection`  | `xl/media/image2.png` | 3 (입력 및 화면) | C4  | PNG IHDR × 9525 (dynamic) | `image-spec.json.selection` |
| `alv`        | `xl/media/image1.png` | 3 (입력 및 화면) | C19 | PNG IHDR × 9525 (dynamic) | `image-spec.json.alv` |
| `processFlow`| `xl/media/image3.png` | 4 (처리 로직)    | B19 | PNG IHDR × 9525 (dynamic) | `image-spec.json.processFlow` |

`drawing3.xml` ext values are surgically updated by image name. `drawing4.xml` is injected on demand from a blank template container (each program has a different flow). Geometry (column widths / row heights / styles) stays bound to `template_base.xlsx` — image swap only touches drawing extents + PNG bytes, so the historic drift problem cannot reappear.

### Single entry point (recommended)

```bash
node scripts/spec/build-spec.mjs <tr.json> <image-spec.json> <out.xlsx>
```

Wraps clone + render + swap in one call. Pass `-` for the image-spec argument to skip image rendering entirely (text-only spec with template mockups).

### Image-swap CLI (when you already have PNGs on disk)

```bash
node scripts/spec/image-swap.mjs <out-xlsx> --selection <sel.png> --alv <alv.png> --process-flow <pf.png>
```

- `--selection`     → `xl/media/image2.png` (Sheet 3, C4)
- `--alv`           → `xl/media/image1.png` (Sheet 3, C19)
- `--process-flow`  → injects `xl/media/image3.png` + `drawing4.xml` oneCellAnchor + rels (Sheet 4, B19)
- Any flag may be omitted; omitted slots keep their template state.
- Positional form (`<xlsx> <sel.png> <alv.png> <pf.png>`, use `-` to skip) also accepted.

PNG signature is verified before any write; non-PNG input is rejected without touching the xlsx.

### image-spec.json schema (sap-writer's deliverable)

**Exact JSON shape** (mismatched keys silently render an empty grid — verify by inspecting PNG byte sizes: ~12 KB normal ALV vs ~1 KB empty grid):

```jsonc
{
  "lang": "ko",
  "selection": {
    "blockLabel": "조회 조건",
    "fields": [
      { "name": "P_BUKRS", "label": "회사코드",      "required": true },
      { "name": "P_WERKS", "label": "플랜트",        "required": true },
      { "name": "S_MATNR", "label": "자재번호 범위", "range": true, "note": "LOW~HIGH 입력" }
    ],
    "optionFields": []
  },
  "alv": {
    "columns": [
      { "name": "MATNR", "header": "자재",     "width": 140 },
      { "name": "MAKTX", "header": "자재설명", "width": 320 },
      { "name": "LBKUM", "header": "재고수량", "width": 130, "align": "end" },
      { "name": "MEINS", "header": "단위",     "width": 80 }
    ],
    "sampleRows": [
      { "MATNR": "HALB-001234", "MAKTX": "반제품 A (조립용)",   "LBKUM": "120.00", "MEINS": "EA" },
      { "MATNR": "ROH-005678",  "MAKTX": "원자재 B (강판)",     "LBKUM": "450.50", "MEINS": "KG" },
      { "MATNR": "FERT-009999", "MAKTX": "완제품 C (출하 대기)", "LBKUM": "78.00",  "MEINS": "EA" }
    ],
    "maxRows": 3
  },
  "processFlow": ["시작", "입력 검증", "? 자재 마스터 존재?", "BAPI 호출", "ALV 출력", "! 종료"]
}
```

**Field semantics**
- `selection.fields[].name` — identifier shown in parentheses next to the label
- `selection.fields[].required` — `true` adds the red `*` mark + legend entry
- `selection.fields[].range` — `true` renders SELECT-OPTIONS style (LOW input ~ HIGH input + dropdown)
- `alv.columns[].name` — **REQUIRED**; used as the lookup key for each `sampleRows[i][name]`. Schema mistake here is the most common cause of empty ALV PNGs.
- `alv.columns[].header` — display text (falls back to `name` if absent)
- `alv.columns[].align` — `'end'` (right-aligned, monospace for numerics) / `'left'` / default centre
- `alv.columns[].hotspot` — `true` renders the cell value as blue underlined text
- `alv.columns[].editable` — `true` renders a yellow input cell
- `alv.sampleRows[]` — **OBJECTS** keyed by `name` (NOT positional arrays). Special keys: `_status` (`'●'`/`'○'`/`'◉'`) for tri-state indicators, `_locked: true` to grey the row
- `processFlow` — TWO accepted shapes. **Prefer the graph form** so the xlsx 처리 흐름도 reads like the Markdown `flowchart TD` (decisions + 예/아니오 branches + exception side-paths + loop-backs):
  - **Branching graph (v12, recommended)**: `{ "nodes":[{ "id","type","label","lane?" }], "edges":[{ "from","to","label?" }] }`. `type` ∈ `start`·`end` (blue pill) / `process` (rounded box) / `decision` (amber diamond) / `io` (red message parallelogram — use for 오류/정보 메시지). `lane:"right"` puts a node in the exception column aligned to the decision that branches into it; its edge to a spine node above auto-routes as a loop-back, below as an exit. `\n` in a label forces a line break. Edge `label` 예/아니오 are colour-chipped. Rendered as a **vertical TD flowchart** with a shape legend.
  - **Linear array (legacy)**: `string[]` — prefix `?`=decision, `!`=terminal, none=process; rendered horizontal. Back-compat only.

**Graceful degrade** — if no headless browser is on PATH, `renderScreenImages` returns `null` per slot and `build-spec.mjs` keeps the template mockups for that slot. The xlsx still builds successfully.
