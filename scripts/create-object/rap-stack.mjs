// sc4sap:create-object — RAP / S/4 objects: release gate, names, source templates and the ordered MCP call plan.
//
//   node rap-stack.mjs gate --version S4|ECC --release 816 [--type <TYPE>]      → { ok, refused: [...], allowed: [...] }
//   node rap-stack.mjs plan --spec <spec.json> [--out <plan.json>]              → the RAP stack as ordered MCP calls
//   node rap-stack.mjs single --spec <spec.json> [--out <plan.json>]            → one CDS object (custom entity, table function, CDS unit test …)
//
// Pure: no SAP call. The executor runs the steps in order (create → source → activate) and stops at the first error.
// Generic templates only — no customer, system or object names. Names follow common/naming-conventions.md (VDM):
//   root view ZR_{M}_{Entity} · projection ZC_{M}_{Entity} · basic ZI_{M}_{Entity} · BDEF = the entity's own name ·
//   behavior pool ZBP_R_{M}_{Entity} · DDLX = projection name · SRVD ZUI_{M}_{Entity} (UI) / ZAPI_{M}_{Entity} (API) ·
//   SRVB {SRVD}_O4 / _O2. Tables keep the table convention (the caller names them).

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : []);

// ── gate ──
/** Minimum ABAP release per object kind; ECC is refused for every one of them (no CDS / RAP creation on ECC). */
export const RAP_TYPES = {
  CDSView: 750, ViewEntity: 755, RootViewEntity: 755, ProjectionView: 755, CustomEntity: 755, AbstractEntity: 755, TableFunction: 750,
  MetadataExtension: 752, BehaviorDefinition: 754, BehaviorImplementation: 754, ServiceDefinition: 754, ServiceBinding: 754,
  CdsUnitTest: 752, RapStack: 755,
};
export const gateMessage = {
  en: (v, r) => `This system is ${v} ${r || ''} — CDS and RAP objects cannot be created here. Switch to an S/4HANA (ABAP 7.54+) profile, or use classic objects (table, class, program).`,
  ko: (v, r) => `이 시스템은 ${v}${r ? ` ${r}` : ''} 버전이라서 CDS / RAP 오브젝트를 만들 수 없어요. S/4HANA (ABAP 7.54+) 프로필로 바꾸거나 고전 오브젝트 (테이블, 클래스, 프로그램)를 쓰세요.`,
};
/** { ok, reason, minRelease } for one kind on a system (sapVersion ECC | S4, release like 740 / 816). */
export function rapGate({ sapVersion = '', release = 0, type = 'RapStack' } = {}) {
  const min = RAP_TYPES[type];
  if (!min) return { ok: false, reason: `unknown RAP / CDS type "${type}"`, minRelease: null };
  const v = String(sapVersion).toUpperCase();
  // abapRelease 7xx = the ABAP release; an S/4 profile may carry an 8xx value (e.g. 816) — newer than every threshold here
  const rel = Number(release) || 0;
  if (v !== 'S4') return { ok: false, reason: 'ecc', minRelease: min };
  if (!rel) return { ok: false, reason: 'release unknown — set abapRelease in the profile config.json', minRelease: min };
  if (rel < min) return { ok: false, reason: `needs ABAP ${min}+, this system is ${rel}`, minRelease: min };
  return { ok: true, reason: '', minRelease: min };
}

