import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  renderSelectionScreenSVG,
  renderAlvScreenSVG,
  selectionSchemaWarnings,
  SCREEN_THEMES,
  resolveScreenTheme,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/spec/screen-image-renderer.mjs';
import {
  applySelectionValues,
  buildManual,
  importEditedHtml,
  manualWarnings,
  renderStepScreen,
  nextVersion,
  svgAnchors,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/manual/build-manual.mjs';

// @ts-expect-error — plain .mjs script, no type declarations
import { SCRIPT } from '../../scripts/manual/manual-page.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { renderExcelSheetSVG } from '../../scripts/manual/excel-sheet-svg.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { validateScreenTheme, getScreenTheme, setScreenTheme } from '../../scripts/spec/screen-theme.mjs';

const SAMPLE = join(__dirname, '..', '..', 'skills', 'program-to-manual', 'example-manual.json');
const sample = () => JSON.parse(readFileSync(SAMPLE, 'utf-8'));

describe('callout anchors in screen mockups', () => {
  it('marks selection rows, radio options, toolbar and block titles', () => {
    const svg: string = renderSelectionScreenSVG({
      lang: 'en',
      toolbar: [{ code: 'UPLOAD', label: 'Upload' }],
      blocks: [{ label: 'Criteria', items: [
        { name: 'P_WERKS', label: 'Plant' },
        { type: 'radioGroup', group: 'RG1', options: [{ name: 'R_A', label: 'A' }, { name: 'R_B', label: 'B' }] },
      ] }],
    });
    expect(svgAnchors(svg)).toEqual(expect.arrayContaining(['tb:UPLOAD', 'block:Criteria', 'sel:P_WERKS', 'sel:RG1', 'sel:R_A', 'sel:R_B']));
  });

  it('marks the title, PAI and ALV buttons, dynpro fields and column headers', () => {
    const svg: string = renderAlvScreenSVG({
      screen: { title: 'Monitor', buttons: [{ code: 'SEND', label: 'Send' }], fields: [{ type: 'input', name: 'P_DATE', label: 'Date' }] },
      toolbar: [{ code: 'POST', label: 'Post' }],
      columns: [{ name: 'EBELN', header: 'PO' }],
      sampleRows: [{ EBELN: '1' }],
    }, { lang: 'en' });
    expect(svgAnchors(svg)).toEqual(expect.arrayContaining(['title', 'pai:SEND', 'fld:P_DATE', 'alv:POST', 'col:EBELN']));
  });
});

describe('page script', () => {
  // The script lives in a template literal: a lone \s or \d there loses its
  // backslash and the anchor regex silently matches nothing.
  it('parses anchors with and without an nth suffix', () => {
    const body = SCRIPT.match(/var m=(\/.*?\/)\.exec/)![1];
    const re = new Function(`return ${body}`)() as RegExp;
    expect(re.exec('title')![1]).toBe('title');
    expect(re.exec('col:MATNR#2')!.slice(1, 3)).toEqual(['col:MATNR', '2']);
    expect(re.exec('block:Doc #')![1]).toBe('block:Doc #');
    expect(() => new Function(SCRIPT)).not.toThrow();
  });
});

describe('nested frames and grid titles', () => {
  const withFrame = {
    lang: 'en',
    blocks: [{ label: 'ATP rule', items: [
      { type: 'radioGroup', group: 'G03', options: [{ name: 'P_DIST2', label: 'Own ATP' }, { name: 'P_DIST1', label: 'Distribute' }] },
      { type: 'frame', label: 'Way', items: [
        { type: 'radioGroup', group: 'G04', options: [{ name: 'P_DIST3', label: 'Way 1' }, { name: 'P_DIST4', label: 'Way 2' }] },
      ] },
      { type: 'checkbox', name: 'P_ATP100', label: 'Only 100% ATP' },
    ] }],
  };

  it('draws a frame inside a block, with its items anchored and the block taller', () => {
    const svg: string = renderSelectionScreenSVG(withFrame);
    expect(svgAnchors(svg)).toEqual(expect.arrayContaining(['frame:Way', 'sel:P_DIST3', 'sel:P_DIST4', 'sel:P_ATP100']));
    const flat: string = renderSelectionScreenSVG({ ...withFrame, blocks: [{ ...withFrame.blocks[0], items: withFrame.blocks[0].items.filter(i => i.type !== 'frame') }] });
    const h = (s: string) => Number(s.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)![1]);
    expect(h(svg)).toBeGreaterThan(h(flat) + 2 * 24);
    expect(selectionSchemaWarnings(withFrame)).toEqual([]);
    expect(selectionSchemaWarnings({ blocks: [{ label: 'B', items: [{ type: 'frame', label: 'Empty' }] }] })).toEqual(['frame "Empty" has no items.']);
  });

  it('applies step values inside frames', () => {
    const out = applySelectionValues(withFrame, { P_DIST4: true });
    const frame = out.blocks[0].items[1];
    expect(frame.items[0].options.map((o: { selected: boolean }) => o.selected)).toEqual([false, true]);
  });

  it('draws the ALV grid title above the grid, also without a screen block', () => {
    const svg: string = renderAlvScreenSVG({ gridTitle: 'S.Org KR01 · SO type ZWH1', columns: [{ name: 'EBELN', header: 'PO' }], sampleRows: [{ EBELN: '1' }] }, { lang: 'en' });
    expect(svg).toContain('S.Org KR01 · SO type ZWH1');
    expect(svgAnchors(svg)).toContain('gridtitle');
    const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
    const m = svg.match(/<svg[^>]*\swidth="(\d+)"[^>]*\sheight="(\d+)"/)!;
    expect(Number(m[2])).toBe(Math.round(Number(vb[2]) * 1.15));
  });
});

