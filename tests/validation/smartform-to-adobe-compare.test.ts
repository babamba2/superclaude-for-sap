import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { loadSmartForm } from '../../scripts/adobe/sf-inventory.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { planMigration } from '../../scripts/adobe/sf-to-adobe-plan.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { compareMigration } from '../../scripts/adobe/compare-migration.mjs';

// Self-written files only (ZDEMO names): a one-text form, its plan, and a "migrated" form / layout that differ from
// the plan in known places — as FP_CONTENT would return them after SAP's MIGRATE (P2).
const SF = `<?xml version="1.0"?><sf:SMARTFORM xmlns:sf="x"><HEADER><FORMNAME>ZDEMO_T3</FORMNAME></HEADER><INTERFACE><item><IOTYPE>I</IOTYPE><NAME>IS_A</NAME><TYPENAME>ZDEMO_A</TYPENAME></item></INTERFACE><sf:VARHEADER><sf:item><PAGEFORMAT>DINA4</PAGEFORMAT><sf:PAGETREE><sf:NODE><NODETYPE>RP</NODETYPE><sf:SUCC><sf:NODE><NODETYPE>PA</NODETYPE><sf:OBJ><sf:PAGE><NAME><INAME>P1</INAME></NAME></sf:PAGE></sf:OBJ><sf:SUCC><sf:NODE><NODETYPE>WI</NODETYPE><sf:OBJ><sf:WINDOW ID="1"><NAME><INAME>MAIN</INAME></NAME><WTYPE>M</WTYPE><sf:PROC_CTRL><sf:NODE><NODETYPE>RC</NODETYPE><sf:SUCC><sf:NODE><NODETYPE>TI</NODETYPE><sf:OBJ><sf:TEXT><NAME><INAME>T1</INAME></NAME><TEXT><item><TDFORMAT>*</TDFORMAT><TDLINE>No &amp;IS_A-X&amp;</TDLINE></item></TEXT></sf:TEXT></sf:OBJ><sf:SUCC/></sf:NODE></sf:SUCC></sf:NODE></sf:PROC_CTRL></sf:WINDOW></sf:OBJ><sf:OUTATTR><sf:OUTATTR><WLEFT>2</WLEFT></sf:OUTATTR></sf:OUTATTR><sf:SUCC/></sf:NODE></sf:SUCC></sf:NODE></sf:SUCC></sf:NODE></sf:PAGETREE></sf:item></sf:VARHEADER></sf:SMARTFORM>`;

const node = (id: string, cls: string, name: string, parent: string, next: string, child: string, own = '') =>
  `<cls:${cls} id="${id}"><CL_FP_NODE><NAME>${name}</NAME><STATE>A</STATE><CONDITION/>${parent ? `<PARENT href="#${parent}"/>` : '<PARENT/>'}${next ? `<SUCCESSOR href="#${next}"/>` : '<SUCCESSOR/>'}${child ? `<CHILD href="#${child}"/>` : '<CHILD/>'}</CL_FP_NODE>${own || `<${cls}/>`}</cls:${cls}>`;
