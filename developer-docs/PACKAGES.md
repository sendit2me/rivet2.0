# Package Reference

> Detailed package-by-package reference for the current monorepo.

## Build Order

The root `yarn build` script currently builds packages in this order:

1. `@valerypopoff/rivet2-core`
2. `@valerypopoff/rivet2-node`
3. `@valerypopoff/rivet-app-executor`
4. `@valerypopoff/trivet`
5. `@valerypopoff/rivet-app`
6. `@valerypopoff/rivet2-cli`

That order is encoded directly in the root `package.json` and reflects actual runtime dependencies.

## `@valerypopoff/rivet2-core` (`packages/core/`)

### Role

Shared runtime foundation for the entire repo.

### Package metadata

- Version: `2.0.1`
- Main: `dist/cjs/bundle.cjs`
- Module: `dist/esm/index.js`
- Types: `dist/types/index.d.ts`

### What it contains

- graph/project/node/data types
- `GraphProcessor` and extracted helpers (`NodeExecutionPlanner`, `NodeExclusionPolicy`, `SubprocessorBridge`, `SplitRunProcessor`)
- built-in nodes
- built-in plugins
- `RegistryAssembly` - centralized registry creation and plugin assembly
- serialization with shared V3/V4 helpers (`serializationHelpers.ts`)
- recording/playback support
- runtime integration contracts
- Vercel AI SDK provider adapters used by the user-facing `LLM Chat` node, including the OpenAI-compatible provider factory for Custom provider mode
- `emitDetached` - explicit fire-and-forget event emission helper
- `pQueueCompat` - CJS/ESM interop for p-queue
- shared runtime settings normalization through `resolveProcessSettings(...)`
- public execution helpers and streaming APIs

### Important downstream consumers

- app
- node
- app-executor
- trivet

## `@valerypopoff/rivet2-node` (`packages/node/`)

### Role

Node-native runtime wrapper around core.

### Package metadata

- Version: `2.0.1`
- Main: `dist/cjs/bundle.cjs`
- Module: `dist/esm/index.js`
- Types: `dist/types/index.d.ts`

### Main exports

From `src/index.ts` and related files:

- re-exports of all core exports
- Node native API types and helpers
- `loadProjectFromFile(...)`
- `loadProjectAndAttachedDataFromFile(...)`
- `runGraphInFile(...)`
- `runGraph(...)`
- `createProcessor(...)`
- `createGraphRunner(...)`
- debugger server APIs
- dataset/debugger/project-reference helpers

### Architectural role

This package is the shared Node runtime used by:

- external consumers
- the CLI
- parts of the app-executor stack

It is not just a convenience wrapper. It sets Node-default providers, debugger integration, env-based plugin config fallback, and Node-specific reference loading. Runtime settings still flow through core's shared `resolveProcessSettings(...)` helper instead of being rebuilt independently in the Node package.
It also supplies a default tokenizer for Node-side runs when the caller does not provide one explicitly.

### Runtime-speed characterization

Runtime-speed work for programmatic Node execution is guarded from the Node
package first. [`packages/node/test/runtimeSpeedEquivalence.test.ts`](../packages/node/test/runtimeSpeedEquivalence.test.ts)
pins result and error compatibility across `runGraph(...)`,
`createProcessor(...).run()`, `createGraphRunner(...).run(...)`, and direct
`GraphProcessor.processGraph(...)` execution for simple headless fixtures
covering per-run inputs/context, branching DAGs, async Delay nodes,
missing-required-input exclusion, control-flow exclusion, Code, and Expression.
It also covers repeated same-input and changing-input subgraphs, nested
subgraphs, dynamic `Call Graph` dispatch, and `Referenced Graph Alias` dispatch
through a custom `projectReferenceLoader`. Thrown Code errors and abort signals
are pinned across the public Node APIs.
The direct `GraphProcessor` mode is a diagnostic baseline for these
provider-free fixtures, not a replacement for Node wrapper defaults such as
native providers, MCP, project reference loading, or debugger attachment.

[`packages/node/bench/runtimeSpeed.bench.ts`](../packages/node/bench/runtimeSpeed.bench.ts)
is the repeatable baseline benchmark for the speed plan. Run it with
`yarn bench:runtime-speed`, or tune iteration counts with
`RIVET_RUNTIME_BENCH_ITERATIONS` and
`RIVET_RUNTIME_BENCH_WARMUP_ITERATIONS`. Set
`RIVET_RUNTIME_BENCH_SAMPLES` to run each benchmark case multiple times and
report the average, min/max sample means, and standard deviation. Use
`RIVET_RUNTIME_BENCH_FILTER` with a JavaScript regular expression to run a
targeted subset during regression attribution, and set
`RIVET_RUNTIME_BENCH_JSON=1` when a script needs the benchmark payload as JSON.
The package script still builds `@valerypopoff/rivet2-core` first, so scripts
should read the final JSON array line unless they invoke the built benchmark
file directly. The full matrix is still the required release gate. It measures one-shot
`runGraphInFile(...)`, loaded-project `runGraph(...)`, reused
`createProcessor(...)`, fresh `createProcessor(...)` with default-safe,
explicit compatible, and `runtimeProfile: 'headless-fast'` profiles,
`createGraphRunner(...)`, direct processor execution, cheap text chains, wide
independent fan-in DAGs, single subgraph calls, nested subgraph chains, repeated
same-input fan-in and changing-input subgraph calls, dynamic
`Call Graph` dispatch, `Referenced Graph Alias` dispatch through a custom
`projectReferenceLoader`, Expression and Code chains, lazy preprocessing through
the public dependency planning path, direct compatible-vs-`fast-acyclic`
scheduler-only rows, isolated `loadProjectFromString(...)` and
`loadProjectFromFile(...)` project-loading rows, and both uncached and cached
Node CodeRunner compile/run paths. The benchmark matrix is intentionally broad so
each speed phase can compare flat, subgraph-heavy, graph-dispatch, code-heavy,
and secondary file-loading shapes against the same old-runtime baseline. The
current baseline table is recorded in [`execution-speed.md`](../execution-speed.md)
before runtime optimization work starts. The file-loading referenced-project
benchmark passes `projectPath` explicitly so relative project-reference
`hintPaths` use the default Node loader path.
The benchmark script rebuilds the core ESM package first because the Node
workspace imports `@valerypopoff/rivet2-core` through its package export
surface; running the benchmark against stale `packages/core/dist` output can
hide or invent speed changes.
Benchmarks are diagnostic only; correctness remains pinned by the equivalence
tests.

