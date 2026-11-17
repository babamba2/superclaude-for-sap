---
name: cbo-relation-map
description: Draw how the customer objects of one or more CBO packages relate — one self-contained HTML relation map built from the reference graph of /sc4sap:stock-cbo (DDIC typing, check tables, search helps, value tables, row types, view bases, plus includes, calls, submits, transactions, reads and writes from source). Overview with the most connected objects, usage and groups of related objects; a search-driven neighbourhood view drawn like Obsidian's graph (relation presets, filters by kind / type / basis / usage / package); impact of a change up to the TCodes; shortest paths; a table CRUD tab; a Fields tab (who creates / reads / updates / deletes each table field, incl. customer appends of standard tables, and the TCodes and jobs that reach the writers); source lines behind every relation; PNG / CSV export. Customer (Z / Y / namespace) objects only. Collects the graph itself when it is missing (whole package or used TCodes only; eco = map-only collection).
model: inherit
---

# SC4SAP CBO Relation Map

> **Offline profile** ([`common/offline-mode.md`](../../common/offline-mode.md)): full — only from an existing `graph.json`; collection is blocked.

One **HTML page per package (or set of packages)** that shows how the customer objects hang together: which tables use which data elements and domains, which tables check against which, which programs and function modules read or write which tables, which transactions start what — and what is affected when one of them changes. Drawn from the `graph.json` of `/sc4sap:stock-cbo`; the page itself needs no SAP call.

<Purpose>
Before a change, a conversion or an AMS takeover the first question is "what is connected to this?". The graph exists after an inventory run, but as JSON. This page makes it browsable: start from the most connected objects, a group or a table, centre on any object, follow its relations, see what a change reaches up to the TCodes, ask how two objects are connected — with the DDIC row or source line behind every relation.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Use_When>
- "관계도", "객체 관계도", "DDIC 관계도", "CBO 관계", "패키지 관계도", "연관 관계", "영향도", "영향 분석 그림", "테이블 CRUD", "relation map", "dependency graph", "impact of changing", "what is connected to"
- After `/sc4sap:stock-cbo` on a package, or to compare / combine several packages
</Use_When>

<Do_Not_Use_When>
- Only a list of reusable objects → `/sc4sap:stock-cbo`
- Business process view → `/sc4sap:module-to-process`
- One program's internals → `/sc4sap:program-to-spec`; code quality → `/sc4sap:analyze-code`
</Do_Not_Use_When>

<Decisions_Fixed>
Settled with the user (2026-11-06) — do not ask again:

| Topic | Decision |
|---|---|
| Input | The `graph.json` of `/sc4sap:stock-cbo` (Step G), plus its side files when present: `walk.json` / `inventory.json` (descriptions), `usage-result.json` (used / unused), `ddic-reads.json` (standard check tables, object short texts), `ddic-texts.json` (short texts of a text refresh), `fields.json` (field-level CRUD, written by `build-package-graph` when DD03L was read). Missing graph → collect it per [`collect.md`](collect.md); a graph without short texts → text refresh, [`collect.md`](collect.md) § C |
| Descriptions | The SAP short text (SE11 / SE38 / SE93 / SE37 / SE80 description; English first, else the logon language) wins over the inventory text. Placeholders (`-`, `No DDIC description available`) are dropped; a TCode whose text only names its program takes that program's description. Every related object in the side panel shows its description |
| Collection | Scope **whole package** or **used TCodes only** (productive ST03N). Standard = full `/sc4sap:stock-cbo`; eco = map-only collection (Haiku walk + Step G, no scouts, no finalize) |
| Objects | Customer objects only: in-package members and Z / Y / namespace objects outside the package. Standard and dynamic targets and their relations are never drawn; standard includes inside a Z function group (`LSVIM*`, …) neither. Standard **check tables** appear only as text in the side panel |
| Includes | Folded into their program / function group by default (relations move to the owner, evidence keeps the include and line); `--includes keep` draws them |
| Hubs | Ranked by business relations (everything except field typing); typing hubs are a separate list |
| First screen | Overview → click or search → neighbourhood view (presets Business / All DDIC / Code only / All, depth 1–3, direction, node cap) with side panel; impact; paths (any direction / along the arrows, up to 3 alternatives); Groups tab (Louvain, auto-named); Table CRUD tab; Fields tab |
| Basis | Every relation is `stated in DDIC`, `stated in source` or `inferred` (dashed) |
| Several packages | One merged page; colour by type or by package; the same package's whole-package graph and used-TCode graph merge into one |
| Output | One self-contained HTML page per language — no library, no network, light / dark theme. Korean page plus English companion. Rebuilt on every run, no versions. Never published: it holds the customer's object names |
</Decisions_Fixed>

