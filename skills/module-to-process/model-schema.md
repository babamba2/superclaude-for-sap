# module-to-process — `process-model.json`

Written by `scripts/process/assemble-model.mjs` (Step 7) from the state files, read by `scripts/process/build-process-doc.mjs` (checks in `scripts/process/process-model.mjs` → `checkModel`). One language per model (`lang`); SAP identifiers literal. Invented example values only in this file.

## Shape

```json
{
  "schema": 1,
  "module": "MM", "modules": ["MM"], "lang": "en",
  "title": "MM Process Map", "system": "DEV", "sapVersion": "ECC",
  "author": "", "changeNote": "First version",
  "scope": {
    "packages": [{ "name": "ZXX_MM_A", "desc": "…", "tcodes": 120, "used": 48 }],
    "tcodes": ["ZXX01"],
    "systems": [{ "id": "sap", "kind": "sap", "label": "SAP" }, { "id": "wms", "kind": "external", "label": "WMS" }]
  },
  "lanes": [{ "id": "buyer", "label": "Buyer", "estimated": true }],
  "overview": { "summary": "…", "scopeNote": "48 of 120 TCodes used in the last 3 months on PRD", "handoffs": [{ "from": "ZXX_MM_A", "to": "ZXX_MM_B", "via": "ZXX_LOG", "count": 2 }] },
  "rows": [
    { "code": "1", "level": 1, "label": "…" },
    { "code": "1.2", "level": 2, "label": "…", "desc": "…" },
    { "code": "1.2.3", "level": 3, "label": "…", "desc": "…" },
    { "code": "1.2.3.1", "level": 4, "label": "…", "backbone": "MM.2.3.1",
      "system": "sap", "kind": "cbo", "tcodes": ["ME21N", "ZXX01"], "objects": ["ZXX_PO_UPLOAD"],
      "owner": "buyer", "ownerEstimated": true, "usage": "used", "remark": "",
      "variants": [{ "id": "a", "label": "…", "kind": "cbo", "objects": ["…"], "tcodes": [], "system": "sap", "usage": "used", "desc": "…" }],
      "task": { "…": "see Task sheet" } }
  ],
  "crossModule": [{ "from": "MM", "to": "FI", "object": "BAPI_ACC_DOCUMENT_POST", "desc": "…" }],
  "notEvidenced": [{ "backbone": "MM.2.4.2", "label": "…", "reason": "…" }],
  "openQuestions": ["…"],
  "glossary": [{ "term": "…", "description": "…" }]
}
```

`reconcile` (optional, from `assemble-model.mjs --bph`) = `{source, sheet, matched: [{code, label, bph, bphLabel, score}], bphOnly: [{bph, bphLabel, system}], modelOnly: [{code, label, kind}]}` — label-similarity proposals, to be confirmed.

`notEvidenced` = standard L3 processes of the backbone dropped because nothing in the system shows them (Step 4 `not_evidenced`) — listed in the appendix so the consultant can confirm they are really unused.

## Rows (BPH)

- Flat list in **document order**; a parent row comes before its children. `code` = dot segments (`1`, `1.2`, `1.2.3`, `1.2.3.1`); `level` = number of segments (1–4). Numbering is the document's own, never copied from a customer BPH.
- L1 = mega process, L2 = process chain, L3 = process, L4 = task. Only L4 rows carry `system`, `kind`, `owner`, `usage`, `variants`, `task`; L1–L3 rows have `label` and optional `desc`.
- `backbone` = the `configs/<M>/process-backbone.json` id the task came from; absent for a task that exists only in CBO.
- `kind`: `std` (standard TCode, no CBO in the flow) · `cbo` (a Z program carries it) · `enh` (standard TCode with a customer exit / BAdI / implicit enhancement) · `manual` (outside any system) · `ext` (a non-SAP system carries it).
- `system` = an id of `scope.systems`; `owner` = an id of `lanes`. `ownerEstimated: true` when inferred (shown `(estimated)`); no owner at all → the page shows `To be confirmed`.
- `usage`: `used` / `unused` / `unknown` — from the packages' `usage-result.json` (`direct` or `indirect` → used; `unused` → unused; else unknown). Std-only tasks: `unknown` unless the standard TCode appears in the usage list.
- `variants[]` — the same task done differently per org unit, document type or scenario (`id` = one lowercase letter or short slug, appended to the code in the table: `1.2.3.1a`). Only when the source shows a real branch (CASE / IF on `BUKRS`, `VKORG`, `WERKS`, `AUART`, `BSART`, `LFART`, `FKART`, a constant table, or separate programs per org unit).

