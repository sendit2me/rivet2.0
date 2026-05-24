# Native Runtime Speed Plan

## Status

Implementation plan and live checkpoint for the optional native-fast runtime.
This is not a commitment to rewrite Rivet in Rust. It is a benchmark-first plan
for testing whether a coarse-grained Rust execution core can make
orchestration-heavy workflows meaningfully faster while keeping the TypeScript
public API and editor/runtime compatibility intact.

Current implementation state:

- `createGraphRunner(..., { runtimeProfile: 'native-fast' })` is the only API
  path that can attempt native execution.
- Existing `runGraph(...)`, `runGraphInFile(...)`, `createProcessor(...)`,
  editor, debugger, and recording paths still use the TypeScript runtime.
- Native package loading, native eligibility checks, native IR construction, and
  adapter execution are gated behind the `native-fast` branch.
- Native fallback uses the compatible TypeScript graph runner so unsupported or
  unavailable native execution does not silently substitute a second fast mode.
- The checked-in native package is an explicit prototype under
  `native-runtime/`. It is outside `packages/*` so normal workspace
  install/build/test flows do not require Rust or native package artifacts.
- Native runtime experiments can be loaded with `RIVET_NATIVE_RUNTIME_MODULE`
  using either a package name, file URL, or filesystem path.
- The local JS adapter can execute the existing narrow native IR for
  `graphInput`, `text`, `join`, `object`, `coalesce`, `destructure`,
  `extractObjectPath`, `graphOutput`, direct `subGraph` boundaries, and static
  Referenced Graph Alias boundaries when `RIVET_NATIVE_RUNTIME_BACKEND=js` is
  selected or when no Rust worker binary is available.
- The Rust crate under `native-runtime/native/` now includes a persistent
  worker binary that executes the same narrow IR for native-fast experiments.
  The plan now keeps this worker-process boundary as the production-hardening
  shape for the current native-fast candidate because it preserves crash
  isolation and still fails closed to TypeScript fallback before execution.
- Custom registries and runner event/callback options still force TypeScript
  fallback until the native path can faithfully emit the same lifecycle events
  and honor the same node-definition source.
- Per-run abort signals, stale connections, and unsupported native port shapes
  force TypeScript fallback; native output maps are normalized with the ordinary
  zero-cost output when an eligible cheap-node native run omits `cost`, and
  JSON-transported DataValues that omit `value` are restored to
  `value: undefined` at the Node seam.
- Runtime-speed benchmarks include `native-fast` rows that report whether
  native execution actually ran or fell back, plus which backend ran. Fallback
  rows must not be counted as native wins, and JS-adapter rows must not be
  counted as Rust wins.

Target workflow shapes:

- many cheap nodes
- large fan-in / fan-out graphs
- repeated Subgraph and static Referenced Graph Alias calls
- deeply nested but headless-compatible graph execution

Non-target workflow shapes:

- LLM, HTTP, database, file, sleep, wait, and user-input dominated workflows
- editor/debugger/recording paths where rich lifecycle events are required
- arbitrary user Code/Expression replacement without a separate language,
  sandbox, compatibility, and benchmark plan

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

- Keep the explicit `native-fast` runtime profile graph-runner-only.
  `createGraphRunner(...)` already models "load once, run many times" and can
  amortize native plan construction; `runGraph(...)` and
  `createProcessor(...)` must not consider native execution until they have
  their own benchmark gate.
- Keep `runGraph(...)` and default `createProcessor(...)` on the current
  TypeScript policies until native one-shot overhead is proven safe.
- Do not change the implementation of existing runtime profiles except for the
  smallest dispatch seam needed to route `native-fast` into the native adapter.
  Existing profiles must return to their current code paths before any native
  module import or native eligibility work happens.
- Keep Remote Debugger, recording, trace mode, partial output callbacks,
  user-input/wait-event flows, and editor execution on the TypeScript engine in
  v1.
- Keep the private native decision report for runner tests and benchmarks:
  `nativeUsed`, `nativeEligible`, `nativeBackend`, and a short fallback reason.
  Do not add that report to normal graph outputs.

### Native package shape

- Keep the native runtime package outside the normal Yarn workspace as
  `native-runtime/`. Move it under `packages/*` only after native packaging is
  proven not to affect normal install/build/test flows on machines without a
  Rust toolchain.
