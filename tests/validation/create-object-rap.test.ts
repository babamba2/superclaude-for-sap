import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { rapGate, RAP_TYPES, gateMessage, rapNames, checkNames, planStack, planSingle, normalizeSpec, tpl } from '../../scripts/create-object/rap-stack.mjs';

const ROOT = resolve(__dirname, '../..');
type Step = { seq: number; phase: string; tool: string; args: Record<string, any>; skeletonCheck?: boolean };
const base = { module: 'SD', entity: 'SalesNote', alias: 'Note', label: 'Sales note', sapVersion: 'S4', release: 816, package: '$TMP',
  names: { table: 'ZSDT00010', draftTable: 'ZSDT00010D' },
  fields: [{ name: 'order_no', de: 'VBELN' }, { name: 'note_text', type: 'abap.char(120)' }] };
const src = (s: Step) => s.args.ddl_code || s.args.ddl_source || s.args.source_code || s.args.implementation_code || '';
const objOf = (s: Step) => s.args.table_name || s.args.view_name || s.args.name || s.args.class_name || s.args.service_binding_name || s.args.service_definition_name || '';

describe('RAP gate', () => {
  it('refuses every CDS / RAP type on ECC (any release), with the message and no plan steps', () => {
    for (const release of [740, 731, 750]) for (const type of Object.keys(RAP_TYPES)) expect(rapGate({ sapVersion: 'ECC', release, type })).toMatchObject({ ok: false, reason: 'ecc' });
    const p = planStack({ ...base, sapVersion: 'ECC', release: 740 });
    expect(p).toMatchObject({ ok: false, steps: [] });
    expect(p.errors[0]).toBe(gateMessage.en('ECC', 740));
    expect(planSingle({ type: 'CustomEntity', name: 'ZX', queryClass: 'ZCL_X', sapVersion: 'ECC', release: 740 }).steps).toEqual([]);
    expect(gateMessage.ko('ECC', 740)).toMatch(/CDS \/ RAP/);
  });
  it('S/4 by minimum release; 8xx passes; unknown release and unknown type refuse', () => {
    expect(rapGate({ sapVersion: 'S4', release: 754, type: 'BehaviorDefinition' }).ok).toBe(true);
    expect(rapGate({ sapVersion: 'S4', release: 754, type: 'ViewEntity' })).toMatchObject({ ok: false, minRelease: 755 });
    expect(rapGate({ sapVersion: 'S4', release: 754, type: 'RapStack' }).ok).toBe(false);
    for (const type of Object.keys(RAP_TYPES)) expect(rapGate({ sapVersion: 'S4', release: 816, type }).ok).toBe(true);
    expect(rapGate({ sapVersion: 'S4', release: 0, type: 'CDSView' }).reason).toMatch(/release unknown/);
    expect(rapGate({ sapVersion: 'S4', release: 816, type: 'Dcls' }).reason).toMatch(/unknown/);
  });
});

describe('RAP names', () => {
  it('defaults follow the VDM convention; BDEF = entity name; DDLX = projection; SRVB from SRVD', () => {
    expect(rapNames({ module: 'sd', entity: 'SalesNote' })).toMatchObject({ root: 'ZR_SD_SalesNote', projection: 'ZC_SD_SalesNote', basic: 'ZI_SD_SalesNote',
      bp: 'ZBP_R_SD_SalesNote', ddlx: 'ZC_SD_SalesNote', srvd: 'ZUI_SD_SalesNote', srvb: 'ZUI_SD_SalesNote_O4' });
    expect(rapNames({ module: 'SD', entity: 'SalesNote', category: 'api', binding: 'V2' })).toMatchObject({ srvd: 'ZAPI_SD_SalesNote', srvb: 'ZAPI_SD_SalesNote_O2' });
  });
  it('checks namespace, characters and lengths (table 16, SRVB 26, others 30, draft elements 16)', () => {
    const n = { ...rapNames({ module: 'SD', entity: 'SalesNote' }), table: 'ZSDT00010', draftTable: 'ZSDT00010D' };
    expect(checkNames(n, { draft: true, fields: [{ name: 'order_no', alias: 'OrderNo' }] })).toEqual([]);
    const bad = checkNames({ ...n, table: 'ZSDT_TOO_LONG_NAME', srvb: 'ZUI_SD_VERY_LONG_ENTITY_NAME_O4', root: 'AR_SD_X', bp: '' }, { draft: true, fields: [{ name: 'Order No', alias: 'AVeryLongElementName' }] });
    expect(bad.join('\n')).toMatch(/table ZSDT_TOO_LONG_NAME: 18 characters, at most 16/);
    expect(bad.join('\n')).toMatch(/service binding .*at most 26/);
    expect(bad.join('\n')).toMatch(/root view AR_SD_X: must start with Z or Y/);
    expect(bad.join('\n')).toMatch(/behavior pool: name missing/);
    expect(bad.join('\n')).toMatch(/field Order No/);
    expect(bad.join('\n')).toMatch(/element AVeryLongElementName/);
    expect(planStack({ ...base, fields: [] }).errors).toContain('fields: at least one business field');
  });
});

