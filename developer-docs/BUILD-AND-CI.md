# Build, CI, and Release

> Detailed reference for the current build and release workflows.

## Toolchain

### Node and Yarn

Repo-level toolchain expectations:

- Node `20.4.0` via Volta
- root `packageManager`: `yarn@4.6.0`
- Plug'n'Play enabled

Several packages still declare `yarn@3.5.0` in local manifests, but the root workspace tooling is the authoritative setup for normal development.

### Rust

Required for:

- Tauri desktop builds
- release pipelines that package the app

## Root Scripts

Current root scripts from `package.json`:

```bash
yarn dev
yarn build
yarn build:all
yarn test
yarn test:all
yarn lint
yarn prettier:fix
yarn publish
yarn publish-docs
```

### `yarn dev`

Runs:

1. `yarn workspace @ironclad/rivet-app run dev`

That app dev script performs a Windows-only cleanup of stale copied `app-executor.exe` sidecars, then launches `tauri dev`. The Tauri dev command itself runs `yarn prepare:tauri && yarn start` through `beforeDevCommand`, so the Node sidecar is rebuilt before the desktop app starts.

### `yarn build`

Runs builds in fixed order:

1. core
2. node
3. app-executor
4. trivet
5. app
6. cli

### `yarn build:all`

Alias for `yarn build`.

### `yarn test`

Runs all currently defined workspace test suites:

- `yarn workspace @ironclad/rivet-core run test`
- `yarn workspace @ironclad/rivet-node run test`
- `yarn workspace @ironclad/rivet-app run test`
- `yarn workspace @ironclad/rivet-cli run test`

Packages without a `test` script are not included.

### `yarn test:all`

Alias for `yarn test`.

### `yarn lint`

Runs lint across:

- core
- node
- app
- trivet
- app-executor
- cli

### `yarn prettier:fix`

Runs:

- `prettier --write .`

### `yarn publish`

Runs:

- `tsx publish-packages.mts`

### `yarn publish-docs`

Runs:

- `tsx publish-docs.mts`

## Per-Package Build Notes

### Core

`packages/core/package.json`:

- `build`: `build:esm` then `build:cjs`
- ESM output via `tsc -b`
- CJS bundle via `tsx bundle.esbuild.ts`
- watch mode via `tsc -b -w`

#### CJS bundle alias strategy

The CJS bundle (built by `bundle.esbuild.ts`) targets Node 16 and aliases several ESM-only dependencies to older CJS-compatible versions:

| ESM dependency | CJS alias       | Reason                   |
| -------------- | --------------- | ------------------------ |
| `lodash-es`    | `lodash`        | lodash-es is ESM-only    |
| `p-queue`      | `p-queue-6`     | p-queue v7+ is ESM-only  |
| `emittery`     | `emittery-0-13` | emittery v1+ is ESM-only |
| `p-retry`      | `p-retry-4`     | p-retry v6+ is ESM-only  |

The alias packages are installed via `npm:` aliases in `package.json`. Because the CJS `p-queue` alias wraps the default export differently, [`pQueueCompat.ts`](../packages/core/src/utils/pQueueCompat.ts) normalizes the import at runtime so consumers never need an inline type check.

ESM-only packages that cannot be aliased (e.g. `mdast-util-to-markdown`, `@google/genai`) use dynamic `import()` at call sites instead.

### Node

`packages/node/package.json`:

- `build`: `build:esm` then `build:cjs`
- CJS bundle reuses core's esbuild bundler script (same alias strategy applies)
- `pretest`: builds `@ironclad/rivet-core` ESM output first, because the node tests import the workspace package through its published-style export surface

Wrappers that embed this checkout but consume `@ironclad/rivet-core` and
`@ironclad/rivet-node` as built packages should not create symlinks inside the
Rivet workspace or change Rivet's package-manager mode. After building both
workspaces, run `yarn build:packages:local` or
`node scripts/create-built-package-artifacts.mjs --out-dir <dir>`. The script
validates the built `dist/esm`, `dist/cjs`, and `dist/types` outputs, writes
package-manager-neutral `file:` package directories, and rewrites
`@ironclad/rivet-node` to depend on the generated local `@ironclad/rivet-core`
package. npm, Yarn, and pnpm based wrappers can then depend on those generated
local directories without pulling stale public registry packages and without
mutating this checkout's PnP/node-modules layout. The artifact script recreates
its output directory, so it refuses targets that are the repo root, a parent of
the repo root, inside this checkout outside `.rivet-built-packages`, or
overlapping a source package directory.