- Expose the Rust backend to Node through the small JS adapter package named
  `@valerypopoff/rivet2-native-runtime`.
- Treat the package as optional from `@valerypopoff/rivet2-node`; missing native
  binaries must not break installs or existing runtime behavior.
- Load the package only from the native adapter after
  `runtimeProfile: 'native-fast'` has been selected.
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

### P0: Native feasibility benchmark [DONE]

Current status:

- Runtime-speed benchmark rows now cover `native-fast` text chains, subgraph
  chains, wide fan-in, mixed subgraph fan-in, and unsupported Code fallback.
- Benchmark result rows report `nativeEligible`, `nativeUsed`, and
  `nativeFallbackReason` so fallback cannot be mistaken for native execution.
- The local JS adapter can now make the eligible rows execute through the
  opt-in adapter path when `RIVET_NATIVE_RUNTIME_MODULE` points at
  `native-runtime/index.js`.
- The Rust worker backend can now execute the same IR when a native worker
  binary is built and `RIVET_NATIVE_RUNTIME_BACKEND=rust` is selected.
- The before/after matrix is recorded in
  [`native-runtime-before-after.md`](native-runtime-before-after.md). On the
  local 2026-05-24 run, the Rust worker beat the fastest TypeScript row by
  5.88x to 37.04x on the native-eligible target shapes. Unsupported Code stayed
  on whole-run TypeScript fallback and reported `nativeUsed=false`.

Validation notes:

- The worker-process prototype is enough for feasibility; N-API remains a
  productization step, not a prerequisite.
- The 2026-05-24 matrix is end-to-end runner-run evidence: measured native rows
  include TypeScript-to-native input conversion, native execution, and
  native-to-TypeScript output conversion.
- The current Rust worker clears the 30% speed gate for measured eligible
  shapes, but promotion still depends on productization and equivalence gates.

### P1: Optional package and gated profile [DONE]

Completed:

- `runtimeProfile: 'native-fast'` is scoped to `createGraphRunner(...)`.
- Normal `runGraph(...)`, `createProcessor(...)`, compatible
  `createGraphRunner(...)`, and `headless-fast` graph runners do not load the
  native module.
- The native package boundary lives under `native-runtime/` and is outside the
  normal workspace package set.
- `RIVET_NATIVE_RUNTIME_MODULE` can point at a package name, file URL, or
  filesystem path.
- Tests cover missing module fallback, unsupported graph fallback, callback and
  custom-registry fallback, native decision reporting, explicit local-module
  loading, native runner disposal, and overlapping native-fast runs.

Validation notes:

- Root build/test remains TypeScript-only; native build/test work uses explicit
  native scripts and CI jobs.
- Native probing happens only after `runtimeProfile: 'native-fast'` is selected.
- Decision reports distinguish "native actually ran" from "native requested but
  TypeScript fallback ran".
- Import-failure tests prove ordinary `runGraph(...)`, `createProcessor(...)`,
  and non-native `createGraphRunner(...)` calls still use the TypeScript engine.

### P2: Native graph plan and scheduler [DONE]

Completed:

- The JS adapter and Rust worker both build immutable per-graph node maps,
  dependency sets, ready queues, incoming connection lists, and dependent-node
  maps from the TypeScript-produced IR.
- Each `runner.run(...)` owns fresh output maps, graph input maps, graph output
  maps, remaining dependencies, and ready queues.
- The Rust worker can process eligible acyclic graph IR without invoking the
  TypeScript processor.
- The explicit native test script now runs JS-adapter and Rust-worker
  equivalence smoke for interpolation, graph input defaults, join fan-in,
  object construction, coalesce fan-in, simple destructure paths, static
  Extract Object Path, direct subgraph fan-in, repeated runs, concurrent runs,
  duplicate nodes, and stale connections.
- The process worker is the chosen native packaging boundary for the current
  internal experimental candidate. It is deliberately preferred over N-API for
  now because a Rust panic or worker crash can be converted into native-fast
  failure/diagnostics without making ordinary TypeScript runs load native code.
- Cross-platform native CI builds and tests the worker on Windows, macOS, and
  Linux so platform breakage is caught before any public promotion.

Original phase checklist:

- Done: move eligible graph planning, dependency counts, start-node selection,
  ready-queue scheduling, and graph output collection into Rust for the native
  path.
