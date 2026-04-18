# Enforce Code Node Runtime Permissions in Both Executors

## Summary

Current state: the Code node runtime-permission toggles are **not** true enforcement today. The code runners only decide whether to pass `fetch`, `console`, `process`, `require`, and `Rivet` as function arguments. That means:
- direct access can still succeed through ambient globals in some environments,
- `fetch`, `console`, and likely `process` remain reachable when their toggles are off,
- browser-executed Code nodes currently run on the app’s main browser/global context, which is much broader than the permission model suggests.

Chosen direction:
- enforce permissions for both Node and browser execution,
- throw an explicit permission error when forbidden APIs are accessed,
- use **strict browser isolation**, even though that removes ambient `window` / `document` / app-global access from browser Code nodes.

## Implementation Plan

### 1. Add one shared internal permission contract

Create a new internal helper in core, for example:

- `packages/core/src/integrations/codeRunnerPermissions.ts`

It should define:
- the canonical permission names: `fetch`, `require`, `Rivet`, `process`, `console`
- one shared error-message builder, with a stable format:
  - `Code node permission denied: fetch`
  - `Code node permission denied: console`
  - `Code node permission denied: require (Node executor only)`
  - `Code node permission denied: process (Node executor only)`
- one small helper for creating throwing accessors/functions for denied capabilities

This module is internal-only. It exists so Node and browser enforcement produce the same behavior and the same error text.

### 2. Replace the Node executor’s ambient `AsyncFunction` execution with `node:vm`

Update:

- `packages/node/src/native/NodeCodeRunner.ts`

Do not keep the current “conditionally pass arguments to `AsyncFunction` in the current realm” approach.

Instead:
- create a sandbox object for each `runCode(...)` call,
- create a `vm` context from that sandbox,
- run the user code inside that context.

Required sandbox behavior:
- allowed capabilities are present on the sandbox global:
  - `fetch`
  - `console`
  - `Rivet`
  - `require`
  - `process`
- denied capabilities are still defined, but access throws the shared explicit permission error
- `globalThis`, `global`, and `self` must all refer to the sandbox object itself
- `graphInputs` and `context` should only be present if currently provided, same as today
- user code should still run as async code and return outputs exactly as today

Recommended wrapper shape:
- compile a script that produces an async function or async IIFE inside the vm context,
- execute it with the same logical inputs as today,
- await the result,
- propagate user errors normally,
- propagate permission errors with the explicit message from the shared helper.

Important:
- do not silently fall back to current-realm execution if `vm` setup fails
- surface the failure instead

### 3. Add a strict browser sandbox runner in the app, backed by a dedicated worker

Create new app-owned files, for example:

- `packages/app/src/model/codeRunner/BrowserSandboxCodeRunner.ts`
- `packages/app/src/model/codeRunner/browserCodeRunner.worker.ts`

Do not try to make browser enforcement “good enough” by adding more shadowed `AsyncFunction` arguments in the main window context. That is still bypassable and does not satisfy the chosen “real enforcement” direction.

Use a dedicated worker per `runCode(...)` call.

Why per-call worker:
- it avoids state leakage between Code node runs,
- it avoids cleanup complexity around mutated globals,
- it gives true realm separation from the app window,
- it is simpler and safer than pooling for the first correct implementation.

Worker protocol:
- request payload includes:
  - `code`
  - `inputs`
  - `graphInputs`
  - `contextValues`
  - the permission booleans
- response payload is one of:
  - success with `outputs`
  - failure with serialized `name`, `message`, and optional `stack`

Worker runtime behavior:
- import the Rivet browser-side export source needed for `Rivet`
- before executing user code, configure the worker global for the requested permissions
- allowed capabilities are bound normally
- denied capabilities throw the shared explicit permission error when accessed
- `require` and `process` must always behave as Node-only-denied in browser, even if their toggles are on
- `globalThis` and `self` stay available, but point to the worker realm with the enforced capability surface
- there is no `window` or `document`, which is intentional under the chosen strict-isolation path

Execution behavior:
- evaluate user code in the worker after the global surface is configured
- return outputs through `postMessage`
- serialize thrown errors back to the main thread
- terminate the worker after each run, whether success or failure

No insecure fallback:
- if worker creation or execution fails, surface the error
- do not fall back to the old `AsyncFunction` on the main thread

### 4. Wire the browser sandbox runner into every browser graph-execution path in the app

Update all app browser execution entrypoints so they explicitly pass the new browser sandbox runner instead of relying on GraphProcessor’s default `IsomorphicCodeRunner`.

Required call sites:
- `packages/app/src/hooks/useLocalExecutor.ts`
  - main local graph runs
  - Trivet/browser graph runs
- `packages/app/src/components/promptDesigner/PromptDesignerTestRunner.ts`
  - evaluator graph execution
- `packages/app/src/hooks/useGetAdHocInternalProcessContext.ts`
  - set `codeRunner` to the browser sandbox runner so ad-hoc browser contexts never silently rely on insecure fallback if they execute a Code node later

Use one shared app singleton export for the browser sandbox runner so all these call sites stay aligned.

### 5. Keep core fallback behavior out of scope for this pass

Do not try to fully redesign:

- `packages/core/src/integrations/CodeRunner.ts` `IsomorphicCodeRunner`

Reason:
- true browser enforcement is being implemented in the app-owned browser execution layer, where workers are available and product behavior matters
- trying to retrofit a secure browser sandbox directly into generic core in this pass would broaden scope materially

Chosen default:
- app browser execution is secured by explicit injected `BrowserSandboxCodeRunner`
- Node execution is secured in `NodeCodeRunner`
- generic non-app browser consumers of raw core APIs are out of scope for this pass

