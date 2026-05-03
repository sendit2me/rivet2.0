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

1. `yarn workspace @valerypopoff/rivet-app run dev`

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

- `yarn workspace @valerypopoff/rivet2-core run test`
- `yarn workspace @valerypopoff/rivet2-node run test`
- `yarn workspace @valerypopoff/rivet-app run test`
- `yarn workspace @valerypopoff/rivet2-cli run test`

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

- `node scripts/publish-npm-packages.mjs`

This publishes only the public npm package set: `@valerypopoff/rivet2-core`,
`@valerypopoff/rivet2-node`, and `@valerypopoff/rivet2-cli`. Build those
workspaces before publishing.

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
- `pretest`: builds `@valerypopoff/rivet2-core` ESM output first, because the node tests import the workspace package through its published-style export surface

Wrappers that embed this checkout but consume `@valerypopoff/rivet2-core` and
`@valerypopoff/rivet2-node` as built packages should not create symlinks inside the
Rivet workspace or change Rivet's package-manager mode. After building both
workspaces, run `yarn build:packages:local` or
`node scripts/create-built-package-artifacts.mjs --out-dir <dir>`. The script
validates the built `dist/esm`, `dist/cjs`, and `dist/types` outputs, writes
package-manager-neutral `file:` package directories, and rewrites
`@valerypopoff/rivet2-node` to depend on the generated local `@valerypopoff/rivet2-core`
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
- `prepare:tauri`: rebuild `@valerypopoff/rivet-app-executor` before desktop launch/build steps

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

The build script (`scripts/build-executor.mts`) bundles the ESM source to CJS using esbuild, then compiles the CJS bundle into a native binary via `pkg`. CJS format is required because `pkg` needs static analysis of `require()` calls. A custom esbuild plugin (`resolveRivet`) inlines `@valerypopoff/rivet-*` packages from source, so the final bundle has zero external workspace dependencies.

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

The CLI Dockerfile installs the published CLI package by explicit version (`@valerypopoff/rivet2-cli@2.0.0`). Keep that pin aligned with `packages/cli/package.json` whenever the product version changes.

### Trivet

`packages/trivet/package.json`:

- dual ESM/CJS build similar to core/node

### Docs

`packages/docs/package.json`:

- Docusaurus local dev/build/serve
- `typecheck` via `tsc`

The public docs are part of the release surface. Keep them aligned with the
current Rivet 2.0 package/runtime model instead of preserving old fork-era
wording. In practice, docs changes should follow package renames, executor
contract changes, app-level plugin behavior, LLM Chat/HTTP Call output
contracts, Code-node runtime-permission changes, and wrapper/embedder seams.

## CI Workflows

Workflows live under [`.github/workflows/`](../.github/workflows/).

## `build.yml`

### Trigger conditions

- pushes to `develop`
- pull requests targeting `develop`

This general build workflow is also develop-only for now. It should not be widened to `main` until main-branch CI/release behavior is deliberately introduced.

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

## Windows Pages release workflows

Rivet publishes installer download metadata through the Docusaurus GitHub Pages site:

- [`.github/workflows/official-windows-release.yml`](../.github/workflows/official-windows-release.yml) runs on `main`
- [`.github/workflows/developer-windows-release.yml`](../.github/workflows/developer-windows-release.yml) runs on `develop`

Both workflows build installer artifacts only with `yarn tauri build --verbose --ci --bundles "msi,nsis"`. They intentionally avoid updater zip bundles, so they do not need `TAURI_PRIVATE_KEY` or `TAURI_KEY_PASSWORD`.

Both workflows use [`.github/scripts/prepare-windows-release-pages.mjs`](../.github/scripts/prepare-windows-release-pages.mjs) to collect files from `packages/app/src-tauri/target/release/bundle`, copy original installer artifacts under channel-specific `downloads/<channel>/original/` paths, create stable download aliases, and generate a channel metadata file.

Generated metadata and aliases:

- official workflow: `official-release.json`, `downloads/official/Rivet-Windows-Setup.exe`, and `downloads/official/Rivet-Windows.msi`
- developer workflow: `developer-release.json`, `downloads/developer/Rivet-Developer-Windows-Setup.exe`, and `downloads/developer/Rivet-Developer-Windows.msi`