- Done: keep unsupported or event-sensitive graphs on the TypeScript path.
- Done: add equivalence tests for final outputs, exclusion behavior,
  abort-before-run, graph input defaults, and graph output naming.
- Done: add negative eligibility tests proving unsupported nodes/features do
  not partially run natively and instead use whole-run TypeScript fallback.
- Done: add concurrent `runner.run(...)` tests against one native runner to
  prove the Rust plan is immutable and per-run state is not shared across runs.
- Done: benchmark against existing TypeScript `createGraphRunner(...)`,
  `headless-fast`, and direct processor rows.

### P3: Native cheap built-ins [DONE FOR CURRENT CORE SET, OPTIONAL MORE NODES]

Completed:

- `graphInput`, `text`, `join`, `object`, `coalesce`, `destructure`,
  `extractObjectPath`, and `graphOutput` execute in both the local JS adapter
  and Rust worker for the supported data types already admitted by the
  TypeScript eligibility pass, including plain object inputs needed by
  destructure and Extract Object Path. Graph outputs also admit primitive,
  `any`, and `object` array data types so native Object and Extract Object Path
  results can cross graph boundaries; array graph inputs remain fallback-only
  until native-fast implements the TypeScript array coercion rules.
- Text interpolation supports ordinary input tokens, `@context.*`,
  `@graphInputs.*`, escaped interpolation tokens, line-ending normalization, and
  the parity-tested processing subset: `uppercase`, `lowercase`, `trim`, and
  non-negative-integer `truncate`.
- Join supports the current static join-string path and flattening for array
  DataValues.
- Object supports static JSON templates using the same interpolation-token
  discovery as TypeScript, including quoted string escaping, unquoted JSON
  value insertion, embedded string fragments, escaped interpolation tokens,
  `@context.*`, `@graphInputs.*` lookups, and `object[]` outputs. It remains
  native-eligible only when the graph otherwise fits the whole-run native
  subset.
- Coalesce supports exact `inputN` candidate ports, the node-level
  `conditional` gate, and static `ignoreNull`/`ignoreUndefined` settings in
  both JS-adapter and Rust-worker backends.
- The Rust worker defaults omitted coalesce flags to `false`, matching the JS
  adapter and TypeScript node defaults for direct native IR tests.
- Rust `DataValue` deserialization now preserves explicit JSON `null` as
  distinct from missing `value`, which is required for null/undefined coalesce
  parity over the worker transport. Graph-level coalesce smoke currently proves
  fan-in ordering and undefined fallthrough; explicit null handling is covered
  at the Rust node/transport level until another native-eligible node can
  produce null inside a graph fixture.
- Destructure supports required-object-input validation plus a deliberately
  small static JSONPath subset: `$`, dot-property segments, and safe
  non-negative array indexes. Unsupported JSONPath features remain TypeScript
  fallback.
- Extract Object Path supports static stored paths with no interpolation, the
  same simple JSONPath subset as native destructure, required-object-input
  validation, `match`, `all_matches`, no-match exclusion semantics, and
  TypeScript fallback for dynamic path input or richer JSONPath.
- Focused tests now cover native-fast Object and Extract Object Path execution,
  fallback before native module loading for unsupported JSONPath, invalid-path
  eligibility decisions, `all_matches` fan-out, object graph-input defaults,
  JS-adapter/Rust-worker smoke parity, and public TypeScript runtime
  equivalence.
- The first broader native-fast equivalence pass is now in
  `packages/node/test/nativeRuntimeEquivalence.test.ts`. It compares compatible
  TypeScript graph-runner outputs with local native-fast JS-adapter outputs for
  supported text processing, Object/Destructure/Extract/Coalesce pipelines,
  graph input defaults, static subgraph input data, object-array graph outputs,
  control-flow exclusion, and Referenced Graph Alias fan-in. It also proves
  nearby unsupported Expression and dynamic graph-call patterns fall back before
  native module loading.

Optional future scope:

- Add any further cheap node only after dedicated semantic fixtures exist.

Original phase checklist:

- Done: implement the smallest useful set of cheap built-in nodes natively.
- Done: prioritize nodes that keep benchmark execution entirely native: graph
  input, graph output, simple text/value passthrough, object-like value
  construction, destructure/extract primitives, and coalesce-style fan-in.
  Object-like value construction is now represented by native `object`, and
  coalesce-style fan-in is now represented by native `coalesce`; keep adding
  only one node family at a time with fixtures.