The post-P7 full before/after matrix found real wins but also unacceptable
cheap-runtime regressions. The P8-P12 recovery pass fixed the repeatable cheap
path issue and recorded the final matrix in
[`runtime-speed-before-after.md`](../runtime-speed-before-after.md).
Future speed work should still treat direct `GraphProcessor` diagnostic rows as
core hot-path evidence, not only Node API runtime-policy evidence.
The follow-up native-runtime exploration is planned in
[`native-runtime-speed-plan.md`](../native-runtime-speed-plan.md). That plan
keeps the TypeScript public APIs and current engine as the default, and treats
Rust as an optional coarse-grained execution core only if benchmarks prove large
wins for cheap-node, wide fan-in/fan-out, and repeated nested-graph workloads.
The proposed Rust path is strictly opt-in: existing profiles must bypass native
package loading, eligibility checks, native IR construction, and native runtime
branches unless the caller explicitly selects the future `native-fast` profile.
The first implementation should stay graph-runner scoped, keep `runGraph(...)`
and one-shot `createProcessor(...)` on the current TypeScript paths, and report
whether native execution actually ran so benchmark rows cannot count TypeScript
fallback as Rust speed wins. Normal install/build/test flows must remain
TypeScript-only unless an explicit native-runtime script or CI job is invoked.

The native-runtime adapter is now seeded as an opt-in `createGraphRunner(...)`
profile only. `runtimeProfile: 'native-fast'` routes through
[`packages/node/src/nativeGraphRunner.ts`](../packages/node/src/nativeGraphRunner.ts),
which performs a TypeScript-side eligibility pass, builds compact graph IR for
the narrow supported subset, and lazily imports the optional native package only
after that profile has been selected. Unsupported graphs, missing native
modules, and native creation failures fall back to a whole-run compatible
TypeScript runner and expose `getNativeRuntimeDecision()` for tests and
benchmarks. The fallback runner is created lazily so successful native runs do
not pay TypeScript runner setup cost. Per-run abort signals still use compatible
TypeScript fallback until the native path has proven equivalent abort behavior.
Native run-time failures are not double-run through TypeScript; they surface as
errors with a decision reason so benchmarks do not hide native defects. Native
outputs are normalized with the ordinary zero-cost output when the native runner
omits `cost`, and native `DataValue` objects that cross the JSON worker
transport without a `value` field are restored to `value: undefined`, matching
the TypeScript shape. The Rust worker keeps explicit JSON `null` distinct from
missing `value` fields so native nodes with null/undefined semantics can match
TypeScript. The initial native
package boundary lives under
[`native-runtime/`](../native-runtime/) rather than `packages/*`; it is a
private prototype with explicit Cargo scripts and no effect on normal Yarn
workspace install/build/test flows. Its checked-in JS adapter can execute the
current eligible IR for `graphInput`, `text`, `join`, `object`, `coalesce`,
`destructure`, `extractObjectPath`, `graphOutput`, and direct `subGraph` nodes
when `RIVET_NATIVE_RUNTIME_BACKEND=js` is selected or when no Rust worker
binary is available. The Rust worker backend under
`native-runtime/native/` now executes the same narrow IR through a persistent
child process when `RIVET_NATIVE_RUNTIME_BACKEND=rust` is selected, or
automatically when a built worker binary is present. Move the native package
into the workspace only after the package-manager, platform, and benchmark
gates in the plan are satisfied.
Both adapters validate the IR they receive before creating a runner, including
duplicate node IDs and stale connections, and keep per-run input/output maps
fresh so repeated native-fast runs cannot share values.
Local experiments can point the adapter at a package name, file URL, or
filesystem path with `RIVET_NATIVE_RUNTIME_MODULE`; the default unresolved
module name remains `@valerypopoff/rivet2-native-runtime` so a missing native
artifact fails closed to TypeScript fallback. `RIVET_NATIVE_RUNTIME_BACKEND`
can force `rust` or `js`; `RIVET_NATIVE_RUNTIME_BINARY` can point at a specific
worker executable for benchmark runs.
Native runtime checks remain explicit: `npm --prefix native-runtime run test:native`
runs the Rust crate tests, builds the release worker, and runs a
JS-adapter/Rust-worker equivalence smoke for interpolation, defaults, fan-in,
Object JSON-template construction, coalesce fan-in, simple destructure paths,
static Extract Object Path, direct subgraphs, concurrent runs, and create-time
rejection reasons. Rust unit coverage separately verifies explicit JSON `null`
versus missing `value` transport semantics for native nodes that need to
distinguish null from undefined. The main workspace build/test scripts stay
TypeScript-only; CI runs the native prototype in its own `native-runtime` job so
ordinary contributors do not need native artifacts for normal Rivet
development.

