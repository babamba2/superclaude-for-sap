---
name: smartform-to-adobe
description: (Beta — output quality is still low) Plan the conversion of a SmartForm to an Adobe form (SFP) the way SAP's own migration (CL_SSF_MIGRATION) does it — inventory of every node, what each becomes in the Adobe interface / context / layout, and a gap list of what SAP would log or silently lose, with the manual step for each. Read-only; optionally runs the migration of a SAP example SmartForm on DEV into new $TMP objects.
model: inherit
---

# SC4SAP SmartForm → Adobe Form (conversion plan)

> **Beta — output quality is still low.** Tell the user so on every run: in the first reply (before Step 2) and again in the first line of the final report — the plan's predictions and gap rows can be wrong or incomplete, so check the result in SFP before relying on it. The HTML report carries the same notice.

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): degraded — works on a form XML the user already has; no SAP read.

Reads one SmartForm and works out, node by node, what SAP's own migration (`CL_SSF_MIGRATION=>MIGRATE`, the "Smart Form migration" of SFP / SMARTFORMS) makes of it:
- the Adobe interface
- the context tree
- the layout (page set, content areas, subforms)
- the messages SAP would log
- what SAP would drop **without** a message

Every node ends either mapped or in the gap list with a reason and a manual step. Nothing is written to SAP.

<Purpose>
Before anyone runs the migration (it saves at once, has no test mode and overwrites a target of the same name), the consultant needs to know how complete the result will be and what has to be rebuilt by hand. The plan answers that from the form itself, with the SAP method behind each rule.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. Dispatches: `sc4sap:sap-critic` (gap review, Step 5).</Response_Prefix>

<Team_Mode>**No teamMode integration.** Inventory and plan are scripted; one critic review.</Team_Mode>

<Use_When>
- "convert this SmartForm to Adobe", "SmartForm → Adobe form", "스마트폼을 어도비 폼으로 전환", "スマートフォームをAdobeフォームに移行"
- Planning an S/4 output move away from SmartForms; sizing the manual rework per form
</Use_When>

<Do_Not_Use_When>
- Drawing an Adobe form's print → `/sc4sap:adobe-preview`
- A new Adobe form from a PDF → `adobe-from-pdf` (awaiting approval)
- SAPscript (SE71) forms; S/4 output management templates (fragment forms) — not covered
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Rules | SAP's migration behaviour, method by method — [`mapping.md`](mapping.md). A rule that differs from SAP is a defect unless mapping.md gives the reason |
| Options | `full` by default (every migration flag); `sap-default` = what MIGRATE does without options. The report prints the options — a later SAP run must use the same |
| Scope | One form per run. A text module (FORMTYPE T) is reported as "not a form" |
| Data | Form definitions only; no business tables; sample values for previews are invented |
| Writes | Steps 1–6: none. Step 7 (DEV only, `CreateAdobeFormFromSmartForm`): a NEW form and interface `ZSC4SAP_AFM_*` in `$TMP` from a SAP-delivered SmartForm; nothing is overwritten or deleted |
| Language | Named in ARGUMENTS (Korean / English / Japanese → `ko` / `en` / `ja`), else the profile `config.json` `language`, else `en`. Page labels follow it; SAP's messages, reasons and manual steps stay in English (they cite SAP methods) |
| Output | `<artifact-base>/smartforms/<FORM>/` — **`adobe-plan-<lang>.html` (the deliverable)**, `adobe-plan-<lang>.md` (same content), `<FORM>.xml` (from GetSmartFormContent), `inventory.json`, `adobe-plan.json` |
</Decisions_Fixed>

<Prerequisites>
- MCP `GetSmartFormContent` (FM `ZMCP_SSF_CONTENT`, dispatcher action `SSF_CONTENT`); it writes `<form>.xml` next to `<form>.content.json`. An install error → stop and point to `abap/README.md`.
- Any profile: the read is read-only. S/4 systems without the SmartForm helper: read the form on a system that has it, or take the XML the user downloaded from SMARTFORMS (Utilities → Download).
</Prerequisites>

<Workflow>
Paths: `<out>` = `<artifact-base>/smartforms/<FORM>`, scripts in `scripts/adobe/`.

**Step 1 — Form.** Form name from ARGUMENTS (else ask once in plain text: "Which SmartForm? e.g. ZSD_INVOICE"). Uppercase it. Options: `full` unless the user names `sap-default` or a list of flags — do not ask; the report prints them. Then tell the user in one line that this skill is **beta with low output quality** (results must be checked in SFP), and in one more line what comes: read the form → plan → one review → HTML report, read-only, nothing written to SAP.

**Step 2 — Read.** `GetSmartFormContent(form_name, summary: true)`. Note `files.xml` and copy it to `<out>/<FORM>.xml`.

**Step 3 — Inventory.**
```
node scripts/adobe/sf-inventory.mjs "<out>/<FORM>.xml" > "<out>/inventory.json"
```
Report the counts by node kind (windows, texts, tables / loops, templates, events, conditions, code, graphics, addresses, commands), the interface (import / tables / export) and the printed `&fields&`.

**Step 4 — Plan.**
```
node scripts/adobe/sf-to-adobe-plan.mjs "<out>/<FORM>.xml" --options full > "<out>/adobe-plan.json"
```
Read `completeness`, `log`, `gaps`, `result`:
- `result: aborted` → the migration would stop (m13). Name the node and the cause; nothing else matters until it is fixed.
- Per node kind: mapped n / gap n. The gate is **0 nodes unexplained**: every node is mapped or has a gap row.
- The log: SAP's messages in order. An `E` message is a gap; a `W` message keeps the node and needs a look. `predicted` m05 is a guess — DDIC was not checked.
- Silent gaps: what SAP loses without a message (mapping.md §2, last column). These are the reason to run this skill.

