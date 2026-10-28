---
name: project-dashboard
description: SAP project management dashboard for PMs and the PMO — one editable HTML page per project (summary, KPIs, milestones with Q-gates, WBS with Gantt, SAP actuals, team, history) plus a portfolio page over every project. Templates for new implementation (SAP Activate), S/4 conversion, rollout, AMS release and small projects; module consultant and development consultant tracked separately (WRICEF stages and hand-off queue); actuals read from the connected SAP system (transport requests split into customizing vs workbench, package objects, inactive objects, dumps after go-live). Team members join and leave by date; open items of leavers are flagged and reassigned.
model: inherit
---

# SC4SAP Project Dashboard

One **editable HTML page per SAP project** for the PM and the PMO, and one **portfolio page** over all projects. The plan comes from a template for the project type; the progress comes from the PM (edit mode) and from the connected SAP system (read-only).

<Purpose>
SAP projects split the work between **module consultants** (requirements, FS, configuration, functional unit test) and **development consultants** (TS, build, unit test). Delays hide in the hand-off between the two and in transports nobody releases. Generic PM tools do not see either. This skill tracks every WRICEF item through its stages with both owners, shows the hand-off queue, reads the system's transports (customizing = configuration work, workbench = development work), and rolls everything into milestones, KPIs and a portfolio — on pages the PMO can edit and send back.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>
<Target_Object>Packages and transports are read on the active profile's system only. Not found → stop and ask per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md) § Target object not on the active system.</Target_Object>

<Use_When>
- "프로젝트 대시보드", "WBS 관리", "마일스톤 관리", "PMO 보고", "프로젝트 현황", "project dashboard", "SAP project plan", "go-live readiness", "WRICEF 진척", "포트폴리오"
- A new SAP project (implementation, S/4 conversion, rollout, AMS release, small project) needs a plan, or an existing one needs status
- The PMO wants all projects on one page, or the load of people working on several projects
- A team member leaves or joins; WRICEF items change owner
</Use_When>

<Do_Not_Use_When>
- Business process documentation → `/sc4sap:module-to-process`
- One program's specification → `/sc4sap:program-to-spec`
- Writing ABAP → `/sc4sap:create-program`
</Do_Not_Use_When>

<Session_Trust_Bootstrap>
**MANDATORY — Step 0.** Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:project-dashboard`. Skip silently if `.sc4sap/session-trust.log` has a line within the last 24h.
</Session_Trust_Bootstrap>

<Decisions_Fixed>
Settled at design time (2026-10-28) — do not ask again:

| Topic | Decision |
|---|---|
| Readers | PM (edits the plan) and PMO (status across projects) |
| Output | Per project ONE self-contained HTML page with edit mode; `projects/portfolio-<lang>.html` over all projects; English companion |
| Storage | Local files are the source (`<artifactBase>/projects/<CODE>/`). Every row, milestone, member and KPI has a stable id so a later sync (SAP Z tables, Notion) can match rows — not built yet |
| Several projects | Always assume more than one: one folder per project code, portfolio rebuilt after every change, people matched across projects by SAP user (else name) |
| Team changes | Members leave by an end date (`to`), never by deletion; finished items keep their owner; open items of a member who left are flagged ("needs a new owner") until `reassign` |
| Two consultant sides | `fnOwner` = module consultant, `devOwner` = development consultant on deliverables and WRICEF items; WRICEF stages req → FS → TS → build → unit test → FUT → SIT → done; hand-off queue = FS done (waiting for development) and unit test done (waiting for FUT) |
| SAP actuals | Read-only: E070 / E07T (requests since project start; W = configuration, K = development; workstream from the request text, default `[SD] …`), E071 (WRICEF objects → requests), package objects (TADIR, or the ADT package listing on BASIS < 7.50), inactive objects, dumps after go-live. Never business data, never a write |
| Progress | The PM's values win; SAP evidence only suggests ("evidence ahead") |
| KPIs | Auto KPIs (schedule, WRICEF, transports, team, hypercare) trended per build; manual KPIs per project type (quality, data, training, cost) entered in the page |
| Versions | Plan changes (import, add-wricef, reassign, build) = new minor version; `refresh` (actuals) = same version |
</Decisions_Fixed>

<Paths>
`<PRJ>` = `<artifactBase>/projects` ([`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). Per project `<PRJ>/<CODE>/`: `<CODE>-project.json` (model), `<CODE>-project.en.json`, `<CODE>-<lang>.history.json`, `<CODE>-dashboard-v<ver>-<lang>.html`, `_src/`, `_i18n/`, `_answers.json`. Tool: `node "<PLUGIN_ROOT>/scripts/project/build-project-doc.mjs" <cmd> … --dir <PRJ>` (header of that file lists every command).
</Paths>

<Workflow>
MUST read [`workflow.md`](workflow.md) before Step 1. Model fields: [`model-schema.md`](model-schema.md) — read before editing a model file directly.
</Workflow>

<Output_Format>
```
Project <CODE> · <name> · v<ver> · <type> · go-live <date>
Status <RAG> · progress <actual>% / plan <planned>% · milestones <passed>/<n> · WRICEF <done>/<n>
Hand-offs: to development <n> · to FUT <n> · needs a new owner <n> · KPIs to watch <n>
SAP actuals: <n> requests (configuration <n> / development <n>) · <n> package objects · read <date>
Page: <html> · English: <html> · Portfolio: <PRJ>/portfolio-<lang>.html
Next: edit in the browser → Save → "import <file>", "실적 갱신", "WRICEF 추가", "<사람> 담당 이관"
```
</Output_Format>

<Not_Yet>
Sync to SAP Z tables (DEV only, approval per run) and export to Notion are phase 2 — say so when asked, and keep ids stable.
</Not_Yet>
