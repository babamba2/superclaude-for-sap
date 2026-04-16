# Setup Wizard Steps

Referenced by `SKILL.md` — this file holds the full 12-step setup wizard.

1. Verify Claude Code version compatibility
2. **Identify SAP system version** — ask user to select their SAP system type:
   - **S/4HANA** (S4) — Business Partner (BP), MATDOC, ACDOCA, Fiori, CDS-based
   - **ECC 6.0** (ECC) — Vendor/Customer separate (XK01/XD01/FK01/FD01), MKPF/MSEG, BKPF/BSEG

   Also ask for **ABAP Release version** (e.g., `750`, `751`, `756`, `757`, `758`):
   - Can be checked via `GetSession` or TCode `SE38` → System → Status after connection
   - Or ask user directly

   This choice is **critical** — it determines:
   - Which SPRO config tables, BAPIs, TCodes, and workflows are referenced from `configs/`
   - How consultant agents (sap-sd-consultant, sap-mm-consultant, etc.) generate code and recommendations
   - Which tables/views agents query (e.g., ECC: `MKPF`+`MSEG` vs S4: `MATDOC`, ECC: `KNA1`+`LFA1` vs S4: `BUT000`)
   - Which ABAP syntax features agents can use in generated code (see ABAP Release Reference below)
   - Store as `SAP_VERSION` (`S4` or `ECC`) and `ABAP_RELEASE` (e.g., `756`) in `.sc4sap/sap.env` and `.sc4sap/config.json`

   Then ask for **Industry** — present a numbered selection menu. Ask **one question** and wait; do NOT dump descriptions inline:

   ```
   Select your industry:
      1) retail          — Retail/Distribution (Article, Store, POS, Assortment)
      2) fashion         — Fashion/Apparel (Style × Color × Size, Season, AFS/FMS)
      3) cosmetics       — Cosmetics (Batch, Shelf Life, Channel Pricing)
      4) tire            — Tire (OE/RE, Mixed Mfg, Mold, Recall)
      5) automotive      — Automotive (JIT/JIS, Scheduling Agreement, PPAP)
      6) pharmaceutical  — Pharmaceutical (GMP, Serialization, Batch Status)
      7) food-beverage   — Food & Beverage (Catch Weight, FEFO, TPM)
      8) chemical        — Chemical (Process, DG, Formula Pricing)
      9) electronics     — Electronics / High-Tech (VC/AVC, Serial, RMA)
     10) construction    — Construction (PS, POC Billing, Subcontracting)
     11) steel           — Steel / Metals (Characteristic, Coil, Heat)
     12) utilities       — Utilities — Power/Gas/Water (IS-U, FI-CA, Device)
     13) banking         — Banking / Finance (FS-CD, FS-BP, Parallel Ledger)
     14) public-sector   — Public Sector (FM, GM, Budget Control)
     15) other           — Other / Industry not specified (applies generic standards)
   ```

   This choice determines which `industry/*.md` reference file SAP consultant agents load when doing config analysis, business process design, Fit-Gap, or requirement interpretation. It is **important context**, not just metadata — consultants will ask the user to set it later if it is missing.

   - Accept either the number (1–15) or the canonical key (e.g. `retail`, `fashion`).
   - Store as `SAP_INDUSTRY=<key>` in `.sc4sap/sap.env` (step 4) **and** as `industry: "<key>"` in `.sc4sap/config.json` (step 10). Keep both in sync when changed via `/sc4sap:sap-option`.
   - If the user is unsure, accept `other` and tell them they can change it anytime via `/sc4sap:sap-option`.
   - Validate against the 15 keys listed in `industry/README.md`. If a new industry MD is added later, this list must be updated here and in `sap-option`.

