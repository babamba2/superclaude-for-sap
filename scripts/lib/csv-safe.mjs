// sc4sap: one rule for every CSV cell a spreadsheet may open (OWASP "CSV injection"), the same rule as
// project/doc-kit.mjs csvOf. A cell that starts with = + - @, a tab or a CR would be read by Excel as a
// formula, so it gets a leading apostrophe (shown as text; the apostrophe itself is not displayed).
//
// role/role-model.mjs imports it (role-page.mjs inlines this file in front of it for the browser). The page
// scripts that cannot import (process/gap-page.mjs, project/project-client.js, relmap/relmap-client.js) carry
// a copy of CSV_FORMULA_START with a comment pointing here; tests/validation/csv-safe.test.ts keeps them identical.

export const CSV_FORMULA_START = /^[=+\-@\t\r]/;

/** The cell text as a spreadsheet should show it: text, never a formula. */
export const csvSafe = (s) => (CSV_FORMULA_START.test(s) ? `'${s}` : s);
