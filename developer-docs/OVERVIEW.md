# Rivet Developer Docs Overview

> Internal maintainer-facing documentation for the current monorepo.
> These docs are intended to support refactors, not just orientation.

## What This Repo Contains

Rivet is a monorepo organized around one shared graph runtime and several product surfaces built on top of it.

At a high level:

1. `@ironclad/rivet-core` defines the graph model, execution engine, built-in nodes, built-in plugins, serialization, and shared runtime contracts.
2. `@ironclad/rivet-app` is the Tauri/React desktop IDE.
3. `@ironclad/rivet-node` adapts core for Node environments.
4. `@ironclad/rivet-cli` exposes run/serve workflows on top of `rivet-node`.
5. `@ironclad/rivet-app-executor` is the Node sidecar used by the desktop app.
6. `@ironclad/trivet` provides graph-oriented testing utilities and serialization.
7. `packages/docs` is the Docusaurus documentation site.

## Workspace Layout

```text
packages/
  app/            Desktop app
  app-executor/   Node sidecar for the app
  cli/            CLI for running and serving graphs
  community/      Internal app/community package
  core/           Runtime engine, graph model, built-in nodes/plugins
  docs/           Docusaurus site
  node/           Node integration library
  trivet/         Test-runner package
developer-docs/   These internal docs
_.github/         CI workflows and release scripts
```

## Dependency Structure

The core dependency direction is intentionally simple:

```text
core
|- node
|  `- cli
|- app
|- app-executor
`- trivet
```

Important implications:

- `core` is the foundation and does not depend on other workspace packages.
- `node`, `app`, `app-executor`, and `trivet` all rely on `core` concepts and types.
- `cli` is not an independent runtime; it is a thin operational layer over `rivet-node`.
- the app uses both `core` directly and the sidecar protocol indirectly.

## Main Architectural Layers

### 1. Shared runtime layer

Owned by `packages/core`.

Contains:

- project and graph types
- data type system
- node registration and node execution
- built-in nodes
- built-in provider plugins
- serialization
- execution recording support
- public programmatic APIs

### 2. Desktop IDE layer

Owned by `packages/app` and `packages/app/src-tauri`.

Contains:

- graph editor UI
- project workspace UI
- local and sidecar execution orchestration
- plugin installation/loading UX
- Trivet integration
- prompt-designer integration
- updater/debugger/community/data overlays
- Tauri-native bridging

### 3. Node runtime layer

Owned by `packages/node`.

Contains:

- file-based project loading
- Node-native execution defaults
- remote debugger server
- dataset/debugger/project-reference helpers
- re-exported core APIs

### 4. Operational surfaces

Owned by:

- `packages/cli`
- `packages/app-executor`
- `packages/trivet`
- `packages/docs`

These packages expose the runtime in different ways rather than redefining it.

## Execution Model

There are three execution contexts worth distinguishing:

### Browser execution

Used by the desktop app when `defaultExecutorState` is `browser`.

- runs `GraphProcessor` in-process inside the app
- uses browser/Tauri-facing adapters
- supports the editor's immediate local run flow
- run-from execution preloads dependency outputs in-process before re-entering `GraphProcessor`

### Sidecar Node execution

Used by the desktop app when `defaultExecutorState` is `nodejs`.

- the app starts or connects to `app-executor`
- communication happens over `ws://localhost:21889/internal`
- execution runs via the debugger/server protocol
- supports Node-specific APIs and plugin installation scenarios
- connection ownership is centralized in the app's shared `executorSession` layer rather than in `useRemoteExecutor` itself

### Standalone Node execution

Used by `rivet-node`, `rivet-cli`, and external Node consumers.

- runs `GraphProcessor` directly in Node
- uses Node-native providers like `NodeNativeApi`, `NodeCodeRunner`, and `NodeProjectReferenceLoader`
- can optionally attach a debugger server

## Cross-Cutting Concepts

### Global node registry

The repo relies heavily on a shared `globalRivetNodeRegistry` from core.

This registry is:

- pre-populated with built-in nodes
- mutated when plugins are registered
- reset and rebuilt in some app/plugin-loading flows

That makes registry state one of the key global couplings in the repo.

### Project serialization

Serialization is versioned in `packages/core/src/utils/serialization/`.

Current repo-visible serialized artifacts include:

- `.rivet-project`
- `.rivet-data`
- `.rivet-recording`

### Attached/test/static data split

Several parts of the system intentionally keep large or auxiliary data outside the central graph structures:

- static project data can live separately from `projectState`
- app state stores Trivet and runtime context separately
- recording and debugger flows serialize execution data separately

This split shows up repeatedly in app save/load code and should be treated as architectural, not incidental.

## Current Refactor Hotspots

Based on the current code, the highest-risk/highest-value refactor areas are:

- `packages/app/src/components/NodeCanvas.tsx` and related canvas hooks
- `packages/app/src/hooks/useGraphExecutor.ts`, `useLocalExecutor.ts`, `useRemoteExecutor.ts`, and `executorSession.ts`
- `packages/app/src/hooks/useProjectPlugins.ts`
- `packages/app/src/hooks/useWorkspaceTransitions.ts` and `packages/app/src/utils/workspaceTransitions.ts`
- `packages/core/src/model/GraphProcessor.ts`, `NodeExecutionPlanner.ts`, and `SubprocessorBridge.ts`
- `packages/core/src/model/SplitRunProcessor.ts`
- `packages/core/src/model/NodeRegistration.ts`
- serialization contracts in `packages/core/src/utils/serialization/`
- debugger/server protocol surfaces between app, app-executor, and node

## How To Use These Docs

Recommended reading order:

1. [APP-ARCHITECTURE.md](./APP-ARCHITECTURE.md) for desktop IDE structure and state flows
2. [CORE-ENGINE.md](./CORE-ENGINE.md) for the runtime model and execution engine
3. [PLUGIN-SYSTEM.md](./PLUGIN-SYSTEM.md) for node/plugin registration and loading behavior
4. [PACKAGES.md](./PACKAGES.md) for package-by-package operational detail
5. [BUILD-AND-CI.md](./BUILD-AND-CI.md) for build, release, and publish workflows

When planning refactors, treat these docs as a map of current seams and constraints, not a guarantee that every area is cleanly isolated.
