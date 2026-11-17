import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { mapTransports, mapObjectTrs } from '../../scripts/project/sap-actuals.mjs';

// A reader may hand back SAP CHAR fields blank-padded (" " for an empty STRKORR). The /wbs actuals use this mapping
// as their only reader, so a padded answer must map exactly like the trimmed one.
describe('project actuals — blank-padded SAP fields', () => {
  const e07t = [{ TRKORR: 'DEVK900001', AS4TEXT: '[SD] Pricing' }, { TRKORR: 'DEVK900002', AS4TEXT: '[MM] Report' }];
  const clean = [
    { TRKORR: 'DEVK900001', STRKORR: '', TRFUNCTION: 'W', TRSTATUS: 'R', AS4USER: 'U1', AS4DATE: '20270104' },
    { TRKORR: 'DEVK900002', STRKORR: '', TRFUNCTION: 'K', TRSTATUS: 'D', AS4USER: 'U2', AS4DATE: '20270105' },
    { TRKORR: 'DEVK900003', STRKORR: 'DEVK900002', TRFUNCTION: 'S', TRSTATUS: 'D', AS4USER: 'U2', AS4DATE: '20270105' },
  ];
  const padded = clean.map((r) => ({ ...r, TRKORR: `${r.TRKORR} `, STRKORR: r.STRKORR ? `${r.STRKORR} ` : ' ', TRFUNCTION: `${r.TRFUNCTION} `, TRSTATUS: ` ${r.TRSTATUS}`, AS4USER: `${r.AS4USER}  ` }));

  it('" " as an empty STRKORR, padded codes and keys map like the clean rows', () => {
    const opts = { workstreams: [{ code: 'SD' }, { code: 'MM' }] };
    const a = mapTransports(clean, e07t, opts);
    expect(a.map((t: any) => [t.trkorr, t.side, t.status, t.ws])).toEqual([['DEVK900001', 'F', 'released', 'SD'], ['DEVK900002', 'D', 'open', 'MM']]);
    expect(mapTransports(padded, e07t.map((r) => ({ ...r, TRKORR: `${r.TRKORR} ` })), opts)).toEqual(a);
  });

  it('WBS object requests: a padded OBJ_NAME still matches the WBS object, through task → request → status', () => {
    const e071 = [{ TRKORR: 'DEVK900003 ', OBJ_NAME: 'ZSD_TEST_UPLOAD   ' }, { TRKORR: 'DEVK900001', OBJ_NAME: 'ZSD_TEST_FORM' }];
    const tasks = [{ TRKORR: 'DEVK900003 ', STRKORR: 'DEVK900002 ' }, { TRKORR: 'DEVK900001', STRKORR: ' ' }];
    const reqs = [{ TRKORR: 'DEVK900002 ', TRSTATUS: 'R ' }, { TRKORR: 'DEVK900001', TRSTATUS: 'D' }];
    expect(mapObjectTrs(e071, tasks, reqs)).toEqual([
      { name: 'ZSD_TEST_UPLOAD', trkorr: 'DEVK900002', status: 'released' },
      { name: 'ZSD_TEST_FORM', trkorr: 'DEVK900001', status: 'open' },
    ]);
  });
});
