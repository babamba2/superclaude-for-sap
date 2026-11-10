# Overflow Routing (Gemini / Codex / Grok) — Design (draft)

Status: **design draft, not implemented, ON HOLD** · 2026-10-16

## 1. Goal

Keep sc4sap pipelines running when the user's Claude usage limit gets close, by moving
**text-synthesis work** to an external **overflow provider** the organization already licenses:

| Provider | Client | Licensing assumed |
|---|---|---|
| `gemini` | Gemini CLI (`gemini -p`) | Gemini Enterprise / Code Assist seat license — per-user daily request quota |
| `codex` | Codex CLI (`codex exec`) | ChatGPT Business / Enterprise seat sign-in — plan usage limits |
| `grok` | Grok Build CLI (`grok -p`) | xAI Grok business / enterprise sign-in (OIDC / SSO) — plan usage limits |

For `codex` and `grok`, an API-key sign-in is pay-per-token and is used only when the user opts in (`allowApiKey`).
Each provider must be approved by the organization's own policy; the profile can allow providers individually (§5).

- Claude is the primary model. Providers are **overflow**, not peers.
- Below the threshold nothing changes; routing is identical to `common/model-routing-rule.md`.
- Providers are plug-ins behind one bridge: adding a third one = one adapter file + one options entry.

Non-goals: no provider calls SAP MCP, writes SAP objects, edits files, or makes judgment / severity calls.

## 2. Signal — Claude usage pressure

The HUD already fetches real utilization: `scripts/hud/lib/usage-api.mjs` → `getUsage()`
returns `{ fiveHour, sevenDay, sevenDayOpus, sevenDaySonnet, *ResetsAt }` (0–100, cached 60 s
in `~/.sc4sap/hud-cache/.hud-usage.json`).

`scripts/overflow/pressure.mjs` (reuses `getUsage`, no new endpoint):

```
pressure = max(fiveHour, sevenDay, sevenDay<Model>)   // <Model> = model the dispatch would use
level    = pressure >= hardPct ? "hard" : pressure >= softPct ? "soft" : "normal"
```