3. **Install `abap-mcp-adt-powerup` MCP server** — clone (`github.com/babamba2/abap-mcp-adt-powerup.git`) and build the external MCP server into the **plugin root's** `vendor/abap-mcp-adt/` folder (typically `~/.claude/plugins/marketplaces/sc4sap/vendor/abap-mcp-adt/`), **NOT** the user's project directory.
   - **⚠️ Path resolution (MANDATORY)**: the install target must be the plugin root, not the current working directory. Resolve the plugin root **dynamically** — never hardcode the path. This skill file lives at `<PLUGIN_ROOT>/skills/setup/SKILL.md`, so:
     - `PLUGIN_ROOT` = absolute path of this `SKILL.md`, then go up two levels (`../..`)
     - On Windows this will usually be `C:\Users\<user>\.claude\plugins\marketplaces\sc4sap`, but **derive it at runtime**, do not assume
   - **Invocation**: always call the script with its **absolute path**, not a relative path, so CWD is irrelevant:
     ```bash
     node "<PLUGIN_ROOT>/scripts/build-mcp-server.mjs"
     ```
     The script itself uses `__dirname` to anchor `vendor/` next to itself, so once invoked with the absolute path it will always install into `<PLUGIN_ROOT>/vendor/abap-mcp-adt/` regardless of where the user ran Claude Code from.
   - If already installed (launcher present at `<PLUGIN_ROOT>/vendor/abap-mcp-adt/dist/server/launcher.js`), skip (use `--update` to refresh)
   - On failure, show error and guide user to manual install

4. **Configure SAP connection** — ask user for SAP credentials and write `.sc4sap/sap.env`:
   - `SAP_URL` (e.g., `https://your-sap-host:44300`)
   - `SAP_CLIENT` (e.g., `100`)
   - `SAP_AUTH_TYPE` (`basic` or `xsuaa`)
   - `SAP_USERNAME` / `SAP_PASSWORD`
   - `SAP_LANGUAGE` (default: `EN`)
   - `SAP_SYSTEM_TYPE` (`onprem` or `cloud`)
   - `SAP_VERSION` (`S4` or `ECC`) — from step 2
   - `ABAP_RELEASE` (e.g., `750`, `756`, `758`) — from step 2; consumed by agents to gate ABAP syntax features
   - `SAP_INDUSTRY` (e.g., `retail`, `cosmetics`, `automotive`, `other`) — from step 2; consumed by consultant agents to load `industry/<key>.md` for business-context analysis
   - `TLS_REJECT_UNAUTHORIZED=0` (dev only, self-signed certs) — omit or unset in production
   - `SC4SAP_MCP_AUTOBUILD=1` — auto-rebuild vendor MCP server when missing after a plugin version upgrade. Default `1` so users don't have to re-run `/sc4sap:setup mcp` after every version bump. Set to `0` to disable auto-build and require manual install.
   - **Blocklist policy (optional, defaults to `standard`)** — this is the **MCP server-side guard (L4)** in `abap-mcp-adt-powerup`, read from env vars in `sap.env`. It is distinct from the **PreToolUse hook (L3)** configured in Step 12. Write these as commented examples so the user can uncomment as needed:
     ```
     # Blocklist profile: minimal | standard | strict | off
     #   minimal  — block only PII/credentials/banking
     #   standard — minimal + Protected Business Data (ACDOCA, BKPF, VBAK, EKKO, ...)   [default]
     #   strict   — standard + Audit/Security + Communication/Workflow
     #   off      — disable the guard entirely (NOT recommended)
     # MCP_BLOCKLIST_PROFILE=standard

     # Comma-separated table names (or Z-patterns) to ALWAYS block, on top of the profile
     # MCP_BLOCKLIST_EXTEND=ZHR_SALARY,ZCUSTOMER_PII

     # Comma-separated table names to WHITELIST (audited bypass). Use sparingly.
     # MCP_ALLOW_TABLE=ACDOCA
     ```
   - Do not set `MCP_BLOCKLIST_PROFILE` unless the user explicitly asks to loosen or tighten the default. `standard` is the safe default.

5. **Reconnect MCP** — prompt user to reconnect via `/mcp` so the newly installed server starts
6. Test SAP system connection via `GetSession`
7. **Confirm and persist connected system info** — parse the `GetSession` response for System ID (SID), MANDT (client), BNAME (user), and SPRAS (language). Display them for the user to confirm, then **write them into `.sc4sap/config.json` → `systemInfo`** so the HUD second line and `/sc4sap:sap-option status` can render the SID/client/user without needing a live MCP call on every refresh.

   Target shape in `config.json`:
   ```json
   {
     "sapVersion": "S4",
     "abapRelease": "758",
     "industry": "cosmetics",
     "systemInfo": {
       "sid": "S4H",
       "client": "100",
       "user": "DEVUSER",
       "language": "EN",
       "capturedAt": "2026-04-15T12:34:56Z"
     }
   }
   ```

   Rules:
   - Write `systemInfo` as a nested object, not a flat prefix. Merge with existing fields — do not overwrite the full file.
   - `capturedAt` is an ISO timestamp so staleness can be detected later.
   - If `GetSession` fails, skip this write and tell the user the HUD will fall back to reading SAP_USERNAME/SAP_CLIENT from `sap.env` (SID will be blank until a session succeeds).
   - Re-run this step from `/sc4sap:sap-option` or by re-invoking `/sc4sap:setup` whenever the user connects to a different system.