const FORM = `<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><VERSION>1</VERSION><INTERFACE>ZDEMO_T3</INTERFACE><CONTEXT href="#o1"/></asx:values><asx:heap xmlns:cls="http://www.sap.com/abapxml/classes/global">
${node('o1', 'CL_FP_CONTEXT', 'CONTEXT', '', '', 'o2')}
${node('o2', 'CL_FP_FOLDER', 'MAIN', 'o1', '', 'o3')}
${node('o3', 'CL_FP_FOLDER', 'T1', 'o2', '', 'o4')}
${node('o4', 'CL_FP_FOLDER', 'IS_A', 'o3', '', 'o5')}
${node('o5', 'CL_FP_DATA', 'X', 'o4', 'o6', '', '<CL_FP_DATA><FIELD>IS_A-X</FIELD></CL_FP_DATA>')}
${node('o6', 'CL_FP_DATA', 'Y', 'o4', '', '', '<CL_FP_DATA><FIELD>IS_A-Y</FIELD></CL_FP_DATA>')}
</asx:heap></asx:abap>`;
const XDP = `<?xml version="1.0"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/"><subform name="ZDEMO_T3"><pageSet><pageArea name="P1"><contentArea name="MAIN"/></pageArea></pageSet><subform name="MAIN"><subform name="T1"><subform name="IS_A"><field name="X"/></subform><draw name="T1"/><draw name="EXTRA"/></subform></subform></subform></template></xdp:xdp>`;
const IFACE = `<?xml version="1.0"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><VERSION>1</VERSION><INTERFACE href="#o1"/></asx:values><asx:heap xmlns:cls="http://www.sap.com/abapxml/classes/global"><cls:CL_FP_INTERFACE_DATA id="o1"><CL_FP_INTERFACE_DATA><PARAMETERS href="#o2"/></CL_FP_INTERFACE_DATA></cls:CL_FP_INTERFACE_DATA><cls:CL_FP_PARAMETERS id="o2"><CL_FP_PARAMETERS><IMPORT_PARAMETERS><SFPIOPAR><NAME>IS_A</NAME><TYPENAME>ZDEMO_A</TYPENAME></SFPIOPAR><SFPIOPAR><NAME>IS_EXTRA</NAME></SFPIOPAR></IMPORT_PARAMETERS></CL_FP_PARAMETERS></cls:CL_FP_PARAMETERS></asx:heap></asx:abap>`;

describe('smartform-to-adobe — plan vs the migrated form (P2 comparison)', () => {
  const plan = planMigration(loadSmartForm(SF), { options: 'full' });
  const c = compareMigration({ plan, formXml: FORM, layoutXdp: XDP, interfaceXml: IFACE,
    log: [{ type: 'W', text: 'Node T1. Something SAP said' }] });

  it('context: the plan\'s folders and data are found by path; the extra SAP node is listed', () => {
    expect(c.context.matched).toBe(4); // MAIN, T1, IS_A, X
    expect(c.context.onlyPlan).toEqual([]);
    expect(c.context.onlyReal.map((x: any) => x.path)).toEqual(['MAIN/T1/IS_A/Y']);
    expect(c.context.fieldDiffs).toEqual([]);
  });

  it('layout: the hidden field declaration of the plan is matched; extra SAP elements are listed', () => {
    expect(c.layout.onlyReal.map((x: any) => `${x.el}:${x.path}`)).toEqual(['draw:ZDEMO_T3/MAIN/T1/EXTRA']);
    expect(c.layout.matched).toBeGreaterThanOrEqual(7);
  });

  it('interface and log differences; differences grouped by the plan method they come from', () => {
    expect(c.interface.onlyReal).toEqual(['IS_EXTRA']);
    expect(c.log.onlyReal).toHaveLength(1);
    // type and order: a W line does not pair with a predicted E; two predicted lines found in reverse order count a break
    const two = { ...plan, log: [{ type: 'E', code: 'm09', node: 'T1', text: 'Node T1. Calculations cannot be migrated at present' }, { type: 'W', code: 'm04', node: 'T1', text: 'Node T1. Field IS_A-Z not supported' }] };
    const r = compareMigration({ plan: two, formXml: FORM, layoutXdp: XDP, log: [{ type: 'W', text: 'Node T1. Feld IS_A-Z nicht unterstützt' }, { type: 'W', text: 'Node T1. other' }, { type: 'E', text: 'Node T1. Berechnungen' }] });
    expect(r.log.matched).toBe(2);
    expect(r.log.orderBreaks).toBe(1);
    expect(c.summary.contextMatch).toBeCloseTo((2 * 4) / (4 + 5), 5);
    for (const v of Object.values(c.byMethod) as any[]) expect(v.contextDiffs + v.layoutDiffs).toBeGreaterThanOrEqual(0);
  });
});
