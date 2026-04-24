# Current Codebase Findings

This document captures the reassessed high-impact findings from the current codebase audit. It separates confirmed issues, resolved issues, and systemic risks so future work can prioritize the problems that are most likely to affect security, correctness, or maintainability.

## Confirmed Findings

### 1. MCP Stdio Server Config Is Logged and Env Is Not Passed

**Severity:** P1 security/correctness issue

`packages/node/src/native/NodeMCPProvider.ts` logs the full `serverConfig` before creating the stdio MCP transport.

The MCP server config type includes:

```ts
env?: Record<string, string>;
```

That means API keys or other secrets configured for MCP servers can be written to logs.

The same code path creates `StdioClientTransport` with only `command` and `args`, so the configured `env` appears to be ignored by the child process while still being exposed in logs.

Recommended direction:

- Remove the unconditional `console.log(serverConfig)`.
- Pass supported environment configuration into `StdioClientTransport` if the SDK supports it.
- If diagnostics are needed, log only redacted, non-secret fields such as server id, command name, and arg count.

## Resolved Findings

### GraphProcessor Tokenizer Error Listener Lifecycle

**Former severity:** P2 API lifecycle risk

**Status:** Fixed

Before the fix, `packages/core/src/model/GraphProcessor.ts` attached a tokenizer `error` listener every time `processGraph(...)` initialized a run:

```ts
this.#context.tokenizer.on('error', (error) => {
  emitDetached(this.#emitter, 'error', { error });
});
```

That listener was never removed. The `Tokenizer` interface only exposed:

```ts
on(event: 'error', listener: (err: Error) => void): void;
```

so `GraphProcessor` had no cleanup contract to call. The built-in `GptTokenizerTokenizer` wrapped `Emittery`, whose `on(...)` does return an unsubscribe callback, but `GptTokenizerTokenizer.on(...)` discarded that callback and also returned `void`. `FallbackTokenizer` in `packages/node/src/api.ts` was a no-op, so it did not leak, but any real/custom reusable tokenizer could.

Confirmed behavior:

- Reusing one `GraphProcessor` with the same `context.tokenizer` across two `processGraph(...)` calls attaches two tokenizer listeners.
- A single later tokenizer `error` emission becomes two processor `error` events.
- A one-off reproduction with a custom counting tokenizer produced:

```json
{ "tokenizerListeners": 2, "errorEvents": 2 }
```

Original exposure:

- The normal desktop local-run path in `packages/app/src/hooks/useLocalExecutor.ts` creates a fresh `GptTokenizerTokenizer` for each run, so that path is mostly protected.
- `coreCreateProcessor(...)` and `packages/node/src/api.ts` create a fresh tokenizer per `run()` only when no `options.tokenizer` is supplied.
- If a caller supplies `options.tokenizer`, that same tokenizer instance is reused by the returned `run()` closure, so repeated `run()` calls accumulate listeners.
- Direct `GraphProcessor` users can hit the same issue by passing the same `ProcessContext` or tokenizer instance to repeated `processGraph(...)` calls.
- Subprocessors receive the same `context.tokenizer`, so subgraph runs also attach listeners to the shared tokenizer. `wireSubprocessorEvents(...)` does not forward the generic `error` event, so stale subprocessor listeners are more of a retention/noise risk than a clearly duplicated parent-visible error path.

Impact before fix:

- Duplicate processor `error` events could appear for one tokenizer failure in reusable public API scenarios.
- Old listener closures could retain old `GraphProcessor` emitters longer than needed.
- The issue was unlikely to corrupt graph outputs because tokenizer errors are emitted as side-channel processor `error` events; token-counting functions usually continue by returning `0` after tokenizer conversion failure.
- The bug was worth fixing because programmatic execution is a priority and reusable processor/tokenizer usage is a legitimate API shape.

Implemented fix:

- `Tokenizer.on(...)` now allows returning an unsubscribe callback while preserving compatibility with legacy custom tokenizers that still return `void`.
- `GptTokenizerTokenizer.on(...)` returns the underlying `Emittery` unsubscribe callback.
- The Node `FallbackTokenizer` returns a no-op unsubscribe callback.
- `GraphProcessor` stores the unsubscribe callback from `context.tokenizer.on('error', ...)` when one is returned and calls it from the `processGraph(...)` `finally` path.
- The overlapping-run guard stays outside the cleanup `try/finally`, so a rejected second run cannot remove the active run's tokenizer listener or emit a premature `finish`.
- Tokenizer cleanup is best-effort: if a custom unsubscribe callback throws, the processor reports that as a generic `error` event instead of failing the graph result.
- Regression coverage verifies cleanup after repeated root runs, rejected overlapping runs, cleanup callback failures, and subgraph runs.

Remaining caveat:

- Legacy custom tokenizers that return `void` still compile and run, but `GraphProcessor` cannot remove listeners they do not expose. Custom tokenizer authors should return an unsubscribe callback from `on(...)`.

## Resolved Maintainability Findings

### App Imports Core Internals Directly

**Former severity:** P2 maintainability issue

**Status:** Fixed

Before the fix, `packages/app/src` still imported files from `packages/core/src/...` directly instead of going through the `@ironclad/rivet-core` package surface.

Evidence from the pre-fix app source:

- `packages/app/src` has 315 `@ironclad/rivet-core` import occurrences.
- It also has 46 direct `core/src` import occurrences.
- 43 of those direct imports are in runtime app files; 3 are test-only.
- The direct imports appear in 41 files total, 38 runtime files.