// ── names ──
export const LIMITS = { table: 16, field: 16, ddls: 30, bdef: 30, clas: 30, ddlx: 30, srvd: 30, srvb: 26 };
const up = (s) => String(s || '').toUpperCase();
const NAME_RE = /^[ZY][A-Z0-9_]*$/;
/** Default names for a module + entity (CamelCase entity kept in the source, names are upper-case objects). */
export function rapNames({ module = '', entity = '', category = 'ui', binding = 'V4', names = {} } = {}) {
  const M = up(module), E = String(entity || '').replace(/[^A-Za-z0-9]/g, '');
  const srvd = names.srvd || `${category === 'api' ? 'ZAPI' : 'ZUI'}_${M}_${E}`;
  const root = names.root || `ZR_${M}_${E}`;
  const projection = names.projection || `ZC_${M}_${E}`;
  return {
    root, projection, basic: names.basic || `ZI_${M}_${E}`,
    bp: names.bp || `ZBP_R_${M}_${E}`,
    ddlx: names.ddlx || projection,
    srvd, srvb: names.srvb || `${srvd}_${binding === 'V2' ? 'O2' : 'O4'}`,
    table: names.table || '', draftTable: names.draftTable || '',
  };
}
/** Errors for names: Z / Y namespace, characters, lengths (tables and table fields 16, SRVB 26, the rest 30). */
export function checkNames(n, { draft = false, fields = [] } = {}) {
  const errors = [];
  const chk = (kind, name, limit) => {
    if (!name) { errors.push(`${kind}: name missing`); return; }
    const N = up(name);
    if (!NAME_RE.test(N)) errors.push(`${kind} ${N}: must start with Z or Y and use A-Z 0-9 _ only`);
    if (N.length > limit) errors.push(`${kind} ${N}: ${N.length} characters, at most ${limit}`);
  };
  chk('table', n.table, LIMITS.table);
  if (draft) chk('draft table', n.draftTable, LIMITS.table);
  chk('root view', n.root, LIMITS.ddls); chk('projection view', n.projection, LIMITS.ddls);
  chk('behavior pool', n.bp, LIMITS.clas); chk('metadata extension', n.ddlx, LIMITS.ddlx);
  chk('service definition', n.srvd, LIMITS.srvd); chk('service binding', n.srvb, LIMITS.srvb);
  for (const f of fields) {
    if (!/^[a-z][a-z0-9_]*$/.test(f.name || '') || f.name.length > LIMITS.field) errors.push(`field ${f.name}: lower-case a-z 0-9 _, at most ${LIMITS.field} characters`);
    // with draft the draft table repeats the CDS element names as its columns → they share the 16-character limit
    if (draft && (!/^[A-Za-z][A-Za-z0-9]*$/.test(f.alias || '') || f.alias.length > LIMITS.field)) errors.push(`element ${f.alias}: letters / digits, at most ${LIMITS.field} characters (draft table column)`);
  }
  return errors;
}

// ── sources ──
const camel = (s) => String(s).split('_').filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
/** Admin fields (table field, CDS alias, type, semantics annotation) — aliases fit the 16-character draft limit. */
export const ADMIN = [
  ['created_by', 'CreatedBy', 'abp_creation_user', '@Semantics.user.createdBy: true'],
  ['created_at', 'CreatedAt', 'abp_creation_tstmpl', '@Semantics.systemDateTime.createdAt: true'],
  ['loc_chg_by', 'LocLastChgBy', 'abp_locinst_lastchange_user', '@Semantics.user.localInstanceLastChangedBy: true'],
  ['loc_chg_at', 'LocLastChgAt', 'abp_locinst_lastchange_tstmpl', '@Semantics.systemDateTime.localInstanceLastChangedAt: true'],
  ['last_chg_at', 'LastChangedAt', 'abp_lastchange_tstmpl', '@Semantics.systemDateTime.lastChangedAt: true'],
];
const fieldType = (f) => f.de ? String(f.de).toLowerCase() : f.type || 'abap.char(40)';
const tableHead = (label) => `@EndUserText.label : '${label}'\n@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #RESTRICTED`;