describe('ALV column headers', () => {
  it('widens a narrow column for its header, up to a cap, and shortens what still does not fit', () => {
    const svg: string = renderAlvScreenSVG({ columns: [
      { name: 'OPEQT', header: 'Open Qty', width: 40 },
      { name: 'CTQTY_GROUP', header: 'Container Quantity per group', width: 50 },
    ], sampleRows: [{ OPEQT: '1', CTQTY_GROUP: '2' }] }, { lang: 'en' });
    const cell = (name: string) => Number(svg.match(new RegExp(`data-anchor="col:${name}"><rect x="[\\d.]+" y="10" width="([\\d.]+)"`))![1]);
    expect(cell('OPEQT')).toBeGreaterThan(40);
    expect(cell('CTQTY_GROUP')).toBe(120);
    expect(svg).toContain('Open Qty<');
    expect(svg).toMatch(/Container Qu[^<]*…</);
  });

  it('never cuts off columns of a wide grid', () => {
    const columns = Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, header: `Field ${i}`, width: 100 }));
    const svg: string = renderAlvScreenSVG({ screen: { title: 'Wide' }, columns, sampleRows: [{ F0: '1' }] }, { lang: 'en' });
    const width = Number(svg.match(/viewBox="0 0 ([\d.]+)/)![1]);
    const lastX = Number(svg.match(/data-anchor="col:F19"><rect x="([\d.]+)"/)![1]);
    expect(width).toBeGreaterThanOrEqual(lastX + 100);
  });

  it('takes SAP icon names from the GUI status', () => {
    const svg: string = renderAlvScreenSVG({ screen: { title: 'T', buttons: [
      { code: 'CONV', label: 'Convert', icon: 'ICON_TRANSPORT' },
      { code: 'X', label: 'Unknown', icon: 'ICON_SOMETHING_ELSE' },
    ] }, columns: [{ name: 'A' }], sampleRows: [{ A: '1' }] }, { lang: 'en' });
    expect(svg).toContain('>⇄<');
    expect(svg).not.toContain('ICON_SOMETHING');
  });

  it('draws red / yellow / green cell values as status lamps', () => {
    const svg: string = renderAlvScreenSVG({ columns: [{ name: 'ICON_STATS', header: 'Status' }], sampleRows: [{ ICON_STATS: 'red' }, { ICON_STATS: 'Green' }] }, { lang: 'en' });
    expect(svg).toContain('fill="#D64545"');
    expect(svg).toContain('fill="#2E9E4F"');
    expect(svg).not.toMatch(/>red</);
  });
});

