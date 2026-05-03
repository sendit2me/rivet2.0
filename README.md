<h1 align="center"><img src="https://rivet.ironcladapp.com/img/logo-banner-wide.png" alt="Rivet Logo"></h1>

![License](https://img.shields.io/github/license/Ironclad/rivet)

# Rivet 2.0

Rivet is a visual IDE and runtime for building AI workflows, agents, prompt chains, graph-based tools, and reusable automation flows. This repository is the Rivet 2.0 monorepo: it contains the desktop app, graph runtime, Node runtime, CLI, app executor sidecar, Trivet test tooling, documentation site, and maintainer developer docs.

This checkout is also designed to be embedded by wrapper applications that vendor Rivet source in a local `rivet/` folder. Wrappers can import from local source paths and use the supported app-host seams without depending on stale public npm packages.

## Contents

- [What This Repo Contains](#what-this-repo-contains)
- [Getting Started](#getting-started)
- [Common Commands](#common-commands)
- [Execution Modes](#execution-modes)
- [Plugins](#plugins)
- [Embedding Rivet In A Wrapper](#embedding-rivet-in-a-wrapper)
- [Developer Releases](#developer-releases)
- [Documentation](#documentation)
- [License](#license)

## What This Repo Contains

Rivet 2.0 is organized as a Yarn workspace monorepo:

| Package | Purpose |
| --- | --- |
| `@ironclad/rivet-core` | Shared graph model, execution engine, built-in nodes, serialization, provider integrations, plugin assembly, and runtime contracts. |
| `@ironclad/rivet-app` | Tauri and React desktop IDE, graph editor, settings, plugins UI, debugger surfaces, prompt designer, chat viewer, data studio, and hosted app entrypoints. |
| `@ironclad/rivet-app-executor` | Node executor sidecar used by the app for Node-mode graph execution. |
| `@ironclad/rivet-node` | Node runtime adapter for loading and running Rivet projects programmatically. |
| `@ironclad/rivet-cli` | CLI commands for running and serving Rivet graphs. |
| `@ironclad/trivet` | Graph-oriented test utilities and test serialization. |
| `packages/docs` | Docusaurus documentation site. |

The repo also includes `developer-docs/`, which documents current architecture and integration contracts, and `refactor-history.md`, which consolidates historical refactor notes for future planning.

## Getting Started

### Prerequisites

- Node.js 20.4.x or a compatible Node 20 runtime.
- Yarn through the checked-in Yarn release (`packageManager` currently points at Yarn 4.6.0).
- Rust stable and the Tauri platform prerequisites if you are building desktop bundles.

### Install Dependencies

```powershell
yarn install --immutable
```

### Start The Desktop App In Development

```powershell
yarn dev
```

The root `dev` script starts the Rivet app workspace and opens the Vite/Tauri development flow used by the desktop IDE.

## Common Commands

```powershell
# Build all main workspaces in dependency order
yarn build

# Run workspace tests
yarn test

# Run workspace lint checks
yarn lint

# Build only the desktop app frontend/package
yarn workspace @ironclad/rivet-app run build

# Build local package artifacts for package-consumer checks
yarn build:packages:local
```

To create a Tauri desktop bundle locally:

```powershell
cd packages/app
yarn tauri build --verbose
```

## Execution Modes

Rivet supports several execution surfaces:

- Browser execution runs graphs in-process inside the app for lightweight local execution.
- Node execution uses `@ironclad/rivet-app-executor`, a websocket sidecar that runs graph work in Node.
- Programmatic Node execution uses `@ironclad/rivet-node` and the CLI without the desktop editor.
- Hosted editor execution lets wrappers provide an internal executor websocket URL instead of asking browser-hosted Rivet to start a Tauri sidecar.

The app executor defaults to a desktop-safe loopback websocket host, and hosted/containerized environments can override it with `RIVET_EXECUTOR_HOST`, `RIVET_EXECUTOR_PORT`, and `executor.internalExecutorUrl`. Code-node runtime-library resolution can be redirected with `RIVET_CODE_RUNNER_REQUIRE_ROOT`.

## Plugins

Rivet 2.0 treats plugin installation as app-level state:

- Installing a plugin makes its nodes available in the node picker for every project.
- A project records a plugin in its YAML only when a graph actually uses a node owned by that plugin.
- Removing all nodes from that plugin removes the plugin from the project's serialized plugin list.
- Opening a project that references plugins not installed in the app shows an explicit install-choice modal instead of silently installing them.

The YAML project format remains unchanged; the app derives the `plugins` list from graph contents when saving, running, and uploading project data.

## Embedding Rivet In A Wrapper

Wrapper apps that vendor this repository as a local `rivet/` folder should import from the vendored source tree they ship. For example:

```ts
import { RivetAppHost } from '../rivet/packages/app/src/host';
import '../rivet/packages/app/src/host.css';
```

`RivetAppHost` provides the app shell needed for embedding the full Rivet editor:

- React Query, providers, async storage bootstrap, and executor-session wiring.
- Hosted executor configuration through `executor.internalExecutorUrl`.
- First-class lifecycle callbacks such as project save/open notifications.
- Workspace host APIs for opening snapshots, opening path-backed projects, closing projects, moving project paths, and replacing the active project.
- Provider-only integration points for IO, datasets, environment variables, storage, path policies, and wrapper bridge components.

Wrappers should prefer these source-level seams over private editor internals. The npm package names describe the workspace boundaries, but a wrapper that ships a custom Rivet checkout should resolve those boundaries to its local `rivet/` source and build outputs.

## Developer Releases

This repo has a develop-branch Windows developer release workflow in `.github/workflows/developer-windows-release.yml`.

On pushes to `develop`, the workflow:

1. Installs dependencies with `yarn install --immutable`.
2. Builds the monorepo with `yarn build`.
3. Builds Windows MSI and NSIS installer bundles from `packages/app`.
4. Publishes a small GitHub Pages download page with the latest developer installers.

The developer release workflow intentionally builds installer artifacts only. It does not sign updater bundles and does not require Tauri updater private-key secrets. Production/tagged release workflows are separate.

## Documentation

Useful current docs:

- [Developer Docs Overview](developer-docs/OVERVIEW.md)
- [Package Boundaries](developer-docs/PACKAGES.md)
- [Build And CI](developer-docs/BUILD-AND-CI.md)
- [App Architecture](developer-docs/APP-ARCHITECTURE.md)
- [Plugin System](developer-docs/PLUGIN-SYSTEM.md)
- [Execution Data Flow](developer-docs/EXECUTION-DATA-FLOW.md)
- [Refactor History](refactor-history.md)

The public docs site lives in `packages/docs`.

## License

Rivet is licensed under the [MIT License](LICENSE).