The supported native IR subset is intentionally small: acyclic graphs with
`graphInput`, `text`, `join`, `object`, `coalesce`, `destructure`,
`extractObjectPath`, `graphOutput`, and direct `Subgraph` nodes whose reached
graphs are also
eligible. Disabled,
conditional, split-run, plugin, custom registry, callback/event-sensitive,
dynamic Call Graph,
referenced-project, Code, Expression, stale connection, and unsupported port
paths remain TypeScript fallback.
Text-node interpolation is native-eligible only for the processing pipes whose
Rust behavior is covered by current parity tests: `uppercase`, `lowercase`,
`trim`, and non-negative-integer `truncate`. Other text processing pipes stay on
the TypeScript path until they have exact semantic fixtures.
Object-node construction is native-eligible for static JSON templates whose
interpolation inputs are ordinary node inputs, `@context.*`, or
`@graphInputs.*`. The native adapters mirror the TypeScript Object node's
quoted-token escaping, unquoted JSON value insertion, embedded string fragments,
escaped interpolation tokens, and `object` versus `object[]` output typing.
Object nodes still inherit the whole-graph native eligibility gate: disabled,
conditional, split-run, plugin/custom-registry, event-sensitive, or unsupported
neighboring nodes keep the entire run on TypeScript fallback.
Coalesce is native-eligible for static `ignoreNull` and `ignoreUndefined`
settings. Its `conditional` input is only a node-run gate, matching the
TypeScript node, dynamic candidate ports must use exact `inputN` names, and the
Rust worker defaults missing coalesce flags to `false` to match the JS adapter
and TypeScript node defaults.
Destructure is native-eligible only for static output paths that fit the current
simple JSONPath subset: `$`, dot-property segments such as `$.meta.name`, and
safe non-negative array-index segments such as `$.items[0]`. Wildcards,
filters, recursive descent, path inputs, and other JSONPath features remain
TypeScript fallback. The required `object` input must be connected before a
graph can enter native-fast so missing-input behavior stays aligned with the
TypeScript processor. Plain `object` graph inputs and graph outputs are admitted
across the current native subset so object-shaped values can cross graph
boundaries without changing the default TypeScript path; omitted `object` graph
inputs use the same `{}` default as the TypeScript engine. Native graph outputs
also admit the primitive, `any`, and `object` array data types so nodes such as
Object and Extract Object Path can expose array-shaped results without forcing a
fallback, but array graph inputs remain TypeScript-only until native-fast covers
the TypeScript array coercion rules.
Extract Object Path is native-eligible only when `usePathInput` is disabled, the
stored path has no interpolation tokens, and the path fits the same simple
JSONPath subset as native destructure. Dynamic path inputs, interpolation,
wildcards, filters, recursive descent, and other JSONPath features remain
TypeScript fallback. A supported path with no match returns an empty
`all_matches` value and a control-flow-excluded `match`, matching the
TypeScript node behavior.
Benchmark rows with
`createGraphRunner native-fast ...` include `nativeEligible`, `nativeUsed`,
`nativeBackend`, and `nativeFallbackReason` fields; a row where `nativeUsed` is
false is a fallback measurement, not a native speed result. A row where
`nativeBackend` is `js-adapter` is useful adapter evidence, but only
`nativeBackend: rust-worker` rows can be counted as Rust candidate evidence.
The first measured native before/after matrix is recorded in
[`native-runtime-before-after.md`](../native-runtime-before-after.md). On the
2026-05-24 local benchmark, the Rust worker cleared the feasibility gate for
eligible cheap-node, fan-in, and subgraph-heavy graph-runner workloads while
unsupported Code rows stayed on TypeScript fallback with `nativeUsed=false`.

`createGraphRunner(...)` is the additive production-facing fast path for
headless/programmatic Node integrations that load a project once and run the
same graph many times. It resolves graph selection, registry/plugin setup,
Node-default providers, settings, plugin env, tokenizer, code runner, and
project-reference loading at runner creation. Each `runner.run(...)` converts
loose `inputs` and `context` values separately and owns its own `abortSignal`.
The `runtimeProfile` option is the fast-path selector for backend integrations.
On `createGraphRunner(...)`, omitting it preserves the ordinary public Node
runner defaults. Passing `compatible` also preserves those defaults.
`headless-fast` still uses `GraphProcessor` node semantics and events, but when
the caller does not provide a custom `codeRunner`, it swaps in a
runner-owned cached Node CodeRunner. That cache stores compiled `AsyncFunction`
instances keyed by source text and argument shape only; it never caches outputs,
inputs, graph inputs, or context values. Each invocation still gets fresh local
variables. The fast profile also shares an immutable graph execution plan across
the runner's run-scoped processors. Plans are keyed by graph object, so nested
subgraph and referenced-graph processors can reuse their own validated
connection maps, port definitions, planner adjacency maps,
missing-required-input lists, start nodes, and SCC metadata. The fast profile
also caches loaded project-reference snapshots for the stable project/registry
setup. It does not cache `NodeImpl` runtime instances, run outputs, graph
inputs, context values, globals, abort state, queued nodes, or execution
metadata. The runner clears its owned caches on `dispose()`. Each run still uses
a run-scoped `GraphProcessor` with fresh node implementations so mutable
processor or custom-node state cannot leak between backend requests. If a child
graph plan is already in the runtime cache, the fresh child processor is seeded
with that immutable plan before its first `processGraph(...)` call; this skips
child preprocessor dispatch while still creating fresh runtime state. Eligible
acyclic graphs can also use the internal fast ready-queue scheduler; unsupported
graphs automatically use the compatible scheduler. Remote
Debugger, recording, SSE/event-stream consumers, editor run-from, and
Browser-mode execution should continue to use the compatible APIs until those
surfaces have explicit runner support.

