---
name: cbo-relation-map
description: Draw how the customer objects of one or more CBO packages relate — one self-contained HTML relation map built from the reference graph of /sc4sap:analyze-cbo-obj (DDIC typing, check tables, search helps, value tables, row types, view bases, plus includes, calls, submits, transactions, reads and writes from source). Overview with the most connected objects, usage and groups of related objects; a search-driven neighbourhood view drawn like Obsidian's graph (relation presets, filters by kind / type / basis / usage / package); impact of a change up to the TCodes; shortest paths; a table CRUD tab; source lines behind every relation; PNG / CSV export. Customer (Z / Y / namespace) objects only. Collects the graph itself when it is missing (whole package or used TCodes only; eco = map-only collection).
model: inherit
---

# SC4SAP CBO Relation Map

One **HTML page per package (or set of packages)** that shows how the customer objects hang together: which tables use which data elements and domains, which tables check against which, which programs and function modules read or write which tables, which transactions start what — and what is affected when one of them changes. Drawn from the `graph.json` of `/sc4sap:analyze-cbo-obj`; the page itself needs no SAP call.

<Purpose>
Before a change, a conversion or an AMS takeover the first question is "what is connected to this?". The graph exists after an inventory run, but as JSON. This page makes it browsable: start from the most connected objects, a group or a table, centre on any object, follow its relations, see what a change reaches up to the TCodes, ask how two objects are connected — with the DDIC row or source line behind every relation.
</Purpose>

<Response_Prefix>Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.</Response_Prefix>

<Use_When>
- "관계도", "객체 관계도", "DDIC 관계도", "CBO 관계", "패키지 관계도", "연관 관계", "영향도", "영향 분석 그림", "테이블 CRUD", "relation map", "dependency graph", "impact of changing", "what is connected to"
- After `/sc4sap:analyze-cbo-obj` on a package, or to compare / combine several packages
</Use_When>

<Do_Not_Use_When>
- Only a list of reusable objects → `/sc4sap:analyze-cbo-obj`
- Business process view → `/sc4sap:module-to-process`
- One program's internals → `/sc4sap:program-to-spec`; code quality → `/sc4sap:analyze-code`
</Do_Not_Use_When>

<Decisions_Fixed>
Settled with the user (2026-11-06) — do not ask again:

| Topic | Decision |
|---|---|
| Input | The `graph.json` of `/sc4sap:analyze-cbo-obj` (Step G), plus its side files when present: `walk.json` / `inventory.json` (descriptions), `usage-result.json` (used / unused), `ddic-reads.json` (standard check tables). Missing graph → collect it per [`collect.md`](collect.md) |
| Collection | Scope **whole package** or **used TCodes only** (productive ST03N). Standard = full `/sc4sap:analyze-cbo-obj`; eco = map-only collection (Haiku walk + Step G, no scouts, no finalize) |
| Objects | Customer objects only: in-package members and Z / Y / namespace objects outside the package. Standard and dynamic targets and their relations are never drawn; standard includes inside a Z function group (`LSVIM*`, …) neither. Standard **check tables** appear only as text in the side panel |
| Includes | Folded into their program / function group by default (relations move to the owner, evidence keeps the include and line); `--includes keep` draws them |
| Hubs | Ranked by business relations (everything except field typing); typing hubs are a separate list |
| First screen | Overview → click or search → neighbourhood view (presets Business / All DDIC / Code only / All, depth 1–3, direction, node cap) with side panel; impact; paths (any direction / along the arrows, up to 3 alternatives); Groups tab (Louvain, auto-named); Table CRUD tab |
| Basis | Every relation is `stated in DDIC`, `stated in source` or `inferred` (dashed) |
| Several packages | One merged page; colour by type or by package; the same package's whole-package graph and used-TCode graph merge into one |
| Output | One self-contained HTML page per language — no library, no network, light / dark theme. Korean page plus English companion. Rebuilt on every run, no versions. Never published: it holds the customer's object names |
</Decisions_Fixed>

<Paths>
`<AB>` = the active profile's artifact base ([`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)). `<DIR>` = `<AB>/cbo/<MODULE>/<PACKAGE>` (whole package, the inventory folder), `<UDIR>` = `<AB>/cbo/<MODULE>/<PACKAGE>.used` (used TCodes only). One package → `<DIR or UDIR>/<PACKAGE>-relation-map-<lang>.html`; several → `<AB>/cbo/<MODULE>/_relmap/<A+B+…>-relation-map-<lang>.html`.
Tool: `node "<PLUGIN_ROOT>/scripts/relmap/build-relation-map.mjs" --dir <dir> [--dir <dir2> …] --lang ko|en [--snippets] [--includes keep] [--out <file>]` — the header of that file lists every option.
</Paths>

<Workflow>
**Step 1 — Find the graphs.** Packages from the request (ask once if none). For each, Glob `<AB>/cbo/*/<PACKAGE>/graph.json` and `<AB>/cbo/*/<PACKAGE>.used/graph.json` on the active profile only.
- Found → those folders are the inputs (both, when both exist).
- Same package under two modules → ask which one.
- None, a refresh asked for, or the user wants used TCodes only → [`collect.md`](collect.md), then continue here.

**Step 2 — Check what each graph holds** (main thread, one Bash call per graph; never read `graph.json` into context):

```bash
node -e "const g=require(process.argv[1]);const c={};for(const e of g.edges)c[e.kind]=(c[e.kind]||0)+1;console.log(JSON.stringify({builtAt:g.builtAt,sapVersion:g.sapVersion,parsed:g.coverage?.parsed??0,kinds:c}))" "<dir>/graph.json"
```

One line each, only when true (notes, not stops): `parsed` = 0 → DDIC relations only (no code relations, no CRUD tab); no `checks` / `searchHelp` / `rowType` / `basedOn` / `valueTable` → the inventory predates the DDIC relation reads (G3), typing only; `builtAt` older than 30 days → may be out of date — offer [`collect.md`](collect.md).

**Step 3 — Build** (one Bash call per language, all folders in one call; `--snippets` when any graph has `parsed` > 0):

```bash
node "<PLUGIN_ROOT>/scripts/relmap/build-relation-map.mjs" --dir "<dir1>" [--dir "<dir2>" …] --lang ko --snippets
node "<PLUGIN_ROOT>/scripts/relmap/build-relation-map.mjs" --dir "<dir1>" [--dir "<dir2>" …] --lang en --snippets
```

Each prints `{ page, bytes, nodes, edges, members, custom, groups, isolated, droppedEdges, foldedIncludes, byBasis, usage, stdChecks, snippets, sourcesParsed, packages }`. Exit 2 = graph missing or no customer object → show the stderr line and stop. Do not open the HTML into context. `bytes` over 15 MB → rebuild without `--snippets` and say so.

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
- **Export** — PNG of the drawing, CSV of the drawn relations.
</Page_Guide>

<MCP_Tools_Used>
None for the page. Collection ([`collect.md`](collect.md)) uses the tools of `/sc4sap:analyze-cbo-obj` Step G and `/sc4sap:module-to-process` Step 2 (read-only).
</MCP_Tools_Used>

<Related_Skills>
- `/sc4sap:analyze-cbo-obj` — builds the whole-package `graph.json` and inventory
- `/sc4sap:module-to-process` — the used-TCode graph laid onto business processes
- `/sc4sap:program-to-spec` — one program in depth
</Related_Skills>

Task: $ARGUMENTS