describe('screen themes', () => {
  const grid = { screen: { title: 'Orders' }, columns: [{ name: 'VBELN', header: 'Order', key: true }], sampleRows: [{ VBELN: '1' }] };

  it('draws SAP Signature by default: blue-grey page, gradient title, no modern header band', () => {
    const svg: string = renderAlvScreenSVG(grid, { lang: 'en' });
    expect(svg).toContain(`fill="${SCREEN_THEMES.signature.page}"`);
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain(`fill="${SCREEN_THEMES.signature.keyCell}"`);
    expect(svg).not.toContain('#2E6FB0');
  });

  it('keeps the modern look on request, and takes the pink scheme or a palette override', () => {
    expect(renderAlvScreenSVG(grid, { lang: 'en', theme: 'modern' })).toContain('fill="#2E6FB0"');
    expect(renderAlvScreenSVG({ ...grid, theme: 'signature-pink' }, { lang: 'en' })).toContain('fill="#F4DEE2"');
    expect(renderSelectionScreenSVG({ lang: 'en', theme: { base: 'signature', page: '#ABCDEF' }, blocks: [{ label: 'B', items: [{ name: 'P_A', label: 'A' }] }] }))
      .toContain('fill="#ABCDEF"');
    expect(resolveScreenTheme('no-such-theme')).toBe(SCREEN_THEMES.signature);
  });

  it('does not leak a theme into the next render', () => {
    renderAlvScreenSVG(grid, { lang: 'en', theme: 'modern' });
    expect(renderAlvScreenSVG(grid, { lang: 'en' })).toContain(`fill="${SCREEN_THEMES.signature.page}"`);
  });

  it('draws the selection-screen title', () => {
    const svg: string = renderSelectionScreenSVG({ lang: 'en', title: '[AP] Open Inquiry List', blocks: [{ label: 'B', items: [{ name: 'P_A', label: 'A' }] }] });
    expect(svg).toContain('[AP] Open Inquiry List');
    expect(svgAnchors(svg)).toContain('title');
  });
});