8. Run `GetInactiveObjects` to confirm ADT access rights

9. **Create ABAP utility function modules** — required by the MCP server for Screen, GUI Status, and Text Element operations:
   1. Check if function group `ZMCP_ADT_UTILS` already exists via `SearchObject` (query=`ZMCP_ADT_UTILS`, objectType=`FUGR`)
   2. If NOT found, create the objects using MCP tools (package `$TMP` = **local-only, not transportable** by design — these are developer tooling helpers, not business logic):
      - `CreateFunctionGroup` — name: `ZMCP_ADT_UTILS`, package: `$TMP`, description: `MCP ADT Utility Functions`
      - `CreateFunctionModule` — name: `ZMCP_ADT_DISPATCH`, group: `ZMCP_ADT_UTILS`, description: `MCP ADT Dispatcher for Screen/GUI Status`
      - `CreateFunctionModule` — name: `ZMCP_ADT_TEXTPOOL`, group: `ZMCP_ADT_UTILS`, description: `MCP ADT Text Pool Read/Write`
      - `UpdateFunctionModule` — for each FM, read the ABAP source from `abap/zmcp_adt_dispatch.abap` and `abap/zmcp_adt_textpool.abap` in the plugin directory, then upload via UpdateFunctionModule
      - Both function modules MUST be set as **RFC-enabled**
      - Activate all objects
   3. If already found, skip creation and report "ZMCP_ADT_UTILS already exists"
   4. Test by calling `SearchObject` for `ZMCP_ADT_DISPATCH` to verify

