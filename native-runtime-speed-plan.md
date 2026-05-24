# Native Runtime Speed Plan

## Status

Planning document. This is not a commitment to rewrite Rivet in Rust. It is a
benchmark-first plan for testing whether a coarse-grained Rust execution core
can make orchestration-heavy workflows meaningfully faster while keeping the
TypeScript public API and editor/runtime compatibility intact.

Target workflow shapes:

- many cheap nodes
- large fan-in / fan-out graphs
- repeated Subgraph, Call Graph, and Referenced Graph calls
- deeply nested but headless-compatible graph execution

Non-target workflow shapes:

- LLM, HTTP, database, file, sleep, wait, and user-input dominated workflows
- editor/debugger/recording paths where rich lifecycle events are required
- arbitrary user Code/Expression replacement before the native engine has
  proven it can beat the optimized TypeScript engine on graph orchestration

## Core Bet

A language rewrite only helps if Rust owns a large enough execution slice to
avoid per-node boundary overhead.

Do this:

```text
TypeScript API -> native runner executes an eligible graph/subgraph segment -> TypeScript receives final outputs
```

Do not do this:

```text
TypeScript scheduler -> Rust helper for one tiny node -> TypeScript scheduler
```

The first native runtime must be an optional, explicit, opt-in execution profile
for headless/programmatic runs. If the caller does not request this Rust mode,
Rivet must run through the exact same TypeScript execution paths it uses today.
The normal TypeScript modes must not import the native package, build native IR,
probe native availability, run native eligibility checks, or pay any native-mode
branch cost. The native profile must preserve existing project files,
`DataValue` semantics, Node package API shape, and TypeScript fallback behavior.
If the native package cannot load, or if a graph is not eligible, the requested
native run must fall back to the current TypeScript engine and expose a
diagnostic decision reason for benchmarks/tests. The fallback must not change
the graph result shape.

## Hard Isolation Contract

The Rust mode is additive. It must not become a hidden default-fast path and it
must not share mutable runtime code with the ordinary TypeScript modes.

- `runtimeProfile: 'native-fast'` is the only profile value that may attempt
  native execution, and v1 should accept it only on the dedicated graph-runner
  path. Do not widen shared profile types in a way that makes `runGraph(...)` or
  one-shot `createProcessor(...)` consider native execution before those APIs
  have their own benchmark gate.
- Omitted `runtimeProfile`, `compatible`, `headless-fast`, editor execution,
  debugger execution, recording, replay, and existing app-executor flows must
  keep their current TypeScript implementation.
- Native package loading must be lazy and profile-gated. A broken, missing, or
  unsupported native binary must not affect any non-native run.
- Normal `yarn install`, `yarn build`, `yarn test`, and editor development must
  not require a Rust toolchain or a native binary. Native build/test work must
  live in explicit native scripts or CI jobs.
- Native eligibility, native IR construction, native plan construction, and
  native output conversion must live behind the native-profile branch.
- The existing TypeScript engine remains the compatibility source of truth. The
  Rust path may call into it only as a coarse fallback for a whole unsupported
  run, not as a per-node normal-mode helper.
- Every phase must include regression tests proving default and existing
  explicit profiles behave the same with the native package present, absent,
  and intentionally failing to load.
- Native execution should run behind a failure boundary that can convert native
  adapter failures into whole-run TypeScript fallback before execution starts.
  If a native crash can terminate the Node process, that phase is prototype-only
  and must not be exposed as an experimental runtime profile.

## Architecture

### Public integration

- Add a new explicit runtime profile, tentatively `native-fast`, only after a
  prototype proves a large win.
- Start with a graph-runner-only API path because it already models "load once,
  run many times" and can amortize native plan construction. The implementation
  may add a runner-specific profile type or adapter rather than expanding the
  shared `NodeRuntimeProfile` union used by `createProcessor(...)`.
- Keep `runGraph(...)` and default `createProcessor(...)` on the current
  TypeScript policies until native one-shot overhead is proven safe.
- Do not change the implementation of existing runtime profiles except for the
  smallest dispatch seam needed to route `native-fast` into the native adapter.
  Existing profiles must return to their current code paths before any native
  module import or native eligibility work happens.
- Keep Remote Debugger, recording, trace mode, partial output callbacks,
  user-input/wait-event flows, and editor execution on the TypeScript engine in
  v1.
- Add a private decision report for native runner tests and benchmarks, for
  example `nativeUsed: boolean` plus a short fallback reason. Do not add that
  report to normal graph outputs.

### Native package shape

- Add a separate optional workspace package for the native runtime, for example
  `packages/native-runtime`, exposed to Node through N-API.
- Treat the package as optional from `@valerypopoff/rivet2-node`; missing native
  binaries must not break installs or existing runtime behavior.
- Load the package only from the native adapter after `runtimeProfile:
  'native-fast'` has been selected.
- Prefer keeping native artifacts out of the main `@valerypopoff/rivet2-node`
  bundle. Native packaging should be optional per platform and should fail
  closed to TypeScript fallback when unavailable.
