import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { parseXml, loadSmartForm, inventory, symbolsOf } from '../../scripts/adobe/sf-inventory.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { planMigration, pageList, encodeName, fieldSupported, rectifyOptions, OPTION_PRESETS } from '../../scripts/adobe/sf-to-adobe-plan.mjs';

// A self-written SmartForm XML (fictitious ZDEMO names, no SAP content) with one node of every kind the rules treat
// differently: windows shown on two pages, a complex table with header / sort / body / footer, a 4.6C table, a loop
// over an undeclared table, an alternative, a command, code with a blank parameter, a dynamic graphic, an address,
// a text module, an include text and a text type the migration has no branch for.
const XML = readFileSync(join(__dirname, '..', 'fixtures', 'adobe', 'sf-synthetic.xml'), 'utf8');
const model = () => loadSmartForm(XML);

describe('smartform-to-adobe — inventory', () => {
  it('reads the XML subset: entities, attributes, self-closing tags; refuses a broken tree', () => {
    const t = parseXml('<?xml version="1.0"?><a x="1 &amp; 2"><b/><c>&lt;x&gt; &#65;&#x42;</c></a>');
    expect(t.children[0].attrs.x).toBe('1 & 2');
    expect(t.children[0].children.map((c: any) => c.tag)).toEqual(['b', 'c']);
    expect(t.children[0].children[1].text).toBe('<x> AB');
    expect(() => parseXml('<a><b></a>')).toThrow(/closes/);
  });

  it('counts every node once by kind; a window shown again on a later page is one node with its pages', () => {
    const inv = inventory(model());
    expect(inv.total).toBe(37);
    expect(inv.counts).toMatchObject({ page: 3, 'window-main': 1, 'window-secondary': 1, 'window-graphic': 1, ctable: 1, table46: 1, loop: 1, row: 2, cell: 2,
      'event-header': 1, 'event-body': 1, 'event-footer': 1, 'event-sort-begin': 1, 'event-true': 1, 'event-false': 1, alternative: 1, command: 1, code: 1,
      graphic: 1, address: 1, 'text-module': 1, 'text-include': 1, 'text-other': 1, 'text-element': 7 });
    expect(inv.nodes.find((n: any) => n.name === 'MAIN').pages).toEqual(['FIRST', 'NEXT']);
    expect(inv.nodes.find((n: any) => n.name === 'TAB_ITEMS')).toMatchObject({ calc: 1, sort: 1, where: 1 });
    expect(inv.interface.tables.map((p: any) => p.name)).toEqual(['IT_ITEMS']);
    expect(inv.pages.map((p: any) => `${p.name}>${p.next}`)).toEqual(['FIRST>NEXT', 'NEXT>NEXT', 'LAST>']);
  });

  it('symbols: output options cut off, comment lines and && skipped', () => {
    expect(symbolsOf([{ format: 'AS', text: 'A &X-Y(Z)& &&lit &SFSY-PAGE& &X-Y&' }, { format: '/*', text: '&HIDDEN&' }])).toEqual(['X-Y', 'SFSY-PAGE']);
    // <(>&<)> is a protected literal '&'; &'pre'NAME'post'& prints NAME between two texts
    expect(symbolsOf([{ format: 'AS', text: '<IT><(>&<)>GS_A-B&</> &GS_N-NO&&\'/ \'GS_N-DATE& &\'(\'GS_N-QTY(C)\')\'&' }])).toEqual(['GS_N-NO', 'GS_N-DATE', 'GS_N-QTY']);
  });
});