### 6. Preserve existing data model and UI behavior

Do not change:
- Code node persisted schema
- permission data keys
- node editor structure
- AI-assist config shape
- existing “require/process are Node executor only” helper text

The only intended user-facing behavior change is runtime enforcement.

### 7. Update developer docs

Update:

- `developer-docs/APP-ARCHITECTURE.md`

Add a Code-node runtime-permissions note covering:
- current permission toggles are enforced at execution time, not just UI time
- Node executor uses a vm sandbox
- browser execution uses a worker sandbox
- browser Code nodes no longer have ambient access to `window` / `document` / app globals
- forbidden API access throws explicit permission errors

## Important Changes Or Additions To Public APIs / Interfaces / Types

No public API changes.

No project schema or persisted-state changes.

Internal-only additions are expected:
- `packages/core/src/integrations/codeRunnerPermissions.ts`
- `packages/app/src/model/codeRunner/BrowserSandboxCodeRunner.ts`
- `packages/app/src/model/codeRunner/browserCodeRunner.worker.ts`

Possible new internal types:
- `type CodeNodeRuntimePermissionName = 'fetch' | 'require' | 'Rivet' | 'process' | 'console'`
- `type BrowserCodeRunnerRequest = { ... }`
- `type BrowserCodeRunnerResponse = { ... }`

## Test Cases And Scenarios

### Node executor tests

Add a dedicated node-side test file, for example:

- `packages/node/test/NodeCodeRunner.test.ts`

Required cases:
1. `fetch` off:
   - direct `fetch(...)` access throws `Code node permission denied: fetch`
2. `fetch` off:
   - `globalThis.fetch(...)` also throws the same permission error
3. `console` off:
   - `console.log(...)` throws `Code node permission denied: console`
4. `process` off:
   - `process.env` throws `Code node permission denied: process`
5. `require` off:
   - `require('node:fs')` throws `Code node permission denied: require`
6. `Rivet` off:
   - `Rivet` access throws `Code node permission denied: Rivet`
7. `fetch` on:
   - direct `fetch` is available
8. `console` on:
   - `console` is available
9. `require` on in Node executor:
   - `require` is available
10. `process` on in Node executor:
   - `process` is available

### Browser sandbox runner tests

Add a dedicated browser-runner test file, for example:

- `packages/app/src/model/codeRunner/BrowserSandboxCodeRunner.test.ts`

Required cases:
1. `fetch` off:
   - direct `fetch(...)` throws `Code node permission denied: fetch`
2. `fetch` off:
   - `globalThis.fetch(...)` throws `Code node permission denied: fetch`
3. `console` off:
   - `console.log(...)` throws `Code node permission denied: console`
4. `Rivet` off:
   - `Rivet` access throws `Code node permission denied: Rivet`
5. `Rivet` on:
   - `Rivet` is available
6. `require` in browser:
   - access throws `Code node permission denied: require (Node executor only)`
7. `process` in browser:
   - access throws `Code node permission denied: process (Node executor only)`
8. strict isolation:
   - `window` is unavailable
   - `document` is unavailable
9. result path:
   - successful outputs round-trip through the worker protocol
10. error path:
   - user-thrown errors are serialized back with message and stack

### App wiring tests

Add a small focused app-side coverage path to prove browser graph execution uses the sandbox runner rather than fallback execution.

Recommended target:
- whichever small helper or singleton wiring module is added for the browser runner

Required cases:
1. local browser graph execution context includes the sandbox runner
2. prompt designer evaluator execution includes the sandbox runner
3. ad-hoc browser process context includes the sandbox runner

### Manual validation

1. Browser/local executor:
   - Code node with `fetch` toggle off and code `await fetch(...)`
   - expected: execution error `Code node permission denied: fetch`
2. Browser/local executor:
   - Code node with `fetch` toggle off and code `await globalThis.fetch(...)`
   - expected: same permission error
3. Browser/local executor:
   - Code node with `console` toggle off and code `console.log('x')`
   - expected: permission error
4. Browser/local executor:
   - Code node with `fetch` toggle on
   - expected: `fetch` works
5. Browser/local executor:
   - Code node using `window` or `document`
   - expected: unavailable in the sandboxed browser environment
6. Node executor:
   - `require` off then `require('node:fs')`
   - expected: permission error
7. Node executor:
   - `require` on then `require('node:fs')`
   - expected: works
8. Node executor:
   - `process` off then `process.env`
   - expected: permission error
9. Prompt designer evaluator graph containing a Code node:
   - expected: same browser permission behavior as local graph execution
10. Trivet/browser execution path with a Code node:
   - expected: same browser permission behavior as local graph execution

## Acceptance Criteria

- Runtime-permission toggles are true enforcement, not just conditional argument injection.
- When a permission is off, direct access and `globalThis`-style access to that capability are blocked.
- Forbidden access throws an explicit permission error.
- Node executor enforcement works for all five toggled capabilities.
- Browser executor enforcement works for all app browser execution paths.
- Browser Code nodes run in strict isolation from the app/global window context.
- No insecure fallback path remains in app browser execution.

## Assumptions And Defaults

- Current prohibition is **not** actually enforced for at least `fetch`, `console`, and likely `process`.
- Chosen failure mode is an explicit permission error, not a silent `undefined`.
- Chosen browser behavior is strict isolation, even though this removes ambient `window` / `document` / app-global access.
- `require` and `process` remain Node-executor-only even if their toggles are enabled in browser execution.
- App browser execution is the supported browser enforcement surface for this pass; raw external browser consumers of generic core APIs are out of scope.
- Correctness and isolation take priority over initial browser runner performance, so per-run worker isolation is preferred over worker pooling in the first implementation.
