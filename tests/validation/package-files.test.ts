import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// Folders the plugin reads at run time (skills / agents / hooks / bridge / scripts). The npm package must carry
// them, or a package install misses rules (common/), the blocklist (exceptions/), the keyring (runtime-deps/) …
const RUNTIME_DIRS = ['agents', 'bridge', 'hooks', 'scripts', 'skills', 'configs', 'common', 'exceptions', 'industry',
  'country', 'agent-refs', 'abap', 'asset', 'data', 'runtime-deps', '.claude-plugin'];

describe('npm package files', () => {
  it.each(RUNTIME_DIRS)('carries %s', (dir) => {
    expect(pkg.files).toContain(dir);
  });
});
