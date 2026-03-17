# Completed Refactors

This file is a plain-language record of refactors that have already been completed. It is
meant to describe what changed and why it mattered, without prioritization, effort sizing,
or planning metadata.


## 1. Eliminate the circular dependency through barrel imports

The circular dependency around `CallGraphNode`, `NodeRegistration`, and the core barrel
exports was removed by replacing a barrel import in `NodeRegistration.ts` with direct type
imports from the underlying source files. The root issue was that importing from
`../index.js` pulled in the entire export tree and recreated a cycle through node
registration.

This refactor matters because it makes the dependency graph easier to reason about and lets
the project enforce cycle detection more strictly. It also reduces the chance that a future
type-only import accidentally drags runtime dependencies into the registration path.

## 2. Fix the `IOProvider` interface segregation problem

The old `IOProvider` interface bundled together features that only some platforms could
actually support, especially path-based file access. Browser implementations had to expose
methods that immediately failed with “not supported”, which made the interface misleading
and forced callers to discover capability differences at runtime by triggering errors.

The refactor split the contract into a smaller base interface plus a path-capable extension,
and callers were updated to use capability checks instead of assuming every environment can
do everything. This makes platform support more explicit and is important groundwork for
web-hosted use cases where native file APIs are not available.

## 3. Remove the redundant `selectedExecutorState` atom

`selectedExecutorState` was just a thin pass-through wrapper around
`defaultExecutorState`, with the same read and write behavior and no extra logic. That
indirection added another name to learn without adding any real abstraction.

The refactor removed the duplicate atom and updated its consumers to use the real source of
truth directly. This simplifies the state layer and makes it clearer where executor
selection actually lives.

## 4. Move `WebSocket` instances out of Jotai state

The remote debugger state previously stored a live `WebSocket` object inside a persisted
Jotai atom. That mixed serializable configuration with non-serializable runtime state, so
the stored value was inherently misleading and could also leave old sockets hanging around
when state changed.

The refactor split persistent debugger configuration from transient connection state and
moved the actual socket instance into a `useRef` managed by the hook that owns the
connection lifecycle. This makes the persistence story honest, reduces leak risk, and keeps
runtime resources in the part of the code that can properly open and close them.

## 5. Add project file validation beyond basic existence checks

Project loading used to verify only a handful of top-level fields before handing data to
the rest of the system. Malformed graphs, nodes, or connections could therefore get fairly
deep into execution before failing with confusing downstream errors.

The refactor added structural validation after deserialization and improved how invalid
files are reported to the user. The main benefit is that broken project data now fails
closer to the source, with better error messages and less guesswork during debugging.

## 6. Surface plugin loading failures instead of failing silently

Plugin load errors were previously swallowed after being logged to the console, which meant
users could be missing nodes and have no clear explanation why. From the UI’s perspective,
the plugin simply disappeared.

This refactor made plugin failures visible by storing failure state and surfacing it in the
application, including user-facing notifications and plugin management feedback. One planned
piece, showing a “plugin unavailable” group in the node picker, was intentionally left out,
but the main problem of silent failure was addressed.

## 7. Clean up widespread `as any` casts

The codebase had accumulated a large number of `as any` casts, including some particularly
risky ones around node registration and event handling. Those casts suppressed useful type
checking and made it easier for real type mismatches to slip through unnoticed.

The refactor removed the vast majority of them, taking the count from 49 down to 4, with
the remaining cases limited to tests. This improves type safety, makes inference more
trustworthy, and reduces the amount of hidden type debt in core execution and UI code.

## 8. Eliminate targeted global singleton coupling

Part of the codebase depended on globally imported providers and caches that were created at
module load time. That pattern made pieces of the app harder to test and encouraged hidden
coupling, because dependencies could be reached from anywhere without being declared.

The implemented refactor addressed the dataset-related singleton coupling by replacing a
singleton import in `io/datasets.ts` with parameter injection. This is narrower than a full
provider-architecture rewrite, but it still moves the codebase in a healthier direction by
making an important dependency explicit instead of ambient.

## 9. Inject concrete dependencies into `GraphProcessor`

`GraphProcessor` used to fall back to global defaults for important collaborators such as
the node registry and tokenizer. That made the class more convenient to instantiate, but it
also hid what it truly depended on and made isolated testing and reuse more awkward.

