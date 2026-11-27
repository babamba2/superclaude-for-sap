# CBO Graph Lookup

The reference graphs that `/sc4sap:stock-cbo` (and `/sc4sap:cbo-relation-map` collection) leave on disk are the plugin's knowledge of how the customer objects hang together: who calls, submits or starts what, which program creates / reads / updates / deletes which table and field, which TCodes and jobs reach a program, what a change affects — each relation with the source line or DDIC row behind it. Skills ask them through one script instead of opening the files.

Why it matters: on ECC, `GetWhereUsed` returns 404 — the graph is the only where-used there. On S/4 it is still faster and cheaper than live calls, and it knows table writes, which where-used does not.

## When

- Before `GetWhereUsed`, and before reading several sources just to find callers or writers.
- When an answer needs: the callers of a customer object, the TCodes / jobs that reach it, the programs that change or read a table (or one field), or what a change would affect.
- Not for standard SAP objects as the subject (the graph holds customer objects; a standard table appears only with its customer readers and writers).

## How

`<CBO_BASE>` = the active profile's `cbo` folder: `<project>/.sc4sap/work/<activeAlias>/cbo` (legacy layout: `<project>/.sc4sap/cbo`). Only the active profile — another profile's graph describes another system ([`multi-profile-artifact-resolution.md`](multi-profile-artifact-resolution.md)). Folder missing → the graph is *not collected*.

```bash
node "<PLUGIN_ROOT>/scripts/graph/cbo-lookup.mjs" --base "<CBO_BASE>" --system "<alias>,<SID>" object <NAME|TYPE:NAME> [<NAME> …] --md
node "<PLUGIN_ROOT>/scripts/graph/cbo-lookup.mjs" --base "<CBO_BASE>" --system "<alias>,<SID>" table <TABLE | TABLE-FIELD> --md
node "<PLUGIN_ROOT>/scripts/graph/cbo-lookup.mjs" --base "<CBO_BASE>" --system "<alias>,<SID>" impact <NAME|TYPE:NAME> --md
```

| Command | Answers |
|---|---|
| `object` | description, usage (direct / indirect / unused / no-evidence), callers, what it calls (customer first), tables it changes (C / U / D ops) and reads, DDIC relations, the TCodes and jobs that reach it |
| `table` | the programs / FMs / classes that change it (with ops) and read it, each with the TCodes and jobs that reach it; `TABLE-FIELD` adds C / R / U / D / F per field from `fields.json` (`(row)` = a whole-row statement) |
| `impact` | the TCodes (with usage), programs and job programs a change reaches (reverse reach: first step over any relation, then code relations, ≤ 6 steps — the relation map's rule) |

- A bare name means the code object before its TCode (`ZSDR0010` → the program, not the TCode of the same name); give `TRAN:ZSDR0010` for the TCode.
- Several names in one call share one load of the graphs — batch them.
- Every stocked graph under `<CBO_BASE>` is searched (whole-package and used-TCode graphs, all modules). The best graph (the object's own package, this system, newest) answers what the object does; callers, writers, readers and impact are merged over every graph of this system that holds it. `also in` names the other graphs.
- `--system` takes the profile alias and the SID (graphs carry either). A graph of another system is marked `other system` and never merged with this one.
- JSON without `--md` (for scripts); `--md` for a prompt. Never `Read` `graph.json` or `fields.json` — they run to megabytes.

## Rules for the answer

1. **Relay the notes.** Each answer ends with `>` notes: built date and `stale` (older than 30 days), `other system`, `DDIC relations only`, and the scope limit. Say them in the answer, in one line.
2. **Not collected ≠ none.** `Searched 0 stocked graph(s)` or *not in any stocked graph* means the object's package was not stocked — never "no callers", "unused" or "safe to change". Offer `/sc4sap:stock-cbo <PACKAGE>`; never collect unasked.
3. **The graph is evidence with a source line, not proof of absence.** Callers from other unstocked packages, RFC, workflow, BAdI / exits called by SAP, dynamic calls (`CALL FUNCTION lv_name`, `SUBMIT (lv)`) and standard code are not in it.
4. **A claim that decides something** (root cause, "only these programs write X", a reuse choice) cites the `unit:line` the graph gives; when the graph is stale or the decision is risky, confirm that one line in the live source before stating it.
5. **ECC:** do not call `GetWhereUsed` (404); the graph answers or the answer says *where-used not available, graph not collected*. **S/4:** `GetWhereUsed` only for what the graph cannot answer (an object not in any stocked graph, or callers outside the stocked packages when they matter).
6. **Sub-agents** that have Bash run the command themselves with the `<CBO_BASE>` and `<PLUGIN_ROOT>` the skill passes; agents without Bash get the `--md` answer pasted into their prompt.

## Consumers

| Skill | Use |
|---|---|
| `/sc4sap:analyze-symptom` | failing customer object → callers, TCodes / jobs that reach it, other writers of the table it changes ([`../skills/analyze-symptom/workflow-steps.md`](../skills/analyze-symptom/workflow-steps.md)) |
| `/sc4sap:create-program` | tables the new program changes / reads → the programs and FMs that already do it, as reuse candidates and consistency checks ([`../skills/create-program/inventory-lookups.md`](../skills/create-program/inventory-lookups.md)) |
| `/sc4sap:cbo-relation-map`, `/sc4sap:transport-readiness` (CAB impact), `/sc4sap:module-to-process` | read the same graphs through their own scripts |

## Limits

- Objects and relations of the stocked packages only; standard tables appear with their customer readers / writers only.
- Code relations come from parsed source (regex statements, not a full parser): see the `confidence: "low"` marks and `scripts/graph/README.md` § edge kinds.
- Fields: SQL statements only; work-area moves are not traced.
- A function module's card adds its function group's global code (TOP, forms): in a group whose forms do the writes (e.g. a generated table maintenance group) every FM shows them.
- A graph without a system tag (older builds) is taken as the active system; the answer says so.
- Usage reflects the ST03N window the graph was built with.
