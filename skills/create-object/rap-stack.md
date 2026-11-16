# create-object — RAP and S/4 CDS objects

Referenced by `SKILL.md` → `<RAP_Objects>`. `<RS>` = `node "<PLUGIN_ROOT>/scripts/create-object/rap-stack.mjs"`. The script is pure: it checks the system, the names and builds the ordered MCP calls with the source of every object; the executor only runs them.

## 1. Gate (Step 3.5, before any MCP call)

Read `sapVersion` and `abapRelease` of the active profile (`config.json`). Run `<RS> gate --version <S4|ECC> --release <abapRelease> --type <TYPE>`.

| Type | Minimum |
|---|---|
| CDS view (`define view`), table function | 7.50 |
| Metadata extension (DDLX), CDS unit test | 7.52 |
| Behavior definition, behavior pool, service definition / binding (RAP) | 7.54 |
| View entity, root view entity, projection view, custom / abstract entity, **RAP stack** | 7.55 |

- **ECC (any release) → refuse every CDS / RAP object**, classic `define view` included. Print the gate's `message` (ko / en) at the top of the report, make **no MCP call**, and offer classic objects (table, class, program) instead.
- S/4 with a release below the minimum → refuse that type with the gate's reason. An S/4 profile may carry an `8xx` value (e.g. `816`); it passes every threshold.
- Release unknown → stop and ask the user to set `abapRelease` in the profile.

## 2. Modes

| Request | Mode |
|---|---|
| "RAP stack", "RAP business object", "Fiori app from a table", "OData service from scratch" | **Stack** (`<RS> plan`) |
| One custom entity / table function / CDS unit test | **Single** (`<RS> single`) |
| One view, DDLX, BDEF, behavior pool, SRVD or SRVB on existing objects | Standard flow (Step 4) with the matching template below as the starting source |

## 3. Stack spec (Step 2 questions → one JSON file in `.sc4sap/work/…/rap/<entity>.spec.json`)

```json
{ "module": "MM", "entity": "PurchaseNote", "alias": "Note", "label": "Purchase note",
  "kind": "managed", "draft": true, "binding": "V4", "category": "ui",
  "sapVersion": "S4", "release": 816, "package": "ZMM_RAP", "transport": "<TRKORR>",
  "names": { "table": "ZMMT00010", "draftTable": "ZMMT00010D" },
  "fields": [ { "name": "po_number", "de": "EBELN" }, { "name": "note_text", "type": "abap.char(120)" } ] }
```

- `kind`: `managed` (default) or `unmanaged` (no draft in the templates). `draft`: managed only. `binding`: `V4` (default) or `V2`. `category`: `ui` (query projection + UI annotations) or `api` (interface projection `transactional_interface`, `interface` BDEF without a strict line, no DDLX; the base BDEF then must be strict — `strict ( 2 )`, `authorization master ( global )` and `get_global_authorizations` in the pool are set by default; `ZAPI_` SRVD prefix; see § 6 for the binding category).
- `fields`: business fields only — the UUID key (`item_uuid` / `ItemUuid`) and five admin fields (created by / at, local last changed by / at, last changed at) are added by the script. Type each field per `common/field-typing-rule.md` (`de` = data element first, `type` only as last resort).
- Names default per `common/naming-conventions.md` § CDS: root `ZR_{M}_{Entity}`, projection `ZC_{M}_{Entity}`, BDEF = the entity's own name (SAP rule), behavior pool `ZBP_R_{M}_{Entity}`, DDLX = projection name, SRVD `ZUI_{M}_{Entity}` / `ZAPI_{M}_{Entity}`, SRVB `{SRVD}_O4` / `_O2`. Tables follow the table convention and are named by the user (`names.table`, `names.draftTable`). Override any name in `names`.
- Limits checked by the script: tables and table fields 16, SRVB 26, everything else 30; with draft every CDS element name ≤ 16 (it is a draft-table column).

## 4. Plan and run