**Step 5 — Review.** `Agent(subagent_type: "sc4sap:sap-critic")` gets the gap list with node paths, the options, and mapping.md §2–§4. It checks the SAP meaning of each reason and action (for example, "a sort event prints for every row" for a group heading) and returns `ok` or a corrected line. Apply a correction in `adobe-plan.json`, in English, and set `"reviewedBy": "critic"` on that gap row (the report marks it *reviewed*): the `action` of any row; the `reason` of a silent row (`logged: false`) only — a logged row's `reason` is SAP's own message text and stays verbatim. Never a node's status, kind or the counts. Re-running Step 4 overwrites the file — then repeat Step 5. The plan's rules change only through mapping.md and a test.

**Step 6 — Report** (offline):
```
node scripts/adobe/sf-to-adobe-page.mjs "<out>/adobe-plan.json" --out-dir "<out>" --lang <lang>
```
It writes `adobe-plan-<lang>.html` (header with form, options, result; tiles mapped / SAP warning / gaps logged / silent; interface; gap list with silent gaps first — node path · kind · logged / silent · reason · manual step; manual steps by kind; SAP log; node kinds; next steps) and the same content as `adobe-plan-<lang>.md`, and prints `summary`. Relay the summary (Output_Format) — its first line is the beta notice — give the HTML path first, then offer the next steps in one line each — do not start them unasked:
- the silent gaps to fix first (count)
- SAP example SmartForm on a DEV profile → "run the migration into new `$TMP` objects" (Step 7)
- after a migration → `/sc4sap:adobe-preview <new form>` to draw its print

**Step 7 — Run on DEV (optional, SAP example SmartForms only).** On the user's yes, `CreateAdobeFormFromSmartForm(source, form_name, interface_name)` with new names `ZSC4SAP_AFM_*` (an existing name is refused). It runs SAP's migration steps with the `full` options, saves both objects in `$TMP` and activates them; it needs FM `ZMCP_FP_MIGRATE` and the dispatcher action `FP_MIGRATE` (see `abap/README.md`). Report `complete`, `active`, SAP's `log` next to the plan's gap list, and the result file. Known differences to SAP's own run: the description ends with ` [sc4sap]` (the form type *migrated* is set as SAP sets it, through the public form-upload path), and duplicate sibling context nodes from a 4.6C table (SAP's result would not activate) are renamed `<NAME>_<n>` — report the `renamed` list; the layout also gets a fresh ADS cache info (`cacheInfo`), which SAP's run leaves as a shared placeholder until the form is saved in the Designer; include texts using `CONTROL_PARAMETERS-LANGU` get the output language, and with `sender_country` address nodes get a sender country — report the `adjusted` list; ask the user for the sender country (the issuing sales organisation's) rather than guessing. When the tool fails after a save, its error names the objects left behind — delete them only with the user's approval. Customer forms: plan only; do not suggest running the migration from SFP by hand on a form someone else owns.
</Workflow>

<Data_Rules>
Only form definitions are read. A preview of the migrated form (`/sc4sap:adobe-preview`) uses invented sample values. Do not read documents with `GetTableContents` / `GetSqlQuery`.
</Data_Rules>

<Output_Format>
```
Beta — output quality is still low; check the result in SFP before relying on it.
ZDEMO_INVOICE → Adobe (options: full) — migrates, nodes 62: mapped 49 · SAP warning 4 · gap nodes 9 — manual steps 11 (logged 4, silent 7)
Interface: 3 import, 1 table, 3 export (+ standard parameters) · global data 5 · init code 18 lines
SAP log (predicted): m07 E OLD_ITEMS · m10 E ITEMS · m03 W CALC_TOTAL · m02 W ADDRESS
Silent: text-element 3 · event-sort-begin 2 · command 1 · graphic 1
Report: <artifact-base>/smartforms/ZDEMO_INVOICE/adobe-plan-ko.html
Next: fix the 7 silent steps first · run the migration on DEV (SAP example forms only) · /sc4sap:adobe-preview after the migration
```
Reply in the user's language.
</Output_Format>

<Limits>
- The plan draws no layout. Draw the migrated form with `/sc4sap:adobe-preview` (S/4, DEV helper `ZMCP_FP_CONTENT`).
- Border, fill and margin details and the XHTML of texts are not modelled (mapping.md §7).
- Rules read from `CL_SSF_MIGRATION` on ECC and S/4 DEV systems (identical source); re-check after a SAP_BASIS upgrade.
</Limits>

<MCP_Tools_Used>
- `GetSmartFormContent` (form XML)
- `GetStructure` / `GetDataElement` (only to check a predicted m05 when the user asks)
</MCP_Tools_Used>

<Files>
- `scripts/adobe/sf-inventory.mjs` — form XML → node inventory
- `scripts/adobe/sf-to-adobe-plan.mjs` — inventory → migration plan (SAP rules)
- `scripts/adobe/sf-to-adobe-page.mjs` — plan → HTML report + Markdown + chat summary
- [`mapping.md`](mapping.md) — node → SAP method → result, gap rules
- [`../../common/adobe-forms-verification.md`](../../common/adobe-forms-verification.md) — metrics and gates
</Files>

<Related_Skills>
- `/sc4sap:smartform-preview` — the SmartForm's own expected print
- `/sc4sap:adobe-preview` — the migrated Adobe form's expected print
- `/sc4sap:smartform-from-pdf` — a new SmartForm from a PDF
</Related_Skills>

Task: $ARGUMENTS
