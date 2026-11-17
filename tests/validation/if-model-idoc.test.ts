import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { newModel } from '../../scripts/interface/if-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { ifValidate } from '../../scripts/interface/if-validate.mjs';

describe('interface model — optional IDoc message type (P3)', () => {
  it('new models carry an empty header.idoc; a given one is kept', () => {
    expect(newModel({ ifId: 'IF_TEST_01', lang: 'en', header: { name: 'Test' } }).header.idoc).toEqual({ mestyp: '', idoctp: '' });
    expect(newModel({ ifId: 'IF_TEST_02', lang: 'en', header: { name: 'Test', idoc: { mestyp: 'ZTEST_MSG' } } }).header.idoc).toEqual({ mestyp: 'ZTEST_MSG', idoctp: '' });
  });

  it('a model saved before the field still validates the same way', () => {
    const m = newModel({ ifId: 'IF_TEST_03', lang: 'en', header: { name: 'Test' } });
    const old = JSON.parse(JSON.stringify(m));
    delete old.header.idoc;
    expect(JSON.stringify(ifValidate(old))).toBe(JSON.stringify(ifValidate(m)));
  });
});