- Done: add a strict TypeScript fallback when a node's settings or data type
  exceed the native implementation's supported subset.
- Done: do not cross the native boundary per node.
- Done: add per-node semantic fixtures before adding each native node family. A
  node is native-eligible only for the exact settings/data combinations covered
  by those fixtures.

### P4: Native nested graph execution [DONE]

Completed:

- Direct eligible `Subgraph` nodes execute inside the same JS adapter or Rust
  worker run.
- Static eligible `Referenced Graph Alias` nodes execute inside the same JS
  adapter or Rust worker run after TypeScript resolves the referenced project
  snapshot and compiles the target graph into namespaced synthetic subgraph IR.
- Child graph plans are reused across runs because they are prepared once from
  the TypeScript-produced IR.
- Per-run subgraph inputs, outputs, graph input values, and graph output maps
  are fresh; final subgraph output values are not memoized.
- Referenced project snapshots are immutable native runner inputs. If a
  referenced project can change between runs, the caller must create a new
  native runner or use the TypeScript path.
- Referenced-project graph IDs are namespaced throughout the reached graph tree
  so a referenced child subgraph cannot collide with a root-project graph that
  happens to have the same ID.
- The internal `__rivet_native_reference__:` graph-ID prefix is reserved for
  that synthetic namespace; projects using it stay on TypeScript fallback.
  Synthetic namespace components are URI-encoded so project and graph IDs that
  contain separators still map to distinct native graph IDs.
- Referenced Graph Alias nodes still fall back for dynamic/error-output modes,
  unresolved references, target graphs outside the native subset, and any
  unsupported boundary ports.
- The benchmark matrix now includes
  `createGraphRunner native-fast Referenced Graph Alias repeated same-input 50`.

Original phase checklist:

- Done: execute eligible Subgraph and Referenced Graph Alias boundaries inside
  the same native run.
- Done: reuse immutable native child graph plans across runner runs.
- Done: preserve graph boundary ids/names and final subgraph output maps for
  supported native boundaries.
- Done: treat resolved referenced projects as immutable runner inputs.
- Done: benchmark repeated same-input subgraph/reference calls.
- Out of scope for native v1: dynamic Call Graph dispatch. It stays TypeScript
  fallback until a separate benchmark/equivalence phase graduates it explicitly.

### P5: Productization gate [DONE: INTERNAL EXPERIMENTAL, NOT PUBLIC DEFAULT]

Completed:

- The main CI build remains TypeScript-only.
- `.github/workflows/build.yml` has a separate `native-runtime` job that sets up
  Rust and runs `npm --prefix native-runtime run test:native` explicitly on
  Windows, macOS, and Linux.
- Runtime-speed benchmarks now include compatible and native-fast object
  construction, coalesce fan-in, destructure fan-out, Extract Object Path, and
  Referenced Graph Alias repeated-call rows so the next
  before/after run can report whether the new cheap object primitives help or
  regress.
- Tiny 2026-05-24 smoke runs with two measured iterations confirmed the new
  coalesce and destructure benchmark rows execute through
  `nativeBackend: rust-worker` with `nativeUsed=true`. This is wiring evidence
  only; it is not a replacement for the full five-sample before/after matrix.
- A tiny 2026-05-24 Extract Object Path smoke run with two measured iterations
  also executed through `nativeBackend: rust-worker` with `nativeUsed=true`:
  compatible mean `0.805ms`, native-fast mean `0.228ms`. This is wiring
  evidence only; it is not a replacement for the full five-sample before/after
  matrix.
- A tiny 2026-05-24 Object construction smoke run with two measured iterations
  also executed through `nativeBackend: rust-worker` with `nativeUsed=true`:
  compatible mean `0.741ms`, native-fast mean `0.181ms`. This is wiring
  evidence only; it is not a replacement for the full five-sample before/after
  matrix.
- A targeted 2026-05-24 Referenced Graph Alias smoke run with five measured
  iterations also executed through `nativeBackend: rust-worker` with
  `nativeUsed=true`: `runGraph` mean `13.394ms`, default-safe fresh processor
  mean `11.165ms`, native-fast mean `0.266ms`. This is wiring evidence only;
  it is not a replacement for the full five-sample before/after matrix.