The `/download` docs page reads both metadata files. A Pages deploy replaces the whole site, so each release workflow preserves the other channel from the currently published Pages site before writing its own current channel:

- `main` official runs preserve `developer-release.json` and the developer assets referenced by that metadata
- `develop` developer runs preserve `official-release.json` and the official assets referenced by that metadata

The release workflows share the `rivet-docs-pages` concurrency group with `cancel-in-progress: false`, so official and developer Pages deployments queue instead of racing and accidentally publishing a site that only contains one release channel.

### `official-windows-release.yml`

#### Trigger conditions

- pushes to `main`
- manual `workflow_dispatch` runs, guarded so jobs only execute when the selected ref is `main`

#### Current behavior

The workflow has two jobs:

1. `build-windows` runs on `windows-latest`, checks out the repo, sets up Node `20.4.x`, installs Rust stable, runs `yarn --immutable`, runs the root `yarn build`, then runs `yarn tauri build --verbose --ci --bundles "msi,nsis"` from `packages/app`.
2. The same Windows job builds the Docusaurus docs site from `packages/docs`, preserves the current developer release feed from Pages if it exists, writes official release metadata and installer files into `packages/docs/build`, and uploads that complete docs-site artifact.
3. `publish-pages` runs on `ubuntu-latest`, downloads the generated docs-site artifact, configures GitHub Pages, uploads it as a GitHub Pages artifact, and deploys it with `actions/deploy-pages`.

The official deploy job uses the `github-pages` environment. If that environment has branch restrictions, it must allow `main`.

### `developer-windows-release.yml`

### Trigger conditions

- pushes to `develop`
- manual `workflow_dispatch` runs, guarded so jobs only execute when the selected ref is `develop`

This workflow is intentionally develop-only. It does not run for `main`.

### Current behavior

The workflow has two jobs:

1. `build-windows` runs on `windows-latest`, checks out the repo, sets up Node `20.4.x`, installs Rust stable, runs `yarn --immutable`, runs the root `yarn build`, then runs `yarn tauri build --verbose --ci --bundles "msi,nsis"` from `packages/app`.
2. The same Windows job builds the Docusaurus docs site from `packages/docs`, preserves the current official release feed from Pages if it exists, writes developer release metadata and installer files into `packages/docs/build`, and uploads that complete docs-site artifact.
3. `publish-pages` runs on `ubuntu-latest`, downloads the generated docs-site artifact, configures GitHub Pages, uploads it as a GitHub Pages artifact, and deploys it with `actions/deploy-pages`.

Docusaurus owns the site root and reads `developer-release.json` on the `/download` page. The generated Pages site represents the current public docs plus the latest successful developer Windows release from `develop`, while preserving the official release feed that was already published from `main`.

### Pages requirements

The repository's GitHub Pages source must be configured for GitHub Actions deployments. There are two supported setup paths:

- Enable Pages once in repository settings: **Settings > Pages > Build and deployment > Source > GitHub Actions**.
- Or add a `PAGES_ENABLEMENT_TOKEN` Actions secret. When that secret exists, the workflow passes `enablement: true` to `actions/configure-pages` so the workflow can create/enable the Pages site before deploying.

`PAGES_ENABLEMENT_TOKEN` must be stronger than the default `GITHUB_TOKEN`; `actions/configure-pages` requires a separate token for enablement. Use a fine-grained token with Pages write access for this repository, a classic token with `repo` scope, or a GitHub App token with `administration:write` and `pages:write`. After Pages is enabled, the normal deployment still uses the workflow's `pages: write` and `id-token: write` permissions.

The developer deploy job uses the `developer-windows-pages` environment instead of the default `github-pages` environment. This keeps the develop-branch installer feed from being blocked by production-oriented `github-pages` environment protection rules, such as "only main can deploy." If the `developer-windows-pages` environment is later given branch restrictions, it must allow `develop`.

