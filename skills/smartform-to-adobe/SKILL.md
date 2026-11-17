---
name: smartform-to-adobe
description: Plan the conversion of a SmartForm to an Adobe form (SFP) the way SAP's own migration (CL_SSF_MIGRATION) does it — inventory of every node, what each becomes in the Adobe interface / context / layout, and a gap list of what SAP would log or silently lose, with the manual step for each. Read-only; optionally runs the migration of a SAP example SmartForm on DEV into new $TMP objects.
model: inherit
---

# SC4SAP SmartForm → Adobe Form (conversion plan)

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
- Drawing an Adobe form's print → `adobe-preview` (once released)
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
| Output | `<artifact-base>/smartforms/<FORM>/` — `<FORM>.xml` (from GetSmartFormContent), `inventory.json`, `adobe-plan.json`, `adobe-plan.md` |
</Decisions_Fixed>

<Prerequisites>
- MCP `GetSmartFormContent` (FM `ZMCP_SSF_CONTENT`, dispatcher action `SSF_CONTENT`); it writes `<form>.xml` next to `<form>.content.json`. An install error → stop and point to `abap/README.md`.
- Any profile: the read is read-only. S/4 systems without the SmartForm helper: read the form on a system that has it, or take the XML the user downloaded from SMARTFORMS (Utilities → Download).
</Prerequisites>

<Workflow>
Paths: `<out>` = `<artifact-base>/smartforms/<FORM>`, scripts in `scripts/adobe/`.

**Step 1 — Form.** Form name from ARGUMENTS (else ask once). Uppercase it. Options: `full` unless the user names `sap-default` or a list of flags.

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

**Step 5 — Review.** `Agent(subagent_type: "sc4sap:sap-critic")` gets the gap list with node paths, the options, and mapping.md §2–§4. It checks the SAP meaning of each reason and action (for example, "a sort event prints for every row" for a group heading) and returns `ok` or a corrected line. Apply corrections to the report text only. The plan's rules change only through mapping.md and a test.

**Step 6 — Report.** Write `<out>/adobe-plan.md`:
- header with the form, options, result and completeness
- interface
- node kinds table
- SAP log
- gap list: node path · kind · logged / silent · reason · manual step
- effort hint: count of manual steps by kind

Print the summary (Output_Format).

**Step 7 — Run on DEV (optional, SAP example SmartForms only).** On the user's yes, `CreateAdobeFormFromSmartForm(source, form_name, interface_name)` with new names `ZSC4SAP_AFM_*` (an existing name is refused). It runs SAP's migration steps with the `full` options, saves both objects in `$TMP` and activates them; it needs FM `ZMCP_FP_MIGRATE` and the dispatcher action `FP_MIGRATE` (see `abap/README.md`). Report `complete`, `active`, SAP's `log` next to the plan's gap list, and the result file. Known differences to SAP's own run: the description ends with ` [sc4sap]` (the form type *migrated* is set as SAP sets it, through the public form-upload path), and duplicate sibling context nodes from a 4.6C table (SAP's result would not activate) are renamed `<NAME>_<n>` — report the `renamed` list; the layout also gets a fresh ADS cache info (`cacheInfo`), which SAP's run leaves as a shared placeholder until the form is saved in the Designer; include texts using `CONTROL_PARAMETERS-LANGU` get the output language, and with `sender_country` address nodes get a sender country — report the `adjusted` list; ask the user for the sender country (the issuing sales organisation's) rather than guessing. When the tool fails after a save, its error names the objects left behind — delete them only with the user's approval. Customer forms: plan only; do not suggest running the migration from SFP by hand on a form someone else owns.
</Workflow>

<Data_Rules>
Only form definitions are read. A predicted preview, once the Adobe renderer exists, uses invented sample values (see `/sc4sap:smartform-preview` Data_Rules). Do not read documents with `GetTableContents` / `GetSqlQuery`.
</Data_Rules>

<Output_Format>
```
ZDEMO_INVOICE → Adobe (plan, options: full) — migrates, 62 nodes: 49 mapped · 4 with a SAP warning · 9 gaps (3 logged, 6 silent)
Interface: 3 import, 1 table, 3 export (+ standard parameters) · global data 5 · init code 18 lines
SAP log (predicted): m07 E OLD_ITEMS · m10 E ITEMS · m03 W CALC_TOTAL · m02 W ADDRESS
Silent: sort level begin / end prints for every row (2) · footer area skipped (1) · layout condition LPAGE (1) · final window timing (1) · dynamic logo key (1)
Files: <artifact-base>/smartforms/ZDEMO_INVOICE/adobe-plan.md
```
Reply in the user's language.
</Output_Format>

<Limits>
- No layout drawing yet — a predicted preview needs the Adobe renderer (`adobe-preview`).
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
- [`mapping.md`](mapping.md) — node → SAP method → result, gap rules
- [`../../common/adobe-forms-verification.md`](../../common/adobe-forms-verification.md) — metrics and gates
</Files>

<Related_Skills>
- `/sc4sap:smartform-preview` — the SmartForm's own expected print
- `/sc4sap:smartform-from-pdf` — a new SmartForm from a PDF
</Related_Skills>

Task: $ARGUMENTS
