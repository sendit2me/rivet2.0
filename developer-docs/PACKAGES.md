# Package Reference

> Detailed package-by-package reference for the current monorepo.

## Build Order

The root `yarn build` script currently builds packages in this order:

1. `@rivet2/rivet-core`
2. `@rivet2/rivet-node`
3. `@rivet2/rivet-app-executor`
4. `@rivet2/trivet`
5. `@rivet2/rivet-app`
6. `@rivet2/rivet-cli`

That order is encoded directly in the root `package.json` and reflects actual runtime dependencies.

## `@rivet2/rivet-core` (`packages/core/`)

### Role

Shared runtime foundation for the entire repo.

### Package metadata

- Version: `2.0.0`
- Main: `dist/cjs/bundle.cjs`
- Module: `dist/esm/index.js`
- Types: `dist/types/index.d.ts`

### What it contains

- graph/project/node/data types
- `GraphProcessor` and extracted helpers (`NodeExecutionPlanner`, `SubprocessorBridge`, `SplitRunProcessor`)
- built-in nodes
- built-in plugins
- `RegistryAssembly` - centralized registry creation and plugin assembly
- serialization with shared V3/V4 helpers (`serializationHelpers.ts`)
- recording/playback support
- runtime integration contracts
- Vercel AI SDK provider adapters used by the user-facing `LLM Chat` node, including the OpenAI-compatible provider factory for Custom provider mode
- `emitDetached` - explicit fire-and-forget event emission helper
- `pQueueCompat` - CJS/ESM interop for p-queue
- shared runtime settings normalization through `resolveProcessSettings(...)`
- public execution helpers and streaming APIs

### Important downstream consumers

- app
- node
- app-executor
- trivet

## `@rivet2/rivet-node` (`packages/node/`)

### Role

Node-native runtime wrapper around core.

### Package metadata

- Version: `2.0.0`
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

## `@rivet2/rivet-app` (`packages/app/`)

### Role

Desktop IDE frontend plus Tauri app packaging layer.

### Package metadata

- Version: `2.0.0`
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

- downstream package source imports core through `@rivet2/rivet-core`, not by reaching into `packages/core/src/...`; the shared root ESLint config enforces that boundary with `no-restricted-imports`
- app-only convenience helpers, such as type-safe object iteration, live in the app package; shared behavior that must match core runtime semantics is exported intentionally by core first
- hosted/wrapper applications that mount Rivet's editor from a vendored `rivet/` folder should import directly from local source paths such as `../rivet/packages/app/src/host` and `../rivet/packages/app/src/host.css`, then render `RivetAppHost` instead of rendering `RivetApp` directly; that host shell owns QueryClient, provider context, executor-session context, async storage bootstrap, optional post-app bridge children, lifecycle callbacks, a stable imperative workspace-host handle through `onWorkspaceHostReady` / `RivetWorkspaceHostBridge` / `useRivetWorkspaceHost`, and optional hosted executor websocket configuration through `executor.internalExecutorUrl`
- `RivetAppHost` provider overrides are the supported hosted integration layer for IO, datasets, env vars, storage, and path policy behavior; wrappers should inject those providers instead of aliasing private globals or Tauri modules
- execution transport/session ownership is centralized under `src/hooks/executorSession.ts` and `src/hooks/useExecutorSession.ts`
- project/graph load-save-switch sequencing is centralized under `src/hooks/useWorkspaceTransitions.ts` and `src/utils/workspaceTransitions.ts`
- remembered editor-view persistence is handled app-side through `src/state/projectEditor.ts`, `src/hooks/useSyncCurrentProjectEditorState.ts`, and `src/hooks/useRestorePersistedWorkspace.ts` rather than through project-file serialization
- platform-specific capabilities are split under `src/utils/platform/*`; the old `nativeApp.ts` barrel has been removed so desktop integrations import only the capability they actually use
- because the app's Vite dev/build path resolves `@rivet2/rivet-core` to core source, browser-reachable provider dependencies that are imported by core Chat v2 code may also need visibility in `packages/app/package.json`; `@ai-sdk/openai-compatible` is intentionally listed in both core and app for that PnP/Vite source-resolution boundary
- the Tauri backend under `src-tauri/` also vendors the two small Tauri v1 plugin crates it depends on under `src-tauri/vendor/` to avoid current Cargo/git-workspace metadata breakage from the upstream plugins workspace template