`createProcessor(...)` now uses an endpoint-style default-safe fast policy for
callers that create a fresh processor, run it once, and discard it.
[`createProcessorRuntimePolicy.ts`](../packages/node/src/createProcessorRuntimePolicy.ts)
owns the internal policy split for that path. Omitted `runtimeProfile` enables
run-scoped subprocessor execution-plan caching and the default cached Node
CodeRunner when no custom `codeRunner` is supplied, but keeps compatible
scheduling and does not cache loaded project references. The root graph stays
on the ordinary one-shot planning path so plain cheap workflows do not pay
reusable-plan construction cost when there is no nested graph execution to
reuse it. `runtimeProfile: 'compatible'` is the rollback knob that disables all
optional fast behavior; the public API exports the `NodeRuntimeProfile` type
while keeping the policy helper internal. For untyped JavaScript callers, only
the documented string values are recognized; an unknown `runtimeProfile` value
uses the compatible policy instead of the omitted-default policy.
Explicit `headless-fast` enables the more aggressive pieces: run-scoped graph
plan caching, loaded-project-reference caching, the default cached CodeRunner
when no custom `codeRunner` is supplied, and the narrow `fast-acyclic` scheduler
when the run is eligible. The run-scoped caches are cleared before and after
`run()`, so they are not cross-request caches. Core will not use cached
execution plans for projects with references unless loaded-project-reference
caching is also enabled; referenced project definitions can affect node port
plans.
If `remoteDebugger !== undefined`, debugger compatibility wins and the processor
uses the fully compatible path even when `headless-fast` is present. Omitted
trace-sensitive runs also use the fully compatible path; explicit
`headless-fast` trace runs keep compatible scheduling but can still use the
other explicit fast pieces. Custom `codeRunner` instances always win; the Node
cached CodeRunner is only used when no custom runner was supplied. Recording
remains supported because the default-safe and explicit fast paths still emit
normal processor events. `runGraph(...)` now applies that omitted-profile
default-safe single-run policy selectively: root graphs with repeated direct
Subgraph targets, repeated direct Referenced Graph Alias targets, multiple
dynamic Call Graph nodes, or Code-family nodes without a custom `codeRunner`,
can use the same run-scoped subprocessor execution-plan caching and default
cached Node CodeRunner as `createProcessor(...).run()`. Simple graphs and
unrelated one-off Subgraph targets stay on the compatible policy to avoid
tiny-graph and no-reuse benchmark regressions.
`runGraph(...)` does not enable the `headless-fast` scheduler or loaded
project-reference caching, and it intentionally ignores any untyped
`runtimeProfile` property. Use `createProcessor(...)` or `createGraphRunner(...)`
when a caller needs an explicit runtime profile. Remote Debugger and
trace-sensitive `runGraph(...)` calls still fall back to the fully compatible
path through the shared runtime policy.

The P8-P12 recovery pass preserved this policy while removing redundant core
hot-path work. The final matrix restored cheap `runGraph(...)`, fresh
`createProcessor(...)`, `createGraphRunner(...)`, and direct `GraphProcessor`
rows while preserving the proven loading, Code-family, reference/subgraph, wide
fan-in, and preprocessing wins.

The final speed-plan pass did not broaden `fast-acyclic` beyond explicit
headless-fast eligible graphs. Scheduler-only benchmark rows prove it is useful
for eligible acyclic headless shapes, but split-run, loop, race, user-input, and
wait-event behavior stay excluded until a dedicated compatibility phase proves
that a specific class is safe to move.

Default-safe processors and `headless-fast` graph runners also share a graph
boundary cache for direct nested-graph callers. The core `GraphBoundaryCache`
helper is used by Subgraph, Referenced Graph Alias, and Loop Until definition
paths plus Subgraph/Referenced Graph Alias runtime input/output map
construction. The cache is keyed by graph object and cleared with the rest of
the processor/runner runtime cache; it never stores final outputs. Fresh
processors get a fresh cache, while `createGraphRunner` keeps it until
`dispose()`, matching the runner's immutable-project execution-plan cache.
Processors with project references and disabled loaded-project caching reset
the boundary cache at run start, because referenced project boundaries can be
reloaded dynamically.
Manually constructed internal contexts can omit the resolver and nested-graph
nodes will fall back to uncached boundary derivation. Ordinary graphs that do
not have boundary-driven nested-graph nodes keep the direct definition-loading
path so simple workflows do not pay a boundary-cache branch.

`captureNodeTimings` is an optional execution-metadata flag shared with core. It
adds `durationMs` and split-run `splitRunDurationMs` to `nodeFinish` / `nodeError` events without changing output
DataValues or project files. Headless `runGraph(...)` and ordinary
`createProcessor(...)` calls do not capture timings unless the caller passes the
flag. When `remoteDebugger` is supplied to Node `createProcessor(...)` or
`runGraph(...)`, the Node package defaults timing capture on so externally
triggered debugger runs can carry duration metadata to the app; passing
`captureNodeTimings: false` explicitly still wins. The app-executor overrides
missing internal run messages back to `false` so the editor's Node executor only
captures timings when the `Show node run durations` app setting asks for them.
Debugger processor attachments must forward this metadata on both successful
`nodeFinish` events and normalized `nodeError` payloads; do not rebuild error
messages in the debugger layer in a way that drops `durationMs` or split-run `splitRunDurationMs`.

Default-fast promotion is guarded by
[`packages/node/test/defaultFastCompatibility.test.ts`](../packages/node/test/defaultFastCompatibility.test.ts).
That suite compares omitted default-safe, explicit compatible, and explicit
`headless-fast` one-shot `createProcessor(...)` runs for final outputs,
callback-visible events, recorder events after serialization, partial-output
callbacks, user-input callbacks, global-set events, raised user events,
Code/Expression errors, aborts, trace fallback, Remote Debugger fallback,
custom CodeRunner ownership, custom `projectReferenceLoader` behavior, and
concurrent runs over the same project object. Dynamic graph-dispatch fixtures
such as `Call Graph` and `Referenced Graph Alias` also have output-equivalence
guards that intentionally do not pin independent root-node event order.
Recorder parity is checked against the serialized replay shape because JSON
cannot preserve `undefined` object properties. Subgraph node `duration` outputs
are treated as timing-dependent values, not exact compatibility values. The
current characterization keeps loaded-project reference caching as an explicit
fast-profile behavior when a custom `projectReferenceLoader` is present: it can
reduce observable loader call counts inside one run, so it is not part of
default behavior until that contract is accepted or guarded by an automatic
fallback.

