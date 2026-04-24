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

## Systemic Maintainability Risk

### App Imports Core Internals Directly

**Severity:** P2 maintainability issue

`packages/app/src` still imports many files from `core/src/...` directly instead of using the `@ironclad/rivet-core` public package surface. Recent examples include interpolation, expression/list output helpers, type-safety helpers, settings defaults, plugin models, tokenizer internals, and symbols.

This makes package boundaries blurry and can create fragile coupling between app internals and core file layout.

Recommended direction:

- Decide which helpers are intentionally public and export them from core.
- Move app-only helpers into the app package when they are presentation-only.
- Prefer package imports over relative `core/src/...` imports.
- Add a lightweight lint or grep check once the intended boundary is cleaned up.