The Pages release workflows use Node 24-compatible artifact action majors (`actions/upload-artifact@v7`, `actions/download-artifact@v7`, and `actions/upload-pages-artifact@v5`) and do not force Node 24 globally with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`. The build itself still uses Node `20.4.x`; that is the project toolchain, not the JavaScript runtime used by GitHub's actions.

### Secrets/environment

The Pages release workflows do not pass updater-signing secrets. They explicitly request only the Windows installer bundles with `--bundles "msi,nsis"`, so Tauri does not create updater zip bundles and does not need `TAURI_PRIVATE_KEY` or `TAURI_KEY_PASSWORD`.

Optional Pages-release secret:

- `PAGES_ENABLEMENT_TOKEN`: only needed if the workflow should enable GitHub Pages automatically instead of relying on the one-time repository setting described above.

Deployment environment:

- `github-pages`: used by the main-branch official release deployment. It should allow `main`.
- `developer-windows-pages`: used by the develop-branch Pages deployment. Leave it unrestricted or allow the `develop` branch.

Production updater/tagged desktop release workflows still use the updater-enabled Tauri packaging contract and therefore continue to require updater signing secrets. Keep the Pages release workflows installer-only unless one is intentionally promoted into an updater feed.

## `publish-npm-packages.yml`

### Trigger conditions

- pushes to `main`
- manual `workflow_dispatch` runs, guarded so jobs only execute when the selected ref is `main`

### Current behavior

This workflow publishes the public runtime packages under the `@valerypopoff`
npm scope. It intentionally does not run on `develop`.

The workflow:

1. checks out the repo
2. verifies the checkout starts clean
3. sets up Node `20.4.x` for the build, matching the repo development toolchain
4. installs dependencies with the checked-in Yarn release and `--immutable`
5. builds `@valerypopoff/rivet2-core`, `@valerypopoff/rivet2-node`, and `@valerypopoff/rivet2-cli`
6. verifies that dependency install and package build touched only generated artifacts
7. switches to Node `22.14.x` and npm `11.5.1` for npm trusted-publishing compatibility
8. verifies that the repository `NPM_TOKEN` secret is present and accepted by `npm whoami`
9. runs `node scripts/publish-npm-packages.mjs --skip-clean-check`

The publish step intentionally skips the script's clean-tree check because this
job installs dependencies and builds ignored publish artifacts immediately
before publishing. The workflow performs cleanliness checks before install and
after build instead, so source changes still fail while Yarn install artifacts,
generated `packages/core/dist`, `packages/node/dist`, `packages/cli/dist`,
`packages/cli/bin`, and `packages/cli/tsconfig.tsbuildinfo` files do not block
publishing.

### Versioning policy

The package manifest version is the release source of truth. The three public
npm packages are versioned in lockstep and must stay on major version `2`.

- patch releases: `2.0.1`, `2.0.2`, etc. for compatible fixes
- minor releases: `2.1.0`, `2.2.0`, etc. for compatible features
- prereleases: `2.1.0-beta.1`, etc. publish with the `next` dist-tag unless `NPM_DIST_TAG` overrides it

The publish script refuses to publish if the three package versions disagree, if
the version is not semver, or if the major version is not `2`. It also checks
npm before publishing each package and skips package versions that are already
present in the registry, so re-running the same main-branch workflow does not
turn an already-published package into a hard failure.

### npm authentication

The main-branch npm workflow currently requires a repository secret named
`NPM_TOKEN`. Add it under GitHub repository Settings -> Secrets and variables ->
Actions. The token should be an npm automation token that can publish public
packages under the `@valerypopoff` scope.

The workflow verifies the token with `npm whoami` before it runs the publish
script. This catches missing or invalid secrets before the package staging script
gets as far as `npm publish`.

The workflow still grants `id-token: write` and sets npm provenance so published
packages can include provenance metadata. Fully tokenless npm trusted publishing
can be revisited later, but this workflow's expected auth path is the
`NPM_TOKEN` repository secret.

For local publishes, `scripts/publish-npm-packages.mjs` reads repo-root `.env`
before it stages packages. A local `NPM_TOKEN=...` entry is mapped to
`NODE_AUTH_TOKEN` and written only to a temporary npm user config inside the
staging directory while `npm view` / `npm publish` run. The temporary `.npmrc` is
removed before the script exits, including when `--keep-stage` leaves staged
packages available for inspection. The repo-root `.env` file is ignored by Git
and must not be committed. GitHub Actions does not receive local `.env` values;
CI publishes need the repository secret named `NPM_TOKEN`.

### Package staging

[`scripts/publish-npm-packages.mjs`](../scripts/publish-npm-packages.mjs) does
not publish directly from the workspace package directories. It stages clean
temporary package directories containing only package metadata, README/LICENSE
files, and built outputs:

- `dist/cjs`, `dist/esm`, and `dist/types` for `rivet2-core` and `rivet2-node`
- `bin` and `dist` for `rivet2-cli`

During staging, internal `workspace:^` dependencies are rewritten to the same
published `^2.x` version. For example, `@valerypopoff/rivet2-node` receives a
normal npm dependency on `@valerypopoff/rivet2-core`, and
`@valerypopoff/rivet2-cli` receives a normal npm dependency on
`@valerypopoff/rivet2-node`.

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
- updater is active in the default Tauri config
- updater endpoint points at GitHub release `latest.json`
- external binaries include app-executor and bundled `pnpm`

### Packaging significance

The app package is not standalone frontend output. Tauri packaging, sidecars, updater behavior, and shell permissions are part of the build contract. CI workflows that only need installer artifacts can override the bundle targets at build time to avoid updater signing.

Startup update checks are intentionally quiet when that `latest.json` feed does not exist or cannot be parsed. This keeps local builds and unsigned developer installer builds from showing an unhandled-rejection toast before a production updater feed has been published. Manual checks from Settings > Updates still surface the failure.

## Publish Scripts

## `scripts/publish-npm-packages.mjs`

Current behavior:

1. load local `.env` publish authentication when present
2. fail if git tree is dirty, unless `--skip-clean-check` is passed
3. verify the three public package manifests are named correctly
4. require lockstep semver package versions on major version `2`
5. validate required built output exists
6. stage clean temporary npm package directories
7. rewrite internal workspace dependencies to public `^2.x` package ranges
8. skip already-published package versions
9. publish core, node, and cli with `npm publish --access public --registry https://registry.npmjs.org/`