The refactor made those dependencies explicit so callers provide the real registry and
tokenizer instead of relying on hidden fallbacks. This improves clarity at construction
time and makes `GraphProcessor` behave more like a predictable, composable service.

## 10. De-duplicate repeated patterns in `GraphProcessor`

Several execution checks and bookkeeping steps inside `GraphProcessor` were implemented more
than once, including input readiness logic, errored-input checks, cost accumulation, and
control-flow exclusion checks. Even when the copies were almost identical, they still had to
be read and maintained separately.

The refactor extracted these repeated patterns into focused private helpers, including a
shared cost accumulator for split-run behavior. This reduced duplication, tightened the main
execution paths, and made later structural refactors easier because the repeated logic was
already named and isolated.

## 11. Break up the largest methods in `GraphProcessor`

Three of the biggest methods in `GraphProcessor` combined multiple responsibilities, deep
nesting, and long stretches of stateful logic in one place. They handled orchestration,
control flow, readiness checks, context construction, and result collection with very little
internal separation.

This refactor split those methods into smaller focused units. `processGraph` and
`#processNodeIfAllInputsAvailable` were reduced dramatically, and
`#processNodeWithInputData` was also made substantially smaller even though it remains above
the ideal target size. The result is a processor that is easier to navigate, easier to test,
and better prepared for deeper modular decomposition.

## 12. Type the WebSocket protocol

The executor/debugger WebSocket protocol had grown into a loosely typed set of incoming and
outgoing messages with inconsistent field conventions. Some messages used `message`, others
used `type`, and one path still relied on a raw string format rather than a structured JSON
payload.

The refactor introduced shared message typing so the protocol is no longer just a collection
of ad hoc objects. That makes the execution boundary safer and easier to evolve. A few
inconsistencies were intentionally preserved for compatibility, so this change improved the
protocol without forcing a risky all-at-once rewrite.

## 13. Decouple app code from direct Tauri imports

Many app files imported Tauri APIs directly, which scattered platform-specific behavior
throughout the UI and bypassed the project’s own abstractions. That made browser-oriented
work harder because Tauri assumptions were embedded in components, hooks, utilities, and IO
paths.

The refactor centralized those imports behind `nativeApp.ts`, which gives the application a
clearer seam between platform-neutral logic and native integrations. The broader `NativeApi`
surface was not fully expanded in this pass, but centralization was the critical win because
it reduces direct platform leakage and simplifies future migration work.

## 14. Break up `useCurrentExecution`

`useCurrentExecution` had become a large, mixed-responsibility hook with 19 methods. It was
handling execution events, graph lifecycle transitions, user-input flows, and low-level data
transformation in one place.

The refactor separated those concerns into smaller hooks and utility functions, while still
preserving a composition layer for compatibility. This makes the execution state flow easier
to follow and lowers the cognitive load for anyone changing one slice of execution behavior.

## 15. Reduce `VisualNode` prop drilling

The canvas stack had grown a long chain of props flowing from `NodeCanvas` through several
intermediate layers into `VisualNode` and its children. Much of that data was shared across
the entire render pass, but it still had to be threaded manually through component after
component.

This refactor introduced `CanvasViewContext` and `CanvasHandlersContext`, reducing the
`VisualNode` prop surface from 28 props to 17. The main benefit is better separation between
node-specific data and shared canvas context, which makes the component tree easier to read
and gives future canvas work a cleaner structure.

## 16. Optimize `ioDefinitionsState`

The original IO definitions atom recalculated definitions for every node whenever any of a
handful of broad dependencies changed. That meant small graph edits could trigger large,
unnecessary recomputation across the whole graph.

The refactor shifted this work toward per-node computation so IO definitions are derived in
a more localized way. This improves performance characteristics, especially during editing,
and aligns the state model more closely with the actual scope of the data being updated.

## 17. Add cleanup for `atomFamily` state

Several `atomFamily` instances were creating keyed atoms over time without corresponding
cleanup when nodes, graphs, or projects disappeared. That left behind stale cached state and
opened the door to memory growth and outdated references.

The refactor expanded `cleanupNodeAtomFamilies` so it now covers execution-related and
builder-related atom families in addition to the more obvious graph entries. This makes the
dynamic state layer less leaky and keeps long-running editing sessions from carrying around
state that no longer belongs to anything in the current project.

## 18. Standardize error handling patterns