### App

`packages/app/package.json`:

- `start`: Vite dev server
- `dev`: `node scripts/dev.mjs`
- `build`: `tsc && vite build`
- `prepare:tauri`: rebuild `@ironclad/rivet-app-executor` before desktop launch/build steps

Current dev/build detail:

- `packages/app/scripts/dev.mjs` does a Windows-only cleanup pass for stale `src-tauri/target/*/app-executor.exe` processes before launching `tauri dev`, because Tauri's sidecar-copy step fails if a previous dev session left that copied sidecar binary locked
- `packages/app/src-tauri/tauri.conf.json` now runs `yarn prepare:tauri` before both `beforeDevCommand` and `beforeBuildCommand`, so desktop Node executor runs cannot drift onto an older bundled sidecar when app/core code has changed
- `packages/app/src-tauri/vendor/` now carries the small vendored Tauri v1 plugin crates (`tauri-plugin-persisted-scope` and `tauri-plugin-window-state`) so Cargo no longer has to parse the upstream `plugins-workspace` template manifest during metadata/check/dev runs

#### pnpm sidecar binaries

The app also tracks `pnpm` sidecar binaries in [`packages/app/sidecars/pnpm`](../packages/app/sidecars/pnpm).

These binaries are currently intentional tracked artifacts because:

- Tauri lists `../sidecars/pnpm/pnpm` in `bundle.externalBin`
- package-plugin installation starts that pnpm binary through the Tauri sidecar shell API
- desktop builds should not depend on a user-installed global `pnpm`

Maintenance rules:

- Treat the directory as vendored binary artifacts.
- Keep [`packages/app/sidecars/pnpm/SHA256SUMS`](../packages/app/sidecars/pnpm/SHA256SUMS) updated whenever the binaries change.
- Keep [`packages/app/sidecars/pnpm/README.md`](../packages/app/sidecars/pnpm/README.md) updated with version/provenance notes.
- Keep `.gitattributes` marking the sidecars as binary and vendored.
- If the release pipeline later gains checksum-verified artifact downloads or Git LFS support, reassess whether these binaries should stay in normal Git history.

### App executor

`packages/app-executor/package.json`:

- `build`: `tsx scripts/build-executor.mts`
- `dev`: `tsx watch --inspect=9228 --experimental-network-imports bin/executor.mts`
- `start`: build then run bundled executor

The build script (`scripts/build-executor.mts`) bundles the ESM source to CJS using esbuild, then compiles the CJS bundle into a native binary via `pkg`. CJS format is required because `pkg` needs static analysis of `require()` calls. A custom esbuild plugin (`resolveRivet`) inlines `@ironclad/rivet-*` packages from source, so the final bundle has zero external workspace dependencies.

The app-executor binary accepts `--port` / `-p` and `--host` flags. The default
host is `127.0.0.1` for the desktop internal sidecar; hosted/container wrappers
can pass `--host 0.0.0.0` or set `RIVET_EXECUTOR_HOST=0.0.0.0` without patching
`executor.mts`. If no port flag is passed, `RIVET_EXECUTOR_PORT` can override
the default `21889`; custom ports must be valid TCP ports from `1` to `65535`.
Code-node `require()` resolution can likewise be redirected
with `RIVET_CODE_RUNNER_REQUIRE_ROOT` or `RIVET_CODE_RUNNER_REQUIRE_ANCHOR` so
wrapper runtimes can provide per-project libraries without string-rewriting
`NodeCodeRunner` or the app-executor worker runner. Hosted bootstrap code can
also expose `globalThis.__RIVET_PREPARE_RUNTIME_LIBRARIES__`; the app-executor
worker runner calls it before require-enabled/Rivet-capable Code nodes so Docker
or server wrappers can synchronize runtime libraries before module resolution.

### CLI

`packages/cli/package.json`:

- `build`: `tsc -b`
- `test`: `tsx --test test/**/*.test.ts`
- `start`: build then run CLI
- `docker-publish`: delegated shell script

The CLI now includes a small smoke suite so root `yarn test` / `npm run test` validates the package instead of failing on an empty test glob.

The CLI Dockerfile installs the published CLI package by explicit version (`@ironclad/rivet-cli@2.0.0`). Keep that pin aligned with `packages/cli/package.json` whenever the product version changes.

### Trivet

`packages/trivet/package.json`:

- dual ESM/CJS build similar to core/node

### Docs

`packages/docs/package.json`:

- Docusaurus local dev/build/serve
- `typecheck` via `tsc`

## CI Workflows

