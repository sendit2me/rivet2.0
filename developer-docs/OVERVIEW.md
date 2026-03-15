# Rivet Developer Documentation - Architecture Overview

> Internal developer documentation for understanding and refactoring Rivet.
> Created to support the new maintainer transition.

## What Is Rivet?

Rivet is a **visual IDE for creating complex AI agents and prompt chains**. It provides:

1. A **desktop application** (Tauri + React) with a node-based graph editor
2. A **core TypeScript library** (`@ironclad/rivet-core`) that powers graph execution
3. A **Node.js library** (`@ironclad/rivet-node`) for embedding Rivet graphs in applications
4. A **CLI** (`@ironclad/rivet-cli`) for running and serving graphs from the command line
5. A **plugin system** for extending node types and integrations
6. A **testing framework** (`@ironclad/trivet`) for validating AI agent behavior

## Monorepo Structure

```
rivet/
├── packages/
│   ├── core/           # @ironclad/rivet-core - Execution engine, node types, type system
│   ├── app/            # @ironclad/rivet-app - Desktop application (Tauri + React + Vite)
│   ├── app-executor/   # @ironclad/rivet-app-executor - Node.js sidecar for the app
│   ├── node/           # @ironclad/rivet-node - Node.js integration library
│   ├── cli/            # @ironclad/rivet-cli - Command-line interface
│   ├── trivet/         # @ironclad/trivet - Test runner for Rivet graphs
│   ├── community/      # Community template sharing
│   └── docs/           # Docusaurus documentation website
├── examples/           # Example projects (RPG chat-loop demo)
├── developer-docs/     # THIS FOLDER - internal developer documentation
├── package.json        # Root workspace config (Yarn 4 PnP)
├── tsconfig.base.json  # Shared TypeScript config
└── eslint.config.mjs   # Shared ESLint config (v9 flat config)
```

## Package Dependency Graph

```
                    ┌──────────────┐
                    │   rivet-core │  (no workspace deps)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐    │     ┌──────▼──────┐
       │  rivet-node  │    │     │  app-executor│
       │  (core)      │    │     │  (core)      │
       └──────┬───────┘    │     └──────────────┘
              │            │
       ┌──────▼──────┐    │
       │  rivet-cli   │    │
       │  (node)      │    │
       └─────────────┘    │
                          │
                   ┌──────▼──────┐
                   │  rivet-app   │
                   │  (core)      │
                   └──────┬───────┘
                          │ spawns
                   ┌──────▼──────┐
                   │ app-executor │
                   │ (sidecar)    │
                   └─────────────┘
```

**Key relationships:**
- `core` has **zero** workspace dependencies - it's the foundation
- `node` wraps `core` with Node.js-specific APIs (file loading, debugger server, MCP support)
- `cli` depends on `node` (and transitively `core`)
- `app` depends on `core` directly for browser-based execution
- `app-executor` is a **sidecar process** spawned by `app` for Node.js-based execution
- `trivet` depends on `core` for graph execution during testing

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Build System** | Yarn 4 (PnP) | Workspaces, zero-install |
| **Language** | TypeScript 5.7 | Strict mode, ESM |
| **Bundler** | Vite 6 (app), esbuild/rollup (libs) | Fast dev server |
| **Desktop Shell** | Tauri 1.8 (Rust) | Lightweight alternative to Electron |
| **Frontend** | React 18 | SPA with Emotion CSS-in-JS |
| **State** | Jotai 2 | Atom-based reactive state |
| **UI Kit** | Atlaskit | Enterprise design system |
| **Graph Editor** | Custom (Canvas + SVG) | DnD via @dnd-kit |
| **Code Editor** | Monaco Editor | Embedded in Code nodes |
| **LLM SDKs** | OpenAI, Anthropic | Direct API integration |
| **Node Runtime** | Node.js 20 | Via Volta version management |
| **CI/CD** | GitHub Actions | Multi-platform builds |

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Desktop App (Tauri)                │
│  ┌───────────────────────────────────────────────┐  │
│  │              React Frontend (Vite)             │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │  Graph   │ │  State   │ │   Settings    │  │  │
│  │  │  Editor  │ │  (Jotai) │ │   & Config    │  │  │
│  │  └────┬─────┘ └─────┬────┘ └───────────────┘  │  │
│  │       │              │                         │  │
│  │  ┌────▼──────────────▼────┐                    │  │
│  │  │    GraphProcessor      │ ← Browser executor │  │
│  │  │    (rivet-core)        │                    │  │
│  │  └────────────────────────┘                    │  │
│  └───────────────────────────────────────────────┘  │
│                      │ WebSocket                     │
│  ┌───────────────────▼───────────────────────────┐  │
│  │          app-executor (Node.js sidecar)        │  │
│  │    GraphProcessor + full Node.js APIs          │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │           Tauri Rust Backend                   │  │
│  │    File dialogs, env vars, plugin extraction   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              Embeddable Runtime                      │
│  ┌───────────────────────────────────────────────┐  │
│  │   Your Node.js App                             │  │
│  │   const { runGraphInFile } = rivetNode;        │  │
│  │   const result = await runGraphInFile(          │  │
│  │     'project.rivet-project',                   │  │
│  │     { graph: 'Main', inputs: { ... } }         │  │
│  │   );                                           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Dual Execution Model

The app supports two execution backends:

### Browser Executor (Default)
- Runs `GraphProcessor` directly in the browser main thread
- Fast startup, no extra processes
- Limited: no file system access, no shell commands, no native modules
- Good for quick prototyping and simple graphs

### Node.js Executor (Sidecar)
- Spawns `app-executor` as a Tauri sidecar process
- Communicates via WebSocket (`ws://localhost:21889/internal`)
- Full Node.js capabilities: file I/O, shell access, native modules
- Required for: Code nodes with Node APIs, plugin nodes needing system access
- Supports remote debugging from external processes

## File Formats

| Extension | Purpose | Format |
|-----------|---------|--------|
| `.rivet-project` | Project file | JSON (versioned serialization) |
| `.rivet-data` | Large dataset storage | JSON (sibling to project file) |
| `.rivet-graph` | Single graph export | JSON |
| `.rivet-recording` | Execution recording | JSON (for playback/debugging) |

Projects use versioned serialization (v1-v4) with backward compatibility.

## Documentation Index

| Document | Contents |
|----------|----------|
| [OVERVIEW.md](./OVERVIEW.md) | This file - high-level architecture |
| [CORE-ENGINE.md](./CORE-ENGINE.md) | Execution engine, type system, node architecture |
| [APP-ARCHITECTURE.md](./APP-ARCHITECTURE.md) | Desktop app, graph editor, state management |
| [PLUGIN-SYSTEM.md](./PLUGIN-SYSTEM.md) | Plugin interfaces, loading, registration |
| [PACKAGES.md](./PACKAGES.md) | Detailed package reference |
| [BUILD-AND-CI.md](./BUILD-AND-CI.md) | Build system, CI/CD, release process |
