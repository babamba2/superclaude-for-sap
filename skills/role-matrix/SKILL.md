---
name: role-matrix
description: SAP role & authorization document for a project — one editable HTML workbook (cover with checks, business roles, technical PFCG roles, business role × T-code matrix F/C/D, user × role assignment, authorization objects, SoD rules with automatic conflict check, change history). New design (module consultant proposes roles, T-codes, authorization objects and SoD rules; T-codes narrowed to the ones users run when ST03N usage is available) or read from the connected SAP system (PFCG roles, T-codes, authorization values, org levels, user–role assignment by user ID). Spreadsheet-style editing in the browser, CSV per sheet, versioned. Also triages one user's "no authorization" in a T-code (SU53): missing object / values, roles that would grant them, SoD impact.
model: inherit
---

# SC4SAP Role Matrix

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): full — new design only (no ST03N narrowing); `sync` and triage are blocked.

One **editable HTML workbook per role design** — a role & authorization workbook (seven tabs and an overview) as a page the security owner, module consultants and the business edit together. Built new from a consultant's proposal, or read from the roles that already exist in SAP.

<Purpose>
Role design is a project deliverable that changes every week: business roles are argued over with the business, T-codes move between roles, users are assigned before go-live, SoD conflicts must be found before an auditor does. Spreadsheets drift from what PFCG really holds. This skill keeps one model, draws the workbook from it, checks it (unmapped roles, T-codes in no role, SoD conflicts per user and inside a role), and can read the real roles from SAP so the document starts from the system — not from memory.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>
<Target_Object>Roles are read on the active profile's system only. Not found → stop and ask per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Target object not on the active system.</Target_Object>

<Use_When>
- "권한 매트릭스", "Role 매트릭스", "역할 설계", "권한 설계서", "PFCG 역할 정리", "SoD 점검", "권한 감사", "사용자 권한 배정표", "role matrix", "authorization concept", "SoD", "role audit"
- **Triage** — "권한 오류", "권한 없음 분석", "no authorization", "SU53", "어떤 롤을 줘야", "authorization error": one user gets "no authorization" in one T-code → [`triage.md`](triage.md)
- A project needs its role & authorization document (new design), or an existing system's roles must be documented / reviewed (audit, SoD review — read from SAP)
- "SAP 반영 확인" — is the document what the system holds (roles, T-codes, authorization values, org levels, assignments)? → `verify` in [`workflow.md`](workflow.md) § Operations
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
| Layout | The default workbook: overview (figures, document info, checks, tab cards, symbols), business roles, PFCG roles, T-codes by role (F/C/D), user assignment (X), authorization objects, SoD, history |
| Company form | Forms differ by company. The workbook above is the default; on request a **company layout** ([`layout.md`](layout.md)) read from the company's own form (.html / .docx) sets sheet titles and order, columns and headers, own columns, level codes, cover fields, colours, font and logo — editing, CSV, checks and SoD stay the same |
| Output | ONE self-contained HTML page per document with spreadsheet-style editing (range select, F/C/D/X typed over a range, Excel copy / paste, fill down, undo, rename an ID everywhere) and CSV per sheet. No xlsx |
| Mode | Always ask: **new design** or **read from SAP**; a third mode **triage** (one user + one T-code authorization error) runs [`triage.md`](triage.md) — no workbook is built |
| SAP reads | Role design tables (AGR_DEFINE, AGR_TEXTS, AGR_FLAGS, AGR_AGRS, AGR_TCODES, AGR_1251, AGR_1252) and the assignment table AGR_USERS (**user ID and validity only**). Names, departments and positions of users are typed in the page. USR* tables are never read |
| New design | The module consultant proposes business roles, T-codes with levels, technical roles (master + derived per org value), authorization objects (SU24 view) and SoD rules; narrowed to the T-codes users run when ST03N usage is available |
| SoD | Rules by business-role pair or by T-code sets (library `scripts/role/sod-library.json`); conflicts are computed per user and inside a single role |
| Versions | 0.1 steps in the history tab; each Save in the page adds a row; `--major` for 1.0 |
</Decisions_Fixed>

<Paths>
`<RM>` = `<artifactBase>/roles` ([`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). Per document `<RM>/<CODE>/`: `<CODE>-roles.json` (model), `<CODE>-role-matrix-v<ver>-<lang>.html`, `_src/`. Tool: `node "<PLUGIN_ROOT>/scripts/role/build-role-doc.mjs" <cmd> … --dir <RM>` (the header of that file lists every command).
</Paths>

<Language>
A `Language: Korean | English | Japanese` line (or "Write the report in …") sets the document language: Korean → `--lang ko`, English → `--lang en`, Japanese → `--lang ja` on `init` / `sync`. None → the profile `config.json` `language`. A draft that names its own `lang` keeps it — set the draft `lang` to the same value.
</Language>

<Workflow>
Triage (user + T-code + error) → MUST read [`triage.md`](triage.md) and follow it instead. Otherwise MUST read [`workflow.md`](workflow.md) before Step 1. Model fields: [`model-schema.md`](model-schema.md) — read before writing a draft or editing a model file.
</Workflow>

<Output_Format>
```
Role matrix <CODE> · <project> · v<ver> · <new design | read from SAP <SID> (<n> roles)>
Business roles <n> · technical roles <n> · T-codes <n> · users <n> · auth rows <n> · SoD rules <n> (broken <n>)
Checks: <err> errors · <warn> warnings — <top 3>
Page: <html>
Next: edit in the browser → Save → "import <file>", "SoD 규칙 추가 (MM, FI)", "SAP에서 다시 읽기", "회사 양식 적용 (<form>.docx)"
```
</Output_Format>
