# Current High-Severity Problems in Rivet

This report is based on:

- the maintainer docs in `developer-docs/`
- the completed refactor history in `past-refactors.md`
- direct inspection of the current app, executor, core, and CLI code

I focused on the problems that are most likely to hurt the project before new features are added: security risks, architectural traps, hidden coupling, unnecessary complexity, correctness bottlenecks, and operational hazards.

I am intentionally not repeating refactors that were already completed unless the underlying problem is still materially present.

## 1. The desktop app still has an extremely wide native trust boundary

**Why this is serious**

The Tauri app is running with a very broad native capability surface. That means any compromised frontend code, plugin code, or unexpected execution path has unusually strong local-machine access.

**Evidence**

- `packages/app/src-tauri/tauri.conf.json`
- `fs.all` is `true`
- filesystem `scope` includes effectively everything, including `"**"`, `"**/*"`, and `"/**/*"`
- `shell.execute` is enabled
- shell scope allows `npm`, `git`, and bundled `pnpm`
- `security.csp` is `null`

**Why this matters architecturally**

A lot of the repo is about making the app more platform-neutral and capability-based, but the packaged desktop app still grants a very broad set of powers at the Tauri boundary. That undercuts the value of those abstractions because the real security posture is still “the UI process can do almost anything.”

**What to fix later**

- reduce filesystem scope to the smallest required paths
- remove `shell.execute` for general tools unless absolutely necessary
- restore a meaningful CSP
- treat the app as a privileged host and make that privilege explicit and narrow

## 2. Package plugin loading is effectively a remote code execution and supply-chain execution pipeline

**Why this is serious**

The plugin system is not just loading trusted local extensions. It downloads tarballs from npm, extracts them, optionally installs dependencies, reads plugin entry files as text, converts them to base64 data URLs, and then executes them inside the desktop app.

That is a very large trust boundary with almost no hard security controls.

**Evidence**

- `packages/app/src/hooks/useLoadPackagePlugin.ts`
- fetches package metadata from `https://registry.npmjs.org/...`
- downloads the package tarball
- extracts it via a native command
- runs `pnpm install --prod --ignore-scripts`
- reads the plugin `main` file into memory
- imports it via `data:application/javascript;base64,...`
- `packages/app/src/hooks/useProjectPlugins.ts`
- URI plugins are imported dynamically and initialized with the full `Rivet` API namespace
- `packages/app-executor/bin/executor.mts`
- sidecar also dynamically imports URI and package plugins at runtime

**Why this matters architecturally**

The plugin model spans frontend, Tauri, sidecar, package installation, and registry rebuilding. That means one risky feature crosses almost every major boundary in the repo. It is also the clearest place where “extensibility” turns into “execute arbitrary third-party code with broad local privileges.”

**What to fix later**

- define a trust model for plugins
- add signing, pinning, or explicit trust prompts
- strongly separate “development plugin loading” from “install arbitrary package into the app”
- avoid data-URL execution where possible
- audit what plugin code can access in both app and executor contexts

## 3. The debugger / executor WebSocket protocol is unauthenticated and highly privileged

**Why this is serious**

The debugger transport can upload projects and settings, run graphs, preload data, pause, resume, abort, and answer user-input prompts. In the sidecar path, graph upload is explicitly enabled.

There is no authentication, authorization, or origin verification in the server implementation.

**Evidence**

- `packages/node/src/debugger.ts`
- `new WebSocketServer({ port, host })` with no auth/origin checks
- message handlers accept `run`, `set-dynamic-data`, `preload`, `pause`, `resume`, `abort`, `user-input`
- uploaded project/settings are stored in process-global `currentDebuggerState`
- `packages/app-executor/bin/executor.mts`
- starts debugger server with `allowGraphUpload: true`
- default sidecar port is `21889`
- `packages/app/src/hooks/executorSession.ts`
- internal executor URL is `ws://localhost:21889/internal`

**Why this matters architecturally**

This transport is not just a debug helper anymore. It is a privileged execution control plane. Right now it behaves more like a trusted local backchannel than a hardened boundary, but the repo increasingly depends on it as a core runtime surface.

**What to fix later**

- require authentication or a session secret
- narrow the accepted message surface
- isolate per-client state instead of global `currentDebuggerState`
- make “debug protocol” and “production execution protocol” separate concepts if needed

## 4. `rivet serve` exposes powerful graph execution over HTTP with no auth or guardrails

**Why this is serious**

The CLI’s server mode is a thin HTTP wrapper around graph execution. That is convenient, but it currently has almost no safety controls in the implementation.

**Evidence**

- `packages/cli/src/commands/serve.ts`
- defines `POST /` to run a graph
- optional `POST /:graphId` when graph ID routing is enabled
- accepts raw request bodies and parses JSON directly
- no authentication
- no authorization
- no request-size limit
- no rate limiting
- no concurrency guard
- optional SSE streaming keeps long-lived execution streams open

**Why this matters architecturally**

The docs correctly describe CLI serve as a thin wrapper over the Node runtime. That is exactly the problem: it exposes the execution engine almost directly, but without the usual service-layer protections you would expect on a serious execution API.

**What to fix later**

- add an explicit auth model before treating this as a real service surface
- add body size limits, timeouts, and rate limits
- make localhost-only / development-only behavior explicit
- separate “dev serve” from “deployable serve” if both use cases matter