The app had multiple competing error-handling styles, including ad hoc `try/catch` blocks,
fire-and-forget async calls, and helpers that swallowed promise errors in ways that lost
important context. That inconsistency made it harder to know how failures would surface and
how much diagnostic information would survive.

This refactor moved the codebase toward a more centralized error-handling model so reporting
is more consistent and asynchronous failures are less likely to disappear silently. The goal
was not only cleaner code, but also a more predictable user and developer experience when
something goes wrong.

## 19. Consolidate serialization backward compatibility

The project supported multiple serialization versions, but the compatibility logic had grown
messy. In particular, deserialization leaned on a nested try/catch fallback chain, and the
V3 and V4 formats duplicated a lot of structure despite being mostly similar.

The refactor introduced clearer version-aware handling and reduced the amount of incidental
complexity in the compatibility path. Some shared V3/V4 logic still remains duplicated, so
there is room for future cleanup, but the serialization layer is now much easier to reason
about than it was before.

## 20. Split `GraphProcessor` into focused modules

`GraphProcessor` had grown into a single large class carrying orchestration, cycle
detection, recording playback, process-context construction, and other distinct concerns.
That concentration of responsibility made the file hard to navigate and made targeted
changes riskier than they needed to be.

This refactor extracted four major pieces into dedicated modules: `GraphPreprocessor`,
`CycleDetector`, `RecordingPlayer`, and `ProcessContextBuilder`. `GraphProcessor` is still a
large file and further extractions remain for future work, but the most self-contained
responsibilities now live in named modules with clearer boundaries.

## 21. Decompose monolithic UI components

Several large UI components had accumulated too many responsibilities, including rendering,
state orchestration, event handling, and inline helper logic. The worst offenders included
`VisualNode`, `SettingsModal`, `PromptDesigner`, `NodeCanvas`, and `GraphList`.

This refactor significantly reduced the size of some of the biggest components. `VisualNode`
was cut from 815 lines to 199, `SettingsModal` from 682 to 107, and `PromptDesigner` from
1101 to 754. `NodeCanvas` and `GraphList` still need more decomposition, but the work that
was completed already makes the component layer more maintainable and easier to split
further.

## 22. Add broader test coverage

The monorepo had very limited automated coverage relative to the size and importance of the
core execution code. Important areas such as serialization, graph preprocessing, selectors,
and storage behavior either had thin coverage or none at all.

This refactor doubled the test-file count from 7 to 14 and added new coverage for areas like
`CycleDetector`, `GraphPreprocessor`, serialization, graph selectors, hybrid storage,
user-input actions, and graph folders. There are still important gaps, especially around
abort/pause/resume behavior and end-to-end flows, but the project now has a meaningfully
stronger safety net for ongoing refactor work.

## 23. Restructure state management for separation of concerns

The state layer had mixed together raw atoms, derived selectors, storage implementation
details, and business logic. That made it harder to tell which parts of the system were
declaring state shape, which parts were computing derived values, and which parts were
performing side-effect-heavy work.

This refactor reorganized the state code around clearer boundaries so storage, selectors,
actions, and base atoms are less entangled. The result is a state system that is easier to
trace and easier to extend, while also reducing the amount of unrelated logic packed into
single state files.

## 24. Finish shrinking `GraphProcessor` into an orchestration layer

`GraphProcessor` was still carrying too many internal responsibilities even after the earlier
round of extraction work. Scheduling decisions, control-flow exclusion, split-run behavior,
loop handling, subprocessor setup, and child-event forwarding were still tightly packed into
one class, which made execution bugs harder to isolate and increased the risk of changing one
path while accidentally affecting another.

This refactor moved those responsibilities behind clearer internal boundaries by extracting
planner and subprocessor helpers, passing a shared execution-state object through the deeper
flows, and deleting obsolete private wrappers. The result is that `GraphProcessor` behaves
more like an orchestration layer around execution state and the public event API, which makes
the remaining execution code easier to navigate and safer to change.

## 25. Break up `ChatNodeBase` and remove provider-specific duplication

`ChatNodeBase` and the provider-specific chat nodes had accumulated a large amount of repeated
logic around prompt shaping, token budgeting, streaming, output normalization, and cost
tracking. That duplication made provider behavior harder to compare and increased the chance
that a bug fix in one provider path would not be carried over to the others.