describe('smartform-to-adobe — SAP helper rules', () => {
  it('ENCODE_SF_NAME: upper case, X<hex>_ for other characters, field symbols X3C_', () => {
    expect(encodeName('%event2')).toBe('X25_EVENT2');
    expect(encodeName('a-b_c')).toBe('A-B_C');
    expect(encodeName('-X')).toBe('X2D_X');
    expect(encodeName('<FS_ITEM>')).toBe('X3C_FS_ITEM');
    expect(encodeName('A B')).toBe('AX20_B');
  });

  it('IS_FIELD_SUPPORTED: the listed system fields and the standard parameters are not', () => {
    for (const f of ['SFSY-JOBPAGES', 'SFSY.XSF', 'SFSY-COPYCOUNT0', 'OUTPUT_OPTIONS-TDDEST', 'CONTROL_PARAMETERS']) expect(fieldSupported(f)).toBe(false);
    for (const f of ['SFSY-PAGE', 'SFSY-FORMPAGES', 'SFSY-DATE', 'IS_HEAD-VBELN', '']) expect(fieldSupported(f)).toBe(true);
  });

  it('RECTIFY_MIGRATING_OPTIONS: all beats true, binding beats placeholder, no context = no layout', () => {
    const r = rectifyOptions({ ...OPTION_PRESETS.full });
    expect([r.alternative_all, r.alternative_true, r.text_binding, r.text_placeholder]).toEqual([true, false, true, false]);
    expect(rectifyOptions({ context: false, layout: true, table: true })).toMatchObject({ layout: false, table: false });
    expect(OPTION_PRESETS['sap-default']).toMatchObject({ table: false, condition_data: false, coding: false, template: true, command_pagebreak: true });
  });

  it('CONVERT_SF2XFT_PAGELIST: a page that repeats itself is unbounded; a cycle opens a nested page set', () => {
    expect(pageList([{ name: 'FIRST', next: 'NEXT' }, { name: 'NEXT', next: 'NEXT' }]).map((e: any) => `${e.el}${e.name ? `:${e.name}` : ''}(${e.min ?? ''},${e.max ?? ''})`))
      .toEqual(['pageSet(0,1)', 'pageArea:FIRST(0,1)', 'pageArea:NEXT(0,-1)', '/pageSet(,)']);
    expect(pageList([{ name: 'A', next: 'B' }, { name: 'B', next: 'A' }]).map((e: any) => e.el + (e.name ? `:${e.name}` : '')))
      .toEqual(['pageSet', 'pageSet', 'pageArea:A', 'pageArea:B', '/pageSet', '/pageSet']);
    expect(pageList([{ name: 'P1', next: '' }]).map((e: any) => e.el)).toEqual(['pageSet', 'pageArea', '/pageSet']);
  });
});

describe('smartform-to-adobe — plan (full options)', () => {
  const plan = planMigration(model(), { options: 'full' });
  const node = (name: string) => plan.nodes.find((n: any) => n.name === name);

  it('every inventory node has exactly one entry, mapped or explained; none is silently left out', () => {
    expect(plan.nodes).toHaveLength(37);
    expect(new Set(plan.nodes.map((n: any) => n.id)).size).toBe(37);
    for (const n of plan.nodes) if (n.status === 'gap') expect(n.messages.some((m: any) => m.type === 'E') || n.gaps.length > 0).toBe(true);
    expect(plan.completeness.mapped + plan.completeness.warning + plan.completeness.gap).toBe(37);
  });

  it('predicts the SAP log in walk order, with the m05 guesses marked', () => {
    expect(plan.log.map((m: any) => `${m.code}:${m.node}`)).toEqual([
      'm04:T_INTRO', 'm05:T_INTRO', 'm09:TAB_ITEMS', 'm10:TAB_ITEMS', 'm04:ROW_B', 'm04:ROW_B', 'm04:ROW_B', 'm14:C_SUM', 'm04:C_SUM', 'm03:C_SUM',
      'm07:OLD_TAB', 'm05:BAD_LOOP', 'm13:BAD_LOOP', 'm06:CMD_NEXT', 'm02:A_CUST', 'm02:A_CUST']);
    expect(plan.log.filter((m: any) => m.code === 'm05').every((m: any) => m.predicted)).toBe(true);
    expect(plan.result).toBe('aborted');
    expect(plan.aborted.node).toBe('BAD_LOOP');
  });

  it('SET_FP_CONDITION reads the previous row: after an unsupported field every later row is dropped', () => {
    const folder = JSON.stringify(plan.context);
    expect(folder).toContain('"condition":["SFSY-XSF NE INITIAL"]');
    expect(node('ROW_B').status).toBe('warning');
  });

  it('silent gaps carry a reason, an action and the node path: group begin, layout condition, dynamic graphic, BTF text, break target', () => {
    const silent = plan.gaps.filter((g: any) => !g.logged).map((g: any) => g.node);
    expect(silent).toEqual(expect.arrayContaining(['%EV_S', 'T_INTRO', 'G_LOGO', 'T_BTF', 'CMD_NEXT']));
    for (const g of plan.gaps) expect(g.reason.length > 10 && g.action.length > 5 && g.path.length > 0).toBe(true);
    const lp = plan.gaps.find((g: any) => g.node === 'T_INTRO' && !g.logged);
    expect(lp.reason).toMatch(/LPAGE/);
    expect(lp.action).toMatch(/\$layout\.page\(ref\(\$\)\) <> \$layout\.pageCount\(\)/);
    expect(lp.action).toMatch(/main window: a presence change/); // T_INTRO flows in the main window
    expect(plan.gaps.find((g: any) => g.node === '%EV_S').reason).toMatch(/group begin \(MATNR\).*every row/);
    expect(plan.gaps.find((g: any) => g.node === 'OLD_TAB').action).toMatch(/Designer table/);
  });

  it('a footer whose table has no footer flag never prints in SmartForms either: an info row, not a gap', () => {
    expect(plan.gaps.map((g: any) => g.node)).not.toContain('%EV_F');
    expect(plan.infos.map((i: any) => i.node)).toEqual(expect.arrayContaining(['%EV_F', 'T_FOOT']));
    expect(node('%EV_F').status).toBe('mapped');
  });

  it('interface: every parameter incl. the standard ones, global data, init coding; windows: main once, secondary per page', () => {
    expect(plan.interface).toMatchObject({ import: ['OUTPUT_OPTIONS', 'IS_HEAD'], export: ['JOB_OUTPUT_INFO'], tables: ['IT_ITEMS'], exceptions: ['FORMATTING_ERROR'],
      globalData: ['GS_ITEM', 'GV_TOTAL'], initLines: 3, formRoutineLines: 1, initInput: ['IS_HEAD'], initOutput: ['GV_TOTAL'] });
    const lay = JSON.stringify(plan.layout);
    expect(lay.split('"el":"subform","name":"MAIN"').length - 1).toBe(1); // the main window's flow subform: once
    expect(lay.split('"el":"contentArea","name":"MAIN"').length - 1).toBe(2);
    expect(lay).toContain('"name":"FIRST_ADR"');
    expect(lay).toContain('"name":"NEXT_ADR"');
    expect(plan.windowRefs.map((r: any) => r.page)).toEqual(['NEXT', 'NEXT']);
    expect(lay).toContain('"layoutCondition":"$layout.absPage(ref($)) == \\"1\\""');
  });
});

