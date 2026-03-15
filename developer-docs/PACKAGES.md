# Packages Reference

> Detailed reference for each package in the Rivet monorepo.

## `@ironclad/rivet-core` (`packages/core/`)

**The foundation.** Zero workspace dependencies. Runs in both browser and Node.js.

| Aspect | Details |
|--------|---------|
| **Version** | 1.26.0 (npm), package.json matches |
| **Entry (ESM)** | `dist/esm/index.js` |
| **Entry (CJS)** | `dist/cjs/bundle.cjs` |
| **Types** | `dist/esm/index.d.ts` |
| **Build** | Rollup (ESM) + esbuild (CJS) |
| **Test** | Vitest |
| **Size** | Largest package (84 node implementations) |

**Contains:**
- Type system (`DataValue`, `DataType`)
- Graph model (`Project`, `NodeGraph`, `ChartNode`, `NodeConnection`)
- Execution engine (`GraphProcessor`)
- All 84 built-in node types
- Plugin interface (`RivetPlugin`, `PluginNodeDefinition`)
- Node registration system (`NodeRegistration`, `globalRivetNodeRegistry`)
- Serialization (v1-v4)
- Integration interfaces (`LLMProvider`, `EmbeddingGenerator`, `VectorDatabase`, etc.)
- MCP (Model Context Protocol) support
- Streaming API (`getProcessorEvents`, `getProcessorSSEStream`)

**Key exports:**
```typescript
// Running graphs
export { coreCreateProcessor, coreRunGraph } from './api/createProcessor'
export { GraphProcessor } from './model/GraphProcessor'

// Types
export type { Project, NodeGraph, ChartNode, NodeConnection, DataValue, DataType }
export type { ProcessContext, InternalProcessContext, ProcessEvents }
export type { RivetPlugin, PluginNodeDefinition, PluginNodeImpl }
export type { RunGraphOptions, NodeRegistration }
```

**Dependencies (notable):**
- `openai` - OpenAI SDK for Chat nodes
- `@anthropic-ai/sdk` - Anthropic Claude
- `@assemblyai/lemur` - AssemblyAI
- `tiktoken` / `js-tiktoken` - Token counting
- `emittery` - Async event emitter
- `p-queue` - Promise queue for execution concurrency
- `nanoid` - ID generation
- `yaml` - YAML parsing
- `lodash-es` - Utility functions

---

## `@ironclad/rivet-node` (`packages/node/`)

**Node.js integration library.** Wraps `rivet-core` with Node.js-specific APIs.

| Aspect | Details |
|--------|---------|
| **Version** | 1.26.0 |
| **Entry** | `dist/index.js` (ESM) |
| **Build** | Rollup |
| **Dependencies** | `rivet-core` (workspace), `ws`, `emittery`, `@modelcontextprotocol/sdk`, `lodash-es`, `minimatch`, `nanoid`, `ts-pattern`, `type-fest` |

**Provides:**
```typescript
// High-level API
export function loadProjectFromFile(path: string): Promise<Project>
export function loadProjectFromString(content: string): Project
export function runGraphInFile(
  path: string,
  options: RunGraphOptions
): Promise<Record<string, DataValue>>
export function runGraph(
  project: Project,
  options: RunGraphOptions
): Promise<Record<string, DataValue>>
export function createProcessor(
  project: Project,
  options: RunGraphOptions
): { processor, run(), getEvents(), ... }

// Debugging
export class RivetDebuggerServer {
  constructor(options: { port?: number, ... })
  // WebSocket server for remote debugging from Rivet app
}

// MCP
export class NodeMCPProvider { ... }
// Model Context Protocol integration using @modelcontextprotocol/sdk

// Re-exports everything from rivet-core
export * from '@ironclad/rivet-core'
```

**Usage example:**
```typescript
import { runGraphInFile } from '@ironclad/rivet-node';

const result = await runGraphInFile('my-project.rivet-project', {
  graph: 'Main',
  inputs: { query: 'Hello, world!' },
  openAiKey: process.env.OPENAI_API_KEY,
});
```

---

## `@ironclad/rivet-app` (`packages/app/`)

**The desktop application.** See [APP-ARCHITECTURE.md](./APP-ARCHITECTURE.md) for details.

| Aspect | Details |
|--------|---------|
| **Version** | 1.1.0 (package.json) / 1.11.3 (Tauri productVersion) |
| **Framework** | React 18 + Vite 6 + Tauri 1.8 |
| **State** | Jotai 2 |
| **Styling** | Emotion CSS-in-JS |
| **UI Kit** | Atlaskit |

**Key scripts:**
```bash
yarn dev          # Start Vite dev server + Tauri
yarn build        # Production build
yarn start        # Vite dev server only (for dev without Tauri)
```

