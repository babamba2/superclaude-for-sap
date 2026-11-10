import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Business-action ABAP sources are split by system family:
//   abap/biz/*.abap      common  — must activate on ECC 7.40 and S/4HANA
//   abap/biz/731/*.abap  ECC 7.31 copy
//   abap/biz/s4/*.abap   S/4HANA only (ZCL_MCP_BIZ_SYS_S4, ZCL_MCP_BIZ_EWM)
// Common and 7.31 sources must not name S/4-only objects statically: ECC activation would fail.

const ROOT = join(__dirname, '..', '..', 'abap', 'biz');

// Tables / views that do not exist on ECC (EWM /SCWM/ and /SCDL/ tables only exist where EWM runs).
const S4_ONLY_OBJECT =
  /\b(?:FROM|JOIN|TYPE|LIKE|TABLE\s+OF|INCLUDE\s+TYPE|UPDATE|INSERT\s+INTO|MODIFY|DELETE\s+FROM)\s+(acdoca|acdocp|acdoca_m_extract|matdoc|matdoc_extract|prcd_elements|ukm[a-z0-9_]*|fins_[a-z0-9_]*|i_[a-z0-9_]+|\/scwm\/[a-z0-9_]+|\/scdl\/[a-z0-9_]+)\b/i;
// Status fields that exist in these tables on S/4HANA only (they are in VBUK / VBUP on ECC);
// also through a variable named after the table (ls_vbak-fksak) — compile-checked as well.
const S4_ONLY_FIELD =
  /\b(?:[a-z0-9]+_)?(?:vbak|vbap|likp|lips|vbrk)-(?:fksak|fksaa|gbstk|gbsta|lfstk|lfsta|wbstk|wbsta|abstk|absta|cmgst|kostk|kosta|lvstk|lvsta|fkstk|fksta|uvall|uvvls)\b/i;