describe('smartform-to-adobe — plan (other options and form types)', () => {
  it('sap-default (MIGRATE without options): tables flattened, code and conditions dropped — each said', () => {
    const p = planMigration(model(), { options: 'sap-default' });
    const reasons = p.gaps.map((g: any) => `${g.node}: ${g.reason}`).join('\n');
    expect(reasons).toMatch(/TAB_ITEMS: table \/ loop not migrated as a repeating node/);
    expect(reasons).toMatch(/C_SUM: program lines dropped/);
    expect(reasons).toMatch(/ROW_B: data condition not migrated \(option condition_data off\)/);
    expect(reasons).toMatch(/ALT_PAY: alternative: both branches are migrated and print unconditionally/);
    expect(p.log.map((m: any) => m.code)).not.toContain('m09');
    expect(p.nodes).toHaveLength(37);
  });

  it('page-break footer values, code in a group area, an earlier table\'s footer anchor reused, copies window', () => {
    // two tables: the first has a footer "always" with a total, the second a footer without flag (the anchor stays)
    const T = (name: string, text: string) => `<sf:NODE><NODETYPE>TI</NODETYPE><sf:OBJ><sf:TEXT><NAME><INAME>${name}</INAME></NAME><TEXT><item><TDFORMAT>AS</TDFORMAT><TDLINE>${text}</TDLINE></item></TEXT></sf:TEXT></sf:OBJ><sf:SUCC/></sf:NODE>`;
    const EV = (name: string, t: string, inner: string, extra = '') => `<sf:NODE><NODETYPE>EV</NODETYPE><sf:OBJ><sf:EVENT><NAME><INAME>${name}</INAME></NAME><EVTYPE>${t}</EVTYPE>${extra}</sf:EVENT></sf:OBJ><sf:SUCC>${inner}</sf:SUCC></sf:NODE>`;
    const LOOP = (name: string, footer: string, inner: string) => `<sf:NODE><NODETYPE>SE</NODETYPE><sf:OBJ><sf:SECTION><NAME><INAME>${name}</INAME></NAME><SECTTYPE>L</SECTTYPE><TABNAME>IT_ITEMS</TABNAME><TABHEADER>GS_ITEM</TABHEADER>${footer ? `<OTABFOOTER>${footer}</OTABFOOTER>` : ''}</sf:SECTION></sf:OBJ><sf:SUCC>${inner}</sf:SUCC></sf:NODE>`;
    const CODE = '<sf:NODE><NODETYPE>CO</NODETYPE><sf:OBJ><sf:CODE><NAME><INAME>C_RESET</INAME></NAME></sf:CODE></sf:OBJ><sf:SUCC/></sf:NODE>';
    const xml = `<?xml version="1.0"?><sf:SMARTFORM xmlns:sf="x"><HEADER><FORMNAME>ZDEMO_T2</FORMNAME></HEADER><INTERFACE><item><IOTYPE>T</IOTYPE><NAME>IT_ITEMS</NAME></item></INTERFACE><GDATA><item><NAME>GS_ITEM</NAME></item><item><NAME>GV_SUM</NAME></item></GDATA>
<sf:VARHEADER><sf:item><PAGEFORMAT>DINA4</PAGEFORMAT><sf:PAGETREE><sf:NODE><NODETYPE>RP</NODETYPE><sf:SUCC><sf:NODE><NODETYPE>PA</NODETYPE><sf:OBJ><sf:PAGE><NAME><INAME>P1</INAME></NAME><NEXTPAGE><INAME>P1</INAME></NEXTPAGE></sf:PAGE></sf:OBJ><sf:SUCC>
<sf:NODE><NODETYPE>WI</NODETYPE><sf:OBJ><sf:WINDOW ID="1"><NAME><INAME>MAIN</INAME></NAME><WTYPE>M</WTYPE><sf:PROC_CTRL><sf:NODE><NODETYPE>RC</NODETYPE><sf:SUCC>
${LOOP('L1', 'A', EV('%F1', 'F', T('T_SUM', 'Carry forward &amp;GV_SUM&amp;')) + EV('%S1', 'S', CODE, '<SFIELD>MATNR</SFIELD>'))}
${LOOP('L2', '', EV('%F2', 'F', T('T_STALE', 'never printed')))}
</sf:SUCC></sf:NODE></sf:PROC_CTRL></sf:WINDOW></sf:OBJ><sf:SUCC/></sf:NODE>
<sf:NODE><NODETYPE>WI</NODETYPE><sf:OBJ><sf:WINDOW ID="2"><NAME><INAME>COPY</INAME></NAME><WTYPE>C</WTYPE></sf:WINDOW></sf:OBJ><sf:SUCC/></sf:NODE>
</sf:SUCC></sf:NODE></sf:SUCC></sf:NODE></sf:PAGETREE></sf:item></sf:VARHEADER></sf:SMARTFORM>`;
    const full = planMigration(loadSmartForm(xml), { options: 'full' });
    const g = (n: string) => full.gaps.find((x: any) => x.node === n);
    expect(g('%F1').reason).toMatch(/at page breaks shows GV_SUM.*end value/);
    expect(g('C_RESET').reason).toMatch(/run for every row/);
    expect(full.infos.find((i: any) => i.node === '%F2').note).toMatch(/prototype subform that is placed nowhere.*L1/);
    expect(g('COPY').action).toMatch(/once per copy/);
    // with header_footer off the same stale anchor makes the area print once — SmartForms never prints it
    const off = planMigration(loadSmartForm(xml), { options: { ...OPTION_PRESETS.full, header_footer: false } });
    expect(off.gaps.find((x: any) => x.node === '%F2').reason).toMatch(/never prints it, but SAP migrates its content into the flow/);
  });

  it('alternative_true keeps only the TRUE branch', () => {
    const p = planMigration(model(), { options: { ...OPTION_PRESETS.full, alternative_all: false, alternative_true: true } });
    expect(p.gaps.find((g: any) => g.node === '%EV_X').reason).toMatch(/FALSE branch dropped/);
  });

  it('a text module (FORMTYPE T) is not a form: one gap, no walk', () => {
    const xml = '<?xml version="1.0"?><sf:SMARTFORM xmlns:sf="x"><HEADER><FORMNAME>ZDEMO_TM</FORMNAME><FORMTYPE>T</FORMTYPE></HEADER><sf:TEXT><NAME><INAME>%TEXT1</INAME></NAME><TTYPE>R</TTYPE></sf:TEXT></sf:SMARTFORM>';
    const p = planMigration(loadSmartForm(xml));
    expect(p.formType).toBe('text-module');
    expect(p.nodes).toHaveLength(1);
    expect(p.gaps[0].reason).toMatch(/no page tree/);
  });
});
