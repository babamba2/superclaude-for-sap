# Adobe forms — verification (metrics, gates, fixtures)

Shared by `adobe-preview`, `adobe-from-pdf` and `smartform-to-adobe`, and by the verifier who judges them.
Accuracy is a set of numbers measured against SAP's own print. A "pass" without the numbers is not a pass.

## 1. Ground truth

- The reference is the PDF that SAP itself renders, on a DEV system, with invented sample values:
  - Adobe forms: `RenderAdobeForm`, which calls the generated function module with PDF output, no dialog and no spool.
  - SmartForms: `RenderSmartForm`.
- **One sample-value file per form** feeds both the SAP render and our preview. Without the same values the comparison means nothing.
- Every side is read into the same layout JSON (the `scripts/smartform/read-pdf.mjs` format):
  - The SAP PDF is read with `read-pdf`.
  - Our preview HTML is printed to PDF by headless Chrome (A4, margin 0, backgrounds on), then read with `read-pdf`.
- A PDF that cannot be read is **not measurable**: no score, never 0. ADS PDFs (object streams, font subsets, XFA) may need the `read-pdf` extension first.

## 2. Metrics (`score-forms.mjs`, one vector — no total score)

| Metric | Definition | Preview (A) | Conversion (C) | PDF → form (B) |
|---|---|---|---|---|
| P1mm | share of reference texts matched by the same text with anchor error max(\|dx\|, \|dy\|) ≤ 1.0 mm (anchor = left x, baseline y) | ≥ 95 % | ≥ 90 % | ≥ 95 % (layout only) |
| P2mm | same, ≤ 2.0 mm | ≥ 99 % | ≥ 97 % | ≥ 99 % |
| FIELD | bound fields (context leaf / `&sym&`) whose sample value is found and matched in the reference | 100 % | 100 % | 100 % (after the shape step) |
| FIXED | fixed texts present with the same string (blanks normalized, NFC) | ≥ 99 % | ≥ 98 % | ≥ 99 % |
| PAGES | page count | equal | equal | equal |
| ROWBRK | per repeating table: rows per page and the row number at each break | 100 % | 100 % | 100 % where present |
| WRAP | multi-line texts broken at the same words | ≥ 95 % | ≥ 90 % | ≥ 95 % |
| FONT | matched texts with size ± 0.5 pt and the same weight | ≥ 98 % | ≥ 95 % | ≥ 98 % |
| RULE | lines / borders: same direction, position ≤ 0.5 mm, length ± 1 mm | ≥ 95 % | ≥ 90 % | ≥ 95 % |
| IMG | graphic areas with IoU ≥ 0.9 | 100 % | 100 % | 100 % |
| EXTRA | texts printed that the reference does not have (sample values excluded) | 0 | ≤ 2, each in the gap list | 0 |

- **Matching**:
  - Among candidates with the same normalized text, the nearest wins (Hungarian or greedy nearest; each candidate used once).
  - A text that occurs more than once is matched by page and order as well.
- **Anchor**: left edge and baseline. Right edges are not compared, because ADS and the browser have different font metrics. Line breaks are checked by WRAP instead.
- **Output per page and per metric**: the number and a failure list (element, expected position, actual position, error in mm). The report always contains the numbers.

## 2a. Fidelity score (`scripts/forms-common/score-fidelity.mjs`, one number per form)

The single user-facing number for SmartForm and Adobe previews and for SF → Adobe conversions. Target: **corpus average ≥ 98 %**. The §2 vector stays as the diagnosis.

- **Text**: a reference text block (pieces on one baseline that touch) matches when the candidate prints the same text on the same page with left x and baseline within 1 mm.
  - A block split or joined differently on the other side still matches when the pieces are neighbours: at most 3 mm apart (`--join-gap`), plus the blanks the block itself prints there, and the last piece ends where the block ends (±1 mm) or — only for a piece whose width read-pdf estimated (its PDF font has no width table: `wEst`) — starts where the block's average character width puts it (±1 mm). Known limits: the end check needs the block width (a PDF always has it; a hand-made JSON without `w` gets only the gap limit), and in a join of three or more pieces the middle pieces are only gap-limited.
  - text = matched / (reference blocks + extra candidate blocks).
  - A block found farther away is listed as *moved* (dx / dy) and counts once.