### Operational implication

This script assumes the packages have already been built. It is resumable across
already-published package versions, but it does not version-bump packages or
publish Docker images.

Useful local validation flags:

- `--stage-only`: validate and stage the packages without invoking npm
- `--keep-stage`: keep the temporary staged package directory for inspection;
  npm auth config is still removed before exit
- `--dry-run`: run `npm publish --dry-run` against the staged package directories
- `--skip-clean-check`: allow validation from a dirty working tree; the main-branch GitHub Actions publish workflow uses this only after it has already verified that the checkout was clean before building generated package artifacts

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
2. push to `main` to publish npm packages and the current official Windows installer feed on GitHub Pages
3. push `app-v*` tag for updater-enabled desktop release drafts when that path is needed
4. let `release.yml` create draft desktop artifacts
5. let `rename-release-assets.yml` normalize asset names
6. publish docs separately if needed via `yarn publish-docs`

## Known Operational Risks

Visible from the current scripts/workflows:

- docs publishing uses force checkout/reset behavior
- npm publishing depends on correct npm scope authentication or trusted publisher configuration
- npm package publishing and desktop release versioning are separate workflows and must be kept intentionally aligned
- app release depends on sidecar and Tauri packaging staying aligned
- build/test coverage is not symmetrical across all packages

## Practical Refactor Guidance

- Keep root build order aligned with runtime/package dependencies.
- If moving or renaming packages, update root scripts, CI workflows, and publish scripts together.
- If changing app-executor packaging, update both Tauri config and release/build assumptions.
- If changing app execution/session code, manual verification should cover both Browser executor mode and Node executor mode in the desktop app, plus at least one multi-consumer path that listens to executor events while the main graph execution UI is mounted.
- Treat docs publish and package publish scripts as operational code that deserves review, not just maintenance glue.
