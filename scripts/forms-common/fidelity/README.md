# Form fidelity harness

Scores sc4sap's form previews (SmartForm, Adobe) and the SmartForm → Adobe conversion against SAP's own prints with
`../score-fidelity.mjs`: text (0.80), lines (0.15), pages (0.05). Text matches within ±1 mm on the same page. A page-count
mismatch fails the form's page part.

The scripts make no SAP call. The operator renders SAP's prints beforehand on a DEV system (`RenderSmartForm`,
`RenderAdobeForm`, `GetSmartFormContent`, `GetAdobeFormContent`). Then the harness builds the previews locally and scores
them. All data paths are arguments. No form data lives in this repository.

| Script | Scores | Data |
|---|---|---|
| `sf-samples.mjs` | SmartForm previews of a sample set | `--set` (manifest, values, SAP PDFs), `--content` (form content + XML), `--ddic` |
| `adobe-previews.mjs` | Adobe form previews of a sample set | `--set`, `--forms` (form XML / layout XDP), `--meta` (texts, SmartStyles, DDIC) |
| `sf-corpus.mjs` | SmartForm previews of a form corpus | `--forms` (`<FORM>/values.json`), `--content` (content + `<form>.sap.pdf`), `--override` |
| `conversion.mjs` | SAP's SmartForm print vs SAP's print of the migrated Adobe form | `--pairs` (pairs.json) |

Every script writes per form `fidelity.json` and for the set `corpus.json` (or `report.json` for conversion), and logs
one line per form and a `CORPUS` / `SUMMARY` line.

## Sets

- **Tuning set**: the samples development is measured on. Score it as often as needed.
- **Held-out set**: same forms, other interface values. Develop on tuning data only. Score held-out **once at the end of
  a batch of fixes**, report it apart from tuning, and do not tune after seeing the numbers. If held-out output was
  opened for diagnosis, say so in the report: it is no longer blind for the causes found that way.

## SmartForm sample values (`sf-samples.mjs`)

The preview takes values "as printed". `sampleValues()` turns the interface values SAP was rendered with into those:
`preview-values.mjs` formats the DDIC types. `programValues()` runs what the form's program lines compute (simple
statements only, `runInitCoding`):

- a loop / table runs its header events once, its body per row, its footer events with the last row;
- a loop with sort events runs per group (sort-begin code, the group's rows, sort-end code), and a table printed in a
  sort-end event is kept per group (values as one array per group);
- rows are sorted as `build-preview.mjs` sorts them (new table / loop by the sort field, an old 4.6 table as given);
- statements the runner cannot run (SELECT, CALL FUNCTION …) are skipped and counted; the globals the code filled join
  the values;
- a node whose condition is decided false runs no code. EQ / NE against a scalar interface value is decided; anything
  else (OP2 `INITIAL`, an OP1 that is no interface value) is undecidable and runs;
- the values file asks for `unvalued: 'blank'`: a field the data leaves out prints as nothing, as SAP prints an
  initial field.

## Examples

```
node sf-samples.mjs --set <data>/ref --content <data>/content --ddic <data>/ref/ddic --out out/sf-ref
node sf-samples.mjs --set <data>/heldout --content <data>/content --ddic <data>/ref/ddic --out out/sf-heldout
node adobe-previews.mjs --set <data>/ref --forms <work>/mcp-output/adobe --out out/fp-ref
node adobe-previews.mjs --set <data>/heldout --forms <work>/mcp-output/adobe --meta <data>/ref --out out/fp-heldout
node sf-corpus.mjs --forms <work>/sf-learn/forms --content <work>/mcp-output/smartforms --out out/sf-corpus
node conversion.mjs --pairs <data>/conv/pairs.json --out out/conv
```

`pairs.json`: `{ "ID": { "ref": "sf.pdf", "candidates": { "corrected": "af1.pdf", "plain": "af2.pdf" }, "fallback": false } }`.
Paths are relative to the file. `fallback` marks a SmartForm print that used a device font fallback; it is averaged
apart.
