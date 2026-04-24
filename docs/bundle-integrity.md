# `runtime-deps/` bundle integrity

## Why this exists

Claude Code installs plugins by `git clone` — it does not run `npm install`. To deliver working keychain support on first launch, sc4sap commits the `@napi-rs/keyring` npm package and its four platform-native `.node` binaries under `runtime-deps/keyring/node_modules/` (see 0.6.9 release note).

A committed `.node` binary has zero built-in tamper detection. Integrity verification closes that gap so we notice if bytes in the bundle change between merges, rebases, or cross-platform clones.

## What `integrity.json` captures

`runtime-deps/keyring/integrity.json` records, for every bundled package:

- **`npmIntegrity`** — the SHA-512 from `package-lock.json`. Copied verbatim at refresh time. Proves provenance: "this bundle was derived from the npm tarball with that integrity value." Not recomputable from the extracted bundle (tar + extract is lossy), so this field is documentation only.
- **`resolved`** — the registry URL of the source tarball. Pointer for future upstream re-verification (Stage 3-lite v2, not yet shipped).
- **`files`** — an object mapping every file in the bundled package to its SHA-256 (`sha256-<base64>` format, matching the `ssri` convention). This is what `--verify` actually compares.

Schema version is fixed to `1`; bump and migrate if the structure ever changes.

## Maintainer workflow

```bash
# After bumping the bundled @napi-rs/keyring version:

# 1. Fetch the cross-platform binaries (Windows does not get darwin/linux by default)
npm install --no-save --force \
  @napi-rs/keyring-darwin-x64 \
  @napi-rs/keyring-darwin-arm64 \
  @napi-rs/keyring-linux-x64-gnu

# 2. Refresh the bundle itself
node scripts/bundle-keyring.mjs

# 3. Regenerate integrity.json against the new bundle + current package-lock.json
node scripts/bundle-keyring.mjs --refresh-integrity

# 4. Sanity-check (tamper detection is self-consistent with the file just written)
node scripts/bundle-keyring.mjs --verify

# 5. Commit bundle + integrity.json together
git add runtime-deps/ && git commit
```

## `--verify` semantics

`node scripts/bundle-keyring.mjs --verify`

- Runs entirely offline. No network, no npm invocation, no package-lock.json read.
- Walks `runtime-deps/keyring/node_modules/@napi-rs/<pkg>/` for every entry in `integrity.json`:
  - Missing / unexpected files → problem.
  - Per-file SHA-256 mismatch → problem.
- Exit codes: `0` = integrity OK, `7` = `integrity.json` missing, `8` = one or more problems reported to stderr.

It catches:

- A `.node` binary swap in the repo (intentional or malicious).
- A text file accidentally CRLF-normalized at checkout despite `.gitattributes` (should not happen given `runtime-deps/** -text`, but the verify step is cheap insurance).
- A stale `integrity.json` left behind after a bundle update (the fast-path reminder to also run `--refresh-integrity`).

It does NOT catch:

- A compromised upstream tarball that was successfully installed and then bundled. That is Stage 3-lite v2 scope — recomputing integrity against the `resolved` URL would catch it.

## When to run

**Pre-commit (recommended)**: before committing any change under `runtime-deps/`.

```bash
node scripts/bundle-keyring.mjs --verify
```

**Pre-push (belt-and-suspenders)**: harmless and fast (~40 ms for the current 19-file bundle).

**CI**: this repo has no `.github/workflows/` today. When CI is added, include the verify step as the first job in the pipeline so bundle tampering fails the PR before tests run:

```yaml
# Example — add under .github/workflows/ci.yml once CI is set up
- name: Verify runtime-deps bundle integrity
  run: node scripts/bundle-keyring.mjs --verify
```

## What gets checked in

| Path | Purpose |
|---|---|
| `runtime-deps/keyring/package.json` | `createRequire` anchor (see `scripts/sap-profile-cli.mjs`) |
| `runtime-deps/keyring/integrity.json` | This file's subject |
| `runtime-deps/keyring/node_modules/@napi-rs/keyring/*` | JS wrapper + TypeScript types |
| `runtime-deps/keyring/node_modules/@napi-rs/keyring-<platform>/` | 4 platform-native `.node` binaries |

## Stage 3-lite v2 — deferred follow-up

An additional subcommand that fetches each package's tarball from its recorded `resolved` URL, recomputes SHA-512, and compares against `npmIntegrity` — catching upstream tampering that this offline `--verify` cannot. Skipped for now because:

1. It requires network; offline verify is the more common case for maintainers and CI.
2. The registry-side tarball verification npm itself performs at install time already covers the "trust upstream" angle for the window in which the bundle is produced.
3. We have no concrete adversary model in which an upstream tarball silently rotates behind a pinned version without a yanked-version signal from npm.

Future trigger: if sc4sap bundles additional native dependencies (`better-sqlite3`, `@ast-grep/napi`) whose upstream release cadence is faster than the sc4sap release cadence, upstream re-verification becomes proportionally more valuable.
