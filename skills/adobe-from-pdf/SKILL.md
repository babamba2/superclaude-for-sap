---
name: adobe-from-pdf
description: Build an Adobe form (SFP — interface, context and XDP layout) from a PDF of the printed form, the way smartform-from-pdf builds a SmartForm, upload it to the DEV system, print it there and score the print against the source page. Awaiting approval — not runnable yet.
model: inherit
---

# SC4SAP PDF → Adobe Form (skeleton — awaiting approval)

> **Status: awaiting approval (P2).** The SAP write helper `ZMCP_FP_WRITE` is not approved or installed. This skill does nothing yet except say so. The steps below are the agreed design, so the build can start once the helper is approved.

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): blocked — reply with the stop line there and stop.

<Purpose>
Same goal as `/sc4sap:smartform-from-pdf`, with an Adobe form as the target instead of a SmartForm. It is for systems where new output is built in SFP.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention. This skill dispatches no agents (`Dispatched: none`).</Response_Prefix>

<Use_When>
- "make an Adobe form from this PDF", "PDF → Adobe form", "이 PDF로 어도비 폼 만들어", "このPDFからAdobeフォーム"
</Use_When>

<Do_Not_Use_When>
- Today: always. Answer that the skill awaits approval of the DEV write helper. Offer `/sc4sap:smartform-from-pdf` (SmartForm target), or `/sc4sap:smartform-to-adobe` to plan a conversion.
- Changing an existing Adobe form, or any SAP standard form or interface.
- QA / production profiles.
</Do_Not_Use_When>

<Decisions_Fixed>
| Topic | Decision |
|---|---|
| Steps | As `smartform-from-pdf`: read-pdf → plan (fixed texts, ruled areas → tables / subforms) → shape (values → fields, items → repeating subform, interface + context, decided with the user) → write → upload (DEV) → SAP print → score |
| Output format | SFP download XML (`CL_FP_HELPER` form / interface conversions); creation via `CL_FP_WB_FORM` create → save → activate in the write helper |
| Writes | DEV profile only, user approval per write, new Z / Y names only, overwrite only of a form this skill created |
| Check | SAP's own print with invented sample values vs the source page — [`common/adobe-forms-verification.md`](../../common/adobe-forms-verification.md) column B |
| Output | `<artifact-base>/adobe/<FORM>/` |
</Decisions_Fixed>

<Workflow>
**Step 0 — Gate.** If the MCP tool for the Adobe write helper is not available, stop with the status line and the alternatives in Do_Not_Use_When.

Steps 1–7 follow `smartform-from-pdf` one to one, with the outputs in Decisions_Fixed. They are written out here once the helper is approved.
</Workflow>

<Data_Rules>
Same as `/sc4sap:smartform-from-pdf`:
- The source page is read locally. Values on it become fields and are never printed into the form.
- Sample values are invented.
- Business tables are not read.
</Data_Rules>

<Related_Skills>
- `/sc4sap:smartform-from-pdf` — the SmartForm version, available now
- `/sc4sap:smartform-to-adobe` — conversion plan of an existing SmartForm
</Related_Skills>

Task: $ARGUMENTS