describe('RAP stack plan', () => {
  it('managed + draft + V4: tools in the activation order the stack needs', () => {
    const p = planStack(base);
    expect(p.ok).toBe(true);
    expect(p.steps.map((s: Step) => `${s.tool}:${objOf(s) || (s.args.objects || []).map((o: any) => o.name).join('+')}`)).toEqual([
      'CreateTable:ZSDT00010', 'UpdateTable:ZSDT00010', 'CreateTable:ZSDT00010D', 'UpdateTable:ZSDT00010D',
      'CreateView:ZR_SD_SalesNote', 'UpdateView:ZR_SD_SalesNote', 'ActivateObjects:ZR_SD_SalesNote',
      'CreateView:ZC_SD_SalesNote', 'UpdateView:ZC_SD_SalesNote', 'ActivateObjects:ZC_SD_SalesNote',
      'CreateBehaviorDefinition:ZR_SD_SalesNote', 'UpdateBehaviorDefinition:ZR_SD_SalesNote', 'CreateBehaviorImplementation:ZBP_R_SD_SalesNote', 'UpdateBehaviorImplementation:ZBP_R_SD_SalesNote',
      'UpdateBehaviorDefinition:ZR_SD_SalesNote', 'ActivateObjects:ZBP_R_SD_SalesNote',
      'CreateBehaviorDefinition:ZC_SD_SalesNote', 'UpdateBehaviorDefinition:ZC_SD_SalesNote',
      'CreateMetadataExtension:ZC_SD_SalesNote', 'UpdateMetadataExtension:ZC_SD_SalesNote',
      'CreateServiceDefinition:ZUI_SD_SalesNote', 'UpdateServiceDefinition:ZUI_SD_SalesNote', 'CreateServiceBinding:ZUI_SD_SalesNote_O4', 'GetInactiveObjects:']);
    // the root view is active before the projection is saved (save pre-check); BDEF + pool go through one ActivateObjects
    expect(p.steps.filter((s: Step) => ['UpdateView', 'UpdateBehaviorImplementation'].includes(s.tool)).every((s: Step) => s.args.activate === false)).toBe(true);
    // root BDEF saved first (the pool's class check needs it), activated after the pool exists
    expect(p.steps.filter((s: Step) => s.tool === 'UpdateBehaviorDefinition' && s.args.name === 'ZR_SD_SalesNote').map((s: Step) => s.args.activate)).toEqual([false, true]);
    expect(p.steps.find((s: Step) => s.tool === 'ActivateObjects' && s.phase === 'behavior').args.objects).toEqual([{ name: 'ZBP_R_SD_SalesNote', type: 'CLAS/OC' }]);
    expect(p.steps.find((s: Step) => s.tool === 'CreateServiceBinding').args.binding_type).toBe('ODataV4');
    expect(p.manual.join(' ')).toMatch(/Publish .*UI vs Web API.*DCLS/s);
    expect(p.steps.some((s: Step) => /^Delete/.test(s.tool))).toBe(false);
  });
  it('sources: draft BDEF, mapping of every element, draft table columns = element names, projection with draft', () => {
    const s = normalizeSpec(base);
    const bdef = tpl.bdefManaged(s);
    expect(bdef).toMatch(/^managed implementation in class zbp_r_sd_salesnote unique;\nwith draft;/);
    expect(bdef).toContain('draft table zsdt00010d');
    expect(bdef).toContain('lock master total etag LastChangedAt');
    expect(bdef).toContain('field ( numbering : managed, readonly ) ItemUuid;');
    for (const pair of ['ItemUuid = item_uuid;', 'OrderNo = order_no;', 'NoteText = note_text;', 'LocLastChgAt = loc_chg_at;']) expect(bdef).toContain(pair);
    expect(bdef).not.toMatch(/strict/);
    expect(tpl.bdefManaged(normalizeSpec({ ...base, strict: 2 }))).toContain('strict ( 2 );');
    const draft = tpl.draftTable(s);
    for (const col of ['itemuuid', 'orderno', 'notetext', 'loclastchgat', '"%admin" : include sych_bdl_draft_admin_inc']) expect(draft).toContain(col);
    expect(tpl.table(s)).toContain('order_no : vbeln;');
    expect(tpl.projection(s)).toMatch(/define root view entity ZC_SD_SalesNote\n  provider contract transactional_query\n  as projection on ZR_SD_SalesNote/);
    expect(tpl.bdefProjection(s)).toMatch(/projection;\nuse draft;[\s\S]*use action Edit;/);
    expect(tpl.srvd(s)).toContain('expose ZC_SD_SalesNote as Note;');
    expect(tpl.ddlx(s)).toContain('annotate entity ZC_SD_SalesNote with');
    for (const t of [tpl.table(s), draft, tpl.root(s), tpl.projection(s), bdef, tpl.ddlx(s), tpl.srvd(s)]) expect((t.match(/\{/g) || []).length).toBe((t.match(/\}/g) || []).length);
  });
  it('unmanaged + V2 + api: no draft steps, CRUD / lock / saver stubs, ZAPI service', () => {
    const p = planStack({ ...base, kind: 'unmanaged', draft: true, binding: 'V2', category: 'api', names: { table: 'ZSDT00020' } });
    expect(p.ok).toBe(true);
    expect(p.draft).toBe(false);
    expect(p.steps.some((s: Step) => s.phase === 'draft-table')).toBe(false);
    expect(p.names).toMatchObject({ srvd: 'ZAPI_SD_SalesNote', srvb: 'ZAPI_SD_SalesNote_O2' });
    expect(p.steps.find((s: Step) => s.tool === 'CreateBehaviorDefinition').args.implementation_type).toBe('Unmanaged');
    const pool = p.steps.find((s: Step) => s.tool === 'UpdateBehaviorImplementation').args.implementation_code;
    for (const m of ['METHODS create FOR MODIFY', 'METHODS read FOR READ', 'METHODS lock FOR LOCK', 'INHERITING FROM cl_abap_behavior_saver', 'METHODS save REDEFINITION']) expect(pool).toContain(m);
    expect(p.steps.find((s: Step) => s.tool === 'CreateServiceBinding').args.binding_type).toBe('ODataV2');
    const bdefC = src(p.steps.find((s: Step) => s.tool === 'UpdateBehaviorDefinition' && s.args.name === 'ZC_SD_SalesNote'));
    expect(bdefC).not.toMatch(/draft|use etag/);
    // api = interface projection: transactional_interface, interface BDEF, no UI layer
    expect(bdefC).toMatch(/^interface;\n\n/); // no strict line in an interface BDEF (live: "strict" not expected)
    // the interface BDEF needs a strict base: strict ( 2 ) + global authorization in BDEF and pool
    expect(src(p.steps.filter((s: Step) => s.tool === 'UpdateBehaviorDefinition' && s.args.name === 'ZR_SD_SalesNote').pop())).toMatch(/strict \( 2 \);[\s\S]*authorization master \( global \)/);
    expect(pool).toMatch(/METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION[\s\S]*METHOD get_global_authorizations\.[\s\S]*if_abap_behv=>auth-allowed/);
    const proj = src(p.steps.find((s: Step) => s.tool === 'UpdateView' && s.args.view_name === 'ZC_SD_SalesNote'));
    expect(proj).toContain('provider contract transactional_interface');
    expect(proj).not.toContain('@Metadata.allowExtensions');
    expect(p.steps.some((s: Step) => /MetadataExtension/.test(s.tool))).toBe(false);
  });

  it('review fixes: Activate optimized only from 7.57, projection BDEF uses the etag (managed), skeleton creates', () => {
    const p = planStack(base);
    const rootOf = (q: any) => src(q.steps.filter((s: Step) => s.tool === 'UpdateBehaviorDefinition' && s.args.name === 'ZR_SD_SalesNote').pop());
    expect(rootOf(p)).toContain('draft action Activate optimized;');
    expect(rootOf(planStack({ ...base, release: 757 }))).toContain('draft action Activate optimized;');
    expect(rootOf(planStack({ ...base, release: 756 }))).toContain('draft action Activate;');
    expect(src(p.steps.find((s: Step) => s.tool === 'UpdateView' && s.args.view_name === 'ZC_SD_SalesNote'))).toMatch(/@Metadata.allowExtensions: true[\s\S]*transactional_query/);
    expect(src(p.steps.find((s: Step) => s.tool === 'UpdateBehaviorDefinition' && s.args.name === 'ZC_SD_SalesNote'))).toMatch(/^projection;/);
    // creates that syntax-check an empty skeleton are marked, and each is followed by the Update that writes the source
    const sk = p.steps.filter((s: Step) => s.skeletonCheck);
    expect(sk.map((s: Step) => s.tool)).toEqual(['CreateBehaviorDefinition', 'CreateMetadataExtension', 'CreateServiceDefinition']);
    for (const s of sk) expect(p.steps[s.seq].tool).toBe(s.tool.replace('Create', 'Update'));
    expect(src(p.steps.find((s: Step) => s.tool === 'UpdateBehaviorDefinition' && s.args.name === 'ZC_SD_SalesNote'))).toMatch(/alias \w+\nuse etag\n\{/);
  });
});

describe('RAP single objects', () => {
  it('custom entity + query class, table function + AMDP class: DDLS activated before the class is saved', () => {
    const ce = planSingle({ type: 'CustomEntity', name: 'ZI_SD_NoteQuery', queryClass: 'ZCL_SD_NOTE_QUERY', sapVersion: 'S4', release: 816 });
    expect(ce.steps.map((s: Step) => s.tool)).toEqual(['CreateView', 'UpdateView', 'ActivateObjects', 'CreateClass', 'UpdateClass', 'ActivateObjects', 'GetInactiveObjects']);
    expect(src(ce.steps[1])).toContain("@ObjectModel.query.implementedBy: 'ABAP:ZCL_SD_NOTE_QUERY'");
    expect(src(ce.steps[4])).toMatch(/INTERFACES if_rap_query_provider[\s\S]*get_paging/);
    const tf = planSingle({ type: 'TableFunction', name: 'ZI_SD_NoteTf', amdpClass: 'ZCL_SD_NOTE_TF', sapVersion: 'S4', release: 816 });
    expect(src(tf.steps[1])).toContain('implemented by method zcl_sd_note_tf=>get_data;');
    expect(src(tf.steps[4])).toMatch(/BY DATABASE FUNCTION FOR HDB LANGUAGE SQLSCRIPT/);
    expect(src(tf.steps[4])).toMatch(/AS NVARCHAR\(10\) \) AS itemid[\s\S]*AS NVARCHAR\(40\) \) AS itemtext/);
    expect(src(ce.steps[4])).toMatch(/get_offset\( \)[\s\S]*get_sort_elements\( \)[\s\S]*get_filter\( \)[\s\S]*SORT result BY \(order\)[\s\S]*DELETE result TO skip/);
    expect(src(ce.steps[4])).toContain('filter ranges are read but NOT applied');
    const ut = planSingle({ type: 'CdsUnitTest', name: 'ZCL_SD_NOTE_TEST', cdsView: 'ZR_SD_SalesNote', sapVersion: 'S4', release: 816 });
    // CreateCdsUnitTest cannot create the class over MCP: global class → activate → local test class → activate
    expect(ut.steps.map((s: Step) => s.tool)).toEqual(['CreateClass', 'ActivateObjects', 'UpdateLocalTestClass', 'ActivateObjects', 'GetInactiveObjects']);
    expect(ut.steps[0].args.class_name).toBe('ZCL_SD_NOTE_TEST');
    expect(ut.steps[2].args.test_class_code).toMatch(/FOR TESTING[\s\S]*cl_cds_test_environment=>create\( i_for_entity = 'ZR_SD_SALESNOTE' \)[\s\S]*FROM zr_sd_salesnote/);
    expect(planSingle({ type: 'Dcls', sapVersion: 'S4', release: 816 }).ok).toBe(false);
  });
});

describe('create-object skill documents', () => {
  const md = (f: string) => readFileSync(join(ROOT, 'skills/create-object', f), 'utf8');
  it('the gate and the stack are documented; naming references agree', () => {
    expect(md('SKILL.md')).toContain('<RAP_Objects>');
    expect(md('workflow-steps.md')).toMatch(/CDS \/ RAP object.*gate/);
    expect(md('rap-stack.md')).toMatch(/ECC \(any release\) → refuse every CDS \/ RAP object/);
    expect(md('dispatch-prompts.md')).toContain('## RAP — sap-executor runs a plan');
    const objects = readFileSync(join(ROOT, 'configs/common/naming-conventions-objects.md'), 'utf8');
    expect(objects).not.toMatch(/Z_BP_|Z_SB_|Z_SD_\{|Z_P_\{/);
    expect(objects).toContain('same name as its root entity');
  });
  it('the generator holds no customer or system names', () => {
    const js = readFileSync(join(ROOT, 'scripts/create-object/rap-stack.mjs'), 'utf8');
    expect(js).not.toMatch(/HKT|BXD|ES-DEV|S4-DEV|HKD|ZSC4SAP/);
  });
});