---

## `@ironclad/rivet-app-executor` (`packages/app-executor/`)

**Node.js sidecar process.** Spawned by the desktop app for Node.js-based execution.

| Aspect | Details |
|--------|---------|
| **Entry** | `bin/executor.mts` |
| **Build** | esbuild (single bundle) |
| **Dependencies** | `rivet-core` (workspace) |

**How it works:**
1. The Tauri app spawns this as a sidecar process
2. It starts a WebSocket server on port 21889
3. The app frontend connects and sends graph execution requests
4. The executor runs `GraphProcessor` with full Node.js capabilities
5. Execution events are streamed back to the app via WebSocket
6. Also acts as a `RivetDebuggerServer` for remote debugging

**Includes:** `tiktoken_bg.wasm` for token counting (bundled).

---

## `@ironclad/rivet-cli` (`packages/cli/`)

**Command-line interface.** Run and serve Rivet graphs from the terminal.

| Aspect | Details |
|--------|---------|
| **Version** | 1.26.0 |
| **Entry** | `dist/index.js` |
| **Binary** | `rivet` |
| **Dependencies** | `rivet-node` (workspace), `hono`, `@hono/node-server`, `yargs`, `chalk`, `dotenv`, `didyoumean2` |

**Commands:**
```bash
rivet run <project-file> [options]    # Execute a graph
  --graph <name>                      # Graph to run (default: main)
  --inputs <json>                     # Input values
  --input.<name> <value>              # Individual input

rivet serve <project-file> [options]  # Start HTTP server
  --port <port>                       # Listen port (default: 3000)
  --graph <name>                      # Default graph
```

**Server implementation:** Uses Hono (lightweight web framework) to expose graph
execution via HTTP endpoints. Supports SSE streaming for real-time execution events.

**Docker support:** Can be containerized for production deployment.
See `packages/docs/docs/cli/docker.md` for Dockerfile examples.

---

## `@ironclad/trivet` (`packages/trivet/`)

**Testing framework for Rivet graphs.** Validates that AI agents produce expected outputs.

| Aspect | Details |
|--------|---------|
| **Version** | 1.26.0 |
| **Build** | Rollup |
| **Dependencies** | `rivet-core` (workspace) |

**Concept:**
- **Test Suite**: A collection of test cases for a graph
- **Test Case**: Input values + expected output assertions
- **Validation Graph**: A separate Rivet graph that validates outputs
  (e.g., "does the output contain X?" or "is the output valid JSON?")

**API:**
```typescript
import { runTrivet } from '@ironclad/trivet';

const results = await runTrivet({
  project: loadedProject,
  testSuites: [...],
  onUpdate: (progress) => console.log(progress),
});
// Returns pass/fail status for each test case
```

**Integration:** The desktop app includes a Trivet overlay tab for running
tests visually with progress tracking.

---

## `packages/community/`

**Community template sharing.** Contains the API client and types for the Rivet
community template service (browsing, uploading, versioning templates).

Not published to npm. Used internally by the app.

---

## `packages/docs/`

**Documentation website.** Built with Docusaurus 2.

| Aspect | Details |
|--------|---------|
| **Framework** | Docusaurus 2 |
| **Deploy** | GitHub Pages (`docs` branch) |
| **URL** | https://rivet.ironcladapp.com/docs |

**Content structure:**
```
docs/
├── introduction.md          # Overview
├── getting-started/          # Installation, setup, first agent
├── user-guide/               # Interface, nodes, remote debugging
├── node-reference/           # Documentation for each node type
├── api-reference/
│   ├── core/                 # rivet-core API docs
│   └── node/                 # rivet-node API docs
├── cli/                      # CLI usage, serving, Docker
└── tutorial/                 # Step-by-step guides
```

**Build & publish:**
```bash
cd packages/docs
yarn build                    # Build static site
# Then: tsx publish-docs.mts  # Deploys to docs branch
```

## Package Build Order

The root `yarn build` script enforces this order:

```
1. rivet-core        # Foundation, no deps
2. rivet-node        # Depends on core
3. rivet-app-executor # Depends on core
4. trivet            # Depends on core
5. rivet-app         # Depends on core (+ spawns app-executor)
6. rivet-cli         # Depends on node
```

## Package Publishing

Published to npm via `tsx publish-packages.mts`:

```bash
tsx publish-packages.mts
# Publishes:
#   @ironclad/rivet-core
#   @ironclad/rivet-node
#   @ironclad/rivet-cli
#   @ironclad/trivet
# Requires npm OTP for security
# Also builds Docker image for CLI
```

Requirements:
- Clean git working tree
- Valid npm credentials
- OTP code for publish verification
