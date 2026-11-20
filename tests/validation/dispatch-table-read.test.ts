import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ZMCP_ADT_DISPATCH TABLE_READ (ECC < 7.50, the MCP's table-read fallback), 2026-11-18: customer tables (Z*, Y*,
// this system's own namespaces) of any delivery class are readable with the caller's SE16 authority, except
// personal data; SAP's business tables stay closed unless the blocklist profile is off (all_tables). The 7.31
// copy is kept outside git on some machines: it is checked only where it exists.

const ROOT = join(__dirname, '..', '..');
const ECC = join(ROOT, 'abap', 'zmcp_adt_dispatch_ecc.abap');
const V731 = join(ROOT, 'abap', 'zmcp_adt_dispatch_731.abap');

const form = (src: string, name: string) => {
  const a = src.indexOf(`\nFORM ${name} USING`);
  expect(a, name).toBeGreaterThan(0);
  return src.slice(a, src.indexOf('\nENDFORM.', a));
};

for (const [label, file, allFlag] of [['ECC 7.40', ECC, 'ls_input-all_tables'], ['7.31', V731, 'lv_all']] as const) {
  describe.skipIf(!existsSync(file))(`ZMCP_ADT_DISPATCH ${label} — TABLE_READ`, () => {
    const src = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';

    it('order: credential guard, fixed list, delivery class, then customer tables, then the profile-off path', () => {
      const t = form(src, 'table_read');
      const guard = t.indexOf("IF lv_tab = 'RFCDES'");
      const list = t.indexOf("IF lv_tab <> 'MODACT'");
      const cls = t.indexOf('SELECT SINGLE contflag FROM dd02l INTO lv_class');
      const cust = t.indexOf('PERFORM table_read_customer USING lv_tab CHANGING lv_cust lv_why.');
      const auth = t.indexOf("CALL FUNCTION 'VIEW_AUTHORITY_CHECK'");
      expect([guard, list, cls, cust, auth].every((i) => i > 0), label).toBe(true);
      expect(guard).toBeLessThan(list);
      expect(list).toBeLessThan(cls);
      expect(cls).toBeLessThan(cust);
      expect(cust).toBeLessThan(auth);
    });

    it('the customer path runs only when the profile is not off, and only for a table DD02L knows', () => {
      const t = form(src, 'table_read');
      expect(t).toContain('lv_dd_subrc = sy-subrc.');
      expect(t).toMatch(new RegExp(`IF ${allFlag.replace(/[-]/g, '\\-')} <> 'X'\\.\\n\\s+CLEAR: lv_cust, lv_why\\.\\n\\s+IF lv_dd_subrc = 0\\.\\n\\s+PERFORM table_read_customer`));
      // not a customer table → the old refusal; a customer table with personal data → refused with the reason
      expect(t).toMatch(/IF lv_cust <> 'X'\.\n\s+ev_subrc = 4\. ev_message = \|TABLE_READ: table \{ lv_tab \} is not allowed\|/);
      expect(t).toMatch(/IF lv_why IS NOT INITIAL\.\n\s+ev_subrc = 4\. ev_message = \|TABLE_READ: table \{ lv_tab \} \{ lv_why \} and is not readable\|/);
      // every non-customizing read, customer or profile-off, still needs the caller's SE16 authority
      expect(t.indexOf("CALL FUNCTION 'VIEW_AUTHORITY_CHECK'")).toBeGreaterThan(t.indexOf('IF lv_why IS NOT INITIAL.'));
    });

    it('customer = Z*, Y*, or a namespace this system develops (TRNSPACE role P, not SAP)', () => {
      const c = form(src, 'table_read_customer');
      expect(c).toContain("IF iv_tab CP 'Z*' OR iv_tab CP 'Y*'.");
      expect(c).toContain("SELECT SINGLE role sapflag FROM trnspace INTO (lv_role, lv_sap) WHERE namespace = lv_name.");
      expect(c).toContain("IF sy-subrc = 0 AND lv_role = 'P' AND lv_sap IS INITIAL.");
    });

    it('personal data: HR / payroll names and employee-number fields are refused', () => {
      const c = form(src, 'table_read_customer');
      for (const p of ['ZHR*', 'YHR*', 'Z_HR*', 'Y_HR*', '*PAYROLL*', '*PAYSLIP*', '*SALARY*', '*WAGE*', '*PCL1*', '*PCL2*', '*PCL3*', '*PCL4*'])
        expect(c, p).toContain(`iv_tab CP '${p}'`);
      expect(c).toMatch(/WHERE tabname = iv_tab AND as4local = 'A' AND as4vers = '0000'\n\s+AND \( fieldname = 'PERNR' OR rollname = 'PERNR_D' OR rollname = 'P_PERNR' OR rollname = 'PERSNO' \)\./);
    });

    it('the credential guard and the ops-health-check list are unchanged', () => {
      const t = form(src, 'table_read');
      for (const g of ["lv_tab CP 'USR*'", "lv_tab CP 'UST*'", "lv_tab CP 'SSF_PSE*'", "lv_tab CP 'STRUST*'", "lv_tab CP 'SNC*'", "lv_tab CP 'RSAU*'"])
        expect(t, g).toContain(g);
    });
  });
}

describe('7.31 and ECC copies apply the same rule', () => {
  it.skipIf(!existsSync(V731))('the customer helper FORM is identical in both', () => {
    const a = form(readFileSync(ECC, 'utf8').replace(/\r\n/g, '\n'), 'table_read_customer');
    const b = form(readFileSync(V731, 'utf8').replace(/\r\n/g, '\n'), 'table_read_customer');
    expect(b).toBe(a);
  });
});
