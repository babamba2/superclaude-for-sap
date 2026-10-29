---
name: s4-conversion-readiness
description: S/4HANA conversion readiness report — one HTML report of what to prepare before converting an ECC system to S/4HANA. Asks the target (S/4HANA 2023, 2025, public cloud, or compare), reads the system (components, org units, WM, Material Ledger, credit management, outputs) and asks which extensions to evaluate (EWM, RAP / Fiori elements, Fiori launchpad, output management …) with the evidence found. Matches the CBO reference graphs, saved source, exits / BAdIs / VOFM, table appends and measured T-code usage against a simplification knowledge base — changed tables (KONV, VBUK/VBUP, MKPF/MSEG, BSEG index tables …), removed transactions and BAPIs, Business Partner, native SQL, sort order on HANA, 40-character MATNR, appends to move (PRCD_ELEMENTS, MATDOC, ACDOCA) and CDS views to extend. Per-object rating, rough effort, clean-core level, cloud approach, preparation checklist. Read-only.
model: inherit
---

# SC4SAP S/4HANA Conversion Readiness

One **HTML report per conversion study**: what in this system the move to S/4HANA touches, how badly, where in the code, and what to prepare — sized before SAP's own checks are run.

<Purpose>
A conversion is planned months ahead. The team needs to know early which custom programs break, which only slow down, which enhancements and table appends must move, which business functions change (Business Partner, credit management, WM, rebates …) and which extensions to adopt with the conversion. sc4sap already holds most of the evidence (measured usage, CBO reference graphs with source lines, exits and appends). This skill matches that evidence against a knowledge base of simplification items and draws one report with filters on every table.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>
<Target_Object>The analysed system is the active profile's. Not the system the user means → stop and ask per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Target object not on the active system.</Target_Object>

<Use_When>
- "S/4 전환", "S/4HANA 컨버전", "전환 준비", "컨버전 영향 분석", "S/4 readiness", "simplification item", "brownfield", "ECC → S/4"
- Sizing a conversion: custom code impact, enhancements, appends, business functions to change, extensions to adopt
</Use_When>

<Do_Not_Use_When>
- Running SAP's own checks — the report says to run Readiness Check, SI-Check and ATC; it does not replace them
- Fixing the code → `/sc4sap:analyze-code` per object, `/sc4sap:create-object` for changes
- Process maps → `/sc4sap:module-to-process`; role design → `/sc4sap:role-matrix`
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — Step 0.** Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:s4-conversion-readiness`. Skip silently if `.sc4sap/session-trust.log` has a line within the last 24h.
</Session_Trust_Bootstrap>

<Decisions_Fixed>
Settled with the user (2026-10-29) — do not ask again:

| Topic | Decision |
|---|---|
| Question [1] | Always ask the target first: **S/4HANA 2023**, **S/4HANA 2025** (on-premise / private cloud), **public cloud**, or **not decided — compare** |
| Question [2] | After reading the system, ask which extensions to evaluate, each option with the evidence found (EWM, RAP / Fiori elements, Fiori launchpad, output management; TM, GTS, settlement management, BTP through "Other") |
| Depth | As detailed as the evidence allows: every finding names the object, the table / T-code / FM and the source line |
| Analysis | Deterministic: knowledge base `configs/conversion/simplification.json` × CBO graphs × saved source × exits / appends × usage. No LLM in the matching |
| Narrative | The summary and extension notes are written by the main thread from the scan totals (judgment), then merged with `narrative` |
| Output | ONE self-contained HTML report (tabs, filter row and sort on every table, CSV per table, print). Read-only on SAP |
</Decisions_Fixed>

<Paths>
`<CV>` = `<artifactBase>/conversion` ([`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). Per study `<CV>/<CODE>/`: `facts.json`, `<CODE>-readiness.json` (model), `narrative.json`, `<CODE>-s4-readiness-v<n>-<lang>.html`. Tool: `node "<PLUGIN_ROOT>/scripts/conversion/build-readiness-doc.mjs" <cmd> …` (the header lists every command). Inputs it reads by default: `<artifactBase>/cbo/*/_USED*/graph.json` (else every graph of the module), `<artifactBase>/mcp-output/src`, `<artifactBase>/customizations/<M>/`, the newest `<artifactBase>/usage/tcode-usage-*-all.json` and `-STD.json`.
</Paths>

<Workflow>
MUST read [`workflow.md`](workflow.md) before Step 1. Knowledge base rules and how to extend it: [`knowledge-base.md`](knowledge-base.md).
</Workflow>

<Output_Format>
```
S/4HANA readiness <CODE> · <SID> <ECC release> → <target> · v<n>
Objects <n> analysed · <n> to adapt (<n> blocker) · rough effort <n> person-days · indicator <score>
Findings: blocker <n> · functional <n> · performance <n> · check <n> · info <n>
Top areas: <area worst n> · …   Extensions to evaluate: <list>
Report: <html>
Next: "ATC 결과 반영", "목표를 Public Cloud로 비교", "SD만 다시", "<object> 코드 분석"
```
</Output_Format>