- A full follow-up matrix is recorded in
  [`native-runtime-before-after.md`](native-runtime-before-after.md) after P4,
  P5, and P6. Native-fast remains opt-in and graph-runner-only; unsupported
  Code/Expression rows remain whole-run TypeScript fallback and must not be
  counted as Rust speed wins.
- A same-day 1000-node cheap-chain addendum closes the original cheap-chain
  scaling gate with `runGraph`, default-safe `createProcessor`,
  `headless-fast`, and `native-fast` rows.
- A same-day real-workflow audit/benchmark is recorded in
  [`native-runtime-real-workflow-benchmark.md`](native-runtime-real-workflow-benchmark.md).
  It checked 88 graphs from eight checked-in project files, timed only the
  three non-empty graphs that were native-eligible before execution, and found
  the Rust worker faster on all three. The larger finding is reach: 85 real
  graphs still fall back, mostly because of project-level plugins,
  unsupported built-in nodes, richer JSONPath, split-run, and chat-message
  graph boundary types.
- The productization gate is closed for default/public promotion: the current
  worker is suitable for internal opt-in benchmarking and CI-covered
  experimentation, but `native-fast` should not become a default runtime or a
  broadly documented external consumer feature until release packaging and
  crash/diagnostic expectations are deliberately productized.

### P6: Code and Expression reassessment [DONE: KEEP TYPESCRIPT FALLBACK]

Completed:

- The benchmark matrix includes TypeScript `runGraph`, default-safe
  `createProcessor`, compatible `createGraphRunner`, headless-fast
  `createGraphRunner`, and native-fast fallback rows for Code and Expression
  chains.
- Native-fast fallback neutrality is judged against compatible
  `createGraphRunner(...)`, because unsupported Code and Expression graphs
  deliberately fall back to the compatible TypeScript execution contract rather
  than the explicit `headless-fast` TypeScript profile.
- The cheap-chain benchmark group includes the plan's 20, 100, 500, and 1000
  node sizes, including native-fast and headless-fast graph-runner comparison
  rows for the 1000-node scaling gate.
- The selected v1 behavior is to keep both Code and Expression on the
  TypeScript path. Native-fast rejects them during eligibility and falls back
  for the whole run, preserving JavaScript semantics, sandbox permissions,
  dependency loading, error formatting, and custom CodeRunner ownership.
- A native expression DSL and a separately sandboxed compiled extension model
  remain future product ideas, not part of this speed plan. Either would need a
  user-facing language/compatibility contract, migration story, sandbox model,
  and dedicated benchmarks before implementation.

### P7: Real-workflow fallback diagnostics [DONE]

Completed:

- `packages/node/bench/nativeRealWorkflow.bench.ts` now emits a JSON object with
  raw per-graph `results` plus a deterministic `summary`.
- The summary includes status counts, fallback-family counts, normalized
  fallback blockers, exact fallback reasons, unsupported node-type counts, and
  representative `project#graph` examples.
- Raw per-graph rows remain intact, including missing project files, load
  errors, output mismatches, and run errors.
- Fallback rows remain side-effect-safe: the benchmark reports native
  eligibility decisions without executing TypeScript fallback graphs just to
  gather diagnostics.
- [`native-runtime-real-workflow-benchmark.md`](native-runtime-real-workflow-benchmark.md)
  now includes a top-blockers section and names the next candidate tranches:
  project-plugin gate reassessment, simple conditionals, and simple JSONPath
  expansion.

### P8: Project plugin gate reassessment [NOT STARTED]

Goal:

- Decide whether `project-has-plugins` must block the whole project or whether
  native-fast can safely run built-in-only graphs when project plugins are
  present but unused by the selected graph and its native-resolved child graph
  closure.

Scope:

- P8 is a gate-design phase. It should not widen native eligibility by itself
  unless the required tests and docs for the narrower gate are included in the
  same change.

Required analysis:

- Trace how project plugins can affect node registration, node data semantics,
  graph references, and execution-time behavior.
- Identify whether a graph that uses only built-in native-supported nodes can
  be classified independently from unrelated project-level plugins.
- Confirm that plugin presence cannot change built-in node implementations,
  port definitions, graph input/output behavior, globals, context, or fallback
  expectations for the selected graph closure.

Possible outcomes:

- Keep the current whole-project plugin gate if plugins can alter semantics in
  a way native preflight cannot prove safe.
- Replace it with a narrower graph-closure plugin gate if unused plugins can be
  ignored safely and covered with negative tests.