describe('screen theme setting (sap-option)', () => {
  let ws: string;
  let prevHome: string | undefined;
  beforeAll(() => {
    ws = mkdtempSync(join(tmpdir(), 'sc4sap-theme-'));
    prevHome = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = join(ws, 'home');
    mkdirSync(join(ws, 'home', 'profiles', 'T1'), { recursive: true });
    writeFileSync(join(ws, 'home', 'profiles', 'T1', 'config.json'), JSON.stringify({ industry: 'tire' }));
    mkdirSync(join(ws, 'proj', '.sc4sap'), { recursive: true });
    writeFileSync(join(ws, 'proj', '.sc4sap', 'active-profile.txt'), 'T1');
  });
  afterAll(() => {
    if (prevHome === undefined) delete process.env.SC4SAP_HOME_DIR; else process.env.SC4SAP_HOME_DIR = prevHome;
    rmSync(ws, { recursive: true, force: true });
  });

  it('validates names, aliases and custom palettes', () => {
    expect(validateScreenTheme('PINK')).toBe('signature-pink');
    expect(validateScreenTheme('{"page":"#abcdef"}')).toEqual({ page: '#ABCDEF', base: 'signature' });
    expect(() => validateScreenTheme('purple')).toThrow(/unknown theme/);
    expect(() => validateScreenTheme({ page: 'red' })).toThrow(/#RRGGBB/);
    expect(() => validateScreenTheme({ nope: '#000000' })).toThrow(/unknown palette key/);
  });

  it('writes the profile config.json, keeps other keys, and the manual build picks it up', () => {
    const proj = join(ws, 'proj');
    expect(getScreenTheme(proj).effective).toBe('signature');
    setScreenTheme('signature-pink', proj);
    const cfg = JSON.parse(readFileSync(join(ws, 'home', 'profiles', 'T1', 'config.json'), 'utf-8'));
    expect(cfg).toEqual({ industry: 'tire', screenTheme: 'signature-pink' });
    const out = buildManual({ manualPath: SAMPLE, outDir: join(ws, 'out'), cwd: proj, verbose: false });
    expect(readFileSync(out.html, 'utf-8')).toContain('fill="#F4DEE2"');
    setScreenTheme(null, proj);
    expect(getScreenTheme(proj).value).toBeNull();
  });
});

describe('modal dialog box', () => {
  const popup = (modal: boolean) => renderAlvScreenSVG({
    screen: { title: 'Simulation', modal, buttons: [{ code: 'DETACH', label: 'Detach' }, { code: 'OKAY', icon: 'ICON_OKAY' }] },
    columns: [{ name: 'GROUP', header: 'Group' }], sampleRows: [{ GROUP: 'G001' }],
  }, { lang: 'en' });
  const btnX = (svg: string, code: string) => Number(svg.match(new RegExp(`data-anchor="pai:${code}"><rect x="([\\d.]+)" y="([\\d.]+)"`))!.slice(1, 3)[0]);
  const btnY = (svg: string, code: string) => Number(svg.match(new RegExp(`data-anchor="pai:${code}"><rect x="[\\d.]+" y="([\\d.]+)"`))![1]);
  const headY = (svg: string) => Number(svg.match(/data-anchor="col:GROUP"><rect x="[\d.]+" y="([\d.]+)"/)![1]);

  it('puts the application toolbar under the grid, flush right, for a modal screen', () => {
    const svg = popup(true);
    const width = Number(svg.match(/viewBox="0 0 ([\d.]+)/)![1]);
    expect(btnY(svg, 'OKAY')).toBeGreaterThan(40 + headY(svg)); // header y is local to the nested grid svg
    expect(btnX(svg, 'OKAY')).toBeGreaterThan(width / 2);
    expect(btnX(svg, 'DETACH')).toBeLessThan(btnX(svg, 'OKAY'));
  });

  it('keeps the toolbar under the title for a normal screen', () => {
    const svg = popup(false);
    expect(btnY(svg, 'OKAY')).toBeLessThan(SCREEN_TITLE_PLUS_BAR);
  });
});
const SCREEN_TITLE_PLUS_BAR = 28 + 32;

describe('popup without a grid', () => {
  it('draws title, fields and buttons but no empty table', () => {
    const svg: string = renderAlvScreenSVG({
      screen: { title: 'Confirmation', fields: [{ type: 'output', value: 'Create sales order?' }], buttons: [{ code: 'YES', label: 'Yes' }] },
    }, { lang: 'en' });
    expect(svg).toContain('Create sales order?');
    expect(svgAnchors(svg)).toEqual(expect.arrayContaining(['title', 'pai:YES']));
    expect(svg).not.toContain('#2E6FB0" stroke="#24598F"'); // grid header band
  });
});

describe('manual builder', () => {
  let home: string;
  let prevHome: string | undefined;
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'sc4sap-manual-'));
    prevHome = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = home; // no real profile is read
  });
  afterAll(() => {
    if (prevHome === undefined) delete process.env.SC4SAP_HOME_DIR; else process.env.SC4SAP_HOME_DIR = prevHome;
    rmSync(home, { recursive: true, force: true });
  });

  it('puts a step\'s input values on the selection screen', () => {
    const sel = sample().screens.selection;
    const out = applySelectionValues(sel, { P_WERKS: 'KR01', R_LOG: true });
    const items = out.blocks.flatMap((b: { items: unknown[] }) => b.items);
    expect(items.find((i: { name?: string }) => i.name === 'P_WERKS').default).toBe('KR01');
    const radio = items.find((i: { type?: string }) => i.type === 'radioGroup');
    expect(radio.options.map((o: { selected: boolean }) => o.selected)).toEqual([false, true, false]);
  });

  it('has no warnings for the sample and flags a callout whose anchor is not drawn', () => {
    expect(manualWarnings(sample())).toEqual([]);
    const bad = sample();
    bad.scenarios[0].steps[1].callouts.push({ anchor: 'col:NOPE', text: '없는 컬럼' });
    const warns: string[] = manualWarnings(bad);
    expect(warns.some(w => w.includes('"col:NOPE" is not on screen "alv"') && w.includes('col:MENGE'))).toBe(true);
  });

  it('flags English prose in a Korean manual', () => {
    const bad = sample();
    bad.scenarios[0].steps[0].callouts[0].text = 'Enter the plant you want to check';
    expect(manualWarnings(bad).some((w: string) => w.startsWith('LANGUAGE MIX'))).toBe(true);
  });

  it('numbers versions', () => {
    expect(nextVersion(undefined)).toBe('1.0');
    const h = { versions: [{ version: '1.0' }, { version: '1.1' }] };
    expect(nextVersion(h)).toBe('1.2');
    expect(nextVersion(h, { major: true })).toBe('2.0');
    expect(nextVersion(h, { sameVersion: true })).toBe('1.1');
  });

  it('writes the page, the source and the revision history', () => {
    const outDir = join(home, 'out');
    const first = buildManual({ manualPath: SAMPLE, outDir, cwd: home, verbose: false });
    expect(first.version).toBe('1.0');
    const again = buildManual({ manualPath: SAMPLE, outDir, cwd: home, verbose: false, sameVersion: true });
    expect(again.version).toBe('1.0');
    const second = buildManual({ manualPath: SAMPLE, outDir, cwd: home, verbose: false });
    expect(second.version).toBe('1.1');
    expect(existsSync(join(outDir, '_src', 'ZMMR_GR_3PL-v1.1-ko.manual.json'))).toBe(true);
    const history = JSON.parse(readFileSync(second.history, 'utf-8'));
    expect(history.versions.map((v: { version: string }) => v.version)).toEqual(['1.0', '1.1']);

    const html = readFileSync(second.html, 'utf-8');
    expect(html).toContain('data-callouts="[[1,&quot;sel:P_WERKS&quot;,null,null],[2,&quot;sel:R_LOG&quot;,null,null]]"');
    expect(html).toContain('@page{size:A4 landscape');
    for (const text of ['2-1 <span data-p="scenarios.0.title">입고 로그 조회</span>', '※ Check Points', '오류 메시지 및 조치', '용어집', '개정 이력', '확인 필요']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('<?xml');
  });

  it('renders the edit-mode markup: highlight and bullet lines', () => {
    const m = sample();
    m.intro.purpose = '- 첫째 **굵게**\n- 둘째 ==강조==';
    const outDir = join(home, 'markup');
    const html = readFileSync(buildManual({ manualPath: (() => { const p = join(home, 'markup.json'); writeFileSync(p, JSON.stringify(m)); return p; })(), outDir, cwd: home, verbose: false }).html, 'utf-8');
    expect(html).toContain('<span data-p="intro.purpose"><span class="bl">첫째 <strong>굵게</strong></span><br><span class="bl">둘째 <mark class="em">강조</mark></span></span>');
  });

  it('draws a screenshot step without checking its anchors, with badge offsets and positions', () => {
    const m = sample();
    const st = m.scenarios[0].steps[0];
    st.image = { src: 'data:image/png;base64,iVBORw0KGgo=', width: 600, height: 300 };
    st.callouts[0].offset = [30, 10];
    st.callouts[1].pos = [24, 50];
    expect(manualWarnings(m)).toEqual([]);
    const drawn = renderStepScreen(m, st);
    expect(drawn.image).toBe(true);
    expect(drawn.svg).toContain('<image href="data:image/png;base64,iVBORw0KGgo="');
  });

  it('embeds its manual.json and imports a copy saved from the edit mode', () => {
    const outDir = join(home, 'edit');
    const built = buildManual({ manualPath: SAMPLE, outDir, cwd: home, verbose: false });
    const html = readFileSync(built.html, 'utf-8');
    expect(html).toContain('id="manual-source"');
    expect(html).toContain('id="edit-btn"');
    expect(html).toContain('data-k="callouts.0.text"');
    expect(html).toContain('Quill Editor v2.0.3'); // inlined, nothing loads from the network
    // Reference tables: rows the edit mode can add and delete, cells keyed into their item.
    expect(html).toMatch(/<table class="ed-table" data-array="messages" data-cols="[^"]+"><thead>/);
    expect(html).toContain('<tr data-row="0"><td><code><span data-c="code">');
    expect(html).toMatch(/data-array="fields\.selection"[\s\S]*?<td data-flag="required">●<\/td>/);
    expect(html).not.toMatch(/<script[^>]+src=/);
    // What the edit mode does on save: change the embedded manual, keep the rest of the page.
    const edited = html.replace(/(<script type="application\/json" id="manual-source">)([\s\S]*?)(<\/script>)/, (_, a, json, b) => {
      const src = JSON.parse(json);
      src.manual.scenarios[0].title = '편집된 </script> 제목';
      src.manual.edited = { at: '2026-09-30 10:00:00' };
      return a + JSON.stringify(src).replace(/</g, '\\u003c') + b;
    });
    const editedPath = join(outDir, 'edited.html');
    writeFileSync(editedPath, edited);
    const target = join(outDir, 'draft.manual.json');
    writeFileSync(target, '{}');
    const res = importEditedHtml(editedPath, target);
    const back = JSON.parse(readFileSync(target, 'utf-8'));
    expect(back.scenarios[0].title).toBe('편집된 </script> 제목');
    expect(res.edited).toEqual({ at: '2026-09-30 10:00:00' });
    expect(existsSync(`${target}.bak`)).toBe(true);
    expect(() => importEditedHtml(SAMPLE, target)).toThrow(/no embedded manual source/);
  });
});