/** Source without comments and string literals (they are never compiled as names). */
export function codeOnly(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('*'))
    .map((l) =>
      l
        .replace(/`(?:[^`]|``)*`/g, '``')
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/\|[^|]*\|/g, '||')
        .replace(/".*$/, ''),
    )
    .join('\n');
}

export function s4OnlyRefs(src: string): string[] {
  const hits: string[] = [];
  codeOnly(src)
    .split('\n')
    .forEach((l, i) => {
      const m = l.match(S4_ONLY_OBJECT) ?? l.match(S4_ONLY_FIELD);
      if (m) hits.push(`${i + 1}: ${m[0]}`);
    });
  return hits;
}

/** Names declared more than once (DATA / FIELD-SYMBOLS / CONSTANTS / STATICS) inside one METHOD. */
export function duplicateDecls(src: string): string[] {
  const hits: string[] = [];
  let meth: string | null = null;
  let names: Record<string, number> = {};
  let inDecl = false;
  src
    .replace(/\r/g, '')
    .split('\n')
    .forEach((line, i) => {
      if (line.startsWith('*')) return;
      const mm = line.match(/^\s*METHOD\s+([\w~]+)\s*\./i);
      if (mm) {
        meth = mm[1];
        names = {};
        inDecl = false;
        return;
      }
      if (/^\s*ENDMETHOD\./i.test(line)) {
        meth = null;
        return;
      }
      if (!meth) return;
      const code = line.replace(/".*$/, '');
      const m = code.match(/^\s*(DATA|FIELD-SYMBOLS|CONSTANTS|STATICS)(\s*:)?\s*(.*)$/i);
      let rest: string | null = null;
      if (m) {
        inDecl = !!m[2];
        rest = m[3];
      } else if (inDecl) rest = code;
      if (rest === null) return;
      const n = rest.match(/^\s*(<?\w+>?)\s+(TYPE|LIKE)\b/i);
      if (n) {
        const k = n[1].toLowerCase();
        if (names[k]) hits.push(`${i + 1} ${meth}: ${k} (first at ${names[k]})`);
        else names[k] = i + 1;
      }
      if (/\.\s*$/.test(code)) inDecl = false;
    });
  return hits;
}

const abapIn = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.abap'))
    .map((f) => join(dir, f));

describe('biz ABAP sources: system-family split', () => {
  for (const f of [...abapIn(ROOT), ...abapIn(join(ROOT, '731'))]) {
    it(`${f.slice(ROOT.length + 1)} names no S/4-only object statically`, () => {
      expect(s4OnlyRefs(readFileSync(f, 'utf-8'))).toEqual([]);
    });
  }

  it('the S/4 class exists and is the only place with S/4-only status fields', () => {
    const s4 = readFileSync(join(ROOT, 's4', 'zcl_mcp_biz_sys_s4.clas.abap'), 'utf-8');
    expect(s4OnlyRefs(s4).length).toBeGreaterThan(0);
  });

  // 731/ holds copies of the shared sources (only EXEC and the FM differ on 7.31).
  for (const f of abapIn(join(ROOT, '731'))) {
    const name = f.slice(f.lastIndexOf('731') + 4);
    if (/zcl_mcp_biz_exec\.clas|zmcp_biz_execute\.func/.test(name)) continue;
    it(`731/${name} is the same source as the common one`, () => {
      const norm = (p: string) => readFileSync(p, 'utf-8').replace(/\r/g, '');
      expect(norm(f)).toBe(norm(join(ROOT, name)));
    });
  }

  // A name declared twice in one method fails the SAP syntax check (seen on S4-DEV 2026-11-10).
  for (const f of [...abapIn(ROOT), ...abapIn(join(ROOT, 's4'))].filter((p) => p.endsWith('.clas.abap'))) {
    it(`${f.slice(ROOT.length + 1)} declares no name twice in a method`, () => {
      expect(duplicateDecls(readFileSync(f, 'utf-8'))).toEqual([]);
    });
  }

  it('duplicate-declaration check catches a repeated DATA name', () => {
    const src = '  METHOD m.\n    DATA: lv_from TYPE i,\n          lv_from TYPE string.\n  ENDMETHOD.\n';
    expect(duplicateDecls(src)).toHaveLength(1);
  });

  it('the EWM handler is S/4-only and EXEC creates it by name only', () => {
    const ewm = readFileSync(join(ROOT, 's4', 'zcl_mcp_biz_ewm.clas.abap'), 'utf-8');
    expect(s4OnlyRefs(ewm).length).toBeGreaterThan(0);
    for (const f of [...abapIn(ROOT), ...abapIn(join(ROOT, '731'))]) {
      expect(codeOnly(readFileSync(f, 'utf-8')), f).not.toMatch(/zcl_mcp_biz_ewm/i);
    }
    const exec = readFileSync(join(ROOT, 'zcl_mcp_biz_exec.clas.abap'), 'utf-8');
    expect(exec).toMatch(/optional_handler\( 'EWM' \)/);
  });

  it('the factory creates the S/4 class by name only', () => {
    const fac = readFileSync(join(ROOT, 'zcl_mcp_biz_sys.clas.abap'), 'utf-8');
    expect(fac).toMatch(/CREATE OBJECT lo_obj TYPE \(c_s4_class\)/);
    expect(codeOnly(fac)).not.toMatch(/zcl_mcp_biz_sys_s4/i);
  });

  it('lint catches static S/4-only reads and ignores comments and literals', () => {
    expect(s4OnlyRefs('    SELECT * FROM prcd_elements INTO TABLE lt.')).toHaveLength(1);
    expect(s4OnlyRefs('    DATA ls TYPE acdoca.')).toHaveLength(1);
    expect(s4OnlyRefs('    lv = ls_vbak-fksak.')).toHaveLength(1);
    expect(s4OnlyRefs('    SELECT * FROM /scwm/ordim_o INTO TABLE lt.')).toHaveLength(1);
    expect(s4OnlyRefs('    DATA lv TYPE /scdl/db_refdoc-docid.')).toHaveLength(1);
    expect(s4OnlyRefs('* reads ACDOCA on S/4\n    " FROM acdoca\n    lv_tab = `ACDOCA`.')).toEqual([]);
    expect(s4OnlyRefs('    SELECT * FROM (lv_tab) INTO TABLE lt.')).toEqual([]);
  });
});
