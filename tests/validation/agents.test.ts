import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENTS_DIR = join(__dirname, '..', '..', 'agents');

const EXPECTED_AGENTS = [
  'sap-analyst', 'sap-architect', 'sap-code-reviewer', 'sap-critic',
  'sap-debugger', 'sap-doc-specialist', 'sap-executor', 'sap-planner',
  'sap-qa-tester', 'sap-writer', 'sap-bc-consultant',
  'sap-sd-consultant', 'sap-mm-consultant', 'sap-fi-consultant',
  'sap-co-consultant', 'sap-pp-consultant', 'sap-ps-consultant', 'sap-pm-consultant',
  'sap-qm-consultant', 'sap-tr-consultant', 'sap-hcm-consultant',
  'sap-wm-consultant', 'sap-tm-consultant', 'sap-ariba-consultant',
  'sap-bw-consultant', 'sap-checker',
];

describe('Agents Validation', () => {
  it('all expected agent files exist', () => {
    for (const agent of EXPECTED_AGENTS) {
      const file = join(AGENTS_DIR, `${agent}.md`);
      expect(existsSync(file), `Missing agent: ${agent}.md`).toBe(true);
    }
  });

  for (const agent of EXPECTED_AGENTS) {
    describe(agent, () => {
      const agentFile = join(AGENTS_DIR, `${agent}.md`);

      it('has valid frontmatter', () => {
        if (!existsSync(agentFile)) return;
        const content = readFileSync(agentFile, 'utf-8');
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        expect(match, 'Missing frontmatter').toBeTruthy();
        const fm = match![1];
        expect(fm).toContain(`name: ${agent}`);
        expect(fm).toContain('model:');
      });

      it('has sap- prefix in name', () => {
        expect(agent.startsWith('sap-')).toBe(true);
      });
    });
  }

  describe('Module consultants reference configs/', () => {
    const modules = ['sd', 'mm', 'fi', 'co', 'pp', 'ps', 'pm', 'qm', 'tr', 'hcm', 'wm', 'tm', 'ariba', 'bw'];

    for (const mod of modules) {
      it(`sap-${mod}-consultant references configs/${mod.toUpperCase()}/`, () => {
        const file = join(AGENTS_DIR, `sap-${mod}-consultant.md`);
        if (!existsSync(file)) return;
        const content = readFileSync(file, 'utf-8');
        expect(content.toLowerCase()).toContain(`configs/${mod}`);
      });
    }
  });
});
