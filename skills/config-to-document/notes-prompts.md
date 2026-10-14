# config-to-document — agent prompts

Prompts for Step 4 of [`SKILL.md`](SKILL.md). Fill `<M>` (module), `<m>` (lower case), `<base>` (profile artifact base, absolute), `<bNNN>` / `<tNNN>` (batch), `<lang>` (document language). Every agent saves through `notes.mjs save` from the workspace root (the directory that holds `.sc4sap/`), **no backslash characters** in the text.

**How to save (all prompts):** a whole batch in one heredoc exceeds the Windows command-line limit (`ENAMETOOLONG`). Build the marker text in a file, one or two activities per Bash call — the first call `cat > <file> <<'NOTES_EOF'`, later calls `cat >> <file> <<'NOTES_EOF'` — then save with `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <batch> --kind <kind> --file <file>`. Use a sub-folder of your scratchpad named after the batch and your role (e.g. `b007-writer/b007.draft.txt`) — other agents share the scratchpad, so never write helper files at its top level. Short texts (a review, a few terms) may still go in one heredoc piped to `save` without `--file`.

## 1. Writer — `Agent(subagent_type: "sc4sap:sap-<m>-consultant")`

> You write the consultant notes and the reference material of a configuration document for the SAP <M> module of a real system. Read `<base>/config-docs/<M>/notes/_in/<bNNN>.json`: per IMG activity the IMG path, titles, objects (columns, row counts, customer-changed rows, up to 15 sample rows — customer rows first, codes with their fixed-value text in parentheses), check findings and SAP's IMG documentation (`sapDoc`, English).
>
> For EVERY item write, in <lang> (SAP product terms such as Material Block, MRP Area, Plant stay in English):
> - `## purpose` 1–2 sentences: what the setting controls.
> - `## impact` 2–4 bullets: what THIS system's values mean — quote the sample values; describe patterns when rows are many.
> - `## cautions` 1–3 bullets: risks, dependencies, what to check before a change; include every check finding.
> - `## refs` 1–3 bullets: related T-codes, IMG activities, tables.
> - `## sapdoc` 2–5 sentences: the SAP documentation summarised in <lang> (omit when `sapDoc` is empty).
> - `## cases <decision question>` then 2–3 `### case CASE n — <name>` blocks, each with `flow:` 3–5 short steps separated by `>` (prefix `? ` for a decision, `! ` for the end), `desc:` 2–3 sentences, `when:` when it fits, `this: yes — <evidence from the sample>` or `this: no — <evidence>`. The cases are the realistic ways to set this activity up; exactly the cases the sample supports are `yes`.
> - `## mix` one sentence: how companies usually combine the cases.
> - `## compare` a Markdown table: first row `| Aspect | CASE 1 | CASE 2 |`, 3–5 rows (setup effort, operation, risk …).
> - `## checklist` 3–5 bullets: questions to decide the setup.
> - `## criteria` lines `rev:` reversibility, `chain:` linked settings, `pre:` prerequisites, `ind:` industry variance, `risk:` common mistakes, `s4:` S/4HANA / Fiori differences, `auth:` authorisation and organisation, `mig:` migration and interfaces, `rec:` default recommendation — one line each.
> - `## sources` 2–4 bullets `- <title> | <source name> | <URL> | <one-sentence summary>`. Official SAP documentation only: SAP Help Portal (help.sap.com), SAP Notes / KBAs (me.sap.com, launchpad.support.sap.com, userapps.support.sap.com, support.sap.com) and SAP Learning (learning.sap.com) — never SAP Community, blogs or third-party sites (the save refuses them). Find them with WebSearch and open each with WebFetch before citing it; never cite a URL you did not open; when no official page fits, cite fewer. **`knownSources`** on an item lists pages an earlier review already accepted (for this activity or one that maintains the same tables): when one fits, cite it with its `summary` copied unchanged and without opening it — the reviewer skips verified sources; search the web only for what they do not cover.
>
> **Items with `"mode": "system"`** already have their general part (purpose, SAP documentation summary, cases, comparison, checklist, criteria, sources) reviewed in the knowledge base — `kb.purpose` and `kb.cases` show it. For them write ONLY `## impact`, `## cautions` (include check findings) and `## verdicts` with one line per KB case: `CASE n: yes — <evidence from the sample>` or `CASE n: no — <evidence>`. No web research for these items.
>
> Reading the data: a **customer row** only means its key was recorded in a customer transport (changed, copied or merely saved) — not that the customer created it; a key that follows SAP's naming (no Z/Y/9 prefix, part of a standard series) is a standard entry. In `snapshot.json`, `_tr` entries that are not `<SID>K` + 6 letters or digits (e.g. `DEVK900133`, `DEVK9A2OEJ`) — SAP command files such as `P30A_C_SFC`, `/SPE/100_CUST`, `SAPK…` — are SAP delivery records, not customer transports. A sample holds at most 15 rows, customer rows first: a row missing from it, or a table showing exactly 1000 rows (the read cap), is never proof that something does not exist. When the sample cannot settle a point, look it up in the full table in `<base>/config-docs/<M>/snapshot.json` (`tables.<NAME>.rows`) with a small `node -e` filter — never print the whole file — and say "unverified" only when the snapshot cannot settle it either.
>
> Hard rules: every statement about this system rests on the given data; never invent values, plants or company facts; SAP Note numbers only when the opened page shows them; one or two sentences per bullet.
>
> Save as described under "How to save" with `--batch <bNNN> --kind draft`: per item `@@ <activity id>` followed by the sections. Fix and re-save until it prints `"ok":true`. Final message: the printed JSON line, plus any activity whose sample did not let you judge this system.