export const tpl = {
  /** Persistent table: client, UUID key, business fields, admin fields. */
  table: (s) => `${tableHead(s.label)}\ndefine table ${s.table.toLowerCase()} {\n  key client : mandt not null;\n  key ${s.key.name} : sysuuid_x16 not null;\n`
    + s.fields.map((f) => `  ${f.name} : ${fieldType(f)};\n`).join('') + ADMIN.map(([n, , t]) => `  ${n} : ${t};\n`).join('') + '}\n',
  /** Draft table: the CDS element names as columns plus the draft admin include. */
  draftTable: (s) => `${tableHead(`${s.label} (draft)`)}\ndefine table ${s.draftTable.toLowerCase()} {\n  key mandt : mandt not null;\n  key ${s.key.alias.toLowerCase()} : sysuuid_x16 not null;\n`
    + s.fields.map((f) => `  ${f.alias.toLowerCase()} : ${fieldType(f)};\n`).join('') + ADMIN.map(([, a, t]) => `  ${a.toLowerCase()} : ${t};\n`).join('')
    + '  "%admin" : include sych_bdl_draft_admin_inc;\n}\n',
  root: (s) => `@AccessControl.authorizationCheck: #NOT_REQUIRED\n@EndUserText.label: '${s.label}'\ndefine root view entity ${s.n.root}\n  as select from ${s.table.toLowerCase()}\n{\n  key ${s.key.name} as ${s.key.alias},\n`
    + s.fields.map((f) => `  ${f.name} as ${f.alias},\n`).join('')
    + ADMIN.map(([n, a, , sem], i) => `  ${sem}\n  ${n} as ${a}${i < ADMIN.length - 1 ? ',' : ''}\n`).join('') + '}\n',
  projection: (s) => `@AccessControl.authorizationCheck: #NOT_REQUIRED\n@EndUserText.label: '${s.label}'\n${s.category === 'api' ? '' : '@Metadata.allowExtensions: true\n'}define root view entity ${s.n.projection}\n  provider contract ${s.category === 'api' ? 'transactional_interface' : 'transactional_query'}\n  as projection on ${s.n.root}\n{\n  key ${s.key.alias},\n`
    + [...s.fields.map((f) => f.alias), ...ADMIN.map(([, a]) => a)].map((a, i, all) => `  ${a}${i < all.length - 1 ? ',' : ''}\n`).join('') + '}\n',
  bdefManaged: (s) => `managed implementation in class ${s.n.bp.toLowerCase()} unique;\n${s.strict}${s.draft ? 'with draft;\n' : ''}\ndefine behavior for ${s.n.root} alias ${s.alias}\npersistent table ${s.table.toLowerCase()}\n`
    + `${s.draft ? `draft table ${s.draftTable.toLowerCase()}\n` : ''}lock master${s.draft ? ' total etag LastChangedAt' : ''}\n${authLine(s)}etag master LocLastChgAt\n{\n  create;\n  update;\n  delete;\n`
    + `  field ( numbering : managed, readonly ) ${s.key.alias};\n  field ( readonly ) ${ADMIN.map(([, a]) => a).join(', ')};\n`
    // `optimized` only from 7.57 (S/4 2022) on
    + (s.draft ? `  draft action Edit;\n  draft action Activate${s.release >= 757 ? ' optimized' : ''};\n` + '  draft action Discard;\n  draft action Resume;\n  draft determine action Prepare;\n' : '')
    + `  mapping for ${s.table.toLowerCase()}\n  {\n    ${[[s.key.alias, s.key.name], ...s.fields.map((f) => [f.alias, f.name]), ...ADMIN.map(([n, a]) => [a, n])].map(([a, n]) => `${a} = ${n};`).join('\n    ')}\n  }\n}\n`,
  bdefUnmanaged: (s) => `unmanaged implementation in class ${s.n.bp.toLowerCase()} unique;\n${s.strict}\ndefine behavior for ${s.n.root} alias ${s.alias}\nlock master\n${authLine(s)}{\n  create;\n  update;\n  delete;\n  field ( readonly : update ) ${s.key.alias};\n}\n`,
  // api: interface projection (transactional_interface) with an interface BDEF and no UI layer; ui: query projection
  bdefProjection: (s) => `${s.category === 'api' ? 'interface' : 'projection'};\n${s.category === 'api' ? '' : s.strict}${s.draft ? 'use draft;\n' : ''}\ndefine behavior for ${s.n.projection} alias ${s.alias}\n${s.kind === 'managed' ? 'use etag\n' : ''}{\n  use create;\n  use update;\n  use delete;\n`
    + (s.draft ? '\n  use action Edit;\n  use action Activate;\n  use action Discard;\n  use action Resume;\n  use action Prepare;\n' : '') + '}\n',
  /** Implementations include of the behavior pool: a managed handler needs no method; unmanaged gets the CRUD / lock / saver stubs. */
  // a handler class without a behavior method fails the class check, so managed starts with no local class
  // strict: the handler gets the global authorization method (managed then has a real handler class)
  poolManaged: (s) => (s.strict
    ? `CLASS lhc_${s.alias.toLowerCase()} DEFINITION INHERITING FROM cl_abap_behavior_handler.\n  PRIVATE SECTION.\n${authDef(s)}ENDCLASS.\n\nCLASS lhc_${s.alias.toLowerCase()} IMPLEMENTATION.\n${authImpl(s)}ENDCLASS.\n`
    : `* Managed ${s.n.root}: the framework runs create / update / delete and the draft actions.\n`
      + `* Add CLASS lhc_${s.alias.toLowerCase()} INHERITING FROM cl_abap_behavior_handler here together with its first\n`
      + '* determination, validation, action or authorization method.\n'),
  poolUnmanaged: (s) => {
    const a = s.alias, h = `lhc_${a.toLowerCase()}`;
    return `CLASS ${h} DEFINITION INHERITING FROM cl_abap_behavior_handler.\n  PRIVATE SECTION.\n${s.strict ? authDef(s) : ''}`
      + `    METHODS create FOR MODIFY IMPORTING entities FOR CREATE ${a}.\n    METHODS update FOR MODIFY IMPORTING entities FOR UPDATE ${a}.\n`
      + `    METHODS delete FOR MODIFY IMPORTING keys FOR DELETE ${a}.\n    METHODS read FOR READ IMPORTING keys FOR READ ${a} RESULT result.\n`
      + `    METHODS lock FOR LOCK IMPORTING keys FOR LOCK ${a}.\nENDCLASS.\n\nCLASS ${h} IMPLEMENTATION.\n${s.strict ? `${authImpl(s)}\n` : ''}`
      + ['create', 'update', 'delete', 'read', 'lock'].map((m) => `  METHOD ${m}.\n    " TODO: ${m} — buffer the change; the saver writes it in save\n  ENDMETHOD.\n`).join('\n')
      + `ENDCLASS.\n\nCLASS lsc_${s.n.root.toLowerCase().slice(0, 26)} DEFINITION INHERITING FROM cl_abap_behavior_saver.\n  PROTECTED SECTION.\n`
      + '    METHODS finalize REDEFINITION.\n    METHODS check_before_save REDEFINITION.\n    METHODS save REDEFINITION.\n    METHODS cleanup REDEFINITION.\n    METHODS cleanup_finalize REDEFINITION.\nENDCLASS.\n\n'
      + `CLASS lsc_${s.n.root.toLowerCase().slice(0, 26)} IMPLEMENTATION.\n` + ['finalize', 'check_before_save', 'save', 'cleanup', 'cleanup_finalize'].map((m) => `  METHOD ${m}.\n  ENDMETHOD.\n`).join('\n') + 'ENDCLASS.\n';
  },
  ddlx: (s) => {
    const first = s.fields[0]?.alias || s.key.alias;
    return `@Metadata.layer: #CORE\n@UI.headerInfo: { typeName: '${s.label}', typeNamePlural: '${s.label}', title: { type: #STANDARD, value: '${first}' } }\nannotate entity ${s.n.projection} with\n{\n`
      + `  @UI.facet: [ { id: 'General', purpose: #STANDARD, type: #IDENTIFICATION_REFERENCE, label: 'General', position: 10 } ]\n  @UI.hidden: true\n  ${s.key.alias};\n`
      + s.fields.map((f, i) => `  @UI: { lineItem: [ { position: ${(i + 1) * 10} } ], identification: [ { position: ${(i + 1) * 10} } ]${i < 2 ? `, selectionField: [ { position: ${(i + 1) * 10} } ]` : ''} }\n  ${f.alias};\n`).join('')
      + '  @UI.hidden: true\n  LocLastChgAt;\n}\n';
  },
  srvd: (s) => `@EndUserText.label: '${s.label}'\ndefine service ${s.n.srvd} {\n  expose ${s.n.projection} as ${s.alias};\n}\n`,
  customEntity: (o) => `@EndUserText.label: '${o.label}'\n@ObjectModel.query.implementedBy: 'ABAP:${o.queryClass}'\ndefine custom entity ${o.name}\n{\n  key ItemId : abap.char(10);\n  ItemText : abap.char(40);\n}\n`,
  queryClass: (o) => `CLASS ${o.queryClass.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES if_rap_query_provider.\nENDCLASS.\n\n`
    + `CLASS ${o.queryClass.toLowerCase()} IMPLEMENTATION.\n  METHOD if_rap_query_provider~select.\n    DATA result TYPE STANDARD TABLE OF ${o.name.toLowerCase()} WITH EMPTY KEY.\n`
    + '    " sort ($orderby) and paging ($top / $skip) are applied to the rows; the filter ranges are read but NOT applied —\n'
    + '    " replace the sample rows with a real selection that uses the ranges (WHERE ... IN)\n'
    + '    DATA(paging) = io_request->get_paging( ).\n    DATA(top) = paging->get_page_size( ).\n    DATA(skip) = paging->get_offset( ).\n'
    + '    DATA(sort) = io_request->get_sort_elements( ).\n    TRY.\n        DATA(filter) = io_request->get_filter( )->get_as_ranges( ).\n      CATCH cx_rap_query_filter_no_range.\n        CLEAR filter.\n    ENDTRY.\n'
    + "    result = VALUE #( ( itemid = '0000000001' itemtext = 'Sample row' ) ( itemid = '0000000002' itemtext = 'Second row' ) ).\n"
    + '    DATA order TYPE abap_sortorder_tab.\n    order = VALUE #( FOR element IN sort ( name = element-element_name descending = element-descending ) ).\n'
    + '    IF order IS NOT INITIAL.\n      SORT result BY (order).\n    ENDIF.\n'
    + '    IF io_request->is_total_numb_of_rec_requested( ).\n      io_response->set_total_number_of_records( lines( result ) ).\n    ENDIF.\n'
    + '    IF io_request->is_data_requested( ).\n      IF skip > 0.\n        DELETE result TO skip.\n      ENDIF.\n      IF top > 0 AND lines( result ) > top.\n        DELETE result FROM top + 1.\n      ENDIF.\n      io_response->set_data( result ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n',
  /** CDS unit test: the test include of a plain global class — one local test class with the CDS test environment. */
  cdsTestLocal: (o) => `CLASS ltc_view DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.\n  PRIVATE SECTION.\n`
    + '    CLASS-DATA environment TYPE REF TO if_cds_test_environment.\n    CLASS-METHODS class_setup RAISING cx_static_check.\n    CLASS-METHODS class_teardown.\n'
    + '    METHODS setup.\n    METHODS empty_doubles_no_rows FOR TESTING RAISING cx_static_check.\nENDCLASS.\n\nCLASS ltc_view IMPLEMENTATION.\n'
    + `  METHOD class_setup.\n    environment = cl_cds_test_environment=>create( i_for_entity = '${o.view}' ).\n  ENDMETHOD.\n\n`
    + '  METHOD class_teardown.\n    environment->destroy( ).\n  ENDMETHOD.\n\n  METHOD setup.\n    environment->clear_doubles( ).\n  ENDMETHOD.\n\n'
    + '  METHOD empty_doubles_no_rows.\n    " next: environment->insert_test_data( i_data = <rows of a data source> ) and assert the view logic\n'
    + `    SELECT * FROM ${o.view.toLowerCase()} INTO TABLE @DATA(result).\n    cl_abap_unit_assert=>assert_initial( act = result msg = 'empty doubles must give no rows' ).\n  ENDMETHOD.\nENDCLASS.\n`,
  tableFunction: (o) => `@EndUserText.label: '${o.label}'\n@ClientHandling.type: #CLIENT_DEPENDENT\n@ClientHandling.algorithm: #SESSION_VARIABLE\ndefine table function ${o.name}\nreturns {\n  client : abap.clnt;\n  ItemId : abap.char(10);\n  ItemText : abap.char(40);\n}\nimplemented by method ${o.amdpClass.toLowerCase()}=>get_data;\n`,
  amdpClass: (o) => `CLASS ${o.amdpClass.toLowerCase()} DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES if_amdp_marker_hdb.\n    CLASS-METHODS get_data FOR TABLE FUNCTION ${o.name.toLowerCase()}.\nENDCLASS.\n\n`
    + `CLASS ${o.amdpClass.toLowerCase()} IMPLEMENTATION.\n  METHOD get_data BY DATABASE FUNCTION FOR HDB LANGUAGE SQLSCRIPT OPTIONS READ-ONLY.\n`
    + "    RETURN SELECT CAST( SESSION_CONTEXT('CLIENT') AS NVARCHAR(3) ) AS client, CAST( '0000000001' AS NVARCHAR(10) ) AS itemid,\n"
    + "                  CAST( 'Sample row' AS NVARCHAR(40) ) AS itemtext FROM dummy;\n  ENDMETHOD.\nENDCLASS.\n",
};