## Task sheet (`rows[].task`, L4 only)

```json
{
  "definition": "…", "output": "Purchase order number", "timing": "Daily batch 06:00",
  "rules": [{ "text": "…", "source": { "object": "ZXX_PO_UPLOAD", "unit": "ZXX_PO_UPLOAD_F01", "line": 120 } },
            { "text": "…", "estimated": true }],
  "steps": [{ "name": "…", "where": "ZXX_PO_UPLOAD", "method": "…", "timing": "…", "owner": "buyer", "system": "sap" }],
  "flow": { "nodes": [{ "id": "S", "type": "start", "label": "…" }, { "id": "P", "type": "process", "label": "…", "where": "ME21N" }], "edges": [{ "from": "S", "to": "P", "label": "" }] },
  "objects": [{ "name": "ZXX_PO_UPLOAD", "usage": "used", "desc": "…" }, { "name": "BAPI_PO_CREATE1" }],
  "exits": ["MM06E005"],
  "interfaces": [{ "system": "wms", "direction": "out", "object": "ZXX_IF_PO", "desc": "…" }],
  "links": ["1.3.1.1", { "code": "1.4.1.1", "note": "…" }],
  "conversion": ["…"],
  "tbd": ["…"]
}
```

- `rules[]` — each rule cites `source` (object, unit = include / FM, line) or carries `estimated: true`. Never a rule without either.
- `steps[]` — 2–8 steps; `owner` / `system` reference `lanes` / `scope.systems`. `name` says the business action in the reader's words ("Release the purchase order"), never a bare FM / table / job name; `where` names where it runs — TCode, program, RFC FM (with the calling system), batch job or external system screen — and is shown on the step box; `method` adds how (BDC, BAPI, file upload, proxy) in one short phrase. A step done by **several programs / TCodes** never lists them in `where`: it carries `alts: [{ when, where, label, method? }]` — one entry per program, `when` = the business case that picks it (org unit, document type, upload vs screen, display vs change …, read from the source), `where` = that one program, `label` = what it does in that case. `action` (steps, `alts`, process / io flow nodes) says what the user does in that program to make it happen — "Execute (F8)", "'Create PO' button (function code CRPO)", "select rows in the ALV, then 'Save'", "runs as batch job (P_BATCH)", "automatic on save (user exit)" — read from `sy-ucomm` / OK-code `CASE`, ALV toolbar handlers and the GUI status texts. The step box then reads "N programs ▸" and links to a case figure (step → condition on each arrow → program box).
- `flow` — optional decision flow, node types `start` / `end` / `process` / `decision` / `io`; ≤ 12 nodes. Node `label` is business wording ("Save the price condition", "Credit limit exceeded?"), never only an object name such as `BAPI_…` or `ZXXT… 저장`; the optional `where` (TCode / program / RFC FM / job) is drawn as the second line of the box. Drawn by the flowchart renderer.
- `objects[]` — Std TCodes stay in the row's `tcodes`; this list holds programs, FMs, BAPIs, classes with their usage.
- `interfaces[]` — `direction` `in` / `out` / `both`; `system` an id of `scope.systems` (add the system there first).
- `conversion[]` — S/4HANA conversion notes for this task (from `common/sap-version-reference.md` and the backbone `s4` notes); ECC→S/4 only, empty when nothing changes.
- `tbd[]` — what the consultant must confirm.

## Checks (`checkModel`)

Errors stop the build: missing `module` / rows, duplicate code, `level` ≠ segments, parent after child, missing label, unknown `kind` / `usage` / `system` / `owner`, step owner / system unknown, unknown system kind. Warnings: L4 without `kind` or task, rule without source and not estimated, link to an unknown row, task on a non-L4 row. Run `node "<PLUGIN_ROOT>/scripts/process/build-process-doc.mjs" <model> --check`.