This refactor split the shared chat pipeline into focused helpers and reduced provider nodes to
the parts that are genuinely provider-specific. Shared message coercion, token-budget logic,
assistant output shaping, and streaming behavior now live in reusable pipeline modules, which
lowers maintenance cost and makes future provider work less dependent on copying existing code.

## 26. Simplify execution connectivity into one explicit session manager

Executor connectivity in the app had been spread across several hooks and ad hoc coordination
mechanisms, including reconnect logic, readiness tracking, socket lifecycle, and a
module-level promise bridge. The behavior worked, but it was difficult to reason about which
part of the system owned the session at any given moment and why the UI considered the
executor ready, disconnected, or reconnecting.

This refactor introduced a single executor-session layer with explicit states and narrow
transport boundaries for the internal sidecar and remote debugger paths. Existing hooks and UI
surfaces were adapted to consume that session state instead of duplicating their own
connectivity logic. This reduces lifecycle drift and creates a cleaner seam for both current
desktop execution and future browser-safe transports.

## 27. Reduce project load/save/switch duplication into a single workspace flow

Project loading, graph switching, and saving had been implemented through several hooks and
helpers that all knew slightly different versions of the same workflow. That duplication made
it too easy to miss one persistence or cleanup concern when changing how projects moved
through the app.

This refactor consolidated those operations into an explicit workspace-transition layer with
shared helpers for graph syncing, atom-family cleanup, view restoration, and Trivet/static
data persistence. The project lifecycle now has one clearer internal flow, with thin hook
adapters on top, which reduces hook code volume and keeps platform-neutral workspace logic
separate from filesystem concerns.

## 28. Decompose the remaining large app components by responsibility

Several major UI files were still large enough to mix rendering, event handling, state
selection, and specialized sub-behaviors in one place. Even when those files were working,
their size made review slower and made it harder to tell which logic actually belonged
together.

This refactor split those components along domain boundaries instead of just chopping them by
line count. `NodeCanvas`, `NodeEditor`, `NodeOutput`, `RenderDataValue`, `SettingsPages`, and
`PluginsOverlay` were all reduced so each file answers a narrower question, which improves
reviewability, lowers unrelated subscriptions inside single components, and makes UI bugs
easier to localize.

## 29. Collapse duplicated app-side execution rendering and status derivation

The app had multiple places computing concepts like whether execution could start, whether a
run was active or paused, what status a node should display, and whether a node output was
worth rendering. That meant execution semantics were partly encoded in the UI layer itself,
with slightly different naming and predicate logic across components.

This refactor centralized those derivations into selector and helper modules near the execution
state model and updated the UI to consume the canonical outputs. This makes changes to run-
state behavior more predictable, because the action bar, node styling, process-page logic,
and output displays now speak the same status language.

## 30. Separate platform-neutral app logic from desktop-only integration points

The app layer still mixed product logic with desktop-only assumptions about Tauri APIs,
sidecar bootstrapping, dialogs, and path-based file access. That made the architecture harder
to reason about and created friction for any future browser-safe client, because platform
concerns could leak into otherwise reusable hooks and components.

This refactor moved the app toward a platform-neutral core plus explicit platform adapters.
Product code now depends more directly on capability boundaries instead of desktop-flavored
helpers, and the docs now make the distinction between shared app logic and desktop-specific
implementations explicit. This improves current dependency clarity while also preserving a
realistic path for future non-desktop clients.

## 31. Consolidate serialization code further and shrink compatibility paths

The serialization layer still carried duplicated V3/V4 helper logic and a compatibility path
that was more complicated than it needed to be. Since serialization is a user-data boundary,
that extra complexity increased review cost and made future persistence changes feel riskier
than they should have.

This refactor extracted shared serialization helpers, narrowed version detection to cleaner
entry points, and added round-trip coverage for the supported formats. The result is a smaller
and easier-to-audit compatibility surface that preserves existing file behavior while reducing
the amount of duplicate serialization and YAML-envelope logic spread across versions.

## 32. Shrink `nativeApp.ts` into focused platform capability modules

`nativeApp.ts` had become an oversized catch-all surface for desktop integrations such as app
window behavior, shell commands, dialogs, filesystem access, updater APIs, and HTTP. Even
though it was better than scattering raw Tauri imports everywhere, it still encouraged callers
to think in terms of one giant native module instead of explicit capabilities.