## `@valerypopoff/rivet-app` (`packages/app/`)

### Role

Desktop IDE frontend plus Tauri app packaging layer.

### Package metadata

- Version: `2.0.1`
- Private: yes

### Runtime shape

- React/Vite frontend under `src/`
- Tauri/Rust backend under `src-tauri/`

### Important responsibilities

- graph editor
- project workspace UX
- local and sidecar execution
- plugin loading/install UI
- prompt designer
- Trivet UI
- debugger/data/update overlays

### Important current boundaries

- downstream package source imports core through `@valerypopoff/rivet2-core`, not by reaching into `packages/core/src/...`; the shared root ESLint config enforces that boundary with `no-restricted-imports`
- app-only convenience helpers, such as type-safe object iteration, live in the app package; shared behavior that must match core runtime semantics is exported intentionally by core first
- hosted/wrapper applications that mount Rivet's editor from a vendored `rivet/` folder should import directly from local source paths such as `../rivet/packages/app/src/host` and `../rivet/packages/app/src/host.css`, then render `RivetAppHost` instead of rendering `RivetApp` directly; that host shell owns QueryClient, provider context, executor-session context, async storage bootstrap, optional post-app bridge children, lifecycle callbacks, host UI policy such as browser File menu visibility, a stable imperative workspace-host handle through `onWorkspaceHostReady` / `RivetWorkspaceHostBridge` / `useRivetWorkspaceHost`, optional hosted executor websocket configuration through `executor.internalExecutorUrl`, and the shared host style entrypoint, including the Atlaskit reset that keeps canvas Markdown spacing consistent with standalone Rivet. The style entrypoint also locks the document and Rivet app shell to the iframe viewport so modal scroll restoration cannot shift or clip the editor after fullscreen output modals close. Hosted shells must make both `Roboto` and `Roboto Mono` available, because Rivet's shared typography tokens default ordinary UI text to Roboto and explicit code/monospace surfaces to Roboto Mono.
- `RivetAppHost` provider overrides are the supported hosted integration layer for IO, datasets, env vars, storage, and path policy behavior; wrappers should inject those providers instead of aliasing private globals or Tauri modules
- `RivetAppHost` UI config is the supported wrapper layer for hiding top-level browser File menu items. Pass `ui={{ fileMenu: { visibleItems: [...] } }}` with stable `FileMenuItemId` values to filter the canonical menu order and labels, including the browser-only `Rivet settings` label for the stable `settings` command id and the `Help` item for the stable `get_help` command id. This does not disable commands globally, and it does not rewrite the desktop/Tauri native application menu; `useMenuCommands` remains the command-behavior owner.
- execution transport/session ownership is centralized under `src/hooks/executorSession.ts`, `src/providers/ExecutorSessionContext.tsx`, and `src/hooks/useExecutorSessionCoordinator.ts`; `src/hooks/useExecutorSession.ts` is now only a compatibility/read-only state hook that exposes `useExecutorSessionState()` plus coordinator exports
- project/graph load-save-switch sequencing is centralized under `src/hooks/useWorkspaceTransitions.ts` and `src/utils/workspaceTransitions.ts`
- remembered editor-view persistence is handled app-side through `src/state/projectEditor.ts`, `src/hooks/useSyncCurrentProjectEditorState.ts`, and `src/hooks/useRestorePersistedWorkspace.ts` rather than through project-file serialization
- platform-specific capabilities are split under `src/utils/platform/*`; the old `nativeApp.ts` barrel has been removed so desktop integrations import only the capability they actually use
- because the app's Vite dev/build path resolves `@valerypopoff/rivet2-core` to core source, browser-reachable provider dependencies that are imported by core Chat v2 code may also need visibility in `packages/app/package.json`; `@ai-sdk/openai-compatible` is intentionally listed in both core and app for that PnP/Vite source-resolution boundary
- the Tauri backend under `src-tauri/` also vendors the two small Tauri v1 plugin crates it depends on under `src-tauri/vendor/` to avoid current Cargo/git-workspace metadata breakage from the upstream plugins workspace template

### Branding assets