### Version caveat

The desktop product version is also tracked in `packages/app/src-tauri/tauri.conf.json`, which currently reports `2.0`.

## `@rivet2/rivet-app-executor` (`packages/app-executor/`)

### Role

Node sidecar process used by the desktop app for Node-capable execution.

### Package metadata

- Version: `2.0.0`
- Bin: `./bin/executor-bundle.cjs`

### Main behavior

The sidecar:

- starts a debugger/WebSocket server
- binds to `127.0.0.1:21889` by default for the desktop internal sidecar, but accepts `--host <host>` / `RIVET_EXECUTOR_HOST` and `--port` / `RIVET_EXECUTOR_PORT` for hosted wrappers that need to expose the executor server from a container; custom ports must be valid TCP ports from `1` to `65535`
- accepts uploaded project/settings/static-data state
- uses `assembleRegistry()` from core's `RegistryAssembly.ts` to build a fresh registry for each graph run
- dynamically imports plugins through `importPluginInitializer()`, which handles CJS/ESM default-export interop
- runs graphs dynamically using `rivet-node` APIs
- injects a sidecar-only worker-backed `CodeRunner` so most Code-node JavaScript runs in a fresh Node worker thread instead of blocking unrelated node completion events on the sidecar's main event loop
- bridges permitted Code-node `console.*` calls from the worker/current-thread fallback into `codeConsole` WebSocket messages so the app can replay them in the renderer console for the active editor run
- supports preload, pause, resume, abort, and user-input messages
- supports run-from execution by accepting preload data and a `runFromNodeId`

The worker-backed runner is scoped to the app executor. `@rivet2/rivet-node`
programmatic callers still use `NodeCodeRunner` by default unless they pass a
custom `codeRunner`, and Code nodes that request the `Rivet` capability fall back
to current-thread execution inside the sidecar for compatibility.

Code-node `require()` resolution is intentionally configurable for hosted runtimes.
Both public `NodeCodeRunner` and the app-executor worker runner honor
`RIVET_CODE_RUNNER_REQUIRE_ROOT` and `RIVET_CODE_RUNNER_REQUIRE_ANCHOR`. By
default they resolve modules from the process working directory through the
synthetic `__rivet_node_code_runner__.cjs` anchor. Hosted wrappers can point the
root at a runtime-library directory instead of patching Rivet source.
Before a require-enabled or Rivet-capable Code node runs, the app-executor worker
runner also calls an optional global
`__RIVET_PREPARE_RUNTIME_LIBRARIES__(true)` hook when a hosted bootstrap layer
provides one. That keeps managed runtime-library sync outside Rivet core while
still giving hosted executors a stable "prepare, then resolve" seam.

### Build model

The executor source is ESM (`.mts`) but is bundled to CJS (`executor-bundle.cjs`) by esbuild so that `pkg` can statically analyze it for native binary compilation. A custom esbuild plugin inlines all `@rivet2/rivet-*` workspace packages from source.

### Architectural significance

This package is effectively the app's Node execution backend. It shares the same `assembleRegistry()` helper as the app for registry construction, keeping plugin/runtime assembly logic in one place.
It is paired with the app-side shared executor session rather than being managed independently by each remote execution hook consumer.

## `@rivet2/rivet-cli` (`packages/cli/`)

### Role

Operational CLI for running or serving Rivet graphs.

### Package metadata

- Version: `2.0.0`
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

## `@rivet2/trivet` (`packages/trivet/`)

### Role

Graph-oriented testing package.

### Package metadata

- Version: `2.0.0`
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

- Version: `2.0.0`
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