// ── plan ──
// strict mode only when asked (spec.strict 1 | 2): the profile's abapRelease does not tell the BDEF language version reliably
const authLine = (s) => (s.strict ? 'authorization master ( global )\n' : '');
const authDef = (s) => `    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION\n      IMPORTING REQUEST requested_authorizations FOR ${s.alias} RESULT result.\n`;
const authImpl = (s) => '  METHOD get_global_authorizations.\n    " TODO: AUTHORITY-CHECK for the user; return if_abap_behv=>auth-unauthorized where it fails\n'
  + `    result = VALUE #( %create = if_abap_behv=>auth-allowed %update = if_abap_behv=>auth-allowed %delete = if_abap_behv=>auth-allowed${s.draft ? ' %action-Edit = if_abap_behv=>auth-allowed' : ''} ).\n  ENDMETHOD.\n`;
const strictFor = (strict) => (Number(strict) === 2 ? 'strict ( 2 );\n' : Number(strict) === 1 ? 'strict;\n' : '');
const act = (objects) => ({ tool: 'ActivateObjects', args: { objects } });
const pkgArgs = (spec) => ({ package_name: spec.package || '$TMP', ...(spec.transport ? { transport_request: spec.transport } : {}) });
const tr = (spec) => (spec.transport ? { transport_request: spec.transport } : {});

