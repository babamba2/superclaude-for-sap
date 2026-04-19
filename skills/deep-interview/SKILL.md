---
name: sc4sap:deep-interview
description: Socratic deep interview to crystallize SAP requirements before autonomous execution
level: 2
---

# SC4SAP Deep Interview

Follows OMC `deep-interview` pattern adapted for SAP. Conducts a structured Socratic interview to crystallize SAP development requirements before any code is written. Prevents wasted execution cycles on underspecified ABAP tasks.

<Purpose>
sc4sap:deep-interview asks targeted questions to resolve ambiguity in SAP requirements. It gates on a mathematical ambiguity threshold: only when requirements are sufficiently specified does it produce a validated spec file and offer to proceed to `/sc4sap:create-program` or `/sc4sap:create-object`.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Use_When>
- Requirement is vague (no object names, package, transport, or system details)
- User says "deep interview", "ask me questions", "help me spec this", or "I'm not sure what I need"
- Task involves complex SAP scenarios (RAP, BAdI, enhancement framework) where wrong assumptions are costly
- User is unfamiliar with SAP object types and needs guidance on the right approach
</Use_When>

<Do_Not_Use_When>
- Requirements are concrete (specific class name, method signature, package) -- proceed directly to `/sc4sap:create-object`
- User wants immediate execution on a full program spec -- use `/sc4sap:create-program`
- Task is a one-line fix -- skip interview entirely
</Do_Not_Use_When>

<SAP_Interview_Dimensions>
The interview covers these dimensions until each is resolved:

**Object scope**: What ABAP objects are needed? (class, interface, program, function module, BAdI implementation, CDS view, RAP business object)

**Package and transport**: Which development package? New transport or existing? Which system landscape (DEV -> QAS -> PRD)?

**Technical pattern**: OO class hierarchy? Procedural? RAP/OData? Enhancement spot/BAdI? Which release (ECC vs S/4HANA)?

**Integration points**: Which SAP modules does this touch? (FI, MM, SD, HCM, etc.) Any BAPIs, RFCs, or IDocs involved?

**Data model**: Which tables are read/written? Custom Z-tables or standard SAP tables? Authorization objects needed?

**Testing requirements**: Unit tests needed? Which test classes? Test data strategy?
</SAP_Interview_Dimensions>

<Ambiguity_Gating>
After each round of questions, score ambiguity 0-10:
- 8+: too vague, continue interview
- 5-7: borderline, ask 1-2 clarifying questions
- Below 5: sufficient, generate spec

Do not proceed to spec generation until score is below 5.
</Ambiguity_Gating>

<Output>
When ambiguity threshold is met:
1. Write validated spec to `.sc4sap/deep-interviews/sap-{timestamp}.md`
2. Spec includes: object list, package, transport strategy, technical pattern, integration points, test requirements
3. Offer: "Spec ready. Proceed with `/sc4sap:create-program` (full program) or `/sc4sap:create-object` (single object)?"
</Output>

Task: {{ARGUMENTS}}