- Build a Rust-owned immutable execution plan from a compact graph IR. The
  plan can be reused by a native graph runner, but it must not cache final
  outputs, graph inputs, context values, globals, abort state, or event data.
- Keep TypeScript as the canonical project parser, registry/plugin loader, and
  compatibility gate. TypeScript decides whether a graph is native-eligible and
  serializes only the eligible graph/subgraph IR into Rust.

### Native eligibility v1

The first native path should be intentionally narrow:

- headless only
- no debugger, recorder, trace, partial output, user input, wait event, race,
  loop, split-run, or custom plugin nodes
- no global get/set nodes, context nodes, external function calls, provider
  nodes, HTTP/file/network nodes, or other mutable/runtime-environment nodes in
  v1
- acyclic graphs only
- no node settings that depend on dynamic editor/runtime provider behavior
  outside the native supported subset
- direct Subgraph and Referenced Graph Alias dispatch only when every reached
  graph is eligible. Dynamic Call Graph dispatch stays TypeScript fallback until
  a later phase proves target resolution can stay native without changing
  semantics.
- project references only after TypeScript has resolved a stable snapshot for
  the graph runner; native v1 must not perform dynamic project loading itself
- built-in cheap nodes only, starting with the minimum set needed to benchmark
  graph input/output, text/value passthrough, fan-in/fan-out, and subgraph
  boundary propagation

Unsupported graphs must run through the TypeScript engine without changing
outputs or events.

### Data and node semantics

- Preserve the existing `DataValue` wire shape at the TypeScript API boundary.
- Inside Rust, use compact native representations for supported values and
  convert back only at the graph boundary.
- Preserve `control-flow-excluded`, missing-required-input exclusion, disabled
  nodes, false `If` ports, graph input defaults, graph output maps, and
  subgraph boundary names exactly for supported nodes.
- Preserve supported error behavior at the API boundary. Native internal errors
  must not leak Rust panic strings as user-facing node errors unless they are
  intentionally mapped to the existing Rivet error shape.
- Abort handling starts narrow: support abort before native execution begins and
  fallback for graphs that require mid-run abort semantics. Add cooperative
  mid-run abort only with dedicated benchmarks and equivalence tests.
- Do not rewrite arbitrary Code/Expression nodes first. If native orchestration
  wins are proven, evaluate Code/Expression separately with its own benchmark
  and compatibility plan. Arbitrary Rust snippets are not a drop-in replacement
  for current JavaScript snippets because compilation, sandboxing, dependency
  loading, and error display are separate product problems.

## Implementation Phases

### P0: Native feasibility benchmark

- Build a throwaway Rust/N-API prototype outside the public API path.
- Feed it generated benchmark IR for cheap chains, wide fan-in/fan-out, repeated
  subgraph calls, nested subgraphs, and referenced-graph-like dispatch.
  Benchmark dynamic Call Graph separately as a fallback/control row, not as a v1
  native success row.
- Measure native plan construction, per-run execution, TypeScript-to-native
  conversion, and native-to-TypeScript output conversion separately.
- Continue only if the native execution slice is at least 30% faster than the
  optimized TypeScript runtime on the target shapes after conversion overhead.

### P1: Optional package and gated profile

- Add the native workspace package and CI build smoke tests.
- Keep the root build/test path TypeScript-only. Add explicit native scripts for
  building/testing the Rust package so normal contributors are not forced into
  the native toolchain.
- Add a Node-side capability probe and keep all existing APIs functional when
  the native package is unavailable. The probe must be called only from the
  native-profile branch.
- Add `native-fast` behind an internal flag first. Do not expose it as a normal
  documented profile until equivalence and benchmark gates pass.
- Add benchmark rows for native load-once runner execution and one-shot native
  conversion overhead.
- Add a native decision report used by tests/benchmarks to distinguish "native
  actually ran" from "native requested but TypeScript fallback ran".
- Add explicit tests where the native package import throws and ordinary
  `runGraph(...)`, `createProcessor(...)`, and `createGraphRunner(...)` calls
  still use the TypeScript engine successfully.

### P2: Native graph plan and scheduler

- Move eligible graph planning, dependency counts, start-node selection,
  ready-queue scheduling, and graph output collection into Rust for the native
  path.
- Keep unsupported or event-sensitive graphs on the TypeScript path.
- Add equivalence tests for final outputs, exclusion behavior, abort-before-run,
  graph input defaults, and graph output naming.
- Add negative eligibility tests proving unsupported nodes/features do not
  partially run natively and instead use whole-run TypeScript fallback.
- Add concurrent `runner.run(...)` tests against one native runner to prove the
  Rust plan is immutable and per-run state is not shared across runs.
- Benchmark against existing TypeScript `createGraphRunner(...)`,
  `headless-fast`, and direct processor rows.

### P3: Native cheap built-ins

- Implement the smallest useful set of cheap built-in nodes natively.
- Prioritize nodes that keep benchmark execution entirely native: graph input,
  graph output, simple text/value passthrough, object-like value construction,
  destructure/extract primitives, and coalesce-style fan-in.
- Add a strict TypeScript fallback when a node's settings or data type exceed
  the native implementation's supported subset.