This refactor replaced that monolith with narrower modules under `utils/platform/`, including
separate app, shell, window, dialog, filesystem, path, updater, and HTTP helpers, plus a tiny
shared core for environment detection. The result is clearer dependency boundaries, smaller
files, and an app layer that can depend on the exact platform capability it needs.

## 33. Simplify node/plugin registration ownership

Registry setup had mixed together built-in node registration, plugin loading, runtime reset,
and global-registry replacement in ways that were functional but not very explicit. That made
plugin-related behavior harder to follow across the app and executor, and it increased hidden
coupling around global registry state.

This refactor established clearer registry assembly operations and reused them across the app
and executor. Creating a built-in registry, extending it with plugins, and optionally
installing it as the current global registry are now separate concerns. This reduces duplicate
setup code and makes plugin/runtime assembly easier to reuse outside one long-lived desktop
global path.

## 34. Replace ad hoc fire-and-forget event emission with explicit helpers

Core execution code had accumulated many inline promise-detachment patterns and lint
suppression comments around intentional fire-and-forget event emission. Even when those calls
were correct, the repeated local patterns made it hard to tell which cases were deliberate and
which might be hiding a sequencing bug.

This refactor introduced a small explicit helper for detached async emission and replaced the
repetitive inline suppressions where the behavior was intentional. That makes the async model
easier to audit, reduces comment noise, and clarifies which calls are meant to be detached
versus which ones still deserve explicit awaiting or local justification.

## 35. Clean up CJS/ESM friction in `rivet-node` and `app-executor`

The Node-oriented runtime surfaces still carried a variety of compatibility hacks for mixed
CommonJS and ESM behavior, including double-default resolution, dynamic import boundaries, and
packaging constraints imposed by `pkg`. Those issues were not always breaking builds, but they
generated confusion and made the runtime edges harder to maintain.

This refactor centralized the compatibility strategies instead of leaving them as scattered
inline special cases. Interop helpers and explicit documentation now explain why certain Node-
only or packaging-specific patterns exist. This reduces build-time surprise and makes the
runtime boundary between browser-safe code and Node-only execution more deliberate.

## 36. Create a small internal UI domain layer for graph editing actions

Graph editing behavior had still been spread across hooks, commands, state modules, and
component-local callbacks, with the same workflows assembled in slightly different ways in
different surfaces. That made editing behavior harder to trace and increased the chance of one
entry point drifting from another.

This refactor grouped the stable editing workflows into small internal domain modules for node
actions, connection actions, navigation actions, and graph or folder operations. Hooks now act
more like UI adapters over those domain helpers. This reduces repeated glue code and gives the
application a clearer place to evolve graph-editing behavior without rewriting the same
sequence in multiple UI paths.

## 37. Compress rendering-by-data-type into a table-driven renderer map

Data-value rendering had grown around long branching logic that decided how to display many
different data types in one place. That structure worked, but it made renderer-specific
behavior harder to isolate and made adding or adjusting a single data-type renderer more
invasive than it needed to be.

This refactor introduced a table-driven renderer map so type-specific rendering is delegated to
focused renderers while the top-level component stays narrow. The result is a smaller and more
extensible rendering surface, with a clearer fallback path for unsupported values and less
branching logic in the main output-view component.

## 38. Continue replacing stateful hook tricks with plain helpers where React is not needed

Several hooks were still carrying logic that was mostly pure transformation or imperative
workflow sequencing rather than true React lifecycle behavior. Keeping that code inside hooks
made the logic harder to test directly and increased the amount of closure-heavy code that had
to be understood through the lens of React state wiring.

This refactor moved those non-React responsibilities into plain helper modules and kept the
hooks focused on integration with atoms, effects, and callbacks. This reduces unnecessary hook
surface area, improves testability, and lowers the risk of accidental reactivity bugs caused
by logic that never really needed to live inside React in the first place.

## 39. Add targeted regression coverage for the simplified boundaries

The refactor plan created several cleaner internal seams, but those simplifications would have
been risky without better automated coverage around the new boundaries. Broad integration tests
alone were not enough, because the main goal was to make it safe to delete glue code and
consolidate behavior without losing confidence.

This refactor added focused regression coverage around the extracted execution, workspace,
platform, chat, and graph-editing boundaries, along with targeted tests for high-risk helper
behavior discovered during reassessment. That supports continued simplification work while
lowering the chance that subtle execution, connectivity, or UI-boundary bugs will be
reintroduced.