<Paths>
`<AB>` = the active profile's artifact base ([`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). `<DIR>` = `<AB>/cbo/<MODULE>/<PACKAGE>` (whole package, the inventory folder), `<UDIR>` = `<AB>/cbo/<MODULE>/<PACKAGE>.used` (used TCodes only). One package → `<DIR or UDIR>/<PACKAGE>-relation-map-<lang>.html`; several → `<AB>/cbo/<MODULE>/_relmap/<A+B+…>-relation-map-<lang>.html`.
Tool: `node "<PLUGIN_ROOT>/scripts/relmap/build-relation-map.mjs" find --base <dir> … --packages <list>` and `… --dir <dir> [--dir <dir2> …] --lang ko|en|ja [--snippets [--src <dir> …]] [--includes keep] [--sid <SID>] [--max-bytes <n>] [--out <file>]` — both offline; the header of that file lists every option.
</Paths>

<Workflow>
**Step 0 — Intake.** From ARGUMENTS, plain words or one `Label: value` line each (web form):
- `Packages: ZMM*, ZSD_CBO` — names or prefixes ending in `*` or `%` (`ZMM%` = `ZMM*`; write `%` on the command line where `*` is refused), comma-separated (required; ask once if none)
- `Scope: Use existing graph | Collect whole package | Collect used TCodes only` — default *Use existing graph*: never collect unasked. The two Collect values go to [`collect.md`](collect.md) § A / § B for those packages (reads SAP)
- `Source lines: Yes | No` → `--snippets` (default Yes)
- `Language: Korean | English | Japanese` → `--lang ko | en | ja` (default: the profile language; Korean page + English companion when nothing is named)
- Paths a hosted run gives (knowledge base, source folders, output file, `--max-bytes`) are used as given.

