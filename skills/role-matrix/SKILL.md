---
name: role-matrix
description: SAP role & authorization document for a project — one editable HTML workbook (cover with checks, business roles, technical PFCG roles, business role × T-code matrix F/C/D, user × role assignment, authorization objects, SoD rules with automatic conflict check, change history). New design (module consultant proposes roles, T-codes, authorization objects and SoD rules; T-codes narrowed to the ones users run when ST03N usage is available) or read from the connected SAP system (PFCG roles, T-codes, authorization values, org levels, user–role assignment by user ID). Spreadsheet-style editing in the browser, CSV per sheet, versioned.
model: inherit
---

# SC4SAP Role Matrix

One **editable HTML workbook per role design** — the classic SAP role-matrix workbook (seven sheets and a cover) as a page the security owner, module consultants and the business edit together. Built new from a consultant's proposal, or read from the roles that already exist in SAP.

<Purpose>
Role design is a project deliverable that changes every week: business roles are argued over with the business, T-codes move between roles, users are assigned before go-live, SoD conflicts must be found before an auditor does. Spreadsheets drift from what PFCG really holds. This skill keeps one model, draws the workbook from it, checks it (unmapped roles, T-codes in no role, SoD conflicts per user and inside a role), and can read the real roles from SAP so the document starts from the system — not from memory.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>
<Target_Object>Roles are read on the active profile's system only. Not found → stop and ask per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Target object not on the active system.</Target_Object>

<Use_When>
- "권한 매트릭스", "Role 매트릭스", "역할 설계", "권한 설계서", "PFCG 역할 정리", "SoD 점검", "사용자 권한 배정표", "role matrix", "authorization concept", "SoD"
- A project needs its role & authorization document (new design), or an existing system's roles must be documented / reviewed
</Use_When>

<Do_Not_Use_When>
- Creating or changing roles in PFCG — this skill never writes to SAP
- Reading user master data, passwords or logon data — never
- Process documentation → `/sc4sap:module-to-process`; project plan → `/sc4sap:project-dashboard`
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — Step 0.** Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:role-matrix`. Skip silently if `.sc4sap/session-trust.log` has a line within the last 24h.
</Session_Trust_Bootstrap>

<Decisions_Fixed>
Settled with the user (2026-10-28) — do not ask again:

| Topic | Decision |
|---|---|
| Layout | The classic workbook: cover (document info, sheet guide, legend, computed summary, checks), 1 business roles, 2 technical roles, 3 business role × T-code (F/C/D), 4 user × business role (X), 5 authorization objects, 6 SoD, 7 change history |
| Output | ONE self-contained HTML page per document with spreadsheet-style editing (range select, F/C/D/X typed over a range, Excel copy / paste, fill down, undo, rename an ID everywhere) and CSV per sheet. No xlsx |
| Mode | Always ask: **new design** or **read from SAP** |
| SAP reads | Role design tables (AGR_DEFINE, AGR_TEXTS, AGR_FLAGS, AGR_AGRS, AGR_TCODES, AGR_1251, AGR_1252) and the assignment table AGR_USERS (**user ID and validity only**). Names, departments and positions of users are typed in the page. USR* tables are never read |
| New design | The module consultant proposes business roles, T-codes with levels, technical roles (master + derived per org value), authorization objects (SU24 view) and SoD rules; narrowed to the T-codes users run when ST03N usage is available |
| SoD | Rules by business-role pair or by T-code sets (library `scripts/role/sod-library.json`); conflicts are computed per user and inside a single role |
| Versions | 0.1 steps in sheet 7; each Save in the page adds a row; `--major` for 1.0 |
</Decisions_Fixed>

<Paths>
`<RM>` = `<artifactBase>/roles` ([`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). Per document `<RM>/<CODE>/`: `<CODE>-roles.json` (model), `<CODE>-role-matrix-v<ver>-<lang>.html`, `_src/`. Tool: `node "<PLUGIN_ROOT>/scripts/role/build-role-doc.mjs" <cmd> … --dir <RM>` (the header of that file lists every command).
</Paths>

<Workflow>
MUST read [`workflow.md`](workflow.md) before Step 1. Model fields: [`model-schema.md`](model-schema.md) — read before writing a draft or editing a model file.
</Workflow>

<Output_Format>
```
Role matrix <CODE> · <project> · v<ver> · <new design | read from SAP <SID> (<n> roles)>
Business roles <n> · technical roles <n> · T-codes <n> · users <n> · auth rows <n> · SoD rules <n> (broken <n>)
Checks: <err> errors · <warn> warnings — <top 3>
Page: <html>
Next: edit in the browser → Save → "import <file>", "SoD 규칙 추가 (MM, FI)", "SAP에서 다시 읽기"
```
</Output_Format>
