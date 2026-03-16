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
yarn test
yarn lint
yarn prettier:fix
yarn publish
yarn publish-docs
```

### `yarn dev`

Runs:

1. `yarn workspace @ironclad/rivet-app-executor run build`
2. `yarn workspace @ironclad/rivet-app run dev`

This means repo-level app development depends on the sidecar being built first.

### `yarn build`

Runs builds in fixed order:

1. core
2. node
3. app-executor
4. trivet
5. app
6. cli

### `yarn test`

Currently only runs the core test suite:

- `yarn workspace @ironclad/rivet-core run test`

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

### Node

`packages/node/package.json`:

- `build`: `build:esm` then `build:cjs`
- CJS bundle reuses core's esbuild bundler script

### App

`packages/app/package.json`:

- `start`: Vite dev server
- `dev`: `tauri dev`
- `build`: `tsc && vite build`

### App executor

`packages/app-executor/package.json`:

- `build`: `tsx scripts/build-executor.mts`
- `dev`: `tsx watch --inspect=9228 --experimental-network-imports bin/executor.mts`
- `start`: build then run bundled executor

### CLI

`packages/cli/package.json`:

- `build`: `tsc -b`
- `start`: build then run CLI
- `docker-publish`: delegated shell script

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

- `beforeDevCommand`: `yarn start`
- `beforeBuildCommand`: `yarn build`
- `devPath`: `http://localhost:5173`
- `distDir`: `../dist`
- package version there: `1.11.3`
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
- Treat docs publish and package publish scripts as operational code that deserves review, not just maintenance glue.
