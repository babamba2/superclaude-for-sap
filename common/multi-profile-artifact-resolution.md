# Multi-Profile Artifact Resolution

When multi-profile mode is active (`<project>/.sc4sap/active-profile.txt` exists), project-local artifacts live under `<project>/.sc4sap/work/<alias>/...` instead of directly under `.sc4sap/`. Skills that read or write artifacts **must** use the resolution rules below to stay correct across profile switches.

## Rules

### Write path — always the active profile

```
<project>/.sc4sap/work/{activeAlias}/<category>/<rest>
```

Categories: `program/`, `cbo/`, `customizations/`, `audit/`, `comparisons/`. Writes NEVER fall back to another profile or to the project root.

Legacy (no active-profile.txt): writes go to `<project>/.sc4sap/<category>/<rest>` exactly as before.

### Read path — current profile first, then fall-through (read-only)

1. Look up `<project>/.sc4sap/work/{activeAlias}/<relative>`.
2. If not found, iterate other profiles in `<project>/.sc4sap/work/*/`. Return the first hit, **annotated** with `ℹ from=<otherAlias> (readonly cross-view)`.
3. Legacy fallback: `<project>/.sc4sap/<relative>`.

Cross-view reads let a QA-active session open a Dev-produced spec without copying it. The annotation is important: the skill must NEVER silently write back to a file it found through cross-view — that would corrupt the source profile. Treat cross-view reads as immutable.

## Skill implementation pattern

Before any `Read` of an artifact path, walk the rules above. Pseudocode:

```
function resolveArtifact(relativePath):
  active = readFile('.sc4sap/active-profile.txt')
  if active:
    primary = '.sc4sap/work/' + active + '/' + relativePath
    if exists(primary): return { path: primary, from: active, crossView: false }
    for alias in listDirs('.sc4sap/work/'):
      if alias == active: continue
      candidate = '.sc4sap/work/' + alias + '/' + relativePath
      if exists(candidate): return { path: candidate, from: alias, crossView: true }
  legacy = '.sc4sap/' + relativePath
  if exists(legacy): return { path: legacy, from: null, crossView: false }
  return null
```

For writes:

```
function writePath(relativePath):
  active = readFile('.sc4sap/active-profile.txt')
  if active: return '.sc4sap/work/' + active + '/' + relativePath
  return '.sc4sap/' + relativePath  // legacy
```

## Affected skills

Skills that read or produce project-local artifacts must adopt this pattern:

- `/sc4sap:create-program` — writes `program/<name>/{platform,interview,spec,plan,report,...}.md`
- `/sc4sap:program-to-spec` — reads existing programs, writes spec.md / spec.xlsx
- `/sc4sap:analyze-code` — writes review report
- `/sc4sap:analyze-cbo-obj` — writes `cbo/<MODULE>/<PACKAGE>/{index,inventory}.md`
- `/sc4sap:compare-programs` — writes `comparisons/*.md`
- `/sc4sap:analyze-symptom` — writes audit reports
- `/sc4sap:create-object` — writes nothing long-term (transient state only)
- Setup / sap-option — manage profile files themselves; outside this pattern

Each affected skill's SKILL.md should explicitly state "uses multi-profile artifact resolution per `common/multi-profile-artifact-resolution.md`" so the LLM picks up the rule at dispatch time.

## Invariants

- **Never** write to `<project>/.sc4sap/` directly when `active-profile.txt` exists — always scope under `work/<alias>/`.
- **Never** write to a cross-view path — cross-view is read-only by definition.
- When surfacing a cross-view read to the user, always show the origin alias. This prevents confusion when QA sees a Dev-authored spec and accidentally edits it with the current-profile context in mind.
- Legacy projects (no active-profile.txt) behave identically to pre-0.6.0 — no breaking change.
