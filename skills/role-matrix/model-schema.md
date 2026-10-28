# role-matrix — Model schema

`<CODE>-roles.json`. `normalizeModel` (scripts/role/role-model.mjs) fills every default, so drafts may leave fields out. Example: `scripts/role/example-draft.json`.

| Key | Shape | Notes |
|---|---|---|
| `lang` | `ko` \| `en` | Labels of the page |
| `doc` | `{ code, project, system, module, author, reviewer, date, mode: new\|sap }` | Cover sheet; `date` is set by the build |
| `broles[]` | `{ id, name, nameEn, module, desc, tasks, org, troles: [trole id], users, note }` | Sheet 1. `id` is the column key of sheets 3 and 4 — rename it in the page (or with `renameBrole`), never by hand in one place only |
| `troles[]` | `{ id, desc, type: Single\|Composite\|Derived\|Master, parent, module, brole, orgLevel, orgValue, children: [trole id], owner, status: design\|build\|unit\|integration\|live\|retired, note }` | Sheet 2. Derived roles name `parent`; composites list `children` |
| `tcodes[]` | `{ module, area, tcode, text, levels: { <brole id>: F\|C\|D }, note, guess }` | Sheet 3. A missing key = no access. `guess: true` = level estimated from SAP authorization values |
| `users[]` | `{ empNo, uid, name, dept, pos, plant, roles: { <brole id>: "X" }, approval: pending\|approved\|rejected, valid, note }` | Sheet 4. From SAP only `uid`, `roles`, `valid` |
| `auths[]` | `{ trole, object, objText, field, fieldText, value, note }` | Sheet 5. One row per role · object · field; `value` is free text (`01,02,03`, `1000-1999`, `*`) |
| `sod[]` | `{ id, a, b, kind, risk, level: H\|M\|L, mitigation, approver, status: open\|mitigated\|accepted\|resolved, note, tcodesA: [], tcodesB: [] }` | Sheet 6. `a` / `b` = business role IDs (comma list allowed); `tcodesA` / `tcodesB` = T-code sets from the library — any business role with F or C on both sides is a conflict |
| `revisions[]` | `{ ver: "v0.1", date, author, change, approver, note }` | Sheet 7. The last row's `ver` is the document version |
| `source` | `{ system, readAt, patterns, users, roles }` | Set by `sync` |

Computed (never stored): T-code counts per role and level, users per role, SoD conflicts (`users` holding both sides, `inherent` business roles holding both sides), checks.