1. `<RS> plan --spec <spec.json> --out <plan.json>` → `{ ok, errors, steps[], names, manual[] }`. `ok: false` → show the errors (gate or names) and stop.
2. Show the user the names and the step count; confirm once.
3. Dispatch `sc4sap:sap-executor` with the plan path (dispatch-prompts.md § RAP). The executor runs `steps[]` **in order**, one MCP call per step with the given `tool` and `args`, and stops at the first failure (a `skeletonCheck` create that reports `preCheck syntax check failed` is tolerated: the object exists and the next Update writes the source).

Order (the plan encodes it): table → draft table (both activated by `UpdateTable`) → root view (`CreateView` + `UpdateView`) → `ActivateObjects` root (the projection's save pre-check needs an active base) → projection (`CreateView` + `UpdateView`) → `ActivateObjects` projection → root BDEF (`CreateBehaviorDefinition` + `UpdateBehaviorDefinition` saved, not activated — the pool's class check needs the source naming it) → behavior pool (`CreateBehaviorImplementation` + `UpdateBehaviorImplementation`, not activated) → `UpdateBehaviorDefinition` **activated** (the pool exists, inactive is enough; a mass activation of BDEF + class fails without a message) → `ActivateObjects` pool → projection BDEF (`Projection`, activated) → DDLX → SRVD → `CreateServiceBinding` (activated) → `GetInactiveObjects`.

Single plans: custom entity (`CreateView` + `UpdateView` + `ActivateObjects`, then query class `CreateClass` + `UpdateClass` implementing `IF_RAP_QUERY_PROVIDER` + `ActivateObjects` — the class pre-check needs the active DDLS), table function (same order: DDLS active first, then AMDP class `IF_AMDP_MARKER_HDB`), CDS unit test (`CreateClass` → `ActivateObjects` → `UpdateLocalTestClass` with `CL_CDS_TEST_ENVIRONMENT` on the active view → `ActivateObjects`; `CreateCdsUnitTest` drops the class source over MCP).

## 5. Templates (generic, in `rap-stack.mjs` → `tpl`)

| Template | Content |
|---|---|
| `table` / `draftTable` | `define table`, client key, UUID key `sysuuid_x16`; the draft table repeats the CDS element names + `include sych_bdl_draft_admin_inc` |
| `root` / `projection` | `define root view entity … as select from`, admin `@Semantics`; projection `transactional_query` + `@Metadata.allowExtensions` (ui) or `transactional_interface` (api) |
| `bdefManaged` | `managed implementation in class … unique`, optional `with draft`, persistent / draft table, `lock master total etag`, `etag master`, managed UUID numbering, read-only admin fields, draft actions (`Activate optimized` from release 757 on), `mapping for` |
| `bdefUnmanaged` / `poolUnmanaged` | unmanaged BDEF; handler stubs create / update / delete / read / lock and the saver (finalize … cleanup_finalize) |
| `bdefProjection` | `projection;` (ui) or `interface;` (api), `use draft;`, `use etag` (managed), `use create / update / delete`, draft actions |
| `poolManaged` | comment only — a handler class with no behavior method fails the class check; add `lhc_<alias>` with the first determination / validation / action |
| `ddlx` | `@Metadata.layer: #CORE`, header info, identification facet, line item / identification / selection fields |
| `srvd` | `define service … expose <projection> as <alias>` |
| `customEntity` / `queryClass`, `tableFunction` / `amdpClass` | single-object samples (paging read, `SESSION_CONTEXT('CLIENT')`) |

Strict mode is off unless the spec sets `"strict": 1 | 2`. Views carry `@AccessControl.authorizationCheck: #NOT_REQUIRED` (§ 6).

## 6. Manual steps (the MCP server has no tool — say so in the report, never fake them)

- **Publish** the service binding in ADT (Publish) or `/IWFND/V4_ADMIN` (V4) / `/IWFND/MAINT_SERVICE` (V2).
- **Binding category** UI vs Web API cannot be chosen by `CreateServiceBinding`; check in ADT and change it there when needed.
- **Access control (DCLS)** cannot be created; add one in ADT before productive use.

## 7. Report (Step 7)

Names created per step with the activation result, `GetInactiveObjects` (must be empty), the manual steps of § 6, the next actions (publish, preview in ADT, add validations / determinations / actions to the behavior pool). A failed step: the step number, tool, object and the SAP message verbatim; the steps after it were not run.