/** Normalized stack spec with defaults (UUID key, aliases from field names). */
export function normalizeSpec(spec0 = {}) {
  const s = { kind: 'managed', draft: true, binding: 'V4', category: 'ui', package: '$TMP', ...spec0 };
  s.kind = s.kind === 'unmanaged' ? 'unmanaged' : 'managed';
  if (s.kind === 'unmanaged') s.draft = false; // the templates cover draft for managed only
  s.binding = s.binding === 'V2' ? 'V2' : 'V4';
  s.category = s.category === 'api' ? 'api' : 'ui';
  s.label = s.label || s.entity || 'Entity';
  s.alias = s.alias || String(s.entity || 'Entity').replace(/[^A-Za-z0-9]/g, '');
  s.n = rapNames(s);
  s.table = s.n.table; s.draftTable = s.n.draftTable;
  s.key = { name: 'item_uuid', alias: 'ItemUuid', ...(s.key || {}) };
  s.fields = arr(s.fields).map((f) => ({ ...f, name: String(f.name || '').toLowerCase(), alias: f.alias || camel(String(f.name || '')) }));
  // an interface BDEF (api) needs a strict base BDEF; strict needs authorization master → global auth in the pool
  if (s.category === 'api' && !s.strict) s.strict = 2;
  s.strict = strictFor(s.strict);
  return s;
}