describe('Excel worksheet screen', () => {
  const spec = {
    kind: 'excel', file: 'UPLOAD_TEMPLATE.xlsx', note: '* Mandatory Field',
    columns: [{ name: 'KUNNR', header: '*Customer', headerFill: '#ED7D31' }, { name: 'WERKS', header: 'Plant', headerFill: '#FFFF00' }],
    sampleRows: [{ KUNNR: '100234', WERKS: 'KR01' }],
  };
  it('draws column letters, the note, the header row and data from the next row, with anchors', () => {
    const svg: string = renderExcelSheetSVG(spec);
    expect(svg).toContain('UPLOAD_TEMPLATE.xlsx - Excel');
    expect(svg).toContain('#ED7D31');
    expect(svgAnchors(svg)).toEqual(expect.arrayContaining(['title', 'note', 'col:KUNNR', 'col:WERKS', 'row:3', 'sheet']));
    expect(svg).toContain('>100234<');
  });
  it('is drawn for a step instead of an SAP grid', () => {
    const m = { ...sample(), screens: { excel: spec } };
    const drawn = renderStepScreen(m, { screen: 'excel' });
    expect(drawn.svg).toContain('UPLOAD_TEMPLATE.xlsx - Excel');
    expect(drawn.svg).not.toContain('<?xml');
  });
});