## 40. Replace executor-session singleton ownership with an explicit runtime

The executor session layer in the app had been improved structurally, but it still depended on
module-level mutable state for sockets, callbacks, and pending work. That made ownership
implicit, kept lifecycle coupling hidden, and made it harder to test or evolve transport
behavior without worrying about process-global side effects.

This refactor moved session ownership into an explicit app-scoped runtime that owns connection
state, message routing, request dispatch, and teardown. Hooks now subscribe to that runtime
instead of mutating a shared singleton, which makes executor behavior easier to reason about and
reduces the chance of stale session state leaking across reconnects, project switches, or future
runtime surfaces.

## 41. Make remote execution tracking request-scoped instead of single-flight

Remote execution handling previously assumed there could be only one pending run at a time. A
second run could replace the first pending promise, which meant overlapping work was not tracked
safely and completion or error handling could become attached to the wrong request.

This refactor introduced stable request IDs and request-scoped tracking for remote runs so the
app can safely manage multiple active executions at once. Completion, failure, and cleanup are
now routed to the specific request they belong to, which makes concurrent tooling behavior more
predictable and avoids confusing replacement-style failures.

## 42. Replace mutable global registry switching with clearer project-scoped ownership

The app had still been relying on a mutable global node registry that changed when projects or
plugin sets changed. Even when that worked, it created hidden coupling between project loading,
editor behavior, validation, and runtime availability because global state was standing in for
project-owned dependencies.

This refactor moved the app toward explicit project-scoped registry ownership and reduced the
amount of code that depends on the registry as an ambient singleton. That makes multi-project and
plugin behavior easier to reason about, lowers the risk that one project’s plugin changes affect
another, and gives the app a clearer dependency boundary between project state and runtime setup.

## 43. Introduce bounded concurrency policy into `GraphProcessor`

`GraphProcessor` had still been running with effectively unbounded concurrency by initializing
its queue with `Infinity`. That made resource usage and throughput depend too heavily on graph
shape and node behavior instead of an intentional execution policy, which increased the risk of
load spikes and unstable behavior under heavy fan-out.

This refactor introduced explicit concurrency policy so execution can run under clearer and more
predictable limits. The result is a scheduler that is easier to tune, easier to observe, and
less likely to overload the system unpredictably when large or high-latency graphs are running.

## 44. De-duplicate multi-project workspace state into a clearer authority model

Workspace state for multiple open projects had been duplicated across open-tab state and
persistence-oriented layers, which created overlapping sources of truth. That duplication made
stale writes, hidden synchronization drift, and unnecessary memory pressure more likely,
especially during tab switching or restoration flows.

This refactor reduced that duplication by moving the workspace toward one clearer authoritative
model and treating tab metadata and stored snapshots as narrower derived artifacts. That makes
project switching and restoration behavior more reliable and lowers the chance that the app will
resurrect stale project data after transitions or recovery paths.

## 45. Make app-side error handling more structured and boundary-aware

The app still had too many failure paths that collapsed into generic logs, generic toasts, or
silent degradation. In a stateful desktop application, that kind of low-signal failure handling
made it too easy for important execution, transport, and persistence problems to leave the app
in a partially broken state without enough information to recover or debug the issue.

This refactor pushed the codebase toward more structured, boundary-specific failure handling.
Errors now preserve more contextual information, asynchronous failures are less likely to vanish
silently, and important boundaries such as executor/session flows, plugin loading, and workspace
transitions now behave more predictably when something goes wrong.

## 46. Consolidate repeated async action and mutation boilerplate in the app

The app’s safety and error-reporting work had improved behavior, but it also left behind a lot
of repeated async boilerplate in components and hooks. Repeated `try/catch` blocks, duplicated
error-metadata wiring, wrapper-on-wrapper handlers, and near-identical React Query mutation setup
made common UI flows bigger and harder to maintain than they needed to be.

This refactor consolidated those repeated patterns into a smaller set of explicit helpers such as
`wrapAsync` and shared handled-mutation plumbing, while deliberately leaving more complex
orchestration paths explicit where their behavior is meaningfully unique. The result is smaller
call sites, more consistent async behavior, and less copy-pasted code in routine app-side flows.