/** The whole stack as ordered MCP calls; { ok:false, errors } on a refused gate or bad names. */
export function planStack(spec0) {
  const s = normalizeSpec(spec0);
  const gate = rapGate({ sapVersion: s.sapVersion, release: s.release, type: 'RapStack' });
  if (!gate.ok) return { ok: false, gate, errors: [gate.reason === 'ecc' ? gateMessage.en(s.sapVersion, s.release) : gate.reason], steps: [] };
  const errors = checkNames(s.n, { draft: s.draft, fields: s.fields });
  if (!s.fields.length) errors.push('fields: at least one business field');
  if (errors.length) return { ok: false, gate, errors, steps: [] };
  const n = s.n, P = pkgArgs(s), T = tr(s);
  const steps = [];
  const add = (phase, call) => steps.push({ seq: steps.length + 1, phase, ...call });
  if (s.createTable !== false) {
    add('table', { tool: 'CreateTable', args: { table_name: n.table, description: s.label, ...P } });
    add('table', { tool: 'UpdateTable', args: { table_name: n.table, ddl_code: tpl.table(s), activate: true, ...T } });
  }
  if (s.draft) {
    add('draft-table', { tool: 'CreateTable', args: { table_name: n.draftTable, description: `${s.label} (draft)`, ...P } });
    add('draft-table', { tool: 'UpdateTable', args: { table_name: n.draftTable, ddl_code: tpl.draftTable(s), activate: true, ...T } });
  }
  add('views', { tool: 'CreateView', args: { view_name: n.root, description: s.label, ...P } });
  add('views', { tool: 'UpdateView', args: { view_name: n.root, ddl_source: tpl.root(s), activate: false, ...T } });
  // the projection's save pre-check needs an active root view, so the root is activated on its own first
  add('views', act([{ name: n.root, type: 'DDLS/DF' }]));
  add('views', { tool: 'CreateView', args: { view_name: n.projection, description: `${s.label} (projection)`, ...P } });
  add('views', { tool: 'UpdateView', args: { view_name: n.projection, ddl_source: tpl.projection(s), activate: false, ...T } });
  add('views', act([{ name: n.projection, type: 'DDLS/DF' }]));
  add('behavior', { tool: 'CreateBehaviorDefinition', args: { name: n.root, root_entity: n.root, implementation_type: s.kind === 'unmanaged' ? 'Unmanaged' : 'Managed', description: s.label, activate: false, ...P } });
  // live on 8xx: the pool's class check needs the BDEF source naming it (saved, inactive is enough); a mass activation
  // of BDEF + pool fails without a message; the BDEF activates once the pool exists, then the pool activates
  add('behavior', { tool: 'UpdateBehaviorDefinition', args: { name: n.root, source_code: s.kind === 'unmanaged' ? tpl.bdefUnmanaged(s) : tpl.bdefManaged(s), activate: false, ...T } });
  add('behavior', { tool: 'CreateBehaviorImplementation', args: { class_name: n.bp, behavior_definition: n.root, description: `Behavior pool ${s.label}`, ...P } });
  add('behavior', { tool: 'UpdateBehaviorImplementation', args: { class_name: n.bp, behavior_definition: n.root, implementation_code: s.kind === 'unmanaged' ? tpl.poolUnmanaged(s) : tpl.poolManaged(s), activate: false, ...T } });
  add('behavior', { tool: 'UpdateBehaviorDefinition', args: { name: n.root, source_code: s.kind === 'unmanaged' ? tpl.bdefUnmanaged(s) : tpl.bdefManaged(s), activate: true, ...T } });
  add('behavior', act([{ name: n.bp, type: 'CLAS/OC' }]));
  // skeletonCheck: the MCP create writes an empty skeleton and syntax-checks it, so the call reports
  // "preCheck syntax check failed" although the object now exists — the next Update writes the real source
  add('projection-behavior', { tool: 'CreateBehaviorDefinition', skeletonCheck: true, args: { name: n.projection, root_entity: n.projection, implementation_type: 'Projection', description: `${s.label} (projection)`, activate: false, ...P } });
  add('projection-behavior', { tool: 'UpdateBehaviorDefinition', args: { name: n.projection, source_code: tpl.bdefProjection(s), activate: true, ...T } });
  // api (interface projection): no UI annotations, so no metadata extension
  if (s.category === 'ui') add('ui', { tool: 'CreateMetadataExtension', skeletonCheck: true, args: { name: n.ddlx, description: `${s.label} UI`, activate: false, ...P } });
  if (s.category === 'ui') add('ui', { tool: 'UpdateMetadataExtension', args: { name: n.ddlx, source_code: tpl.ddlx(s), activate: true, ...T } });
  add('service', { tool: 'CreateServiceDefinition', skeletonCheck: true, args: { service_definition_name: n.srvd, description: s.label, source_code: tpl.srvd(s), activate: false, ...P } });
  add('service', { tool: 'UpdateServiceDefinition', args: { service_definition_name: n.srvd, source_code: tpl.srvd(s), activate: true, ...T } });
  // ValidateServiceBinding is left out: S/4 816 answers "Resource controller does not support method GET"
  add('service', { tool: 'CreateServiceBinding', args: { service_binding_name: n.srvb, service_definition_name: n.srvd, binding_type: s.binding === 'V2' ? 'ODataV2' : 'ODataV4', description: s.label, activate: true, ...P } });
  add('verify', { tool: 'GetInactiveObjects', args: {} });
  return {
    ok: true, gate, names: n, kind: s.kind, draft: s.draft, binding: s.binding, category: s.category, steps,
    manual: [
      `Publish ${n.srvb} in ADT (Publish button) or /IWFND/V4_ADMIN (V4) / /IWFND/MAINT_SERVICE (V2) — the MCP server has no publish tool.`,
      `Binding category: the MCP server cannot choose UI vs Web API; check ${n.srvb} in ADT and change it there when "${s.category === 'api' ? 'Web API' : 'UI'}" is not what was created.`,
      'Access control (DCLS): no MCP create tool — the views carry @AccessControl.authorizationCheck: #NOT_REQUIRED; add a DCL in ADT before productive use.',
    ],
  };
}