Workflows live under [`_.github/workflows/`](../_.github/workflows/).

## `build.yml`

### Trigger conditions

- all pushes
- all pull requests

### Current behavior

Runs on `ubuntu-latest` and performs:

1. checkout
2. Node setup (`20.4.x`)
3. `yarn --immutable`
4. `yarn build`
5. `yarn test`
6. `yarn lint`
7. `yarn prettier --check`

### Important notes

- build runs with increased `NODE_OPTIONS`
- formatting check uses the Prettier binary directly via Yarn, not the repo's `prettier:fix` script

## `release.yml`

### Trigger conditions

- pushes to `windows-builds`
- tags matching `app-v*`

### Matrix targets

- `windows-latest`
- `macos-latest`
- `ubuntu-22.04`
- `ubuntu-22.04-arm`

### Current steps

Per matrix entry, the workflow:

1. checks out the repo
2. sets up Node `20.4.x`
3. sets up Rust toolchains
4. installs Linux system dependencies where needed
5. runs `yarn --immutable`
6. runs `yarn build`
7. invokes `tauri-apps/tauri-action`

### Tauri release details

The workflow currently uses:

- `projectPath: packages/app`
- `tauriScript: yarn tauri`
- draft GitHub releases
- universal macOS target

### Release secrets/environment

Current workflow references:

- `GITHUB_TOKEN`
- `TAURI_PRIVATE_KEY`
- `TAURI_KEY_PASSWORD`
- Apple signing/notarization-related secrets

## `rename-release-assets.yml`

### Trigger conditions

- release `published`
- release `edited`

### Current behavior

Runs `_.github/scripts/rename-release-files.mts`, which:

- enumerates release assets
- downloads versioned app artifacts
- re-uploads renamed stable filenames
- deletes older assets with the same target filename if needed

Current rename targets include patterns for:

- universal DMG
- AppImage
- Debian package
- Windows setup executable

## Tauri Build and Packaging

Tauri config lives in [`packages/app/src-tauri/tauri.conf.json`](../packages/app/src-tauri/tauri.conf.json).

### Verified current details

- `beforeDevCommand`: `yarn prepare:tauri && yarn start`
- `beforeBuildCommand`: `yarn prepare:tauri && yarn build`
- `devPath`: `http://localhost:5173`
- `distDir`: `../dist`
- package version there: `2.0`
- updater is active
- updater endpoint points at GitHub release `latest.json`
- external binaries include app-executor and bundled `pnpm`

### Packaging significance

The app package is not standalone frontend output. Tauri packaging, sidecars, updater behavior, and shell permissions are part of the build contract.

## Publish Scripts

## `publish-packages.mts`

Current behavior:

1. parse OTP from CLI args
2. fail if git tree is dirty
3. verify expected workspaces exist
4. publish core, node, cli, and trivet
5. run CLI Docker publish

### Operational implication

This script assumes a release-quality workspace and does not attempt partial or resumable publish logic.

## `publish-docs.mts`

Current behavior:

1. fail if git tree is dirty
2. record current branch
3. build docs
4. copy build to temp dir
5. check out `docs` branch
6. delete tracked files except a short allowlist
7. copy built docs into branch
8. commit `"Docs publish"`
9. force-check out the original branch
10. hard-reset to `HEAD`

### Operational implication

This script is intentionally aggressive and should be treated carefully. It only makes sense on a clean tree and a controlled publish workflow.

## Release Process As Implemented

The current effective release flow is:

1. update versions in package manifests and Tauri config
2. publish npm packages via `yarn publish`
3. push `app-v*` tag for desktop release
4. let `release.yml` create draft desktop artifacts
5. let `rename-release-assets.yml` normalize asset names
6. publish docs separately if needed via `yarn publish-docs`

## Known Operational Risks

Visible from the current scripts/workflows:

- docs publishing uses force checkout/reset behavior
- npm publishing requires a clean tree and OTP up front
- app release depends on sidecar and Tauri packaging staying aligned
- build/test coverage is not symmetrical across all packages

## Practical Refactor Guidance

- Keep root build order aligned with runtime/package dependencies.
- If moving or renaming packages, update root scripts, CI workflows, and publish scripts together.
- If changing app-executor packaging, update both Tauri config and release/build assumptions.
- If changing app execution/session code, manual verification should cover both Browser executor mode and Node executor mode in the desktop app, plus at least one multi-consumer path that listens to executor events while the main graph execution UI is mounted.
- Treat docs publish and package publish scripts as operational code that deserves review, not just maintenance glue.
