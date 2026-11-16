import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { normalizeModel, checkModel, viewModel, withSnapshot, summary } from '../../scripts/project/project-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { instantiate, addWricef } from '../../scripts/project/project-template.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { applyPatch } from '../../scripts/project/project-patch.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { projectXlsx } from '../../scripts/project/project-xlsx.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { computeStatus } from '../../scripts/project/project-status.mjs';

// The web /wbs editor uses this model as its own (one source: plugin_module/scripts/project) and adds fields of its
// own (sc4sap_web docs/wbs-design.md §3). They must travel through every plugin function unchanged.
const TEAM = [{ id: 'PM1', name: 'PM', role: 'pm' }, { id: 'SD1', name: 'SD consultant', role: 'module', module: 'SD' }];
const webModel = () => {
  const m = addWricef(instantiate({ code: 'DEMO1', name: 'Demo', type: 'implementation', start: '2027-01-04', goLive: '2027-06-01', modules: ['SD'], team: TEAM }),
    [{ label: 'Upload', kind: 'C', module: 'SD' }]).model;
  m.updatedAt = '2027-03-01T10:00:00Z';
  m.updatedBy = 'acc-1';
  m.wbs.forEach((w: any, i: number) => { w.effortPlan = 5 + i; w.effortActual = i; });
  const leaves = m.wbs.filter((w: any) => !m.wbs.some((c: any) => c.parent === w.id));
  leaves[1].deps = [leaves[0].id];
  leaves[1].depMeta = { [leaves[0].id]: { type: 'SS', lag: 2 } };
  m.milestones[0].gateRows = [{ c: 'Sign-off', ok: null, note: 'web' }];
  m.risks = [{ id: 'RK1', text: 'Data late', impact: 'H', status: 'open', rowIds: [m.wbs[1].id, m.wbs[2].id] }];
  return m;
};
const EXT = (m: any) => ({
  updatedAt: m.updatedAt, updatedBy: m.updatedBy,
  effort: m.wbs.map((w: any) => [w.id, w.effortPlan, w.effortActual]),
  depMeta: m.wbs.filter((w: any) => w.depMeta).map((w: any) => [w.id, w.depMeta]),
  gateRows: m.milestones.map((x: any) => x.gateRows ?? null),
  rowIds: m.risks.map((r: any) => r.rowIds ?? null),
});

describe('project model — the /wbs extension fields survive the plugin functions', () => {
  it('normalize, check, view, snapshot, status run, AI patch and the list card keep them', () => {
    const m = webModel();
    const want = EXT(m);
    const n = normalizeModel(m);
    expect(EXT(n)).toEqual(want);
    expect(checkModel(n).errors).toEqual([]); // rowIds on a risk is allowed
    expect(EXT(withSnapshot(n, '2027-03-05'))).toEqual(want);
    viewModel(n, '2027-03-05'); // the view reads the model and does not strip it
    expect(EXT(n)).toEqual(want);
    expect(EXT(computeStatus(n, { weekEnd: '2027-03-05', today: '2027-03-06' }).model)).toEqual(want);
    const p = applyPatch(n, [{ op: 'set-text', target: 'risk', id: 'RK1', field: 'text', value: 'Master data late' }]);
    expect(p.model.risks[0]).toMatchObject({ text: 'Master data late', rowIds: want.rowIds[0] });
    expect(EXT(p.model)).toEqual(want);
    expect(summary(n, '2027-03-06').code).toBe('DEMO1');
  });

  it('the Excel export opens with them in the model', () => {
    const buf = projectXlsx(normalizeModel(webModel()), { today: '2027-03-06', lang: 'en' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
