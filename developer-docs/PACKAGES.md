# Package Reference

> Detailed package-by-package reference for the current monorepo.

## Build Order

The root `yarn build` script currently builds packages in this order:

1. `@ironclad/rivet-core`
2. `@ironclad/rivet-node`
3. `@ironclad/rivet-app-executor`
4. `@ironclad/trivet`
5. `@ironclad/rivet-app`
6. `@ironclad/rivet-cli`

That order is encoded directly in the root `package.json` and reflects actual runtime dependencies.

## `@ironclad/rivet-core` (`packages/core/`)

### Role

Shared runtime foundation for the entire repo.

### Package metadata

- Version: `1.26.0`
- Main: `dist/cjs/bundle.cjs`
- Module: `dist/esm/index.js`
- Types: `dist/types/index.d.ts`

### What it contains

- graph/project/node/data types
- `GraphProcessor` and extracted helpers (`NodeExecutionPlanner`, `SubprocessorBridge`, `SplitRunProcessor`)
- built-in nodes
- built-in plugins
- `RegistryAssembly` — centralized registry creation and plugin assembly
- serialization with shared V3/V4 helpers (`serializationHelpers.ts`)
- recording/playback support
- runtime integration contracts
- `emitDetached` — explicit fire-and-forget event emission helper
- `pQueueCompat` — CJS/ESM interop for p-queue
- shared runtime settings normalization through `resolveProcessSettings(...)`
- public execution helpers and streaming APIs

### Important downstream consumers

- app
- node
- app-executor
- trivet

## `@ironclad/rivet-node` (`packages/node/`)

### Role

Node-native runtime wrapper around core.

### Package metadata

- Version: `1.26.0`
- Main: `dist/cjs/bundle.cjs`
- Module: `dist/esm/index.js`
- Types: `dist/types/index.d.ts`

### Main exports

From `src/index.ts` and related files:

- re-exports of all core exports
- Node native API types and helpers
- `loadProjectFromFile(...)`
- `loadProjectAndAttachedDataFromFile(...)`
- `runGraphInFile(...)`
- `runGraph(...)`
- `createProcessor(...)`
- debugger server APIs
- dataset/debugger/project-reference helpers

### Architectural role

This package is the shared Node runtime used by:

- external consumers
- the CLI
- parts of the app-executor stack

It is not just a convenience wrapper. It sets Node-default providers, debugger integration, env-based plugin config fallback, and Node-specific reference loading. Runtime settings still flow through core's shared `resolveProcessSettings(...)` helper instead of being rebuilt independently in the Node package.
It also supplies a default tokenizer for Node-side runs when the caller does not provide one explicitly.

## `@ironclad/rivet-app` (`packages/app/`)

### Role

Desktop IDE frontend plus Tauri app packaging layer.

### Package metadata

- Version: `1.1.0`
- Private: yes

### Runtime shape

- React/Vite frontend under `src/`
- Tauri/Rust backend under `src-tauri/`

### Important responsibilities

- graph editor
- project workspace UX
- local and sidecar execution
- plugin loading/install UI
- prompt designer
- Trivet UI
- debugger/community/data/update overlays

### Important current boundaries

- execution transport/session ownership is centralized under `src/hooks/executorSession.ts` and `src/hooks/useExecutorSession.ts`
- project/graph load-save-switch sequencing is centralized under `src/hooks/useWorkspaceTransitions.ts` and `src/utils/workspaceTransitions.ts`
- remembered editor-view persistence is handled app-side through `src/state/projectEditor.ts`, `src/hooks/useSyncCurrentProjectEditorState.ts`, and `src/hooks/useRestorePersistedWorkspace.ts` rather than through project-file serialization
- platform-specific capabilities are split under `src/utils/platform/*`; the old `nativeApp.ts` barrel has been removed so desktop integrations import only the capability they actually use
- the Tauri backend under `src-tauri/` also vendors the two small Tauri v1 plugin crates it depends on under `src-tauri/vendor/` to avoid current Cargo/git-workspace metadata breakage from the upstream plugins workspace template

### Version caveat

The desktop product version is also tracked in `packages/app/src-tauri/tauri.conf.json`, which currently reports `1.11.3`.

## `@ironclad/rivet-app-executor` (`packages/app-executor/`)

### Role

Node sidecar process used by the desktop app for Node-capable execution.

### Package metadata

- Version: `1.0.1`
- Bin: `./bin/executor-bundle.cjs`

### Main behavior

The sidecar:

- starts a debugger/WebSocket server
- accepts uploaded project/settings/static-data state
- uses `assembleRegistry()` from core's `RegistryAssembly.ts` to build a fresh registry for each graph run
- dynamically imports plugins through `importPluginInitializer()`, which handles CJS/ESM default-export interop
- runs graphs dynamically using `rivet-node` APIs
- supports preload, pause, resume, abort, and user-input messages
- supports run-from execution by accepting preload data and a `runFromNodeId`

### Build model

The executor source is ESM (`.mts`) but is bundled to CJS (`executor-bundle.cjs`) by esbuild so that `pkg` can statically analyze it for native binary compilation. A custom esbuild plugin inlines all `@ironclad/rivet-*` workspace packages from source.

### Architectural significance

This package is effectively the app's Node execution backend. It shares the same `assembleRegistry()` helper as the app for registry construction, keeping plugin/runtime assembly logic in one place.
It is paired with the app-side shared executor session rather than being managed independently by each remote execution hook consumer.

## `@ironclad/rivet-cli` (`packages/cli/`)

### Role

Operational CLI for running or serving Rivet graphs.

### Package metadata

- Version: `1.26.0`
- Source entry: `src/cli.ts`
- Published bin mapping: `rivet -> bin/cli.js`
- Types: `dist/types/cli.d.ts`

### Commands

Current command families:

- `run <projectFile> [graphName]`
- `serve [projectFile]`

### `run` command behavior

Implemented in `src/commands/run.ts`.

Supports:

- graph selection by name/ID
- stdin JSON inputs
- repeated `--input key=value`
- repeated `--context key=value`
- optional cost suppression

Internally:

- resolves the project file
- loads the project through `rivet-node`
- builds a processor
- runs it
- prints JSON outputs

### `serve` command behavior

Implemented in `src/commands/serve.ts`.

Supports:

- Hono-based HTTP serving
- optional dev reload mode
- optional graph selection
- optional graph-by-path routing
- optional SSE streaming
- optional single-node streaming
- OpenAI-related option overrides

Architecturally, it is a thin HTTP wrapper around `rivet-node` processor creation and streaming helpers.

## `@ironclad/trivet` (`packages/trivet/`)

### Role

Graph-oriented testing package.

### Package metadata

- Version: `1.26.0`
- Main: `dist/cjs/bundle.cjs`
- Module: `dist/esm/index.js`
- Types: `dist/types/index.d.ts`

### What it contains

- test-suite/test-case/result types
- Trivet serialization
- `runTrivet(...)`
- `createTestGraphRunner(...)`
- validation helpers

### Runtime model

Trivet runs:

1. a test graph with case inputs
2. a validation graph against input/expected/output objects
3. boolean/truthy validation outputs to determine pass/fail

The app integrates this package directly for test UI and persistence.

`createTestGraphRunner(...)` also resolves runtime settings through core's shared `resolveProcessSettings(...)` helper, so Trivet inherits the same minimal runtime defaults as app and Node execution rather than carrying a separate settings shape.

## `packages/community/`

Internal package used by the app for community/template features.

Not published as a public npm package from this repo.

## `packages/docs/`

### Role

Docusaurus documentation site package.

### Package metadata

- Version: `1.0.0`
- Private: yes

### Script surface

- `yarn start`
- `yarn build`
- `yarn serve`
- `yarn typecheck`
- standard Docusaurus maintenance commands

### Publish model

Docs publishing is handled from the repo root by `publish-docs.mts`, not by package-local deploy automation.

## `publish-packages.mts`

Although not itself a package, this root script is part of the operational package story.

Current behavior:

- requires an OTP argument
- refuses to run on a dirty git tree
- verifies expected workspaces exist
- publishes `rivet-core`, `rivet-node`, `rivet-cli`, and `trivet`
- then runs Docker publishing for the CLI

## `publish-docs.mts`

Also operationally important.

Current behavior:

- requires a clean git tree
- builds docs
- copies the built site to a temp dir
- checks out the `docs` branch
- deletes tracked files except a small ignore list
- copies the built site into the branch
- commits `"Docs publish"`
- then force-checks out the previous branch and resets hard to `HEAD`

That script is functionally important but operationally risky. It assumes a clean tree and uses destructive git cleanup on exit.

## Package-Level Refactor Guidance

- Treat `core` as the compatibility center of gravity.
- Treat `node` as the Node-default runtime adapter, not just a re-export package.
- Treat `app-executor` as a runtime package, not a build artifact.
- Treat `cli` as an operational wrapper around `rivet-node` rather than an independent execution engine.
- Treat `trivet` as both a test runner and a persistence format owner for test data.
