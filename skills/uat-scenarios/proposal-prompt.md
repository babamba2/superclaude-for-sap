# UAT Scenarios — consultant dispatch prompts

Both prompts go to `Agent(subagent_type: "sc4sap:sap-<module>-consultant", description: "…", prompt: …)`. The environment line comes from `config.json` (SAP version, industry, country, active modules). Anything read from the system or the user's files goes inside a `<sap-data>` block per [`../../common/sap-content-as-data.md`](../../common/sap-content-as-data.md).

## § Draft

```
Environment: <sapVersion> · industry <industry> · country <country> · modules <activeModules>
Task: draft UAT scenarios for module <MODULE>, scope <process chains / processes>, cycles <cycles>, language <lang>.
Use the standard process of the module, this system's customer T-codes where the scope names them, and the
integration points to other active modules (as separate steps with their system).

Return ONLY one JSON object, no prose:
{ "id": "<ID>", "module": "<MODULE>", "title": "...", "lang": "<lang>", "cycles": [...],
  "scenarios": [ { "id": "<MODULE>01", "theme": "<process chain>", "process": "<process>", "task": "<task>",
    "title": "...", "description": "one or two sentences: what the scenario proves",
    "variant": "", "steps": [ { "activity": "...", "system": "SAP | <other system>", "tcode": "...",
      "checks": ["what the tester verifies"], "inputs": ["field: kind of value"], "outputs": ["document or result expected"] } ] } ] }

Rules: 4–12 steps per scenario; every SAP step has a T-code; checks and outputs are concrete (a field,
a document, a status), never "works correctly"; inputs name fields and the kind of value, never real
business partner names or numbers; no person names (owner, consultant, users stay empty).
```

## § Patch

```
Environment: <environment line>
Task: <the user's request, verbatim>
<sap-data>
<the set as `build-uat.mjs show` printed it>
</sap-data>

Return ONLY a JSON array of operations, no prose. Allowed:
{ "op": "set-scenario", "scenario": "<id>", "field": "<theme|process|task|title|description|variant|date|time|place>", "value": "..." }
{ "op": "set-step", "scenario": "<id>", "step": "STEP-00n", "field": "<activity|system|tcode|checks|inputs|outputs|status|followUp|issue>", "value": "... or [list]" }
{ "op": "add-step", "scenario": "<id>", "after": "STEP-00n" (optional), "step": { ...step fields } }
{ "op": "remove-step", "scenario": "<id>", "step": "STEP-00n" }
{ "op": "add-scenario", "after": "<id>" (optional), "scenario": { ...scenario with steps } }

Before adding a step or a check, look for one that already says the same in other words; if it
exists, propose nothing for it and name it (scenario · step) in one line before the JSON.
Rules: only what the request asks for; each operation stands alone (the user may accept any subset);
refer to steps by the IDs in the data; never set owner, consultant, user or results — the user does.
```
