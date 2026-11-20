import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain ESM script without types
import { planMigration, OPTION_PRESETS } from '../../scripts/adobe/sf-to-adobe-plan.mjs';
// @ts-expect-error — plain ESM script without types
import { loadSmartForm } from '../../scripts/adobe/sf-inventory.mjs';
// @ts-expect-error — plain ESM script without types
import { renderPlanHtml, renderPlanMarkdown, renderPlanSummary, optionLabel } from '../../scripts/adobe/sf-to-adobe-page.mjs';

const XML = readFileSync(join(__dirname, '..', 'fixtures', 'adobe', 'sf-synthetic.xml'), 'utf8');
const plan = planMigration(loadSmartForm(XML), { options: 'full' });

describe('smartform-to-adobe report page', () => {
  it('names the option preset', () => {
    expect(optionLabel(plan.options)).toBe('full');
    expect(optionLabel(OPTION_PRESETS['sap-default'])).toBe('sap-default');
  });

  it('HTML carries every gap, the abort node and the next steps', () => {
    const html = renderPlanHtml(plan, 'ko');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="ko">');
    for (const g of plan.gaps) expect(html).toContain(g.kind);
    expect((html.match(/class="silent"/g) || []).length).toBe(plan.gaps.filter((g: { logged: boolean }) => !g.logged).length);
    if (plan.aborted) expect(html).toContain(plan.aborted.node);
    expect(html).toContain('/sc4sap:adobe-preview');
    expect(html).toContain('prefers-color-scheme');
  });

  it('marks rows the critic corrected', () => {
    const p = { ...plan, gaps: [{ ...plan.gaps[0], reviewedBy: 'critic' }] };
    expect(renderPlanHtml(p, 'en')).toContain('(reviewed)');
    expect(renderPlanMarkdown(p, 'en')).toContain('(reviewed)');
  });

  it('says it is a beta with low output quality, in page, Markdown and summary', () => {
    expect(renderPlanHtml(plan, 'ko')).toContain('베타 버전이에요');
    expect(renderPlanMarkdown(plan, 'en')).toContain('Beta — output quality is still low');
    expect(renderPlanSummary(plan, 'en').split('\n')[0]).toMatch(/^Beta — output quality is still low/);
  });

  it('escapes SAP text', () => {
    const p = { ...plan, gaps: [{ node: 'X', path: '<b>x</b>', kind: 'text-element', reason: '<script>alert(1)</script>', action: 'a & b', logged: false }] };
    const html = renderPlanHtml(p, 'en');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('Markdown and summary agree on the counts', () => {
    const md = renderPlanMarkdown(plan, 'en');
    const sum = renderPlanSummary(plan, 'en');
    expect(md).toContain(sum.split('\n')[1]);
    expect(sum).toContain(`Gap nodes ${plan.completeness.gap} — Manual steps ${plan.gaps.length}`);
    // node counts add up; gap rows are counted apart from nodes
    expect(plan.completeness.mapped + plan.completeness.warning + plan.completeness.gap).toBe(plan.completeness.nodes);
    expect(sum).toContain('Silent: ');
    expect(md.split('\n').filter((l: string) => l.startsWith('| ') && plan.gaps.some((g: { path: string }) => l.includes(g.path))).length).toBeGreaterThanOrEqual(plan.gaps.length);
  });
});
