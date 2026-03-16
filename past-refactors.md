# Completed Refactors

This file is a plain-language record of refactors that have already been completed. It is
meant to describe what changed and why it mattered, without prioritization, effort sizing,
or planning metadata.

The numbering is preserved from the original plan so it is easy to cross-reference past
work when planning future refactors.

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
