# role-matrix — Workflow

Referenced by `SKILL.md`. `<B>` = `node "<PLUGIN_ROOT>/scripts/role/build-role-doc.mjs"`, every call with `--dir <RM>`. Each step prints `Step X/5 · <label>`.

## Step 1 — Which document

1. Confirm the active profile in one line (alias, SID, tier). List the folders under `<RM>` (code, project, version from each `<CODE>-roles.json`).
2. An existing document → **Operations** below. A new one → Step 2.

## Step 2 — Intake

One `AskUserQuestion` (2 options): **새로 설계 (new design)** / **SAP 권한 연동 (read from SAP)**. Then one free-text ask, with an example filled in:

- code (letters, digits, `_` `-`, ≤ 30), project name, system / module (`PRD / PM`), author, reviewer
- modules in scope (`PM`, or `MM, SD`)
- read from SAP: role-name patterns (`Z_PM*, ZPM*`; `*` wildcard) and whether to read the user assignment (default yes — user IDs only)
- new design: organizations the derived roles split by (`plants 1000, 2000`), the business roles the user already has in mind (optional), an existing role list or workbook to start from (optional, attachment)

## Step 3a — Read from SAP

1. `<B> sync --code <CODE> --patterns "<p1,p2>" --module <M> [--no-users] --project "<name>" --system "<SID / module>" --author "<name>"` — read-only. A model that exists keeps what people wrote (business-role names, user names / departments, SoD rules, notes); `--replace` starts over.
2. `readErrors` mentioning `ZMCP_ADT_DISPATCH … not allowed` on BASIS < 7.50 → the dispatcher on that system predates the role-table rule: tell the user the AGR_* role tables must be allowed in `TABLE_READ` (see `abap/zmcp_adt_dispatch_ecc.abap`), and stop. Never change SAP code without the user's explicit approval for that system.
3. Levels read from SAP are **estimates** (`guess` rows, marked "?"): a T-code's level comes from the role's ACTVT values (01/06 → F, 02 → C, 03 only → D) and from display wording in the T-code text. Say so in the report.
4. Large reads are complete: role names are read in name ranges past the 5000-row limit of one read. A single role with more than 5000 T-codes or authorization values (an all-access role) is only partly read — `readErrors` names it; say so. The page shows long sheets in pages (rows and 50 role columns at a time); search, CSV and paste work on the whole sheet.
5. Business roles: one per master / single / composite role; derived roles join their master's business role. Their names are the role texts — ask the user whether to rename them now or in the page.

## Step 3b — New design

1. Usage (when the profile has `SAP_USAGE_RFCDEST` or the user gives a usage export): collect the module's T-codes from `configs/<M>/tcodes.md`, call `GetTcodeUsage` (months 12) in batches ≤ 320, keep `used[]`. No usage → say "(standard proposal, not narrowed by usage)".
2. Dispatch the module consultant (`sc4sap:sap-<m>-consultant`, one per module, in parallel) with the brief below. Each returns JSON only.

   ```
   Propose the role design for <module> (<industry>, <country>, <SAP version>) for a project role-matrix document.
   Organizations for derived roles: <orgs>. Business roles the user named: <list or none>.
   T-codes in use (ST03N, 12 months): <list or "not available — propose the standard set">.
   Return ONE JSON object (no prose) shaped like <PLUGIN_ROOT>/scripts/role/example-draft.json:
   broles [{id "<M>-01"…, name (Korean), nameEn, module, desc, tasks, org, troles[]}],
   troles [{id Z_<M>_<ROLE> master + Z_<M>_<ROLE>_<org> derived, desc, type Master|Derived|Single|Composite, parent, module, brole, orgLevel, orgValue}],
   tcodes [{module, area, tcode, text, levels {"<brole id>": "F"|"C"|"D"}}] — only T-codes in use when the list is given,
   auths [{trole (master roles), object, objText, field, fieldText, value, note}] — the SU24 objects that matter (org-level fields, document types, activities),
   sod [{a, b, kind, risk, level H|M|L, mitigation}] between your business roles.
   Display-only business role always. No customer names.
   ```

3. Merge the module JSONs into one draft (`broles`, `troles`, `tcodes` — one row per T-code, levels merged —, `auths`, `sod`), add `doc` from Step 2, `Write` `<RM>/<CODE>/_draft.json`, then `<B> init --code <CODE> --from <RM>/<CODE>/_draft.json`.

## Step 4 — SoD rules and checks

1. `<B> sod --code <CODE> --modules <M1,M2>` adds the library rules of the modules (T-code sets; skipped when a rule of that kind exists). Cross-module pairs (MM + FI) come from the library too.
2. `<B> check --code <CODE>` → print errors and warnings (≤ 8 lines); offer to fix the obvious ones in the model (unknown role IDs, duplicate T-codes) — `Edit` the model per [`model-schema.md`](model-schema.md), then `<B> build --code <CODE> --same-version`.

## Step 5 — Report

Print the Output_Format block (SKILL.md). Tell the user how to edit: open the page, **편집**, type F/C/D over a selected range or click a matrix cell and pick the value, filter a column with ▾ in its header, insert a row above the picked cell (button or right-click), paste from Excel, **저장** → hand the saved file back for `import`.

## Operations (existing document)

| Request | Do |
|---|---|
| Edited page handed back | `<B> import <file>` (the page's own version and sheet-7 row are kept) |
| "SAP에서 다시 읽기" | Step 3a on the same code (keeps what people wrote) |
| Add SoD rules of a module | `<B> sod --code <CODE> --modules <M>` |
| Changes by chat (rename a role, move T-codes, add users) | `Edit` the model, `<B> check`, `<B> build --code <CODE> --note "<what>"` |
| Final version | `<B> build --code <CODE> --major --note "<what>"` |
| "use our company form", company form handed over (.html / .docx) | Company layout per [`layout.md`](layout.md): `template` → `columns` → mapping table confirmed by the user → `Write` `<RM>/_layouts/<name>.json` → `layout --code <CODE> --file …` |
| Back to the default form | `<B> layout --code <CODE> --file none` |
| A filled-in company workbook (.xlsx) to take over as the document | Layout with `form` blocks per [`layout.md`](layout.md) step 7 → `<B> import-form <file> --code <CODE> --layout …` |

## Rules

- Never write to SAP. Never read USR* tables. AGR_USERS is read for user ID and validity only.
- User names, departments and positions come from the user, never from SAP.
- Customer workbooks the user shows are layout references only — their names and values never go into the plugin's files.