- **Lines**: drawn lines, stroked box edges and thin filled bars (white bars and barcodes excluded). Pieces of one visual line merge: parallel within 0.3 mm, gaps up to the tolerance. A line matches when direction, position and both ends are within 1 mm. lines = matched / (reference + extra).
- **Pages**: min / max of the page counts.
- score = 0.80 text + 0.15 lines + 0.05 pages, reported with the text-only score next to it. Weights and tolerance are options; reports use the defaults.
- **A different page count fails the form** (`pagesMismatch`) whatever its score; the score is still computed.
- A reference without text is **not measurable** and is not averaged.
- Candidates:
  - a PDF, or the `layout.json` that `build-preview.mjs --layout-json` (SmartForm) and `build-adobe-preview.mjs --layout-json` (Adobe) write from the page as the browser prints it
  - a converted form: its SAP PDF
- Corpus: `score-fidelity.mjs corpus <list.json>` → per-form score, average, pass.

## 3. Conversion fidelity (C)

1. **Print**: the SmartForm's SAP print vs the converted Adobe form's SAP print (P2), or vs the predicted preview (P1). Same sample values, column C of §2.
2. **Mapping completeness**: every node of `sf-inventory` is mapped or in the gap list (reason + manual step). **Silently missing nodes: 0.** The report has a per-kind table: mapped n / gap n.
3. **Interface and context**:
   - every SmartForm import / tables parameter is in the Adobe interface
   - every printed field is bound in the context (100 %)
4. **SAP rule fidelity**: the plan follows `CL_SSF_MIGRATION` ([`skills/smartform-to-adobe/mapping.md`](../skills/smartform-to-adobe/mapping.md)).
   - Rules that differ from SAP: 0, or each one listed with its reason.
   - In P2, the created form (read back with `FP_CONTENT`) and the BAL log are compared with the plan node by node.

## 4. Fixtures

- **Only existing forms, read-only, never changed.** Our own test forms are not approved.
  - Adobe: SAP's test / example forms (package SFPT).
  - SmartForms: SAP's examples (package SMART).
- A missing form is replaced by the next one of the same kind, and the replacement is recorded.
- A corpus entry must be a **form**: a text module (FORMTYPE T) is not one.
- The sample values for each form are invented. If the interface uses the flight example types, the values are still invented and no table is read.
- **Goldens** (SAP's prints of SAP forms, their layout JSON) are SAP content:
  - they never go into the public repository
  - they live in the private repository or a git-ignored local test-data folder, with SID, release, date and SHA-256 recorded
- Public CI runs only **self-written synthetic fixtures** (XML / XDP written by us, fictitious names, no SAP content): renderer and rule unit tests.
- Golden comparisons run in private / local CI.
- Goldens are refreshed only with `score-forms.mjs --refresh-golden`, with the user's approval and a verifier record.

## 5. Independent verdict

- The builder never judges its own result.
  - Form numbers: verifier-2, who runs every step on the DEV system from a clean folder.
  - Web parts: verifier.
- Verdict report per step:
  - the §2 table per fixture (numbers)
  - the top 20 failing elements
  - the commands run, input / output SHA-256, tool versions, SID / release
  - an MCP log summary: write calls 0 (or the approved writes listed), business table reads 0, renders on DEV only
- A threshold missed → the failure list goes back to the builder. The next verdict uses the same procedure.

## 6. Never (checked automatically)

1. Writes on a system that is not DEV (MCP refuses, the skill checks first, the verifier reads the MCP log).
2. Changes to SAP standard forms, interfaces or styles. Write tools refuse names outside Z / Y / customer namespace. A form is overwritten only if this skill created it (creation record).
3. **Migration onto an existing name**: `MIGRATE` deletes and recreates an existing target. The write helper refuses existing names and always passes both target names.
4. Business data reads (`GetTableContents` / `GetSqlQuery` on business tables).
5. Customer names, system IDs or customer Z names in public files (skill MDs, fixtures, CHANGELOG) — string check.
6. Spool or printer output: render helpers return PDF only.
