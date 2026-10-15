---
name: config-to-document
description: Document one module's configuration as it is in the connected SAP system — one HTML file that follows the module's IMG tree, shows every IMG activity with its real table values drawn on an SM30-style screen, marks the rows customer transports changed (with the transport history), runs configuration checks and adds SAP's own IMG documentation. MM first; other modules through the same pipeline.
model: inherit
---

# SC4SAP Configuration → Document

Reads the module's IMG structure and configuration tables from the live system and writes **one HTML file**: an IMG tree with search and status filters on the left, one page per IMG activity (screen drawing with the real values, the full value table, customer changes, checks, SAP documentation) and a checklist panel on the right.

<Purpose>
Consultants, key users and auditors need to know how a system is set up — not how SAP describes the module in general. This skill answers "what is configured here, what did the project change, and what looks wrong" from the system itself. GUI screenshots are not possible, so the screens are drawn with the shared screen renderer (the same drawing as `program-to-manual`), filled with the values read from the tables.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Team_Mode>**No teamMode integration.** Extraction and drawing are scripted; agents only write and review the consultant notes (Step 4).</Team_Mode>

<Use_When>
- "설정 문서", "컨피그 리스트", "configuration list", "IMG 설정 정리", "SPRO 설정 문서화", "설정 점검", "config audit", "how is MM configured in this system"
- Go-live / handover / audit: the configuration must be written down as it is
- Before a rollout or a system copy: what did the project change in the IMG
</Use_When>

<Do_Not_Use_When>
- One program's behaviour → `/sc4sap:program-to-spec` or `/sc4sap:program-to-manual`
- A question about one setting → `/sc4sap:ask-consultant` (answers in chat)
- Business-process documentation of a custom package → `/sc4sap:package-to-process`
</Do_Not_Use_When>

<Decisions_Fixed>
Settled when the skill was designed — do not ask again:
- **Real values, as they are.** The document shows the table values exactly as read (organisation names included). It is an internal document; say so once in the closing message.
- **Read-only.** Only customizing / system tables (delivery class C, G, E, S), DDIC metadata and the transport key tables are read — on ECC through `ZMCP_ADT_DISPATCH` `TABLE_READ`, which refuses everything else. The MCP blocklist still applies; a refused table shows as "Not readable" in the document, never as a failure.
- **Customer change = customer transport.** A row counts as customer-changed when a non-SAP transport (`E071K`, `TRKORR NOT LIKE 'SAP%'`) recorded its key, in any client.
- **Language.** Texts (IMG titles, field labels, value texts) in the document language when the system has them, else English. SAP documentation is mostly English.
- **One file.** HTML with data and drawings embedded; works offline; prints.
</Decisions_Fixed>

<Inputs>
- Module (required): `MM` today. `SD`, `PP`, `PM`, `QM`, `LE`, `PS`, `CO` resolve through the same IMG walk (`--module X`); only MM has check rules (`configs/MM/config-checks.json`) yet — other modules get the built-in checks.
- Areas (optional): IMG areas under the module node — default all.
- Language (optional): from `.sc4sap/config.json` (`language`), else `ko`.
</Inputs>

<Workflow>

**Step 1 — Module and preflight.** Take the module from the arguments; if missing, ask with `AskUserQuestion` (MM first, recommended). Confirm the active profile (`.sc4sap/active-profile.txt`) in one line.

**Step 2 — Areas.** Run
```
node scripts/config/extract-config.mjs --module <M> --list-areas
```
Show the areas (document language + English) and ask with one `AskUserQuestion` (`multiSelect: true`, first option "All areas (Recommended)"). A full MM run reads about 1,300 tables (15–25 minutes on ECC); say so when the user picks all.

If the command fails with `TABLE_READ: table … is not allowed` on an IMG table (`TNODEIMG`, `CUS_IMGACH`), the system's `ZMCP_ADT_DISPATCH` predates the customizing allow rule: stop and tell the user to update it from `abap/zmcp_adt_dispatch_ecc.abap` (setup Step 9) — never work around the dispatcher.

