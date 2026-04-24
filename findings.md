# Current Codebase Findings

This document captures the reassessed high-impact findings from the current codebase audit. It separates confirmed issues from downgraded risks so future work can prioritize the problems that are most likely to affect security, correctness, or maintainability.

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

## Downgraded Findings


### 3. GraphProcessor Tokenizer Error Listener Lifecycle

**Severity:** P2 API lifecycle risk

`packages/core/src/model/GraphProcessor.ts` attaches a tokenizer `error` listener during each graph run. The `Tokenizer` interface exposes `on(...)` but not `off(...)`, so a reused tokenizer can accumulate listeners across repeated runs.

This is lower risk than initially ranked because common execution paths create a fresh tokenizer per run. The issue becomes more relevant for callers that provide and reuse a custom tokenizer instance.

Recommended direction:

- Extend the tokenizer interface with an unsubscribe contract, or have `on(...)` return a cleanup callback.
- Register the listener with cleanup in `GraphProcessor`.
- Add a regression test that reuses a tokenizer across multiple `processGraph()` calls and verifies one emitted tokenizer error becomes one processor error event.

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
