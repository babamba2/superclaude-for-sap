import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain .mjs module without type declarations
import { loadCatalogs, allActions, matchText, familyOf, isVerified } from '../../scripts/assist/catalog.mjs';

const ROOT = join(__dirname, '..', '..');
const skill = readFileSync(join(ROOT, 'skills', 'assist', 'SKILL.md'), 'utf-8');
const description = (skill.match(/^description:\s*(.*)$/m) || [])[1] ?? '';
const catalogs = loadCatalogs();

describe('assist catalog runtime (scripts/assist/catalog.mjs)', () => {
  it('loads every module catalog', () => {
    const mods = catalogs.map((c: { module: string }) => c.module);
    for (const m of ['MM', 'PP', 'SD', 'FI', 'CO']) expect(mods).toContain(m);
  });

  it('family from sapVersion', () => {
    expect(familyOf('S4')).toBe('S4');
    expect(familyOf('S/4 On-Prem')).toBe('S4');
    expect(familyOf('ECC')).toBe('ECC');
    expect(familyOf(undefined)).toBe('ECC');
  });

  it('hides actions not verified for the family', () => {
    const a = { verified_on: [{ family: 'ECC' }] };
    expect(isVerified(a, 'ECC')).toBe(true);
    expect(isVerified(a, 'S4')).toBe(false);
    expect(isVerified({ verified_on: [] }, 'ECC')).toBe(false);
  });

  it('matches a Korean lookup and flags an ambiguous write term', () => {
    const acts = allActions(catalogs, 'ECC');
    expect(matchText('오늘 미결 PO 알려줘', acts).candidates[0].id).toBe('MM.PO.LIST_OPEN');
    const r = matchText('PO 4500000001 완결해줘', acts);
    expect(r.ambiguities.length).toBeGreaterThan(0);
    expect(r.ambiguities[0].candidates).toContain('MM.PO.SET_DELIVERY_COMPLETE');
  });
});

describe('assist skill description carries business triggers', () => {
  it('names at least one Korean intent phrase of every module catalog', () => {
    for (const c of catalogs) {
      const ko = c.actions.flatMap((a: { intents?: { ko?: string[] } }) => a.intents?.ko ?? []);
      expect(ko.some((w: string) => description.includes(w)), `no ${c.module} trigger in description`).toBe(true);
    }
  });

  it('does not hardcode action ids in the skill MDs', () => {
    const wf = readFileSync(join(ROOT, 'skills', 'assist', 'workflow.md'), 'utf-8');
    const ids = allActions(catalogs, null).map((a: { id: string }) => a.id);
    for (const id of ids) {
      expect(skill.includes(id) || wf.includes(id), `${id} hardcoded`).toBe(false);
    }
  });
});