**Step 3 — Extract.** Run in the background (`run_in_background: true`):
```
node scripts/config/extract-config.mjs --module <M> [--areas "<Area 1>,<Area 2>"] [--lang <lang>]
```
It prints progress (`tables n/N`) on stderr and one JSON line at the end: `{ ok, file, counts }`. An interrupted run resumes from its read cache; `--fresh` starts over (use it when the user asks for a refresh of an earlier document). Report the counts when it finishes.

**Step 4 — Consultant notes and reference material (written, then reviewed).** Per IMG activity the notes card (purpose, effect of *this system's* values, cautions, references) and the reference panel (SAP documentation summarised in the document language, 2–3 setup cases with flow diagrams and which one this system follows, comparison table, decision checklist, decision criteria, official SAP sources — Help Portal, Notes / KBAs, Learning — opened and cited) are written by the module consultant agent and reviewed by `sap-critic`; never by the main thread. Prompts: [`notes-prompts.md`](notes-prompts.md) — use them verbatim with the placeholders filled.
0. **Terms first.** `node scripts/config/notes.mjs terms --module <M>` → `terms/_in/tNNN.json` (names SAP has no document-language text for: IMG folders, activity titles, field labels; 150 per batch; translated terms are reused by later runs). Per batch: writer then reviewer, prompt § 4. Skip when it reports 0 terms.
1. **Scope — ask on every run.** `node scripts/config/notes.mjs scopes --module <M>` prints activities and batches per scope (activities with reviewed notes from earlier runs are left out). Ask with one `AskUserQuestion`, each option labelled with its numbers from that output and the cost (one batch ≈ 12 activities, a writer, a reviewer and usually a revision run with web research — measured on MM: about 750k tokens and 40 minutes per batch):
   - `custom` — activities customer transports changed (Recommended)
   - `values` — also standard and empty ones (every activity with a table)
   - `all` — every activity, including transaction-only ones
   - `none` — no notes this run; the document is built without new notes
   Then `node scripts/config/notes.mjs batches --module <M> --scope <scope> --size 12` → `notes/_in/bNNN.json` (numbered after existing batches; `--redo` rewrites reviewed activities too, only when the user asks).
2. **Write** — per batch, `Agent(subagent_type: "sc4sap:sap-<m>-consultant")` with prompt § 1 (saves `--kind draft`). Batches run in parallel, at most 4 at a time.
3. **Review** — per batch, prompt § 2: (a) `notes-lint.mjs` on the main thread (sources, transactions, counts, check findings — no tokens), (b) `sc4sap:sap-critic` judges SAP meaning with the lint facts in hand and opens only sources the lint marks `new` / `changed` (saves `--kind review`, prints the `fix` list). Saving a review adds the sources of every `ok` activity to the verified-source cache, which later batches receive as `knownSources`; `notes.mjs sources --module <M>` seeds that cache from batches reviewed before it existed.
4. **Revise** — for a batch with `fix` items, the writer agent again with prompt § 3 (saves `--kind revised`). One round; findings still open after it stay visible in the document ("Review findings open").
5. `node scripts/config/notes.mjs status --module <M>` must show draft + review for every batch of this run before Step 5 (skip this step with scope `none`).
6. **Knowledge base.** `node scripts/config/notes.mjs kb --module <M>` copies the general part of every reviewed note (purpose, SAP documentation summary, cases without the verdicts, comparison, checklist, criteria, official sources) to `~/.sc4sap/kb/config/<M>/<lang>/`. Later runs — this system again or any other system — mark those activities `"mode": "system"` in their batches: the writer adds only impact, cautions and one verdict per case, with no web research, and the reviewer checks only that part. On MM this cuts a batch to a fraction of the first-run cost.

**Step 5 — Build.**
```
node scripts/config/build-config-doc.mjs --module <M> [--lang <lang>] [--import <edited.html>]
```
Output: `<artifactBase>/config-docs/<M>/<M>-config-v<n>-<lang>.html` (`status` counts, checks with findings and `edited` notes in the JSON line). When the user hands back a page saved from edit mode, build with `--import <file>`: its edits merge into `notes/edits.json` (per activity or view the newer edit wins; a page from another system or module is refused) and every later build keeps them — edited views replace their values, card title and history and are drawn again. Edits never enter the knowledge base.

**Step 6 — Close.** Report in the user's language:
- the file path, IMG activities by status (customized / standard / not set / no values / not readable),
- the check findings by severity, error ones by title,
- tables that could not be read, and why (blocklist, dispatcher),
- one line: the document holds the system's real configuration values — share it internally only.

Do not paste table contents into chat.
</Workflow>

<Document_Contents>
Per IMG activity: IMG path, title (document language + English), status badge, T-codes, consultant notes with their review state, objects (view / view cluster / table), row and customer-row counts; for each view an SM30 overview drawn with the first rows (customer rows first) and, for wide views, a detail screen of one row; the full value table (key columns bold, fixed-value texts next to codes, customer rows highlighted with their transports, filter and "customer rows only"); the customer transports that touched the table (date, request, user, description); checks for the activity; SAP's IMG documentation. Overview: counts by status, areas with status bars, recent customer transports. Right panel: all check findings, click to jump.

Edit mode ("Edit" in the top bar, nothing installed): the consultant notes and the reference panel become editable plain text — add or delete list items, add notes to an activity without them, delete a source — and so do the views: card title, value-table cells (rows added or deleted) and the change-history rows. Edited notes and views carry an "Edited · author · date" badge, so readers see where the page differs from the system; an edited view's SM30 drawing is drawn again from the edited rows at the next `--import` build. Any drawing (overview or detail) can be replaced by a real screenshot — "Use screenshot", or click the drawing and Ctrl+V; "Original screen" brings the drawing back; captures wider than 1800 px are scaled down. Undo (Ctrl+Z / button), autosave to the browser with "continue editing" on reopen. "Save" asks for author and change note and downloads the page with every edit embedded (`<script id="config-edits">`) — the file to hand back for `--import`.
</Document_Contents>

<Checks>
Built-in: activities whose values could not be read. Module rules: `configs/<M>/config-checks.json` — `reads` (extra tables the rules need) and `rules` of type `exists` (every row of A has its counterpart in B), `assigned` (every row of A is used by B) and `custom-keys` (customer name-space entries). Add a rule there instead of hard-coding checks; each rule names its tables, so it attaches itself to the IMG activities that maintain them.
</Checks>

<Files>
- `scripts/config/extract-config.mjs` — IMG walk, values, transports, docs → `config-docs/<M>/snapshot.json`
- `scripts/config/sap-reader.mjs` — MCP client, SELECT * reads, IN-list chunking, read cache
- `scripts/config/itf.mjs` — SAP documentation (ITF) → blocks
- `scripts/config/notes.mjs` — note and term batches, marker-text parsing, merge of drafts / reviews / revisions, knowledge base (`kb`), source-cache seeding (`sources`)
- `scripts/config/notes-sources.mjs` — verified-source cache `~/.sc4sap/kb/config/<M>/sources-<lang>.json` (status, record, hints)
- `scripts/config/notes-lint.mjs` — mechanical batch checks before review; t-code cache `~/.sc4sap/kb/tcodes/<system>.json`
- `scripts/config/config-checks.mjs` — rule engine
- `scripts/config/build-config-doc.mjs` + `config-doc-page.mjs` — model, screen drawings, page, `--import` of edits
- `scripts/config/config-doc-editor.mjs` — edit mode (styles, client script, labels)
</Files>
