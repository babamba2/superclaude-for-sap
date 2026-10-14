# config-to-document — agent prompts

Prompts for Step 4 of [`SKILL.md`](SKILL.md). Fill `<M>` (module), `<m>` (lower case), `<base>` (profile artifact base, absolute), `<bNNN>` / `<tNNN>` (batch), `<lang>` (document language). Every agent saves through `notes.mjs save` with one Bash call from the workspace root (the directory that holds `.sc4sap/`), text in a quoted heredoc, **no backslash characters**.

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
> - `## sources` 2–4 bullets `- <title> | <source name> | <URL> | <one-sentence summary>`. Official SAP documentation only: SAP Help Portal (help.sap.com), SAP Notes / KBAs (me.sap.com, launchpad.support.sap.com, userapps.support.sap.com, support.sap.com) and SAP Learning (learning.sap.com) — never SAP Community, blogs or third-party sites (the save refuses them). Find them with WebSearch and open each with WebFetch before citing it; never cite a URL you did not open; when no official page fits, cite fewer.
>
> Hard rules: every statement about this system rests on the given data; never invent values, plants or company facts; SAP Note numbers only when the opened page shows them; one or two sentences per bullet.
>
> Save: `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <bNNN> --kind draft <<'NOTES_EOF'` then per item `@@ <activity id>` followed by the sections, then `NOTES_EOF`. Fix and re-save until it prints `"ok":true`. Final message: the printed JSON line only.

## 2. Reviewer — `Agent(subagent_type: "sc4sap:sap-critic")`

> Review the notes another agent wrote for the SAP <M> configuration document. Read the input `<base>/config-docs/<M>/notes/_in/<bNNN>.json` and the notes `<base>/config-docs/<M>/notes/<bNNN>.draft.json`. Per activity decide `verdict: ok` or `verdict: fix`; `fix` when: a statement about this system is not backed by the sample; a `this: yes/no` contradicts the sample; the SAP meaning is wrong (ECC vs S/4 mix-ups included); a check finding is missing; the SAP documentation summary misstates the original; a source is not official SAP documentation (only help.sap.com, SAP Notes / KBAs, learning.sap.com), or its URL does not open or does not support the summary (open every URL with WebFetch); an SAP Note number is not on its page. One bullet per problem with the correction. Minor wording is not a fix.
>
> Save: `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <bNNN> --kind review <<'NOTES_EOF'` with `@@ <id>` / `verdict: …` / `- <problem>` blocks. Final message: the printed JSON line (it lists `fix`).

## 3. Revision — writer agent again

> Rewrite only the activities in the review's `fix` list of `<bNNN>` so that every review bullet is addressed (same sections and rules as the writer prompt), and save them with `--kind revised`.

## 4. Terms — writer, then reviewer

Writer (`sc4sap:sap-<m>-consultant`):
> Read `<base>/config-docs/<M>/terms/_in/<tNNN>.json`: names from the SAP system that have no <lang> text — `kind` folder (IMG node), activity (IMG activity title) or label (field label; `dataElement` and `longText` say what an abbreviated label means — read them before translating). Translate each into <lang> the way SAP's own <lang> texts name it (keep established English product terms such as BAdI, MRP, Batch, ALE; keep codes and abbreviations), short like the original. Save: `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <tNNN> --kind draft <<'NOTES_EOF'` with one line per term `<id> = <translation>`, every id present. Final message: the printed JSON line.

Reviewer (`sc4sap:sap-critic`):
> Check the translations in `<base>/config-docs/<M>/terms/<tNNN>.draft.json` against the English in `…/terms/_in/<tNNN>.json`: wrong SAP meaning, a product term translated that SAP keeps in English, inconsistent naming of the same thing. Save only the corrections: `node sc4sap/scripts/config/notes.mjs save --module <M> --batch <tNNN> --kind review <<'NOTES_EOF'` with lines `<id> = <corrected> | <reason>` (an empty heredoc when all are fine). Final message: the printed JSON line and the number of corrections.