- The source UI mark is [`packages/app/src-tauri/icons/rivet-2-logo-no-background.svg`](../packages/app/src-tauri/icons/rivet-2-logo-no-background.svg). It is the Rivet shape with no underlay, and consumers should color the paths for their background. The app's dark welcome screen imports a white copy at [`packages/app/src/rivet-2-logo-no-background.svg`](../packages/app/src/rivet-2-logo-no-background.svg), the plugin catalog uses a white copy at [`packages/app/src/assets/vendor_logos/rivet-logo.svg`](../packages/app/src/assets/vendor_logos/rivet-logo.svg), and the docs navbar uses a black copy at [`packages/docs/static/img/logo.svg`](../packages/docs/static/img/logo.svg).
- The source icon mark is [`packages/app/src-tauri/icons/rivet-2-logo-background.svg`](../packages/app/src-tauri/icons/rivet-2-logo-background.svg). It includes the black square background and is the source for app icons, favicons, and other fixed icon surfaces.
- Desktop app and installer icons are generated assets under [`packages/app/src-tauri/icons/`](../packages/app/src-tauri/icons/) and are referenced from `tauri.conf.json` through the `tauri.bundle.icon` list. Keep the existing filenames when replacing them, including the Windows `Square*Logo.png` and `StoreLogo.png` assets. Generate them from a 1024x1024 PNG rendered from `rivet-2-logo-background.svg` with `yarn workspace @valerypopoff/rivet-app exec tauri icon <source-png> -o src-tauri/icons`.
- The web app public icons mirror the generated desktop icon set: [`packages/app/public/favicon.png`](../packages/app/public/favicon.png), [`packages/app/public/favicon.ico`](../packages/app/public/favicon.ico), [`packages/app/public/Square284x284Logo.png`](../packages/app/public/Square284x284Logo.png), [`packages/app/public/Square310x310Logo.png`](../packages/app/public/Square310x310Logo.png), and [`packages/app/public/rivet-icon-macos.png`](../packages/app/public/rivet-icon-macos.png). `packages/app/index.html` and `packages/app/public/manifest.json` read these by their checked-in filenames.
- The documentation site uses [`packages/docs/static/img/logo.svg`](../packages/docs/static/img/logo.svg), [`packages/docs/static/img/favicon.png`](../packages/docs/static/img/favicon.png), [`packages/docs/static/img/social-card.png`](../packages/docs/static/img/social-card.png), and [`packages/docs/static/img/logo-banner-wide.png`](../packages/docs/static/img/logo-banner-wide.png). Docusaurus reads these through `packages/docs/docusaurus.config.js`; the checked-in static images are the source of truth for social cards and banner images.
- Documentation logo assets use the black no-background mark by default. [`packages/docs/src/css/custom.css`](../packages/docs/src/css/custom.css) inverts `img/logo.svg` in dark mode so the logo is white on dark backgrounds without adding an underlay. The docs social-card and wide-banner PNGs use the white no-background mark on a black background.
- There is no single checked-in logo generator yet. When the Rivet 2 logo changes, update the colored SVG copies, regenerate the Tauri icon set from the background SVG, refresh the app public icons, and update the docs static images together so the desktop shell, installer, web app, and documentation site stay visually aligned.

### Desktop version metadata

The desktop app package version is the version developers should bump first.
Tauri still reads `packages/app/src-tauri/tauri.conf.json` `package.version`
when naming installer bundles, and the Rust package version is tracked in
`packages/app/src-tauri/Cargo.toml` / `Cargo.lock`. Those secondary files are
generated from `packages/app/package.json` by
[`scripts/sync-desktop-version.mjs`](../scripts/sync-desktop-version.mjs).
Run `yarn sync:desktop-version` after bumping the app package version if you
want the generated metadata checked in. The release workflows and Tauri
`prepare:tauri` path also run the sync automatically before building, so stale
Tauri metadata cannot publish mis-versioned Windows filenames.

## `@valerypopoff/rivet-app-executor` (`packages/app-executor/`)

### Role

Node sidecar process used by the desktop app for Node-capable execution.

### Package metadata

- Version: `2.0.0`
- Bin: `./bin/executor-bundle.cjs`

### Main behavior

The sidecar:

- starts a debugger/WebSocket server
- binds to `127.0.0.1:21889` by default for the desktop internal sidecar, but accepts `--host <host>` / `RIVET_EXECUTOR_HOST` and `--port` / `RIVET_EXECUTOR_PORT` for hosted wrappers that need to expose the executor server from a container; custom ports must be valid TCP ports from `1` to `65535`
- accepts uploaded project/settings/static-data state
- uses `assembleRegistry()` from core's `RegistryAssembly.ts` to build a fresh registry for each graph run
- dynamically imports plugins through `importPluginInitializer()`, which handles CJS/ESM default-export interop
- runs graphs dynamically using `rivet-node` APIs
- injects a sidecar-only worker-backed `CodeRunner` so most Code-family JavaScript runs in a fresh Node worker thread instead of blocking unrelated node completion events on the sidecar's main event loop
- bridges permitted Code-family `console.*` calls from the worker/current-thread fallback into `codeConsole` WebSocket messages so the app can replay them in the renderer console for the active editor run
- supports preload, pause, resume, abort, and user-input messages
- supports editor run-from execution by accepting startup `preloadData` in the same `run` message as explicit `runToNodeIds`; the sidecar applies that preload after creating the processor and before calling `run()`

The worker-backed runner is scoped to the app executor. `@valerypopoff/rivet2-node`
compatible-profile `createProcessor(...)` callers still use `NodeCodeRunner` by
default unless they pass a custom `codeRunner`; omitted-default
`createProcessor(...)` and eligible `runGraph(...)` calls can use the run-scoped
cached Node CodeRunner when no custom runner is supplied. Code-family nodes that
request the `Rivet` capability fall back to current-thread execution inside the
sidecar for compatibility.

For ordinary Code (legacy), Code, and Expression node execution, the app executor
keeps a small pool of prewarmed single-use workers. Each run still consumes a
fresh worker and terminates it after the result so `globalThis` state and
`require()` module cache do not leak between runs, but worker startup is moved
out of the hot path for the next run. The default pool size is `2`;
hosted/runtime environments can set `RIVET_CODE_RUNNER_WORKER_POOL_SIZE` to tune
it or set it to `0` to disable prewarming.

The shared pool is created lazily by the code runner module, while the
app-executor sidecar explicitly prewarms it during startup before announcing the
executor websocket. Idle workers are unrefed and guarded with error/exit cleanup
so an unexpected idle-worker failure is removed from the pool and replenished
without turning into a top-level sidecar error.

The worker runner has three ownership layers. [`AppExecutorWorkerCodeRunner.mts`](../packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts)
is the `CodeRunner` orchestration layer: it prepares hosted runtime libraries,
chooses worker execution versus the `includeRivet` current-thread fallback, and
keeps the sidecar console bridge for fallback runs. [`codeRunnerWorkerPool.mts`](../packages/app-executor/bin/codeRunnerWorkerPool.mts)
owns pool size configuration, shared prewarm/shutdown lifecycle, idle-worker
checkout, replenishment, stats, and cleanup. [`codeRunnerWorkerHost.mts`](../packages/app-executor/bin/codeRunnerWorkerHost.mts)
owns the string-evaluated worker source, worker creation, ready/result message
handling, worker-exit errors, worker-side console forwarding, and error
deserialization. Keep the worker source string close to worker creation unless
the desktop package pipeline is verified on every supported platform; ordinary
Code-family runs still consume one fresh worker and terminate it after the
result.

