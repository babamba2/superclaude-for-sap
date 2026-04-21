#!/usr/bin/env node
/**
 * sc4sap SessionStart hook — Legacy migration banner.
 *
 * Detects the transitional state where a project still uses
 * `<cwd>/.sc4sap/sap.env` as its single-profile config, but multi-profile
 * support is now available. Emits a one-line notice into the session so the
 * user knows migration is available.
 *
 * Detection rule:
 *   needsMigration =
 *     EXISTS <cwd>/.sc4sap/sap.env
 *     AND NOT EXISTS <cwd>/.sc4sap/active-profile.txt
 *     AND (no profiles in $SC4SAP_HOME_DIR/profiles/)
 *
 * Non-blocking. Silent on any other state (fresh install, already migrated,
 * error reading files). Fires once per session via SessionStart.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function sc4sapHome() {
  return process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
}

function hasAnyProfile() {
  const dir = join(sc4sapHome(), 'profiles');
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).some((f) => {
      if (f === '.trash') return false;
      try {
        return statSync(join(dir, f)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function main() {
  const cwd = process.cwd();
  const legacy = join(cwd, '.sc4sap', 'sap.env');
  const pointer = join(cwd, '.sc4sap', 'active-profile.txt');

  const legacyExists = existsSync(legacy);
  const pointerExists = existsSync(pointer);
  const profilesExist = hasAnyProfile();

  const needsMigration = legacyExists && !pointerExists && !profilesExist;
  if (!needsMigration) process.exit(0);

  const message =
    '[sc4sap] 🆕 Multi-environment profiles are now available (Dev / QA / Prod).\n' +
    '         Your project still uses the legacy single-profile .sc4sap/sap.env.\n' +
    '         Run /sc4sap:sap-option to migrate — you choose the alias and tier.\n' +
    '         The original file is kept as sap.env.legacy for rollback.';

  // Claude Code SessionStart hook schema: write a plain message to stdout.
  // Non-fatal — the hook exits 0 regardless.
  process.stdout.write(message);
  process.exit(0);
}

main();
