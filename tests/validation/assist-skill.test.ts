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
    for (const m of ['MM', 'PP', 'SD', 'FI', 'CO', 'OUT', 'LE', 'WM', 'PM', 'QM', 'EWM']) expect(mods).toContain(m);
  });

  it('matches Korean EWM lookups on S/4 and hides EWM on ECC', () => {
    const s4 = allActions(catalogs, 'S4');
    expect(matchText('미결 창고작업 보여줘', s4).candidates[0].id).toBe('EWM.WT.LIST_OPEN');
    expect(matchText('빈 저장빈 알려줘', s4).candidates[0].id).toBe('EWM.BIN.LIST_EMPTY');
    expect(matchText('재고 위치 알려줘', s4).candidates[0].id).toBe('EWM.STOCK.BY_PRODUCT');
    expect(matchText('창고오더 2000001 조회', s4).candidates[0].id).toBe('EWM.WO.GET_DETAIL');
    expect(matchText('납품 80000001 창고 진행 알려줘', s4).candidates[0].id).toBe('EWM.DLV.WAREHOUSE_STATUS');
    expect(s4.filter((a: { id: string; kind: string }) => a.id.startsWith('EWM.')).every((a: { kind: string }) => a.kind === 'query')).toBe(true);
    const ecc = allActions(catalogs, 'ECC');
    expect(ecc.some((a: { id: string }) => a.id.startsWith('EWM.'))).toBe(false);
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

  it('matches Korean LE / WM requests on ECC and hides them on S/4', () => {
    const ecc = allActions(catalogs, 'ECC');
    expect(matchText('이전오더 확정해줘', ecc).candidates[0].id).toBe('WM.TO.CONFIRM');
    expect(matchText('빈 저장빈 알려줘', ecc).candidates[0].id).toBe('WM.BIN.LIST_EMPTY');
    expect(matchText('미결 이전요청 목록', ecc).candidates[0].id).toBe('WM.TR.LIST_OPEN');
    expect(matchText('운송 생성해줘', ecc).candidates[0].id).toBe('LE.SHP.CREATE');
    expect(matchText('납품 8100000001 피킹해줘', ecc).candidates[0].id).toBe('LE.DLV.PICK');
    const s4 = allActions(catalogs, 'S4');
    expect(s4.some((a: { id: string }) => /^(LE|WM)\./.test(a.id))).toBe(false);
  });

  it('matches Korean QM lookups on S/4, hides QM on ECC and keeps unexecuted QM writes hidden', () => {
    const s4 = allActions(catalogs, 'S4');
    expect(matchText('미결 검사로트 보여줘', s4).candidates[0].id).toBe('QM.LOT.LIST_OPEN');
    expect(matchText('검사로트 10000000886 조회', s4).candidates[0].id).toBe('QM.LOT.GET_DETAIL');
    expect(matchText('사용결정 코드 알려줘', s4).candidates[0].id).toBe('QM.UD.GET');
    expect(matchText('미결 품질통지 목록', s4).candidates[0].id).toBe('QM.NOTIF.LIST_OPEN');
    expect(matchText('검사계획 조회', s4).candidates[0].id).toBe('QM.PLAN.GET_DETAIL');
    expect(s4.filter((a: { id: string; kind: string }) => a.id.startsWith('QM.')).every((a: { kind: string }) => a.kind === 'query')).toBe(true);
    const ecc = allActions(catalogs, 'ECC');
    expect(ecc.some((a: { id: string }) => a.id.startsWith('QM.'))).toBe(false);
  });

  it('matches Korean PM requests on ECC and offers only the PM queries on S/4', () => {
    const ecc = allActions(catalogs, 'ECC');
    expect(matchText('미결 보전오더 보여줘', ecc).candidates[0].id).toBe('PM.ORD.LIST_OPEN');
    expect(matchText('고장 통지 등록해줘', ecc).candidates[0].id).toBe('PM.NOTIF.CREATE');
    expect(matchText('보전오더 실적 등록', ecc).candidates[0].id).toBe('PM.ORD.CONFIRM');
    expect(matchText('설비 10000001 조회', ecc).candidates[0].id).toBe('PM.EQUI.GET_DETAIL');
    const teco = matchText('보전오더 4000001 기술적 완료해줘', ecc);
    expect(teco.candidates[0].id).toBe('PM.ORD.TECO');
    expect(teco.ambiguities.length).toBeGreaterThan(0);
    const s4 = allActions(catalogs, 'S4');
    const pmS4 = s4.filter((a: { id: string }) => a.id.startsWith('PM.'));
    expect(pmS4.length).toBe(8);
    expect(pmS4.every((a: { kind: string }) => a.kind === 'query')).toBe(true);
    expect(matchText('미결 보전오더 보여줘', s4).candidates[0].id).toBe('PM.ORD.LIST_OPEN');
    expect(s4.some((a: { id: string }) => a.id === 'PM.ORD.TECO' || a.id === 'PM.NOTIF.CREATE')).toBe(false);
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