10. Write plugin config to `.sc4sap/config.json` — include `sapVersion`, `abapRelease`, and `industry` fields, and preserve the `systemInfo` block written in step 7 (merge, don't overwrite).
    - Note: `sapVersion` / `abapRelease` / `industry` are **duplicated** in `sap.env` (step 4) on purpose. `sap.env` is consumed by the MCP server process; `config.json` is consumed by plugin-side components (HUD, PreToolUse hook, agents, SPRO cache, consultant agents reading `industry/*.md`). Keep both in sync when the user changes them via `/sc4sap:sap-option`.
    - `systemInfo` is **not** duplicated in `sap.env` — it represents what the system actually reported, not what the user typed, so it only lives in `config.json`.

11. **Ask user about SPRO config extraction (optional)** — prompt whether to run SPRO extraction now:

    ```
    Would you like to extract SPRO config now? (y/N)
    - Optional. You can run `/sc4sap:setup spro` anytime later.
    - 🔺 Initial download consumes significant tokens (dozens to hundreds of tables per module).
    - ✅ Once cached locally, future development sessions use the local cache
       (.sc4sap/spro-config.json), dramatically reducing token usage.
    - ⏭️  Skipping is fine — the plugin works with static configs/ references by default.
    ```

    - If user answers yes: proceed to run SPRO extraction (see `spro-auto-generation.md`)
    - If user answers no or skips: confirm "Skipped SPRO extraction. Run `/sc4sap:setup spro` later if needed." and complete setup

12. **🔒 Data Extraction Blocklist — PreToolUse hook (L3, MANDATORY — not skippable)** — install the Claude Code `PreToolUse` hook that blocks row extraction from sensitive tables *before* the MCP call is even made.

    > **Two-layer model — do not conflate:**
    > - **L3 (this step)** = Claude Code PreToolUse hook, config in `.sc4sap/config.json` → `blocklistProfile`. Values: `strict` | `standard` | `minimal` | `custom`. Fires for any Claude Code session regardless of which MCP server is in use.
    > - **L4 (step 4, optional)** = MCP server internal guard, config in `sap.env` → `MCP_BLOCKLIST_PROFILE`. Values: `minimal` | `standard` | `strict` | `off`. Applies only to `abap-mcp-adt-powerup`.
    >
    > They enforce similar intent but are **independent**. Typical setups run L3 on `strict` (the default) and leave L4 on `standard`. A user can change L3 here (or by editing `config.json`); L4 is changed via `/sc4sap:sap-option`.

    **Step A — Profile selection**: ask the user to choose a blocklist scope:

    ```
    🔒 Select a data-extraction blocklist profile (required to complete setup).

      1) strict   — block everything (recommended default)
                    PII + credentials + HR + transactional tables (VBAK/BKPF/...)
                    + audit logs / workflow

      2) standard — PII + credentials + HR + transactional tables (VBAK/BKPF/ACDOCA/...)
                    audit logs / workflow allowed

      3) minimal  — block only PII + credentials + HR + Tax
                    general business transaction tables allowed

      4) custom   — ignore built-in list; apply only the tables listed in
                    .sc4sap/blocklist-custom.txt

    Any profile merges in extra entries from .sc4sap/blocklist-extend.txt if present.
    ```

    - Accept: `strict` / `standard` / `minimal` / `custom` (or 1/2/3/4)
    - Write the chosen value to `.sc4sap/config.json` as `blocklistProfile`
    - If `custom`: prompt user to create `.sc4sap/blocklist-custom.txt` now (one table name or pattern per line) or after setup; warn that an empty custom list means no enforcement at L3

    **Step B — Install the hook (mandatory)**:

    Run `node scripts/install-hooks.mjs` (defaults to user-level `~/.claude/settings.json`).
    - If the user prefers project-level enforcement: `node scripts/install-hooks.mjs --project`
    - On success, report: "✅ PreToolUse hook installed. Profile: {profile}"

    **Step C — Verification (smoke test)**:

    Pipe a BNKA test payload to the hook script and confirm it returns a `deny` decision. Example (bash):
    ```bash
    echo '{"tool_name":"mcp__plugin_sc4sap_sap__GetTableContents","tool_input":{"table_name":"BNKA"}}' \
      | node scripts/hooks/block-forbidden-tables.mjs
    ```
    Expected: JSON containing `"permissionDecision":"deny"` in `hookSpecificOutput`. If not, halt setup and surface the error. (The hook matches tool names by substring — any name containing `GetTableContents` or `GetSqlQuery` works.)

    **Step D — Final confirmation**:
    - Print profile, extend file path (exists? yes/no), custom file path (for custom mode), and the full settings.json hook entry.
    - Remind the user they can change the **L3 hook profile** anytime by re-running `/sc4sap:setup` or editing `.sc4sap/config.json` → `blocklistProfile`.
    - For the **L4 MCP-server profile** (`MCP_BLOCKLIST_PROFILE` in `sap.env`), direct them to `/sc4sap:sap-option`.

    Setup cannot complete without Step 12 succeeding. If the hook install fails (no node, permission error, etc.), stop and report — do not mark setup as done.

13. **Install HUD status line into user settings (mandatory)** — some Claude Code versions do not render plugin-declared `statusLine` entries unless the same block is present in `~/.claude/settings.json`. Run:

    ```bash
    node "<PLUGIN_ROOT>/scripts/hud/install-statusline.mjs"
    ```

    The installer is idempotent:
    - If no `statusLine` exists → writes the sc4sap HUD entry.
    - If a sc4sap entry already exists → refreshes it.
    - If a **non-sc4sap** `statusLine` exists → leaves it alone and prints a warning; re-run with `--force` only if the user confirms they want to overwrite their custom status line.

    After success, tell the user: "Restart Claude Code to see the HUD render below the input box." See `hud-statusline.md` for the full spec.

<SAP_Version_Reference>
When you need to explain ECC vs S/4HANA differences (tables, TCodes, BAPIs, development patterns) during setup or when routing follow-up questions, **read `common/sap-version-reference.md`** and apply the rules there. Do not duplicate the comparison table inline — the file is the single source of truth.
</SAP_Version_Reference>

<ABAP_Release_Reference>
When you need to reason about ABAP syntax availability for a given `ABAP_RELEASE` (e.g., whether inline declarations, RAP, or Open SQL expressions are allowed), **read `common/abap-release-reference.md`** and follow the rules there. Do not duplicate the feature matrix inline.
</ABAP_Release_Reference>
