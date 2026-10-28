import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { locate, fix, fixMechanical, detect, pack, parseMarked, protectedTokens, changeRate, rejectReason, unpack, jsonTexts, jsonApply, mdTexts, mdApply } from '../../scripts/lib/humanize.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { extractTexts, applyTexts } from '../../scripts/process/companion.mjs';

describe('humanize — detect', () => {
  it('fixes connective commas after verb stems in code, not SAP nouns ending in 고 or copula 이고', () => {
    expect(fixMechanical('입력하고, 저장하며, 입고, 출고, 재고, 필수이고, 끝.')).toBe('입력하고 저장하며 입고, 출고, 재고, 필수이고, 끝.');
    const f = fix({ items: [
      { i: 1, text: '회사코드를 입력하고, 사용자 ID 첫 자리가 회사코드 첫 자리와 같은 권역만 실행함.' },
      { i: 2, text: '입고, 출고, 재고 이동은 MIGO에서 처리함.' },
    ] });
    expect(f.items).toEqual([{ i: 1, text: '회사코드를 입력하고 사용자 ID 첫 자리가 회사코드 첫 자리와 같은 권역만 실행함.' }]);
    expect(f.commas).toBe(1);
  });

  it('detects on the fixed text and no longer sends C-11 to the model', () => {
    const texts = { items: [{ i: 1, text: '회사코드를 입력하고, 사용자 ID 첫 자리가 회사코드 첫 자리와 같은 권역만 실행함.' }] };
    expect(detect(texts, fix(texts)).items).toEqual([]);
  });

  it('flags translationese and long sentences; skips short or multi-line items', () => {
    const long = '구매 담당은 화면에서 정보를 변경·조회하고 개설 신청과 변경 신청과 내국신용장 자료를 은행에 보내며 번호를 받으면 개설을 확정하고 정정과 선적 계획 수량 등록도 같은 화면에서 처리하고 결과를 담당 팀장에게 메일로 알림.';
    const f = detect({ items: [
      { i: 1, text: '이 값은 시스템에 의해 자동으로 계산되어지며 사용자는 바꿀 수 없음. 조회만 가능함.' },
      { i: 2, text: long },
      { i: 3, text: '짧은 문장임.' },
      { i: 4, text: '첫 줄은 입력하고, 저장함.\n둘째 줄은 확인하고, 닫음. 여러 줄 항목은 빼야 함.' },
      { i: 5, text: 'HePS ↔ SAP 계약 인터페이스의 구매처 번호 매핑을 점검해야 함. 공급업체가 BP로 바뀜.' },
    ] });
    const byI = Object.fromEntries(f.items.map((x: { i: number; tells: string[] }) => [x.i, x.tells]));
    expect(byI[1]).toEqual(expect.arrayContaining(['A-8', 'A-9']));
    expect(byI[2]).toContain('LONG');
    expect(byI[3]).toBeUndefined();
    expect(byI[4]).toBeUndefined();
    expect(byI[5]).toBeUndefined(); // ↔ is not an emoji
  });
});

describe('humanize — pack / parse', () => {
  it('packs one marked line per item and splits at the size limit', () => {
    const items = Array.from({ length: 6 }, (_, k) => ({ i: k + 1, text: '가'.repeat(100) }));
    const chunks = pack({ items: items.map(x => ({ ...x, tells: ['A-9'] })) }, 250);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toMatch(/^\[진단\][^\n]*\n- 항목 1: A-9\n- 항목 2: A-9\n\[\/진단\]/);
    const m = parseMarked(`${chunks[0]}\n<!-- HUMANIZE-SUMMARY\n⟦99⟧ not an item\n-->`);
    expect([...m.keys()]).toEqual([1, 2]); // diagnosis lines are not items
  });
});