- Defer the gate if plugin safety depends on unresolved graph-reference,
  custom-registry, or dynamic node-definition questions.

Exit criteria:

- The decision is documented in developer docs and benchmark notes.
- If the gate is narrowed, equivalence tests prove plugin-bearing projects still
  fall back when the selected graph actually uses plugin/custom nodes.
- The real-workflow benchmark explicitly reports whether `project-has-plugins`
  remains a top blocker after the decision.

### P9: First real-workflow eligibility tranche [NOT STARTED]

Goal:

- Add one cheap, side-effect-free native eligibility expansion chosen from the
  P7/P8 fallback data, with tests before implementation.

Selection rules:

- Prefer blockers that appear in checked-in real projects and keep execution
  entirely deterministic.
- Prefer simple built-ins, simple data-type expansions, or simple port-setting
  variants over provider, file, user-input, debugger, Code, Expression, or
  dynamic-dispatch behavior.
- Prefer features that can be proven from the static TypeScript native
  preflight without executing the fallback TypeScript graph.
- Do not add more than one semantic node family per tranche unless the second
  family is purely mechanical test coverage for the first.

Required implementation order:

- Add TypeScript/native equivalence tests for supported and unsupported
  settings.
- Add negative fallback tests before widening eligibility.
- Implement the native JS adapter behavior first, then Rust worker behavior.
- Update native IR typing only for the selected feature.
- Keep fallback whole-run and observable when settings exceed the supported
  native subset.

Exit criteria:

- Existing TypeScript modes remain unchanged.
- Native-fast only accepts the newly covered semantics.
- The selected real-workflow blocker count decreases in the benchmark report.
- If the selected blocker count does not decrease, stop and explain why before
  starting another tranche.

### P10: Rerun and document the eligibility matrix [NOT STARTED]

Goal:

- Prove whether the new tranche actually increases real checked-in workflow
  reach without hiding regressions.

Required checks:

- Run focused equivalence tests for the new native feature.
- Run native runtime tests and the lightweight real-workflow audit.
- Run the full native/runtime benchmark matrix when eligibility or worker
  transport changes could affect measured performance.
- Use the same documented benchmark command shape before and after the change,
  changing only the code under test.
- Update
  [`native-runtime-real-workflow-benchmark.md`](native-runtime-real-workflow-benchmark.md)
  with before/after eligible counts, exact fallback deltas, output mismatch
  count, run error count, and measured timing rows.
- Update developer docs with the new native-eligible feature and fallback
  limits.
- Mark the relevant P7-P10 phase headers as done only after checks and docs are
  complete.

Exit criteria:

- The report clearly says whether native-fast real-project reach improved.
- Any speed wins are counted only when `nativeUsed=true`.
- Any unchanged or worsened reach is explained before the next tranche begins.

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

If a future expansion tranche cannot meet these gates, stop widening native
eligibility for that tranche and keep the unsupported behavior on the
TypeScript runtime.

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
- A native runtime may duplicate engine semantics unless the expanded
  equivalence fixtures stay ahead of new native node families.
- Silent fallback can hide the fact that Rust did not actually run unless the
  decision report is included in benchmarks and diagnostics.
- Adding `native-fast` to shared profile plumbing too early can accidentally
  route one-shot APIs through native checks; keep v1 graph-runner scoped.

## Recommended Next Move

The TypeScript-side adapter contract, local JS control adapter, process-based
Rust worker backend, cross-platform native CI smoke, Code/Expression fallback
decision, and before/after benchmark matrices are now in place. The Rust worker
proved the speed win for the narrow eligible workload set, but the product gate
keeps it internal and opt-in rather than default.

The next remaining implementation sequence is P8 through P10: reassess the
project-plugin gate, implement one data-backed low-risk eligibility tranche,
then rerun and document the matrix. During that work:

- keep ordinary TypeScript paths unchanged and keep `native-fast` opt-in;
- keep the worker-process boundary unless a future release-packaging phase
  proves N-API is worth the crash-isolation tradeoff;
- do not start P9 until the P8 plugin-gate decision is documented;
- add supported and unsupported equivalence tests before every eligibility
  expansion;
- rerun the relevant benchmark matrix whenever native eligibility or worker
  transport changes;
- keep Code and Expression on TypeScript fallback unless a separate
  product-level language/runtime plan proves a migration-safe speed win.