Code-family `require()` resolution is intentionally configurable for hosted runtimes.
Both public `NodeCodeRunner` and the app-executor worker runner honor
`RIVET_CODE_RUNNER_REQUIRE_ROOT` and `RIVET_CODE_RUNNER_REQUIRE_ANCHOR`. By
default they resolve modules from the process working directory through the
synthetic `__rivet_node_code_runner__.cjs` anchor. Hosted wrappers can point the
root at a runtime-library directory instead of patching Rivet source.
Before a require-enabled or Rivet-capable Code-family node runs, the app-executor
worker runner also calls an optional global
`__RIVET_PREPARE_RUNTIME_LIBRARIES__(true)` hook when a hosted bootstrap layer
provides one. That keeps managed runtime-library sync outside Rivet core while
still giving hosted executors a stable "prepare, then resolve" seam.

### Build model

The executor source is ESM (`.mts`) but is bundled to CJS (`executor-bundle.cjs`) by esbuild so that `pkg` can statically analyze it for native binary compilation. A custom esbuild plugin inlines `@valerypopoff/rivet2-core` and `@valerypopoff/rivet2-node` from their workspace source entrypoints instead of going through built package exports. That source mapping is part of the desktop Node-executor contract: rebuilding the sidecar during `yarn dev` must pick up current core/node execution changes even when package `dist` folders are stale.

### Architectural significance

This package is effectively the app's Node execution backend. It shares the same `assembleRegistry()` helper as the app for registry construction, keeping plugin/runtime assembly logic in one place.
It is paired with the app-side shared executor session rather than being managed independently by each remote execution hook consumer.

## `@valerypopoff/rivet2-cli` (`packages/cli/`)

### Role

Operational CLI for running or serving Rivet graphs.

### Package metadata

- Version: `2.0.1`
- Source entry: `src/cli.ts`
- Published bin mapping: `rivet -> bin/cli.js`
- Types: `dist/types/cli.d.ts`
- TypeScript build input: `src/` only; `bin/` is generated output

### Commands

Current command families:

- `run <projectFile> [graphName]`
- `serve [projectFile]`

### `run` command behavior

Implemented in `src/commands/run.ts`.

Supports:

- graph selection by name/ID
- stdin JSON object inputs through `--inputs-stdin`
- repeated `--input key=value`
- repeated `--context key=value`
- optional cost suppression

Internally:

- resolves the project file
- loads the project through `rivet-node`
- parses command input through `src/commandInputs.ts`, which rejects non-object JSON, allows empty string values, and preserves `=` characters inside values
- builds a processor
- runs it
- prints JSON outputs

### `serve` command behavior

Implemented in `src/commands/serve.ts`.

Supports:

- Hono-based HTTP serving
- optional dev reload mode
- optional graph selection
- optional graph-by-path routing
- optional SSE streaming
- optional single-node streaming
- OpenAI-related option overrides

Architecturally, it is a thin HTTP wrapper around `rivet-node` processor creation and streaming helpers. Request bodies are parsed through the same object-input helper as `run`, so empty bodies become `{}` and arrays/primitives are rejected before execution. Project-file lookup resolves relative paths to absolute paths, handles directory inputs, and uses platform path helpers for suggestions so Windows paths do not get split with POSIX-only separators. Graph validation also checks that a stored main graph ID actually exists before the server starts.

### Docker image behavior

The CLI Docker image entrypoint runs the globally installed `rivet` binary as `rivet serve /project`, so project files should be mounted at `/project` and the container does not need `npx` or package resolution at runtime. `docker-publish.sh` reads the package version from `packages/cli/package.json`, passes it into the Dockerfile as `RIVET_CLI_VERSION`, and tags both amd64 and arm64 images with that same version. Do not hardcode a separate package version in the Dockerfile.

## `@valerypopoff/trivet` (`packages/trivet/`)

### Role

Graph-oriented testing package.

### Package metadata

- Version: `2.0.1`
- Main: `dist/cjs/bundle.cjs`
- Module: `dist/esm/index.js`
- Types: `dist/types/index.d.ts`

### What it contains

- test-suite/test-case/result types
- Trivet serialization
- `runTrivet(...)`
- `createTestGraphRunner(...)`
- validation helpers

### Runtime model

Trivet runs:

1. a test graph with case inputs
2. a validation graph against input/expected/output objects
3. boolean/truthy validation outputs to determine pass/fail

The app integrates this package directly for test UI and persistence.

`createTestGraphRunner(...)` also resolves runtime settings through core's shared `resolveProcessSettings(...)` helper, so Trivet inherits the same minimal runtime defaults as app and Node execution rather than carrying a separate settings shape.

## `packages/docs/`

### Role

Docusaurus documentation site package.

### Package metadata

- Version: `2.0.0`
- Private: yes

### Script surface

- `yarn start`
- `yarn build`
- `yarn serve`
- `yarn typecheck`
- standard Docusaurus maintenance commands

### Publish model

Docs publishing is handled by the GitHub Pages release workflows. The docs
package owns local Docusaurus commands such as `yarn build`, `yarn serve`, and
`yarn deploy`, but normal release publishing does not use a root publishing
script.

### Current content contract

The docs package is not an archival copy of the pre-fork Rivet docs. It should
describe the current Rivet 2 surface:

