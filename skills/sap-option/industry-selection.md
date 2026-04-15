# Industry Selection

Industry is stored in **two places** and must stay in sync:
- `.sc4sap/sap.env` → `SAP_INDUSTRY=<key>` (MCP server-side env)
- `.sc4sap/config.json` → `industry: "<key>"` (plugin-side, read by consultant agents)

**Flow:**
1. Show the current value from both files. If they disagree, flag it ("⚠️ sap.env and config.json disagree — will overwrite both to the same value").
2. Render the numbered menu (same as setup step 2):

   ```
   Select industry:
      1) retail          — Retail/Distribution
      2) fashion         — Fashion/Apparel
      3) cosmetics       — Cosmetics
      4) tire            — Tire
      5) automotive      — Automotive
      6) pharmaceutical  — Pharmaceutical
      7) food-beverage   — Food & Beverage
      8) chemical        — Chemical
      9) electronics     — Electronics / High-Tech
     10) construction    — Construction
     11) steel           — Steel / Metals
     12) utilities       — Utilities (Power/Gas/Water)
     13) banking         — Banking / Finance
     14) public-sector   — Public Sector
     15) other           — Other / Industry not specified
   ```

3. Accept the number (1–15) or the canonical key.
4. Preview diff (both files, two-file Before/After).
5. Confirm with `(y/N)`. On yes:
   - Update `SAP_INDUSTRY` in `sap.env` (atomic tmp→rename, with `.bak`).
   - Update `industry` in `config.json` (atomic tmp→rename, with `.bak`, preserve all other fields).
   - **If either write fails, restore from backup and report** — do not leave the two files out of sync.
6. Remind the user: "Industry changed to `<key>`. Consultant agents will load `industry/<key>.md` on next invocation. `/mcp` reconnect is NOT required for industry (plugin-side only); but if you want the MCP server process to see the new `SAP_INDUSTRY` env var for logging, reconnect `/mcp`."

**Edge cases:**
- If `industry/<key>.md` does not exist (user added a new key manually): warn "No `industry/<key>.md` reference file found — consultants will fall back to standard industry-agnostic recommendations."
- `other` is a valid choice meaning "no industry context"; consultants skip the industry reference when `SAP_INDUSTRY=other`.
