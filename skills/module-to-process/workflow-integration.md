# Workflow — integration map (cross-module)

Referenced by `workflow.md` § Step 1 (5b) and `SKILL.md`. Runs after Step 8 of the module (or alone, when the user asks for "the SD–MM integration map" and both maps exist). Path variables: [`paths-and-state.md`](paths-and-state.md).

**Boundary first.** A module run analyses only its own module. Tables, functions and BAPIs of other modules that its programs reach are recorded as boundary stubs (name, read / write / call, evidence line). They are never fetched. When the other module gets its own map later, the integration step pairs them with that module's tasks — no source is read again.

`<INT_DIR>` = `<ARTIFACT_BASE>/processes/_integration/<M1>-<M2>/_state` (modules in the order the user named them).

## X1 — Touchpoints (main thread, deterministic)

```
node "<PLUGIN_ROOT>/scripts/process/cross-module.mjs" --module <M1>=<M1 STATE_DIR>,<M1 SCOPE_DIR>/graph.json --module <M2>=<M2 STATE_DIR>,<M2 SCOPE_DIR>/graph.json --out "<INT_DIR>"
```

For every L4 it walks from the entry programs through customer code (include / call / submit / start) and collects the tables read or written and the functions called. Ownership: customer prefix `Z<M>` / `Y<M>`, else `configs/<M>/tables.md` / `bapi.md`. A touchpoint is paired with the other module's L4s that touch the same object the other way (writer ↔ reader); a write to a widely read table pairs only with the other side's writers; a call pairs with the owner's tasks that call the same function. Master data many tasks read and functions many tasks call that change no data (no table write, no posting / create / change function within three calls, the function group included) are summarised as hubs. Objects of modules without a map stay boundary stubs. Relay its one-line summary.

Missing map of a module named for the integration → stop and say which module must be mapped first.

## X2 — E2E scenarios (one Opus `sap-analyst`)

Write `<INT_DIR>/digest.md` (task pairs with labels, objects and analyst notes; unpaired touchpoints; L2 / L3 of both maps) with a short node script, then `<INT_DIR>/scenario-brief.md` from this template and dispatch `▶ phase=X2.scenarios · agent=sap-analyst · model=Opus`:

- Read `digest.md` first, the two `process-model.json` (filtered), `integration-touchpoints.json` for evidence, sources only to settle a doubt.
- Write 6–12 E2E scenarios crossing the modules as this system runs them: 3–10 steps in business order, each an existing L4 of either module, `via` = the object handed to the next step, `note` = one sentence; inferred → "(estimated)". Per scenario 0–4 S/4HANA notes for the boundary. Plus `pair_notes` for the 15–30 most important task pairs and `open_questions`.
- Output `<INT_DIR>/integration-scenarios.json` `{ schema, modules, scenarios: [{ id, title, desc, steps: [{ module, code, via?, note }], conversion: [] }], pair_notes: [{ a, b, desc }], open_questions: [] }`; check every (module, code) exists.

## X3 — Page

```
node "<PLUGIN_ROOT>/scripts/process/build-integration-doc.mjs" "<INT_DIR>" --lang <lang>
```

One HTML page `<M1>-<M2>-integration-v<ver>-<lang>.html` next to `<INT_DIR>`: overview (touchpoints per direction, paired, task pairs, hubs), E2E scenario swimlanes (lanes = modules, boxes link to the task anchor of the latest module page), touchpoint matrix (L4 of M1 × L2 of M2), touchpoint list per object with evidence, shared master data and utilities, boundary stubs per module without a map. English companion: translate `integration-scenarios.json` texts into `integration-scenarios.en.json` (same shape) with the Step 8b brief, then `--lang en` (task labels come from the modules' English models).

## Notes

- Re-run X1 → X3 after either module map gets a new version; X2 only when the pairs changed a lot (the summary counts tell).
- The integration page is read-only (no edit mode); corrections go into the module maps or `integration-scenarios.json`.

## X4 — Module pages

Every module page shows the integration maps that name its module, read-only (`integration-view.mjs`, loaded by `build-process-doc.mjs` from `processes/_integration/*`): a section "Cross-module E2E scenarios" (its own steps in full colour, the other module's greyed, with where each step runs) and, on each task sheet, "Cross-module links" (the steps before / after it and the key pair notes). After X3, rebuild the module pages as a new minor version, then once more with `--same-version` so every page links to the others' latest versions, then the integration pages with `--same-version`.