describe('humanize — guards', () => {
  it('keeps identifiers, numbers, tags and bold as protected tokens', () => {
    expect(protectedTokens('[KR] ZMMM90040에서 BAPI_PO_CREATE1을 2회 호출함 **주의**')).toEqual(
      expect.arrayContaining(['[KR]', 'ZMMM90040', 'BAPI_PO_CREATE1', '2', '**']));
  });

  it('refuses lost markers, changed tokens, big rewrites and added connective commas', () => {
    const a = 'ZMMM31000에서 L/C 정보를 바꾸고 EDI를 은행에 보내며, 번호를 받으면 확정함.';
    expect(rejectReason(a, undefined)).toBe('marker lost');
    expect(rejectReason(a, a.replace('ZMMM31000', 'ZMMM31001'))).toBe('protected token changed');
    expect(rejectReason(a, 'ZMMM31000 L/C EDI 완전히 다른 문장으로 바꿔 버림.')).toBe('change over 50%');
    expect(rejectReason(a, a.replace('바꾸고', '바꾸고,'))).toBe('connective commas increased');
    expect(rejectReason(a, 'ZMMM31000에서 L/C 정보를 바꾸고 EDI를 은행에 보냄. 번호를 받으면 확정함.')).toBeNull();
    expect(changeRate('abc', 'abc')).toBe(0);
  });

  it('unpack returns only accepted rewrites with refusal stats', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hz-'));
    try {
      mkdirSync(join(dir, 'chunk-1'));
      writeFileSync(join(dir, 'chunk-1', '01_input.txt'), '⟦1⟧ 값을 입력하고, 저장함.\n⟦2⟧ ZMMM20180에서 보내며, 끝남.\n⟦3⟧ 그대로임.\n⟦4⟧ 빠질 항목임.', 'utf8');
      writeFileSync(join(dir, 'chunk-1', 'final.md'), '⟦1⟧ 값을 입력하고 저장함.\n⟦2⟧ ZMMM20181에서 보내며 끝남.\n⟦3⟧ 그대로임.\n<!-- HUMANIZE-SUMMARY -->', 'utf8');
      mkdirSync(join(dir, 'chunk-2'));
      writeFileSync(join(dir, 'chunk-2', '01_input.txt'), '⟦5⟧ 결과 없음.', 'utf8');
      const r = unpack(dir, { items: [{ i: 1, text: 'fixed 1' }, { i: 7, text: '쉼표만 지운 항목임.' }] });
      expect(r.items).toEqual([{ i: 1, text: '값을 입력하고 저장함.' }, { i: 7, text: '쉼표만 지운 항목임.' }]); // model rewrite wins over the fixed text
      expect(r.stats).toMatchObject({ chunks: 2, noOutput: 1, rewritten: 1, fixed: 1, unchanged: 1, refused: { 'protected token changed': 1, 'marker lost': 1 } });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('humanize — locate', () => {
  it('is unavailable without an installed humanize-korean plugin', () => {
    const home = mkdtempSync(join(tmpdir(), 'hz-home-'));
    try {
      expect(locate(home).available).toBe(false);
      mkdirSync(join(home, '.claude', 'plugins'), { recursive: true });
      writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'other@x': [{ installPath: home }] } }));
      expect(locate(home)).toMatchObject({ available: false, reason: 'humanize-korean not installed' });
      const ip = join(home, 'hk');
      mkdirSync(join(ip, 'skills', 'humanize-korean', 'references'), { recursive: true });
      mkdirSync(join(ip, 'agents'), { recursive: true });
      writeFileSync(join(ip, 'skills', 'humanize-korean', 'references', 'quick-rules.md'), '#');
      writeFileSync(join(ip, 'agents', 'humanize-monolith.md'), '#');
      writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'humanize-korean@im-not-ai': [{ installPath: ip, version: '2.3.2' }] } }));
      expect(locate(home)).toMatchObject({ available: true, version: '2.3.2', agent: 'humanize-korean:humanize-monolith' });
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
});

describe('humanize — same-language apply (module-to-process)', () => {
  it('applies a partial rewrite and leaves the other texts', () => {
    const model = { schema: 1, module: 'MM', lang: 'ko', title: 'MM 프로세스 맵', rows: [
      { code: '1', level: 1, label: '구매', desc: '구매요청을 받고, 구매오더를 만듦.' },
      { code: '1.1', level: 2, label: '입고', desc: '입고를 처리함.' },
    ] };
    const texts = extractTexts(model);
    const it = texts.items.find((x: { text: string }) => x.text === '구매요청을 받고, 구매오더를 만듦.');
    expect(it).toBeTruthy();
    const { model: out, missing } = applyTexts(model, texts, { items: [{ i: it.i, text: '구매요청을 받고 구매오더를 만듦.' }] }, 'ko');
    expect(out.rows[0].desc).toBe('구매요청을 받고 구매오더를 만듦.');
    expect(out.rows[1].desc).toBe('입고를 처리함.');
    expect(out.lang).toBe('ko');
    expect(missing.length).toBe(texts.items.length - 1);
  });
});

describe('humanize — JSON and Markdown sources', () => {
  const P = '엑셀 파일 한 개로 판매 인콰이어리를 한꺼번에 생성하고, 행별로 오류를 검증합니다.';
  it('jsonTexts picks prose values, skips code keys, short and multi-line strings; jsonApply writes back', () => {
    const docs = [
      { intro: { purpose: P, title: '짧은 제목' }, code: P, steps: [{ text: P }, { desc: 'DDIC 텍스트로 스무 자를 넘는 설명 문장이 들어갈 수 있음 ZMM' }] },
      { note: '여러 줄은\n빼고 처리해야 하는 긴 문장으로 스무 자를 넘김.' },
    ];
    const t = jsonTexts(docs, ['desc']);
    expect(t.items).toEqual([{ i: 1, text: P }]);
    expect(t.paths[1]).toEqual(['0|intro.purpose', '0|steps.0.text']);
    const r = jsonApply(docs, t, { items: [{ i: 1, text: P.replace('생성하고,', '생성하고') }] });
    expect(r.applied).toBe(2);
    expect(r.docs[0].steps[0].text).toContain('생성하고 행별로');
    expect(r.docs[0].code).toBe(P);
    expect(docs[0].intro.purpose).toBe(P); // inputs untouched
  });

  it('mdTexts skips code, tables, headings and front matter; mdApply keeps list prefixes and line endings', () => {
    const md = ['---', 'title: 문서 제목으로 스무 자를 넘기는 긴 앞부분 메타 문장임', '---', '# 제목인데 스무 자가 넘는 긴 제목을 넣어 봄 테스트', '',
      `- ${P}`, '| 표 | 셀에 스무 자를 넘는 한글 문장이 들어가도 건드리지 않음 |', '```', `${P}`, '```', `> ${P}`, '짧은 줄임.'].join('\r\n');
    const t = mdTexts(md);
    expect(t.items.map((x: { text: string }) => x.text)).toEqual([P, P]);
    const r = mdApply(md, t, { items: t.items.map((x: { i: number }) => ({ i: x.i, text: '바뀐 문장임.' })) });
    expect(r.applied).toBe(2);
    const lines = r.md.split('\r\n');
    expect(lines[5]).toBe('- 바뀐 문장임.');
    expect(lines[10]).toBe('> 바뀐 문장임.');
    expect(lines[8]).toBe(P); // code block untouched
  });
});