- User Guide pages, especially `docs/introduction.md`, are for normal desktop-app users first; the introduction should position Rivet as a visual low-code tool for AI and non-AI workflows, quick experiments, production workflows, and the optional self-hosted web-app form through Rivet Studio Server, while runtime package, CLI, source-checkout, and wrapper embedding details belong in API Reference pages instead of the User Guide introduction
- Tutorial pages must use current app-facing labels rather than old internal names. In particular, the old `Splitting` tutorial URL is kept for link stability, but the visible tutorial is `Running Many Items` and should describe the current node run-mode control: `Run once`, `Many parallel runs`, and `Many sequential runs`
- Tutorial pages for YAML and Subgraphs should stay as practical desktop-app walkthroughs, not placeholders. They should explain the current Extract YAML / To YAML and Graph Input / Graph Output / Subgraph node flows before sending readers to the node reference
- API Reference pages under both core and node are source-backed reference pages, not empty stubs. Keep `GraphProcessor`, `DataValue`, `NodeGraph`, `Project`, `Settings`, `DebuggerEvents`, `LooseDataValue`, `RivetDebuggerServer`, and `RunGraphOptions` aligned with the current TypeScript definitions
- public packages under `@valerypopoff`: `rivet2-core`, `rivet2-node`, `trivet`, and `rivet2-cli`
- app package names and root workspace scripts from the current manifests
- LLM Chat as the recommended chat node for new graphs, with legacy Chat called out as legacy
- Getting Started, User Guide, and Node Reference pages should teach `LLM Chat` as the default chat node for new workflows. Legacy `Chat` examples are acceptable only when the page is explicitly documenting old project/tutorial content or the legacy node itself
- User-facing docs should use `Running Many Items`, `Run once`, `Many parallel runs`, and `Many sequential runs` for node run modes. The old `Splitting` URL may remain for link stability, but new prose should avoid presenting "Split node" as the current UI label
- User-facing docs should say `workflow` / `Executing Workflows` for current graph execution concepts. The old `executing-ai-chains` URL may remain for link stability, but visible labels and prose should not present "AI chains" as the current product language
- Browser, Node, and remote executor behavior, including hosted/internal executor URL seams
- app-level plugin installation, derived project plugin YAML, missing-plugin install prompts, and read-only project-used plugin settings
- Code-family runtime permissions, Node-only `require` / `process`, and configurable require-root behavior
- HTTP Call and LLM Chat retry/status/error output contracts
- keep provider-neutral Chat v2 output assembly in `chatV2Outputs.ts` and pipeline orchestration in `chatV2Pipeline.ts` instead of adding output-shape policy back to node classes or provider adapters
- wrapper/source-checkout guidance pointing to app host seams and generated built-package artifacts rather than stale npm names
- GitHub Pages docs deployment at `/rivet2.0/`, with Docusaurus docs at the site root and a top-right `/download` page that reads stable Windows/macOS release metadata generated by the main-branch workflow plus developer Windows/macOS release metadata generated by the develop-branch workflow
- `packages/docs/docusaurus.config.js` intentionally disables the Docusaurus pages plugin (`pages: false`). The published site root is the docs plugin's introduction page, not a custom `src/pages/index.tsx` landing page. Do not add a second landing shell unless the pages plugin is intentionally re-enabled and this contract is updated.
- Docusaurus footer and header links should stay limited to current Rivet 2 surfaces; do not re-add the old Community/Discord section, legacy YouTube link, or old embedded demo/testimonial sections unless those destinations become current Rivet 2 support surfaces
- Release-download actions should route to the site's `/download` page rather than direct GitHub release asset URLs, because the docs page owns the current stable/developer release channel presentation
- article typography is tuned globally in `packages/docs/src/css/custom.css`; keep body text that follows a heading visually close to that heading while preserving the larger default gap between adjacent headings

When those implementation contracts change, update `packages/docs/docs/` and
this developer-doc package reference together.

## `scripts/publish-npm-packages.mjs`

Although not itself a package, this root script is part of the operational package story.

Current behavior:

- refuses to run on a dirty git tree unless `--skip-clean-check` is passed
- verifies the public package names and lockstep package versions
- rejects non-semver versions and versions outside major `2`
- validates built outputs for `@valerypopoff/rivet2-core`, `@valerypopoff/rivet2-node`, `@valerypopoff/trivet`, and `@valerypopoff/rivet2-cli`
- stages clean npm package directories from built artifacts
- rewrites internal `workspace:^` dependencies to the same public `^2.x` package version
- skips package versions that already exist on npm
- publishes only core, node, Trivet, and cli under the `@valerypopoff` scope

The lockstep version check reads the package manifests directly. For a
main-branch npm release, update all four public package versions together:
`packages/core/package.json`, `packages/node/package.json`,
`packages/trivet/package.json`, and `packages/cli/package.json`. The desktop
app version in `packages/app/package.json` is separate and drives Windows
installer filenames, not npm package publishing.

It does not publish the app, the app executor, or Docker images. The main-branch
npm workflow is the canonical automation path for this script. That workflow
verifies a clean checkout before installing dependencies, then verifies after
the build that only Yarn install artifacts and generated publish artifacts
changed. It then verifies the repository `NPM_TOKEN` secret with `npm whoami`
before publishing. It calls this script with `--skip-clean-check` so ignored
`.pnp.cjs`, `.pnp.loader.mjs`, `.yarn/cache`, `packages/core/dist`,
`packages/node/dist`, `packages/trivet/dist`, `packages/cli/dist`,
`packages/cli/bin`, and `packages/cli/tsconfig.tsbuildinfo` outputs do not
block publishing.

## Package-Level Refactor Guidance

- Treat `core` as the compatibility center of gravity.
- Treat `node` as the Node-default runtime adapter, not just a re-export package.
- Treat `app-executor` as a runtime package, not a build artifact.
- Treat `cli` as an operational wrapper around `rivet-node` rather than an independent execution engine.
- Treat `trivet` as both a test runner and a persistence format owner for test data.