/** One CDS object outside a stack: CustomEntity (+ query class), TableFunction (+ AMDP class), CdsUnitTest. */
export function planSingle(spec = {}) {
  const type = spec.type;
  const gate = rapGate({ sapVersion: spec.sapVersion, release: spec.release, type });
  if (!gate.ok) return { ok: false, gate, errors: [gate.reason === 'ecc' ? gateMessage.en(spec.sapVersion, spec.release) : gate.reason], steps: [] };
  const P = pkgArgs(spec), T = tr(spec), label = spec.label || spec.name;
  const errors = [];
  const chk = (kind, name, limit) => { const N = up(name); if (!N || !NAME_RE.test(N) || N.length > limit) errors.push(`${kind} ${N || '(missing)'}: Z / Y, A-Z 0-9 _, at most ${limit}`); };
  const steps = [];
  const add = (call) => steps.push({ seq: steps.length + 1, phase: type, ...call });
  if (type === 'CustomEntity') {
    chk('custom entity', spec.name, LIMITS.ddls); chk('query class', spec.queryClass, LIMITS.clas);
    const o = { name: up(spec.name), queryClass: up(spec.queryClass), label };
    add({ tool: 'CreateView', args: { view_name: o.name, description: label, ...P } });
    add({ tool: 'UpdateView', args: { view_name: o.name, ddl_source: tpl.customEntity(o), activate: false, ...T } });
    // the class save pre-check needs the active DDLS (row type / table function), so the DDLS goes first
    add(act([{ name: o.name, type: 'DDLS/DF' }]));
    add({ tool: 'CreateClass', args: { class_name: o.queryClass, description: `Query ${label}`, ...P } });
    add({ tool: 'UpdateClass', args: { class_name: o.queryClass, source_code: tpl.queryClass(o), activate: false, ...T } });
    add(act([{ name: o.queryClass, type: 'CLAS/OC' }]));
  } else if (type === 'TableFunction') {
    chk('table function', spec.name, LIMITS.ddls); chk('AMDP class', spec.amdpClass, LIMITS.clas);
    const o = { name: up(spec.name), amdpClass: up(spec.amdpClass), label };
    add({ tool: 'CreateView', args: { view_name: o.name, description: label, ...P } });
    add({ tool: 'UpdateView', args: { view_name: o.name, ddl_source: tpl.tableFunction(o), activate: false, ...T } });
    // the class save pre-check needs the active DDLS (row type / table function), so the DDLS goes first
    add(act([{ name: o.name, type: 'DDLS/DF' }]));
    add({ tool: 'CreateClass', args: { class_name: o.amdpClass, description: `AMDP ${label}`, ...P } });
    add({ tool: 'UpdateClass', args: { class_name: o.amdpClass, source_code: tpl.amdpClass(o), activate: false, ...T } });
    add(act([{ name: o.amdpClass, type: 'CLAS/OC' }]));
  } else if (type === 'CdsUnitTest') {
    chk('test class', spec.name, LIMITS.clas);
    if (!spec.cdsView) errors.push('cdsView: the CDS view under test');
    // CreateCdsUnitTest cannot create the class over MCP (its schema drops class_template / test_class_source and
    // the call falls into the "test run" path), so: global class → active → local test class in its test include
    const o = { name: up(spec.name), view: up(spec.cdsView || '') };
    add({ tool: 'CreateClass', args: { class_name: o.name, description: label, ...P } });
    add(act([{ name: o.name, type: 'CLAS/OC' }]));
    add({ tool: 'UpdateLocalTestClass', args: { class_name: o.name, test_class_code: tpl.cdsTestLocal(o), activate_on_update: false, ...T } });
    add(act([{ name: o.name, type: 'CLAS/OC' }]));
  } else errors.push(`single type must be CustomEntity, TableFunction or CdsUnitTest (got "${type}")`);
  if (errors.length) return { ok: false, gate, errors, steps: [] };
  steps.push({ seq: steps.length + 1, phase: 'verify', tool: 'GetInactiveObjects', args: {} });
  return { ok: true, gate, type, steps, manual: [] };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, ...args] = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    let r;
    if (cmd === 'gate') {
      const types = get('--type') ? [get('--type')] : Object.keys(RAP_TYPES);
      const res = types.map((type) => ({ type, ...rapGate({ sapVersion: get('--version'), release: get('--release'), type }) }));
      r = { ok: res.every((x) => x.ok), allowed: res.filter((x) => x.ok).map((x) => x.type), refused: res.filter((x) => !x.ok).map((x) => ({ type: x.type, reason: x.reason })),
        message: res.some((x) => x.reason === 'ecc') ? { en: gateMessage.en(get('--version'), get('--release')), ko: gateMessage.ko(get('--version'), get('--release')) } : undefined };
    } else if (cmd === 'plan' || cmd === 'single') {
      const spec = JSON.parse(readFileSync(resolve(get('--spec')), 'utf8'));
      r = cmd === 'plan' ? planStack(spec) : planSingle(spec);
      if (get('--out')) writeFileSync(resolve(get('--out')), `${JSON.stringify(r, null, 2)}\n`, 'utf8');
    } else { console.error('Usage: node rap-stack.mjs gate --version S4|ECC --release <n> [--type T] | plan --spec <json> [--out <json>] | single --spec <json> [--out <json>]'); process.exit(2); }
    console.log(JSON.stringify(cmd === 'gate' ? r : { ok: r.ok, errors: r.errors || [], steps: r.steps.length, names: r.names, manual: r.manual }, null, 2));
    process.exit(r.ok ? 0 : 1);
  } catch (e) { console.error(`rap-stack: ${e.message}`); process.exit(1); }
}