**Step 1 — Find the graphs** (offline, one call; `--base` repeats — the profile's `<AB>/cbo`, plus any knowledge-base or run folder named):

```bash
node "<PLUGIN_ROOT>/scripts/relmap/build-relation-map.mjs" find --base "<AB>/cbo" [--base "<dir2>" …] --packages "<list>"
```

It prints `{ ok, graphs[{ package, packages, module, scope, dir, builtAt, parsed, kinds, hasFields, moduleWide, notes }], missing, ambiguous, dirs }`. `dirs` is the `--dir` list for Step 3 (per package its whole-package graph and its used-TCode graph; a module-wide used graph only for a package with no graph of its own).
- `missing` → Scope *Use existing graph*: stop and name the packages (offer the Collect scopes); a Collect scope → [`collect.md`](collect.md), then run `find` again.
- `ambiguous` (same package under two modules, or two equal folders) → ask which `dir`; a hosted run stops and names them.
- A refresh asked for, or used TCodes only wanted and no used graph → [`collect.md`](collect.md).

**Step 2 — Notes.** Relay each graph's `notes` in one line (notes, not stops): *DDIC relations only*; *no fields.json* with `ddic-reads.json` present → rerun G5 of [`../stock-cbo/graph-usage.md`](../stock-cbo/graph-usage.md) first (seconds, no SAP call) so the Fields tab has data; *typing only* → the inventory predates the DDIC relation reads (G3); *older than 30 days* → may be out of date, offer [`collect.md`](collect.md). Never read `graph.json` into context.

**Step 3 — Build** (one Bash call per language — only the named one when a language is given; all folders in one call; `--snippets` when any graph has `parsed` > 0, unless `Source lines: No`):

```bash
node "<PLUGIN_ROOT>/scripts/relmap/build-relation-map.mjs" --dir "<dir1>" [--dir "<dir2>" …] --lang ko --snippets
node "<PLUGIN_ROOT>/scripts/relmap/build-relation-map.mjs" --dir "<dir1>" [--dir "<dir2>" …] --lang en --snippets
```

Use `--dir` once per entry of `dirs`. Add `--sid <SID>` (the profile's system) and, in a hosted run, `--src <dir>` per source folder, `--max-bytes <n>` and `--out <file>` as given. Each prints `{ page, bytes, nodes, edges, members, custom, groups, isolated, droppedEdges, foldedIncludes, byBasis, usage, stdChecks, snippets, sourcesParsed, packages[, reason] }`. Exit 2 = graph missing or no customer object → show the stderr line and stop. `reason: "size"` → the page was rebuilt without source snippets to fit `--max-bytes`; say so. Exit 3 = still over `--max-bytes` without snippets, nothing written → stop and suggest fewer packages. Without `--max-bytes`: `bytes` over 15 MB → rebuild without `--snippets` and say so. Do not open the HTML into context.

**Step 4 — Report** in the Output_Format. Offer to open the page in the browser.
</Workflow>

<Output_Format>
```
Relation map <PACKAGES> · <SID> · <ECC|S4>
Objects <nodes> (in package <members> · Z/Y outside <custom>) · relations <edges> · groups <groups> · unconnected <isolated>
Basis: DDIC <n> · source <n> · inferred <n> — standard / dynamic relations left out <droppedEdges> · includes folded <foldedIncludes>
Usage: used <direct>+<indirect> · unused <unused> · no evidence <n>          (only when usage exists)
<notes from Step 2, if any>
Page: <path>-ko.html (+ -en.html) · <MB> MB · source snippets <n>
```
</Output_Format>

<Page_Guide>
What to tell a user who asks how to read the page:
- **Overview** — counts per type and relation kind, basis, usage; the most connected objects by business relations (typing hubs below, folded). Click a name to centre on it.
- **Explore** — search a name or a description (2+ characters). Presets: Business (all but typing) / All DDIC / Code only / All; filters by relation kind, object type, basis, usage, package — each group with Select all / Clear all, each option with a small [?] that explains it on hover or focus. Drawn like Obsidian's graph view: nodes sized by links, hover lights the neighbours and runs the direction, names fade in as you zoom (centre, lit and 15 most connected always named; overlapping names skipped). Wheel or + / − zooms, drag the ground to pan, drag a node to move it, double click to fit. Greyed = unused. **Click a node** → a detail card next to it (description, package, group, usage, relation counts per kind, impact count) with the button *Show its graph*. Every move to another object, group, path or impact view is a browser history entry: **← Back** at the top left of the drawing (and the browser's back / forward) returns to the earlier view; Esc, a click on the ground, a pan or a zoom closes it.
- **Side panel** — description, package, group, usage, includes inside (the includes folded into this program or function group), standard check tables (text), **impact** (TCodes and programs affected by a change — "Draw it" shows them), every relation with its evidence; a ▸ before a source line opens ±10 lines of source.
- **Path** — a second object next to "Path to": shortest chain (any direction or along the arrows), up to 3 alternatives. The address keeps `#n=TYPE:NAME&to=TYPE:NAME` for sharing.
- **Groups** — Louvain communities, named from shared name prefix and main TCode / program description.
- **Table CRUD** — per table, which objects create / read / update / delete it (C R U D), most writers first; searchable.
- **Fields** — per table field (and per customer structure through the tables that include it): C / R / U / D / F (condition) by object, from SQL statements only — `UPDATE SET f` changes that field, writes from a work area count as "whole row"; source line and snippet per reference; for writers the TCodes and jobs that reach them; "never read" / "never written" flags; CSV per table. Search `TABLE-FIELD` jumps straight to a field. Needs `fields.json` (a graph built before it → rebuild with G5, seconds, no SAP call; appends need G6).
- **Export** — PNG of the drawing, CSV of the drawn relations.
</Page_Guide>

<MCP_Tools_Used>
None for the page. Collection ([`collect.md`](collect.md)) uses the tools of `/sc4sap:stock-cbo` Step G and `/sc4sap:module-to-process` Step 2 (read-only).
</MCP_Tools_Used>

<Related_Skills>
- `/sc4sap:stock-cbo` — builds the whole-package `graph.json` and inventory
- `/sc4sap:module-to-process` — the used-TCode graph laid onto business processes
- `/sc4sap:program-to-spec` — one program in depth
</Related_Skills>

Task: $ARGUMENTS