| Level | Default | Effect |
|---|---|---|
| `normal` | < 80 % | Claude only (today's behavior) |
| `soft` | ≥ 80 % | Tier G jobs → overflow provider |
| `hard` | ≥ 95 % | Tier G + Tier G+ jobs → overflow provider |

Unknown signal (no token, network error, cache older than 10 min) → `normal`, stated once.
Evaluated **once per dispatch group** (`model-dispatch-mode.md`), so a fan-out never splits.

## 3. What can move — Tier G / Tier G+

A job is eligible only if **all** hold: (1) its input is already gathered into local files,
(2) it needs no tool calls, (3) its text / JSON output is validated by a later step.

| Tier | Jobs | Moves at |
|---|---|---|
| **G** — bulk synthesis | `sap-stocker` purpose inference; config-to-document column descriptions; Phase 8 report; program-to-manual / program-to-spec prose from a fact brief | `soft` |
| **G+** — reading summaries | Large-object pre-brief for analyze-code / compare-programs (the Opus judge stays on Claude) | `hard` |
| **Never** | planner, spec decisions, executor (any Create/Update), qa-tester, debugger, review judge / severity, consultant advice, Haiku `sap-checker` (already 1/40 of Opus) | — |

```
sap-checker ×N (Haiku, MCP) ──▶ brief files ──▶ [normal] sap-stocker / sap-writer (Claude)
                                            └─▶ [soft+]  overflow-call.mjs ─▶ provider ─▶ schema check ─▶ next phase
```

## 4. Provider selection

`preferences.json` → `overflow.provider`:

- `gemini` / `codex` / `grok` — the user picks exactly **one** provider.
- `off` (default) — feature disabled.

There is no automatic multi-provider mode: the plugin never chains providers. When the chosen
provider fails, the job goes back to its Claude tier (§7). Switching provider is a user action in `sap-option`.

## 5. Components

| File | Role |
|---|---|
| `scripts/overflow/overflow-call.mjs` | Bridge. `--job <id> --prompt-file --context-file --schema --out [--provider]`. Timeout, 1 retry, JSON-schema validation. Exit: `0` ok · `10` quota · `11` auth · `12` network · `13` schema · `14` provider not installed |
| `scripts/overflow/providers/gemini.mjs` | `gemini -p … -o json --approval-mode plan [-m <model>]`; `transport: cli \| vertex` |
| `scripts/overflow/providers/codex.mjs` | `codex exec … --sandbox read-only [--output-schema <file>] [-m <model>]` (exact flags verified at install time) |
| `scripts/overflow/providers/grok.mjs` | `grok -p … --output-format json [--json-schema <file>]` in plan (read-only) mode (exact flags verified at install time) |
| `scripts/overflow/pressure.mjs` | §2 level resolution; prints `{level, pressure, source}` |
| `scripts/overflow/jobs/*.md` | Provider-neutral prompt template per job (English) + output schema |
| `common/overflow-routing-rule.md` | Rule doc for skills (≤ 200 lines) |
| `~/.sc4sap/preferences.json` | see §6 |
| profile `config.json` | `overflow.allowedProviders` per profile (e.g. `["gemini"]`); PRD tier forced `[]` |
| `scripts/hud/*` | Badge: `OV:gemini soft 312/2000` |
| `sap-option` | New **overflow** menu (§6) |
| `sap-doctor` | Per provider: installed? version, signed in?, quota, one no-data test call |

Adapters hold no credentials; they rely on each CLI's own sign-in.
Both CLIs run in read-only mode, in a scratch working directory that contains only the job files.

## 6. Options (`/sc4sap:sap-option` → overflow)

```json
{
  "overflow": {
    "provider": "off | gemini | codex | grok",
    "softPct": 80,
    "hardPct": 95,
    "providers": {
      "gemini": { "transport": "cli", "model": null },
      "codex":  { "model": null, "allowApiKey": false },
      "grok":   { "model": null, "allowApiKey": false }
    }
  }
}
```

Menu flow: show status per provider (installed / signed in / quota today) → choose provider →
thresholds → **Test connection** (no-data call) → preview diff → confirm → write.
`model: null` = the CLI's default; never hardcode a model name in the plugin.
`model-dispatch-mode.md` `user-defined` adds the enabled provider(s) as extra options for Tier G/G+ groups only.

## 7. Fallback and safety

| Situation | Behavior |
|---|---|
| Exit `10` (quota) | Mark the provider exhausted for the day in hud-cache; Claude tier until the quota resets |
| Exit `11` / `12` / `14` | Claude tier; banner `Overflow unavailable (<provider>: <reason>)` once per run |
| Exit `13` (schema) | One re-prompt with the validation error; then Claude tier |
| Claude also at 100 % | Stop at the phase boundary with a resumable state note; never hand a Never-tier job to a provider |
| Profile not allowed / PRD tier | Overflow off regardless of pressure |
| Codex / Grok signed in with API key and `allowApiKey=false` | Treat as exit `11` (avoids silent per-token billing) |
| Provider not in the profile's `allowedProviders` | Skipped as if not installed |

Data: only the job's brief files are sent (no credentials, no `sap.env`, no blocklisted table
contents). The bridge rejects a context file carrying a `GetTableContents` / `GetSqlQuery` payload marker.

## 8. Visibility

- Phase Banner: `▶ phase=stock.2 · agent=overflow:gemini(G) · reason=5h 84%`
- Response prefix: `[Model: Opus 5.5 · Dispatched: Haiku×6, Gemini×2 (overflow 5h 84%)]`

## 9. Rollout

1. `pressure.mjs` + `overflow-call.mjs` + **gemini** adapter + `sap-doctor` check + `sap-option` menu.
   `SC4SAP_OVERFLOW_FORCE=soft` forces the level for testing.
2. PoC on `sap-stocker` purpose inference (analyze-cbo-obj): compare with the Claude run on the
   same package — purpose agreement, schema pass rate, re-dispatch rate.
3. **codex** and **grok** adapters; run the same PoC package through each for a side-by-side comparison with Claude and Gemini.
4. Extend to config-to-document, Phase 8 report, manual / spec prose; Tier G+ only after metrics are acceptable.

## 10. Open items to verify before coding

- Gemini: does the org's "Gemini Enterprise" license include Gemini CLI headless use, and what is the daily quota?
- Codex: which ChatGPT plan the org has, whether it covers Codex CLI, and its usage limits.
- Grok: whether the org approves xAI for source code, which plan covers Grok Build CLI, its
  usage limits, and the API-key variable name (sources disagree: `XAI_API_KEY` vs `GROK_CODE_XAI_API_KEY`).
- Exact headless flags of each CLI version installed (JSON output, read-only mode, output schema).
- Corporate network access to both providers' endpoints.
- `/api/oauth/usage` availability (HUD dependency; if it breaks, overflow never triggers — safe).