This means the issue is real but not as broad as "the app ignores the core package." Most app code already uses the package import. The remaining problem is a smaller set of deep imports that blur the package boundary.

Current direct-import clusters:

| Direct core source area | Import count | Runtime count | Notes |
| --- | ---: | ---: | --- |
| `utils/typeSafety` | 19 | 19 | Used for `entries`, `values`, and similar small object helpers. These are convenience helpers, not obviously core-domain APIs. |
| `model/PluginLoadSpec` | 5 | 5 | Already exported from `@ironclad/rivet-core`; these direct imports are unnecessary. |
| `utils/symbols.js` | 5 | 2 | Used for `WarningsPort` in output-copy/read helpers and tests. This is a real cross-package contract today, but it is not publicly documented as one. |
| `integrations/GptTokenizerTokenizer` | 3 | 3 | Already exported from `@ironclad/rivet-core`; these direct imports are unnecessary. |
| `plugins/gentrace/plugin` | 2 | 2 | App UI calls `runGentraceTests`, `runRemoteGentraceTests`, and pipeline lookup helpers that are not exported through the top-level plugin surface. |
| `utils/interpolation.js` | 2 | 2 | Used by app-side parsed-source previews to match core interpolation behavior. This is a legitimate shared-semantics need, but currently it is not a declared public helper surface. |
| `utils/defaults` | 2 | 2 | Already exported through `utils/index.ts`; direct imports are unnecessary. |
| `model/nodes/ChatNodeBase` | 2 | 2 | Already exported through `model/Nodes.ts`; direct imports are unnecessary. |
| `core/src/index.js` | 2 | 2 | These should use `@ironclad/rivet-core` directly. |
| `model/nodes/ExpressionNode.js` | 1 | 1 | Already exported through `model/Nodes.ts`; direct import is unnecessary. |
| `model/nodes/jsListCallbackHelpers.js` | 1 | 1 | Used to keep JS Filter/Map parsed-source preview aligned with runtime interpolation; not currently public. |
| `model/RivetUIContext` | 1 | 1 | UI context type lives in core but is not exported from the top-level package. The app's need for it is expected, but the import path is not declared public. |
| `model/ProjectReferenceLoader` | 1 | 1 | App implements a Tauri loader for this core interface, but the interface is not exported from the top-level package. |

Assumptions tested:

- `packages/core/package.json` exports only the package root `"."`. There are no supported subpath exports for `@ironclad/rivet-core/...`, so direct `packages/core/src/...` imports are outside the package API.
- `packages/core/src/index.ts` re-exports `exports.ts`, and `exports.ts` already exposes several things that the app currently imports directly, including `PluginLoadSpec`, `GptTokenizerTokenizer`, defaults, and node exports through `Nodes.ts`.
- `packages/app/vite.config.ts` aliases `@ironclad/rivet-core` to `../core/src/index.ts`, so switching direct imports to `@ironclad/rivet-core` does not force app development to consume stale built `dist` output. It still points at live core source in the monorepo.
- The pre-fix lint config enforced duplicate imports and cycles but did not forbid downstream package-to-core source imports. There was no guard preventing new direct `core/src` imports from being added.

What this is not:

- It is not currently a proven runtime bug.
- It is not currently evidence of duplicate bundled core copies; the app Vite alias means the public package import also resolves to core source during app builds.
- It is not a reason to add broad `@ironclad/rivet-core/src/...` subpath exports. That would make internals official instead of fixing the boundary.

Actual risk:

- Core files can be moved or refactored while the top-level package API remains stable, and the app can still break because it imports file-layout internals directly.
- It is unclear which helpers are intended package contracts versus accidental shared implementation details.
- Some UI presentation code depends on runtime helper internals to keep parsed-source previews aligned with execution behavior. That is a valid product need, but it should be represented by an intentional API.
- The package boundary is not mechanically enforced, so future refactors can silently add more direct imports.

Implemented fix:

- `packages/app/src` now has zero direct `core/src` imports.
- The same boundary cleanup was applied to adjacent downstream package source in `packages/node/src` and `packages/trivet/src`, which had one direct core-source import each for symbols that are now available through `@ironclad/rivet-core`.
- Imports that already had public equivalents were switched to `@ironclad/rivet-core`, including plugin load specs, tokenizer implementation, defaults, `ChatNodeBase` helpers, `Expression` helpers, and direct `core/src/index.js` imports.
- Small object iteration helpers from `utils/typeSafety` were moved to an app-owned helper at `packages/app/src/utils/typeSafety.ts`, avoiding a broad public core export for generic app convenience code.
- Real app/core shared contracts are now exported intentionally from core:
  - `RivetUIContext`
  - `ProjectReferenceLoader`
  - interpolation token helpers
  - warning-port helpers
  - JS list callback helpers used by parsed-source rendering
  - Gentrace app-facing helpers
- the shared root ESLint config now rejects new `**/core/src/**` imports and tells contributors to import through `@ironclad/rivet-core` or promote a shared contract intentionally.

Current boundary rule:

- Downstream package code imports core through `@ironclad/rivet-core`.
- App-only presentation/convenience helpers live in the app package.
- If app code needs behavior that must exactly match runtime core behavior, core must export a deliberate helper from the public package surface first.
- Generated bundles can still contain `../core/src/...` module labels because the bundler records source module paths; those are build artifacts, not source-level imports.