## 2. Review — lint, then judgment

**2a. Lint (main thread, no agent).** `node scripts/config/notes-lint.mjs --module <M> --batch <bNNN>` → `notes/<bNNN>.lint.json`: per activity source status (`verified` / `changed` / `new`), the transactions it names (IMG activity titles, or TSTC kind / program / SM30 view), count statements against the snapshot (`ok: false` = to check; customer counts use customer transports only) and check findings never mentioned. When it lists `unchecked` tokens, look them up with one `GetTransaction` call (`transaction_names`), save the answer to a scratchpad file, merge it with `--put-tcodes <file>` and lint again.

No Haiku pre-check between lint and reviewer: piloted on b028–b030 (2026-10-15) it cost 130k–170k tokens per batch, did not lower the reviewer's tokens or tool calls, and most of its leads were false alarms the reviewer had to disprove.

**2b. Reviewer — `Agent(subagent_type: "sc4sap:sap-critic")`**
> Review the notes another agent wrote for the SAP <M> configuration document. Read the input `<base>/config-docs/<M>/notes/_in/<bNNN>.json`, the notes `<base>/config-docs/<M>/notes/<bNNN>.draft.json` and the lint `…/notes/<bNNN>.lint.json`; check what the sample cannot settle in the snapshot (`<base>/config-docs/<M>/snapshot.json`, small `node -e` filters — never print the whole file). The lint already compared count statements with the snapshot (counts it marks `ok: false` and counts on truncated tables are leads to confirm) and resolved every named transaction (IMG activity title, TSTC program or SM30 view — check each fits its use in the note): trust those facts and do not recount what it marks `ok: true`. Spend your effort on what the scripts cannot judge: SAP meaning, ECC vs S/4 mix-ups, wrong cases, misleading conclusions, statements about rows outside the sample. Per activity decide `verdict: ok` or `verdict: fix`; `fix` when: a statement about this system is not backed by the data; a `this: yes/no` contradicts the sample; the SAP meaning is wrong; a check finding is missing; the SAP documentation summary misstates the original; a source is not official SAP documentation (only help.sap.com, SAP Notes / KBAs, learning.sap.com), or its URL does not open or does not support the summary; an SAP Note number is not on its page. Open with WebFetch only the sources the lint marks `new` or `changed` — `verified` ones were opened and accepted by an earlier review with the same summary. One bullet per problem with the correction. Minor wording is not a fix. For items with `"mode": "system"` review only `impact`, `cautions` and the `verdicts` against the sample and `kb.cases`; open no URLs for them.
>
> Save: `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <bNNN> --kind review <<'NOTES_EOF'` with `@@ <id>` / `verdict: …` / `- <problem>` blocks. Final message: the printed JSON line (it lists `fix`).

## 3. Revision — writer agent again

> Rewrite only the activities in the review's `fix` list of `<bNNN>` so that every review bullet is addressed (same sections and rules as the writer prompt), and save them with `--kind revised`.

## 4. Terms — writer, then reviewer

Writer (`sc4sap:sap-<m>-consultant`):
> Read `<base>/config-docs/<M>/terms/_in/<tNNN>.json`: names from the SAP system that have no <lang> text — `kind` folder (IMG node), activity (IMG activity title) or label (field label; `dataElement` and `longText` say what an abbreviated label means — read them before translating). Translate each into <lang> the way SAP's own <lang> texts name it (keep established English product terms such as BAdI, MRP, Batch, ALE; keep codes and abbreviations), short like the original. Save: `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <tNNN> --kind draft <<'NOTES_EOF'` with one line per term `<id> = <translation>`, every id present. Final message: the printed JSON line.

Reviewer (`sc4sap:sap-critic` with `model: "sonnet"` — a term check needs no Opus):
> Check the translations in `<base>/config-docs/<M>/terms/<tNNN>.draft.json` against the English in `…/terms/_in/<tNNN>.json`: wrong SAP meaning, a product term translated that SAP keeps in English, inconsistent naming of the same thing. Save only the corrections: `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <tNNN> --kind review <<'NOTES_EOF'` with lines `<id> = <corrected> | <reason>` (an empty heredoc when all are fine). Final message: the printed JSON line and the number of corrections.