- Do not cross the native boundary per node.
- Add per-node semantic fixtures before adding each native node family. A node
  is native-eligible only for the exact settings/data combinations covered by
  those fixtures.

### P4: Native nested graph execution

- Execute eligible Subgraph and Referenced Graph Alias boundaries inside the
  same native run. Keep dynamic Call Graph out of native v1 unless a preceding
  benchmark/equivalence phase graduates it explicitly.
- Reuse immutable native child graph plans across runner runs.
- Preserve graph boundary ids/names and final subgraph output maps exactly.
- Treat resolved referenced projects as immutable runner inputs. If a referenced
  project can change between runs, the caller must create a new native runner or
  fall back to TypeScript.
- Benchmark repeated same-input and changing-input subgraph/reference calls.
  Do not memoize final subgraph outputs by input value.

### P5: Productization gate

- Run the full runtime-speed matrix with old TypeScript baseline, current
  TypeScript runtime, and native-fast candidate on the same machine.
- Promote `native-fast` from internal to experimental only if target shapes show
  large wins and all non-native fallback rows remain neutral.
- Keep TypeScript as the default until native-fast has platform packaging,
  crash diagnostics, compatibility docs, and CI coverage.
- Include packaging checks for Windows, macOS, and Linux before documenting
  native-fast for external consumers. A platform without a native artifact must
  keep using TypeScript fallback.

### P6: Code and Expression reassessment

- Reassess Code/Expression only after native graph orchestration is proven.
- Compare three options with benchmarks: keep JS fallback, add a native
  expression DSL for simple pure expressions, or add a separately sandboxed
  compiled native extension model.
- Do not replace current JavaScript Code/Expression semantics unless the new
  model is explicitly user-facing, migration-safe, and measurably faster for
  real workflows.

## Benchmark Gates

Every native phase must compare against the existing optimized TypeScript
runtime, not against old pre-optimization numbers.

Required benchmark groups:

- cheap text/value chains: 20, 100, 500, and 1000 nodes
- wide independent nodes and wide fan-in/fan-out graphs
- repeated Subgraph same-input and changing-input calls
- nested subgraph depth
- repeated direct Subgraph and Referenced Graph Alias dispatch
- dynamic Call Graph fallback/control rows
- concurrent runs against one reused graph runner
- one-shot run cost including native plan construction
- load-once runner cost excluding plan construction
- fallback cost for unsupported graphs
- mixed supported/unsupported graphs to prove fallback does not regress
- normal TypeScript modes with the native package installed, missing, and
  failing to load
- native adapter failure before execution, proving fallback and decision
  reporting work without changing graph outputs

Promotion thresholds:

- at least 30% faster on the primary target group after conversion overhead
- no repeatable slowdown above 3% on TypeScript fallback rows
- zero measurable branch/import/eligibility overhead on normal TypeScript modes
- no output, error, or exclusion behavior differences in equivalence tests
- no native crash can take down a normal TypeScript fallback run
- native-fast benchmark rows must report whether Rust actually executed; rows
  that fell back to TypeScript cannot be counted as native speed wins
- normal build/test/install flows must pass on a machine without Rust installed

If the prototype cannot meet these gates, stop the rewrite and keep optimizing
the TypeScript runtime.

## Compatibility Rules

- Project YAML and recording formats must not change for the native path.
- Existing TypeScript APIs must keep their current behavior by default.
- Native execution must be opt-in until it has broad compatibility coverage.
- Non-native runs must be unable to enter native code by accident. If the
  native module is deleted, corrupted, or platform-unsupported, non-native runs
  must still behave exactly like they do before this plan.
- Native path must never silently run a partially unsupported graph with changed
  semantics. It either runs an eligible graph natively or falls back to the
  TypeScript engine.
- Fallback from requested native mode must be observable to diagnostics and
  benchmarks, but must not alter normal graph outputs.
- The native runtime must not cache final outputs, subgraph results, user
  inputs, context values, globals, provider responses, or arbitrary code
  results.
- Developer documentation must state which graph features are native-eligible,
  how fallback works, and how to benchmark native versus TypeScript execution.

## Risks

- Boundary conversion can erase Rust wins if the native slice is too small.
- Supporting arbitrary Code/Expression semantics natively is much harder than
  supporting graph scheduling and cheap built-ins.
- Native package distribution increases CI, release, and platform complexity.
- Bugs in native code can be harder to diagnose than TypeScript runtime bugs.
- A native runtime may duplicate engine semantics unless equivalence tests are
  expanded before implementation.
- Silent fallback can hide the fact that Rust did not actually run unless the
  decision report is included in benchmarks and diagnostics.
- Adding `native-fast` to shared profile plumbing too early can accidentally
  route one-shot APIs through native checks; keep v1 graph-runner scoped.

## Recommended First Move

Start with P0 only. Build a small native benchmark prototype for generated graph
IR and compare it against the current `yarn bench:runtime-speed` matrix. Do not
change the public runtime, project schema, editor, debugger, or Code/Expression
semantics until the prototype proves that Rust can beat the optimized
TypeScript engine by a large enough margin on the target workflow shapes.
