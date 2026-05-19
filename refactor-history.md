# Refactor History

This file consolidates the root-level refactor records into one planning source of truth.
It was created from:

- `past-refactors.md`
- `refactoring.md`
- `refactoring2.md`
- `refactoring3.md`
- `findings.md` for adjacent completed audit-remediation work and residual watchlist items

The older files mixed completed work, implementation plans, reassessment notes, line-count
targets, and verification commands. This file keeps the durable history: what was changed,
why it mattered, how the change was made, and which files or areas were affected.

Future refactor planning should start here, then verify the current code before editing.
Some older entries name broad areas rather than exact files because the original record did
not preserve a complete file list.

## Planning Rules Preserved

- Prefer one owner per behavior policy.
- Refactor only when the new shape is easier to understand, test, or safely change.
- Do not chase line-count reduction with dense code.
- Keep persisted project and graph formats stable unless a migration is explicitly planned.
- Keep app/editor UI concerns separate from core/programmatic execution concerns.
- Prefer pure helpers and named policy modules over broad frameworks.
- Keep generated/runtime source strings debuggable when users may see their errors.
- Update developer docs when a code change moves an ownership boundary or behavior contract.
- Treat "kept intentionally" as a valid refactor outcome when a helper already pays rent.

## Numbered History

1. **Eliminated circular dependencies through barrel imports**
   - Why: Imports from core barrels pulled in the entire export tree and created cycles around node registration.
   - How: Replaced barrel imports with direct type/source imports in registration code.
   - Affected files/areas: `packages/core/src/model/NodeRegistration.ts`, core barrel exports.

2. **Split path-capable IO from the base IO provider**
   - Why: Browser providers had to implement path-based methods that could only fail at runtime.
   - How: Introduced a smaller base IO contract plus path-capable extension and updated callers to check capability.
   - Affected files/areas: app IO providers, `IOProvider` contracts, project load/save callers.

3. **Removed the redundant selected-executor atom**
   - Why: `selectedExecutorState` duplicated `defaultExecutorState` without adding behavior.
   - How: Removed the pass-through atom and updated consumers to use the real executor state.
   - Affected files/areas: app state atoms and executor-selection consumers.

4. **Moved live WebSocket objects out of persisted Jotai state**
   - Why: Persisted atoms should not hold non-serializable runtime resources.
   - How: Split durable debugger configuration from transient socket state and moved sockets into lifecycle-owned refs.
   - Affected files/areas: remote debugger state/hooks and WebSocket lifecycle code.

5. **Added structural project-file validation**
   - Why: Malformed project data could pass top-level checks and fail later with confusing execution errors.
   - How: Validated graph, node, and connection structure after deserialization and improved load errors.
   - Affected files/areas: project deserialization/loading, project validation helpers, user-facing open errors.

6. **Surfaced plugin loading failures**
   - Why: Failed plugins silently disappeared from the UI.
   - How: Stored plugin failure state and surfaced it through notifications and plugin-management feedback.
   - Affected files/areas: plugin loading hooks/state, plugin UI feedback, node availability.

7. **Reduced widespread `as any` casts**
   - Why: `as any` hid useful type checking around registration and event handling.
   - How: Removed nearly all production casts and left only narrow test cases.
   - Affected files/areas: core node registration, app event handling, related tests.

8. **Replaced targeted global singleton coupling with injection**
   - Why: Dataset IO used ambient imports that made dependencies hidden and hard to test.
   - How: Passed the dataset provider explicitly into dataset IO helpers.
   - Affected files/areas: `packages/app/src/io/datasets.ts`, dataset provider call sites.

9. **Made `GraphProcessor` dependencies explicit**
   - Why: Hidden fallbacks for registry/tokenizer made execution harder to test and reuse.
   - How: Required callers to provide concrete dependencies.
   - Affected files/areas: `packages/core/src/model/GraphProcessor.ts`, processor creation APIs, tests.

10. **Deduplicated repeated `GraphProcessor` execution patterns**
    - Why: Readiness checks, cost accumulation, errored-input handling, and control-flow checks were repeated.
    - How: Extracted focused private helpers and shared cost accumulation.
    - Affected files/areas: `GraphProcessor` internals.

11. **Broke up the largest `GraphProcessor` methods**
    - Why: Long methods mixed orchestration, readiness, context construction, and result collection.
    - How: Split `processGraph`, node readiness, and node execution paths into smaller focused units.
    - Affected files/areas: `packages/core/src/model/GraphProcessor.ts`.

12. **Typed the executor/debugger WebSocket protocol**
    - Why: Message shapes were ad hoc and inconsistent across execution transports.
    - How: Introduced shared message typing while preserving compatibility quirks where needed.
    - Affected files/areas: executor/debugger protocol types, app/executor WebSocket send/receive paths.

13. **Centralized direct Tauri imports**
    - Why: Native assumptions leaked into platform-neutral app code.
    - How: Wrapped Tauri imports behind platform/native helpers.
    - Affected files/areas: `nativeApp.ts` at the time, app components/hooks/utilities that used Tauri directly.

14. **Split `useCurrentExecution` into smaller execution hooks**
    - Why: One hook owned execution events, graph lifecycle, user-input flows, and data transformation.
    - How: Moved concerns into smaller hooks and helpers while retaining a compatibility composition layer.
    - Affected files/areas: `useCurrentExecution` and execution state hooks.

15. **Reduced `VisualNode` prop drilling**
    - Why: Shared canvas context was threaded manually through many component layers.
    - How: Introduced canvas view/handler contexts and reduced the `VisualNode` prop surface.
    - Affected files/areas: `VisualNode`, `NodeCanvas`, canvas context providers.

16. **Optimized IO-definition derivation**
    - Why: Broad atom dependencies recomputed definitions for every node after small graph edits.
    - How: Shifted IO-definition calculation toward per-node derivation.
    - Affected files/areas: `ioDefinitionsState`, graph/node IO selectors.

17. **Added cleanup for atom-family state**
    - Why: Dynamic node/graph/project atoms could survive after their owners were deleted.
    - How: Expanded atom-family cleanup for execution and builder state.
    - Affected files/areas: `cleanupNodeAtomFamilies` and related atom families.

18. **Standardized error-handling patterns**
    - Why: Async failures surfaced inconsistently through local catches, swallowed promises, and generic toasts.
    - How: Moved repeated failure reporting into centralized helpers and clearer async patterns.
    - Affected files/areas: app error handlers, async UI flows, execution hooks.

19. **Simplified serialization compatibility paths**
    - Why: Version fallbacks and V3/V4 serialization code were duplicated and hard to audit.
    - How: Introduced clearer version-aware handling and shared helpers.
    - Affected files/areas: core serialization/deserialization modules and round-trip tests.

20. **Split `GraphProcessor` into focused modules**
    - Why: The processor still owned preprocessing, cycle detection, recording playback, and context building.
    - How: Extracted `GraphPreprocessor`, `CycleDetector`, `RecordingPlayer`, and `ProcessContextBuilder`.
    - Affected files/areas: `GraphProcessor`, `GraphPreprocessor`, `CycleDetector`, `RecordingPlayer`, `ProcessContextBuilder`.

21. **Decomposed monolithic UI components**
    - Why: Large UI files mixed rendering, state orchestration, event handling, and helper logic.
    - How: Split responsibilities in major components; `VisualNode`, `SettingsModal`, and `PromptDesigner` shrank substantially.
    - Affected files/areas: `VisualNode`, `SettingsModal`, `PromptDesigner`, `NodeCanvas`, `GraphList`.

22. **Added broader regression coverage**
    - Why: Core execution and app state had too little test coverage for safe refactoring.
    - How: Added tests for cycle detection, preprocessing, serialization, selectors, storage, user-input actions, and graph folders.
    - Affected files/areas: core tests, app selector/storage tests, graph action tests.

23. **Restructured state management boundaries**
    - Why: Raw atoms, derived selectors, storage, and business logic were interleaved.
    - How: Separated state shape, selectors, actions, and storage-oriented logic.
    - Affected files/areas: app state modules, selectors, actions, storage helpers.

24. **Moved `GraphProcessor` closer to orchestration-only ownership**
    - Why: Scheduling, control-flow exclusion, split runs, loops, subprocessors, and child events were still packed together.
    - How: Extracted planner/subprocessor helpers and passed shared execution state through deeper flows.
    - Affected files/areas: `GraphProcessor`, execution planner/subprocessor helpers.

25. **Broke up `ChatNodeBase` and provider duplication**
    - Why: Provider nodes duplicated prompt shaping, token budgeting, streaming, outputs, and cost tracking.
    - How: Moved shared chat pipeline behavior into focused helpers and left providers with provider-specific code.
    - Affected files/areas: `ChatNodeBase`, provider chat nodes, chat pipeline modules.

26. **Simplified execution connectivity into an explicit session manager**
    - Why: Readiness, reconnects, sockets, and promise bridges were spread across hooks.
    - How: Introduced one executor-session layer with explicit states and transport boundaries.
    - Affected files/areas: executor session hooks/state, internal sidecar connection, remote debugger connection.

27. **Consolidated project load/save/switch into workspace transitions**
    - Why: Project lifecycle hooks had slightly different persistence and cleanup rules.
    - How: Created a clearer workspace-transition flow for graph syncing, atom cleanup, view restore, and Trivet/static data persistence.
    - Affected files/areas: workspace/project load/save hooks, graph-switch code, persistence helpers.

28. **Decomposed remaining large app components by responsibility**
    - Why: Several UI files were still broad enough to slow review and hide ownership.
    - How: Split along domain boundaries instead of line-count chunks.
    - Affected files/areas: `NodeCanvas`, `NodeEditor`, `NodeOutput`, `RenderDataValue`, `SettingsPages`, `PluginsOverlay`.

29. **Centralized app-side execution status derivation**
    - Why: UI components computed run eligibility, active/paused state, node status, and output visibility in multiple ways.
    - How: Moved those concepts into selectors/helpers near execution state.
    - Affected files/areas: execution selectors, action bar, node styling, process page, output display.

30. **Separated platform-neutral app logic from desktop integration**
    - Why: Product logic depended on Tauri dialogs, sidecar bootstrap, filesystem paths, and desktop-only helpers.
    - How: Introduced explicit platform adapters and documented the boundary.
    - Affected files/areas: app platform utilities, IO providers, sidecar bootstrap, developer docs.

31. **Consolidated serialization further**
    - Why: V3/V4 compatibility and YAML envelope logic were still duplicated.
    - How: Extracted shared serialization helpers and narrowed version detection entry points.
    - Affected files/areas: serialization versions, compatibility helpers, round-trip tests.

32. **Split `nativeApp.ts` into platform capability modules**
    - Why: One native helper became a catch-all for app, shell, window, dialog, filesystem, updater, and HTTP behavior.
    - How: Replaced it with focused modules under `utils/platform/`.
    - Affected files/areas: `utils/platform/app`, `shell`, `window`, `dialog`, `fs`, `path`, `updater`, `http`.

33. **Simplified node/plugin registration ownership**
    - Why: Built-in registration, plugin loading, runtime reset, and global replacement were mixed together.
    - How: Created explicit registry assembly operations that app and executor can share.
    - Affected files/areas: registry assembly helpers, plugin loading hooks, app-executor registry setup.

34. **Replaced ad hoc detached async event emission**
    - Why: Fire-and-forget event emission used repeated local lint suppressions and promise-detachment patterns.
    - How: Added an explicit helper for intentional detached async emission.
    - Affected files/areas: core execution event emission paths.

35. **Cleaned up CJS/ESM friction in Node runtimes**
    - Why: `rivet-node` and `app-executor` had scattered mixed-module compatibility hacks.
    - How: Centralized interop helpers and documented why packaging-specific patterns exist.
    - Affected files/areas: `packages/node`, `packages/app-executor`, plugin dynamic import paths.

36. **Created a small UI domain layer for graph editing actions**
    - Why: Graph editing workflows were rebuilt in hooks, commands, state, and callbacks.
    - How: Grouped stable workflows into domain modules for node, connection, navigation, and graph/folder operations.
    - Affected files/areas: `packages/app/src/domain/graphEditing`, commands, graph editing hooks.

37. **Made data-value rendering table-driven**
    - Why: One large branch handled many data-value display types.
    - How: Moved type-specific behavior into renderer-map entries with a clear fallback.
    - Affected files/areas: `RenderDataValue`, render-data-value renderer modules/styles.

38. **Moved non-React logic out of hooks**
    - Why: Pure transformations and imperative workflows were hidden inside React hooks.
    - How: Extracted plain helper modules and left hooks as atom/effect/callback adapters.
    - Affected files/areas: app hooks and utility modules.

39. **Added regression coverage for simplified boundaries**
    - Why: New seams needed focused tests before more glue could be deleted safely.
    - How: Added tests around execution, workspace, platform, chat, and graph-editing helpers.
    - Affected files/areas: app/core test suites for the extracted boundaries.

40. **Replaced executor-session singleton ownership with an explicit runtime**
    - Why: Module-level mutable socket/callback state hid lifecycle ownership.
    - How: Moved connection state, routing, request dispatch, and teardown into an app-scoped runtime.
    - Affected files/areas: executor session runtime, executor hooks, transport adapters.

41. **Made remote execution request-scoped**
    - Why: Single-flight pending run state could attach completions/errors to the wrong request.
    - How: Added stable request IDs and request-scoped tracking.
    - Affected files/areas: remote executor, debugger protocol handling, run request state.

42. **Reduced mutable global registry switching**
    - Why: Project/plugin behavior depended on ambient registry mutation.
    - How: Moved toward explicit project-scoped registry ownership.
    - Affected files/areas: registry state, project plugin loading, validation/runtime setup.

43. **Added bounded concurrency policy to `GraphProcessor`**
    - Why: Execution queues defaulted to effectively unbounded concurrency.
    - How: Introduced explicit concurrency policy for scheduler behavior.
    - Affected files/areas: `GraphProcessor`, split-run/concurrency execution policy.

44. **Deduplicated multi-project workspace state**
    - Why: Open tabs and persistence layers duplicated project authority.
    - How: Moved toward one authoritative workspace model and narrower derived tab/snapshot metadata.
    - Affected files/areas: multi-project workspace state, tab metadata, project persistence.

45. **Made app error handling more boundary-aware**
    - Why: Important transport, execution, plugin, and workspace errors often collapsed into generic logs/toasts.
    - How: Preserved more context and made boundary-specific failures more structured.
    - Affected files/areas: executor/session errors, plugin loading errors, workspace transition errors.

46. **Consolidated repeated async action boilerplate**
    - Why: Components and hooks repeated `try/catch`, metadata wiring, and mutation setup.
    - How: Introduced helpers such as `wrapAsync` and shared handled-mutation plumbing where behavior was routine.
    - Affected files/areas: app async handlers, React Query mutation wrappers, UI action callbacks.

47. **Added execution identity to subgraph dataflow**
    - Why: Inspector data for repeated subgraph runs could mix different invocations by array position.
    - How: Added `rootRunId` and `graphRunId`, attached identities to events, updated recording/replay, and made graph-view inspection run-scoped.
    - Affected files/areas: core execution events, recording/replay, graph view context, app execution reducers, run switcher.

48. **Simplified the execution dataflow app layer**
    - Why: The first execution-identity landing used mismatched `GraphViewKey` formats and fallback logic.
    - How: Removed dead project-scanning inference, centralized graph selection, and filtered node data by `graphRunId`.
    - Affected files/areas: graph-run view selectors, execution data state, `getGraphRunsForView`, graph navigation.

49. **Simplified remaining execution dataflow glue**
    - Why: Local/remote run-from preload, input/output sanitization, graph-run completion updates, and selected-run lookup were duplicated.
    - How: Shared run-from preload derivation, centralized sanitization, added `finishGraphRun(...)`, and passed selected run data down from `VisualNode`.
    - Affected files/areas: `useGraphExecutionEvents`, execution data selectors, `VisualNode` children, preload helpers.

50. **Made canvas undo/redo transactional and preview-driven**
    - Why: Wire rewiring created broken intermediate undo states, and duplicate/paste/auto-layout bypassed history.
    - How: Kept graph state intact until drop, carried original connection in drag state, used preview-aware selectors, routed duplicate/paste/auto-layout through commands, and cleared stale history after out-of-band graph replacement.
    - Affected files/areas: canvas wire drag state, command history, duplicate/paste/auto-layout, preview selectors.

51. **Seeded blank projects with a real default graph**
    - Why: Blank projects showed an in-memory graph not yet present in `project.graphs`.
    - How: Created an `Untitled Graph` in project state, set `mainGraphId`, and normalized project-load graph selection.
    - Affected files/areas: blank project creation, project loader, opened project metadata, workspace transitions.

52. **Made large execution outputs preview-first and ref-backed**
    - Why: Huge payloads in reactive state made the canvas sluggish even when full output was not open.
    - How: Stored oversized payloads in ref-backed storage with preview metadata, restored full values for copy/preload/inspection, and cleaned refs on reset/removal.
    - Affected files/areas: execution data storage, node output, fullscreen output, chat viewer, tooltips, preload/copy paths.

53. **Cleaned large-output boundaries and hot render paths**
    - Why: Stored-data restoration logic was repeated across output surfaces, and renderer registries were rebuilt per component.
    - How: Centralized readers in `executionDataReaders.ts`, added display-copy projection later, made renderer registry module-level/lazy, and tightened ref access.
    - Affected files/areas: `executionDataReaders.ts`, `executionDataCopyValue.ts`, `RenderDataValue`, node output readers.

54. **Added scoped Monaco folding for built-in node editors**
    - Why: Folding was needed for code/JSON node-editor fields without affecting prompt-like or unrelated Monaco surfaces.
    - How: Added `enableFolding` opt-in, enabled it for targeted built-in fields, remounted Monaco when folding/theme context changed, and shared prompt theme expansion.
    - Affected files/areas: code editor definitions, shared `CodeEditor`, node-editor Monaco wrapper, `codeEditorTheme.ts`.

55. **Added persistent per-node-type editor viewport resizing**
    - Why: Code/JSON editor fields were cramped and not user-resizable.
    - How: Added a bottom-edge resizable shell for `javascript` and `json` editor fields, persisted height in app UI storage by node type, and centralized eligibility/validation/final height.
    - Affected files/areas: node-editor code viewport shell, `useNodeEditorCodeViewportHeight.ts`, app UI storage.

56. **Made node-output `Copy value` match displayed output**
    - Why: Copying generic outputs returned internal `DataValue` wrappers instead of the shape users saw.
    - How: Added display-aligned projection, kept JSON/debug copy separate, added node-specific visible-output projectors, and delegated clipboard actions.
    - Affected files/areas: `executionDataCopyValue.ts`, `executionDataReaders.ts`, `nodeOutputCopyValueProjectors.ts`, `nodeOutputCopyActions.ts`, `NodeOutput.tsx`.

57. **Added fullscreen search inside node output**
    - Why: Users needed output-local search for large/structured fullscreen previews.
    - How: Added modal-scoped search UI, next/previous navigation, match counts, highlight rebuilds, markdown-aware behavior, and large-stored-value provider search.
    - Affected files/areas: `NodeOutput.tsx`, `FullscreenNodeOutputToolbar.tsx`, `fullscreenOutputSearch.ts`, `useFullscreenOutputSearch.ts`, `useLargeStoredValueFullscreenSearch.ts`.

58. **Persisted per-project editor view without changing project files**
    - Why: Reopening projects could lose active subgraph context, pan/zoom, or graph navigation state.
    - How: Added app-side project editor state keyed by project id, sanitized persisted graph-view state, synchronized snapshots through project load/switch/save flows, and flushed grouped storage on save.
    - Affected files/areas: `projectEditor.ts`, `projectEditorState.ts`, `useRestorePersistedWorkspace.ts`, `useSyncCurrentProjectEditorState.ts`, `useCurrentProjectEditorSnapshot.ts`.

59. **Centralized editor preference defaults after `PRE-refactor`**
    - Why: UI fallback reads for default colors and auto-open node settings were scattered.
    - How: Added `resolveEditorPreferences(settings)`, removed the narrower pass-through helper, and used resolved preferences in add-node commands.
    - Affected files/areas: `packages/app/src/state/settings.ts`, `settings.test.ts`, `packages/app/src/commands/addNodeCommand.ts`.

60. **Centralized runtime settings construction**
    - Why: Core, Node, and Trivet processor creation duplicated runtime settings defaults.
    - How: Added `resolveProcessSettings(...)` in core and reused it from processor creation while keeping Node environment fallbacks injected.
    - Affected files/areas: `packages/core/src/api/processSettings.ts`, `packages/core/src/api/createProcessor.ts`, `packages/node/src/api.ts`, `packages/trivet/src/api.ts`, `developer-docs/APP-ARCHITECTURE.md`.

61. **Documented editor-only settings boundaries**
    - Why: Public `Settings` contains editor-facing fields that graph execution ignores.
    - How: Kept fields for compatibility but documented app editor preferences versus runtime settings normalization.
    - Affected files/areas: `packages/core/src/model/Settings.ts`, `developer-docs/APP-ARCHITECTURE.md`.

62. **Extracted node metadata editing**
    - Why: `NodeEditor` mixed title, description, color, split-run, variant, and conditional controls.
    - How: Moved title/description/color metadata editing into `NodeMetadataEditor` and kept global controls focused on runtime/editing controls.
    - Affected files/areas: `packages/app/src/components/NodeEditor.tsx`, `packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx`, `NodeEditorGlobalControls.tsx`.

63. **Centralized default node-editor row rendering**
    - Why: Editor definition mapping and grouped inline-field layout were duplicated in JSX.
    - How: Added `getEditorRenderRows(...)` and related key policy in `editorUtils`; `DefaultNodeEditor` renders the row model.
    - Affected files/areas: `DefaultNodeEditor.tsx`, `DefaultNodeEditorField.tsx`, `editorUtils.ts`, `editorUtils.test.ts`.

64. **Kept node-editor width ownership centralized**
    - Why: Width persistence is sticky user state and risky to duplicate.
    - How: Audited and kept `useNodeEditorWidth` plus `NodeEditorResizeContext` as the single width boundary.
    - Affected files/areas: `useNodeEditorWidth.ts`, `NodeEditorResizeContext.ts`, `NodeEditor.tsx`.

65. **Kept dynamic-port connection recovery in domain helpers**
    - Why: Recovery policy is undo-sensitive and should not live in editor UI.
    - How: Commands call existing domain helpers for recovery and validation rather than duplicating port filtering.
    - Affected files/areas: `editNodeCommand.ts`, `editNodeConnectionRecovery.ts`, `connectionValidation.ts`, `stringListPortBinding.ts`.

66. **Made canvas visibility policy explicit**
    - Why: Comment-node visibility, passive viewport freezing, and drag exceptions were easy to break.
    - How: Added `canvasVisibilityBounds.ts` and `viewportVisibilityPolicy.ts`, with focused tests.
    - Affected files/areas: `useVisibleCanvasNodes.ts`, `canvasVisibilityBounds.ts`, `viewportVisibilityPolicy.ts`, related tests.

67. **Separated wire candidate selection from SVG rendering**
    - Why: Wire clipping, freeze behavior, and selection policy made `WireLayer` too complex.
    - How: Added `useRenderableWires` and `getRenderableWireCandidates` so `WireLayer` focuses on SVG/event rendering.
    - Affected files/areas: `WireLayer.tsx`, `useRenderableWires.ts`, `getRenderableWireCandidates.ts`.

68. **Cleaned visual-node CSS without changing cascade broadly**
    - Why: Node state styling had repeated selectors and non-obvious stacking rules.
    - How: Grouped reveal selectors with `:is(...)`, documented Comment stacking, removed extra split-run markup, and kept broad reordering out.
    - Affected files/areas: `nodeStyles.ts`, `NormalVisualNodeContent.tsx`, `VisualNode.tsx`, `SplitRunModeIcon.tsx`.

69. **Added parsed-source display utilities**
    - Why: Expression, JS List, and Extract Object Path repeated display-only interpolation checks.
    - How: Added `parsedSourceDisplayUtils.ts` for "show parsed source only when interpolation-created inputs exist"; runtime substitution stayed node-specific.
    - Affected files/areas: `expressionOutputUtils.ts`, `jsListOutputUtils.ts`, `extractObjectPathOutputUtils.ts`, `parsedSourceDisplayUtils.ts`.

70. **Consolidated structured node output presentation**
    - Why: Expression, JS List, Extract Object Path, and Code diagnostics repeated labeled sections, error text, and parsed-source UI.
    - How: Added `StructuredNodeOutput.tsx` as a common shell without node-type switches or output-port knowledge.
    - Affected files/areas: `ExpressionNode.tsx`, `JSListNode.tsx`, `ExtractObjectPathNode.tsx`, `CodeNode.tsx`, `StructuredNodeOutput.tsx`.

71. **Isolated Code-node diagnostics display**
    - Why: Core error diagnostics and app formatting were mixed.
    - How: Added an app view-model helper while core kept diagnostics extraction.
    - Affected files/areas: `CodeNode.tsx`, `codeNodeOutputUtils.ts`, `codeNodeErrorDiagnostics.ts`.

72. **Shared JS Filter / JS Map scaffolding while keeping wrappers explicit**
    - Why: JS Filter and JS Map duplicated editor/body/process scaffolding.
    - How: Added `jsListCallbackHelpers.ts` for shared scaffolding and preview generation, while filter/map runtime wrappers remain readable and distinct.
    - Affected files/areas: `JSFilterNode.ts`, `JSMapNode.ts`, `jsListCallbackHelpers.ts`, related tests.

73. **Created a display-ready graph-input usage model**
    - Why: Delete-confirmation UI was recomputing graph names and caller labels.
    - How: `graphInputUsage.ts` returns display paths and caller labels; the modal stays presentational.
    - Affected files/areas: `graphInputUsage.ts`, `graphInputUsage.test.ts`, `DeleteGraphInputConfirmModal.tsx`.

74. **Kept graph-input rename and delete policies separate**
    - Why: Deletion warnings conservatively include Call Graph object-input usages; rename propagation should only rewrite direct Subgraph terminals.
    - How: Audited shared traversal opportunities and kept policy-specific paths separate.
    - Affected files/areas: `graphInputRenamePropagation.ts`, `graphInputUsage.ts`, `editNodeCommand.ts`, `deleteNodeCommand.ts`, domain tests.

75. **Extracted remote-debugger popup positioning**
    - Why: DOM measurement and popup clamping made UI code harder to read.
    - How: Added `debuggerPanelPosition.ts` for fallback, anchored placement, and horizontal clamping.
    - Affected files/areas: `DebuggerConnectPanel.tsx`, `ActionBar.tsx`, `debuggerPanelPosition.ts`, `debuggerPanelPosition.test.ts`.

76. **Kept modal sharing as pure helpers instead of a modal framework**
    - Why: A generic modal abstraction would add more complexity than it removed.
    - How: Kept fullscreen bounds math pure and graph-input modal data display-ready, but did not introduce a broad modal hierarchy.
    - Affected files/areas: `FullScreenModal.tsx`, `fullScreenModalBounds.ts`, `DeleteGraphInputConfirmModal.tsx`.

77. **Enforced maintainability-gated deletion in the second refactor pass**
    - Why: The first post-`PRE-refactor` cleanup improved structure but missed code-volume goals.
    - How: Used commit `29b9b889` as baseline, applied a helper-rent rule, and refused net-growth substeps unless they improved a boundary.
    - Affected files/areas: `refactoring2.md`; implementation touched editor, output, JS-list, canvas, and docs areas below.
    - Result: `152` net production lines removed, excluding docs/tests.

78. **Trimmed low-return editor abstractions**
    - Why: Some helper boundaries needed to prove they paid rent.
    - How: Kept `editorUtils` because it protects grouping/key policy, reverted a weak `NodeMetadataEditor` simplification, removed repeated title/description CSS, and left width persistence untouched.
    - Affected files/areas: `DefaultNodeEditor.tsx`, `editorUtils.ts`, `editorUtils.test.ts`, `NodeMetadataEditor.tsx`, `NodeEditorGlobalControls.tsx`, `NodeEditor.tsx`, `useNodeEditorWidth.ts`, `NodeEditorResizeContext.ts`.

79. **Collapsed structured-output duplication further**
    - Why: The structured shell still had nearby duplicated split-output and wrapper-component glue.
    - How: Centralized numeric split-output sorting, removed thin JS Filter/Map output wrapper components, and fixed error-state suppression to use status type.
    - Affected files/areas: `StructuredNodeOutput.tsx`, `CodeNode.tsx`, `ExpressionNode.tsx`, `JSListNode.tsx`, `ExtractObjectPathNode.tsx`.
    - Result: `81` net production lines removed in the structured-output phase.

80. **Trimmed JS-list helper surface**
    - Why: Preview-only helpers did not need to be exported as a larger API.
    - How: Made unneeded helpers file-local, kept wrapper builders exported where tests protect generated-code behavior, and kept wrapper strings explicit.
    - Affected files/areas: `jsListCallbackHelpers.ts`, `JSFilterNode.ts`, `JSMapNode.ts`.

81. **Hardened accepted-growth helpers without collapsing useful boundaries**
    - Why: Some new helpers added lines but protected difficult policies.
    - How: Kept `useRenderableWires`, visibility helpers, `processSettings`, `debuggerPanelPosition`, and graph-input usage model where they owned testable policy; trimmed small redundant exports/labels.
    - Affected files/areas: `useRenderableWires.ts`, `canvasVisibilityBounds.ts`, `viewportVisibilityPolicy.ts`, `processSettings.ts`, `debuggerPanelPosition.ts`, `graphInputUsage.ts`.

82. **Made refactor-plan outcomes more truthful**
    - Why: `DONE` labels were too ambiguous for future planning.
    - How: Recorded whether each substep was deleted, collapsed, kept intentionally, or accepted growth; updated docs only for real ownership changes.
    - Affected files/areas: `refactoring2.md`, `developer-docs/*`.

83. **Scoped the post-Chat-v2 hardening pass**
    - Why: After `a36014d5`, new complexity concentrated around LLM Chat v2, worker isolation, settings polish, output UI, and package metadata.
    - How: Used `a36014d5` as boundary, classified growth buckets, and avoided reopening stable completed areas without a concrete post-refactor reason.
    - Affected files/areas: `refactoring3.md`; subsequent entries describe implementation.
    - Result: Original deletion target was missed; the accepted tradeoff was clearer high-risk Chat v2 runtime ownership.

84. **Extracted LLM Chat v2 credential resolution**
    - Why: API-key source policy is security-sensitive and was mixed with provider/runtime setup.
    - How: Moved configured-provider keys, custom-provider env lookup, input-port validation, and missing-key errors into the cohesive runtime-options boundary.
    - Affected files/areas: `llmChatV2NodeRuntime.ts`, `chatV2RuntimeOptions.ts`, `LLMChatV2Node.test.ts`, `developer-docs/APP-ARCHITECTURE.md`.

85. **Extracted LLM Chat v2 editor-cache policy**
    - Why: Cache identity mixed prompts, credentials, provider config, tools, response format, and generation settings inside the runtime coordinator.
    - How: Added `chatV2EditorCache.ts` for cache keys, secret/provider fingerprints, output cloning, and editor-only cache lookup.
    - Affected files/areas: `llmChatV2NodeRuntime.ts`, `chatV2EditorCache.ts`, `llmChatV2NodeData.ts`, `LLMChatV2Node.test.ts`, `developer-docs/APP-ARCHITECTURE.md`.

86. **Extracted LLM Chat v2 generation, provider-option, and tool policy**
    - Why: Vercel SDK option shapes and provider-specific reasoning/tool settings were too dense in the coordinator.
    - How: Added cohesive `chatV2RuntimeOptions.ts` ownership for generation settings, extra provider options, provider-specific reasoning/thinking, tool choice, built-in provider tools, and OpenAI parallel-tool settings.
    - Affected files/areas: `llmChatV2NodeRuntime.ts`, `chatV2RuntimeOptions.ts`, `providerOptions.ts`, `toolContinuation.ts`, Chat v2 tests.

87. **Left the LLM Chat v2 runtime coordinator as high-level assembly**
    - Why: Too many small helpers can create jump fatigue, but the coordinator should not own raw JSON parsing or provider-specific object construction.
    - How: Kept `resolveLLMChatV2RuntimeConfig(...)` focused on provider/model/base URL, credentials, model instance, functions, runtime options, response format, and cache lookup.
    - Affected files/areas: `llmChatV2NodeRuntime.ts`, `chatV2RuntimeOptions.ts`, `chatV2EditorCache.ts`.

88. **Hardened LLM Chat v2 provider error normalization**
    - Why: Provider and Vercel errors need user-facing detail without leaking secrets or destroying unknown debugging information.
    - How: Trimmed broad data rendering, preserved scalar/nested provider messages, stripped endpoint query strings, passed aborts through, and kept original causes attached.
    - Affected files/areas: `chatV2Errors.ts`, `chatV2Errors.test.ts`, `chatV2Pipeline.ts`, `developer-docs/APP-ARCHITECTURE.md`.

89. **Grouped LLM Chat v2 provider-specific settings definitions**
    - Why: Provider editor sections were hard to audit for visibility/order.
    - How: Added named in-file builders for OpenAI, Anthropic, and Google sections plus a small provider-section helper; avoided a broad settings DSL.
    - Affected files/areas: `llmChatV2NodeEditors.ts`, `LLMChatV2Node.test.ts`.

90. **Simplified the LLM Chat v2 model catalog editor in place**
    - Why: Refresh status, provider/status keys, and refresh messages were mixed into render logic.
    - How: Kept status as a small module-level map, named provider/status-key helpers, and moved refresh message construction into a pure helper without extracting unnecessary hooks/components.
    - Affected files/areas: `LLMChatV2ModelCatalogEditor.tsx`, `chatV2ModelCatalog.ts`, `chatV2CustomProviderEnv.ts`.

91. **Standardized settings field spacing with small CSS ownership**
    - Why: Node/app settings spacing had repeated one-off margin fixes.
    - How: Used named spacing variables in settings page styles and node editor group/row styling instead of adding a new React shell.
    - Affected files/areas: `DefaultNodeEditorField.tsx`, `EditorGroup.tsx`, `KeyValuePairEditor.tsx`, `StringListEditor.tsx`, `SegmentedEditor.tsx`, app settings pages, `settingsPageStyles.ts`, `nodeStyles.ts`.

92. **Consolidated toggle and segmented-control sizing policy**
    - Why: App settings and node settings controls risked drifting visually.
    - How: Kept `ScalableToggle` as primitive, `LabeledToggle` as label/hint wrapper, and left segmented control sizing with its existing scaled owner.
    - Affected files/areas: `LabeledToggle.tsx`, `ScalableToggle.tsx`, `SegmentedEditor.tsx`, `UiSettingsPage.tsx`, node editor styles.

93. **Reunified output and fullscreen presentation where sharing already existed**
    - Why: Output surfaces should use one visual language without reopening completed structured-output internals.
    - How: Verified compact/fullscreen output share render-data-value styles and kept toolbar ownership split between modal geometry and toolbar controls.
    - Affected files/areas: `renderDataValueStyles.ts`, `NodeOutput.tsx`, `FullScreenModal.tsx`, `FullscreenNodeOutputToolbar.tsx`, `StructuredNodeOutput.tsx`.

94. **Audited app-executor worker console serialization**
    - Why: Worker source and current-thread fallback duplicated small console serialization logic.
    - How: Kept the duplication because the worker source is string-evaluated and sharing host functions would add bundling complexity; documented the `includeRivet` fallback boundary.
    - Affected files/areas: `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts`, `developer-docs/APP-ARCHITECTURE.md`, `developer-docs/CORE-ENGINE.md`.

95. **Kept Prompt and Tool body preview behavior explicit**
    - Why: Prompt has line-by-line empty-line preservation and interpolation highlighting; Tool uses markdown body rendering and schema interpolation rules.
    - How: Did not create a generic body-line renderer; documented that Tool Description reuses the resizable code editor shell without creating interpolation ports.
    - Affected files/areas: `PromptNode.tsx`, `NodeBody.tsx`, `ToolNode.ts`, `developer-docs/APP-ARCHITECTURE.md`.

96. **Audited OpenAI-compatible provider dependency ownership**
    - Why: Custom-provider support added package and PnP/Vite resolution risk.
    - How: Kept `@ai-sdk/openai-compatible` in `packages/core` for runtime construction and in `packages/app` for app/Vite workspace resolution under PnP.
    - Affected files/areas: `packages/core/package.json`, `packages/app/package.json`, `yarn.lock`, `.pnp.cjs`, `providerOptions.ts`, `developer-docs/PACKAGES.md`.

97. **Kept small post-refactor UI and graph patches local**
    - Why: Small cohesive patches should not be churned just because they landed after a refactor boundary.
    - How: Audited Ctrl+X, graph-reference reachability, split-run summary/concurrency, max concurrent runs, and resize cursor normalization; no refactor applied.
    - Affected files/areas: `useCopyNodesHotkeys.ts`, `graphReachability.ts`, `SplitRunSummary.tsx`, `SplitRunProcessor.ts`, `NodeBase.ts`, `resizeCursors.ts`.

98. **Fixed app lint including a hook-order bug**
    - Why: Lint was red and one failure was a real conditional-hook bug in `PortInfo`.
    - How: Split `PortInfo` into wrapper/inner components so hooks only mount after a valid port definition; cleaned duplicate imports, `prefer-const`, async click handlers, and hook dependencies.
    - Affected files/areas: `PortInfo.tsx`, `NavigationBar.tsx`, `LLMChatV2ModelCatalogEditor.tsx`, fullscreen/search hooks, prompt designer attached-node hook, execution/menu/node-event hooks, platform shell utility.

99. **Redacted runtime/provider logging**
    - Why: Runtime execution paths logged graph data and provider chunks too freely.
    - How: Added runtime logging helpers, moved shape diagnostics behind debug logging, summarized provider JSON parse failures, and avoided normal logs of raw port maps, provider chunks, and sidecar stderr text.
    - Affected files/areas: `runtimeLogging.ts`, `providerStreamParsing.ts`, `executor.mts`, executor sidecar runtime, local/remote executor hooks, OpenAI/Anthropic provider utilities, Trivet API, `developer-docs/CORE-ENGINE.md`.

100. **Extracted loop-controller break policy**
    - Why: `GraphProcessor` had a confusing suppressed branch around loop-controller break handling.
    - How: Added `loopControllerBreak.ts` with `didLoopControllerBreak(...)` and exported the `loop-not-broken` sentinel; covered behavior with focused tests.
    - Affected files/areas: `GraphProcessor.ts`, `loopControllerBreak.ts`, `loopControllerBreak.test.ts`.

101. **Documented tracked pnpm sidecar binary policy**
    - Why: Large platform sidecar binaries were tracked without an explicit review/update policy.
    - How: Kept binaries tracked, classified them in `.gitattributes`, added README/checksums, and documented update/release implications.
    - Affected files/areas: `.gitattributes`, `packages/app/sidecars/pnpm/README.md`, `packages/app/sidecars/pnpm/SHA256SUMS`, `useLoadPackagePlugin.ts`, `tauri.conf.json`, `developer-docs/BUILD-AND-CI.md`, `developer-docs/PLUGIN-SYSTEM.md`.

102. **Centralized unsafe provider stream parse diagnostics**
    - Why: OpenAI and Anthropic had duplicated raw-chunk parse diagnostics.
    - How: Added `providerStreamParsing.ts` and shared JSON chunk parse/error policy while avoiding a broad provider abstraction.
    - Affected files/areas: `openai.ts`, `anthropic.ts`, `ChatAnthropicNode.ts`, `providerStreamParsing.ts`, `providerStreamParsing.test.ts`.

103. **Split node-output surface ownership**
    - Why: `NodeOutput.tsx` had grown into a broad owner for inline rendering, fullscreen modal orchestration, process paging, output fade/replacement policy, search, wrapping, copy actions, and prompt-designer entry.
    - How: Kept `NodeOutput.tsx` as the stable adapter and compatibility re-export, then moved in-canvas rendering to `NodeInlineOutput.tsx`, fullscreen output orchestration to `NodeFullscreenOutput.tsx`, content-key fade/replacement-grace policy to `NodeOutputContentState.tsx`, and shared process controls to `NodeOutputPager.tsx`.
    - Affected files/areas: `NodeOutput.tsx`, `NodeInlineOutput.tsx`, `NodeFullscreenOutput.tsx`, `NodeOutputContentState.tsx`, `NodeOutputPager.tsx`, node-output regression tests, `developer-docs/APP-ARCHITECTURE.md`.
    - Result in numbers: `NodeOutput.tsx` shrank by 849 net production lines (`+9/-858`). The split added focused owner files, so production code moved `+876/-858` for a net `+18`; tests moved `+57/-26` for net `+31`; docs/planning moved `+1097/-9` for net `+1088` because the full refactor plan was introduced in this commit.

104. **Extract graph-list menu and presentation helpers**
    - Why: `GraphList.tsx` still owned menu item construction, context-menu target normalization, reachability/reference derivation, and row presentation flags alongside drag/drop, modal state, and rendering.
    - How: Added pure graph-list context-menu builders and target resolution in `graphListContextMenu.ts`, moved reachability/reference and row presentation derivation into `useGraphListPresentation.ts`, and left command dispatch plus graph/project modal ownership in `GraphList.tsx`.
    - Affected files/areas: `GraphList.tsx`, `FolderItem.tsx`, `graphListContextMenu.ts`, `useGraphListPresentation.ts`, graph-list regression tests, `developer-docs/APP-ARCHITECTURE.md`.
    - Result in numbers: `GraphList.tsx` shrank by 84 net production lines (`+55/-139`). The new tested helpers made production code move `+426/-170` for a net `+256`; tests moved `+288/-5` for net `+283`; docs/planning moved `+27/-5` for net `+22`.

105. **Separated execution-data storage, preview, and copy policy**
    - Why: `executionDataTransforms.ts` and `executionDataCopyValue.ts` mixed storage/ref lifecycle, preview decisions, restore helpers, and display-copy projection in broad utility files.
    - How: Added focused storage, preview, and sanitization modules, kept `executionDataTransforms.ts` as a compatibility facade, split display-copy implementation under `executionDataCopy/`, and moved internal imports to the new ownership modules.
    - Affected files/areas: `executionDataStorage.ts`, `executionDataPreview.ts`, `executionDataSanitization.ts`, `executionDataCopy/*`, execution-data regression tests, `developer-docs/APP-ARCHITECTURE.md`, `developer-docs/EXECUTION-DATA-FLOW.md`.
    - Result in numbers: broad compatibility files shrank substantially: `executionDataTransforms.ts` shrank by 780 net lines (`+22/-802`) and `executionDataCopyValue.ts` shrank by 311 net lines (`+9/-320`). The new focused modules made production code move `+1215/-1141` for a net `+74`; tests moved `+200/-0`; docs/planning moved `+154/-32` for net `+122`.

106. **Simplified remote execution client pipeline**
    - Why: `useRemoteExecutor.ts` owned upload cache decisions, websocket send handling, active request filtering, and Trivet pending-run cleanup alongside its React/session adapter responsibilities.
    - How: Added explicit upload planning in `remoteExecutorUploadCache.ts`, extracted request-id registration/filtering/send-failure helpers into `remoteExecutorRunRequest.ts`, and rewired `useRemoteExecutor.ts` to use those helpers while keeping atom reads and execution side effects in the hook.
    - Affected files/areas: `useRemoteExecutor.ts`, `remoteExecutorUploadCache.ts`, `remoteExecutorRunRequest.ts`, remote executor helper tests, `developer-docs/APP-ARCHITECTURE.md`, `developer-docs/EXECUTION-DATA-FLOW.md`.
    - Result in numbers: `useRemoteExecutor.ts` stayed essentially size-neutral (`+38/-39`, net `-1`) while request/upload policy moved into named helpers. Production code moved `+183/-46` for a net `+137`; tests moved `+208/-0`; docs/planning moved `+108/-8` for net `+100`.

107. **Split Remote Debugger server transport policies**
    - Why: `debugger.ts` owned websocket protocol handling, heartbeat, safe-send behavior, error emission, processor attachment cleanup, request-id association, and partial-output throttling in one high-impact transport file.
    - How: Kept `startDebuggerServer` as the public protocol assembler while extracting best-effort send/error policy to `debuggerTransport.ts`, heartbeat and timer cleanup to `debuggerHeartbeat.ts`, and processor listener lifecycle to `debuggerProcessorAttachments.ts`.
    - Affected files/areas: `packages/node/src/debugger.ts`, `debuggerTransport.ts`, `debuggerHeartbeat.ts`, `debuggerProcessorAttachments.ts`, Remote Debugger API docs, `developer-docs/APP-ARCHITECTURE.md`, `developer-docs/EXECUTION-DATA-FLOW.md`.
    - Result in numbers: `debugger.ts` shrank by 262 net production lines (`+41/-303`). Extracted transport/heartbeat/attachment helpers made production code move `+382/-303` for a net `+79`; no dedicated test lines moved in this commit; docs/planning moved `+88/-16` for net `+72`.

108. **Clarified app-executor Code worker ownership**
    - Why: `AppExecutorWorkerCodeRunner.mts` mixed CodeRunner orchestration, shared worker-pool lifecycle, package-sensitive stringified worker source, host-side request/result handling, and current-thread fallback behavior.
    - How: Kept `AppExecutorWorkerCodeRunner.mts` as the orchestration adapter, moved shared prewarm/pool lifecycle into `codeRunnerWorkerPool.mts`, and moved the eval worker source plus ready/result/error handling into `codeRunnerWorkerHost.mts`.
    - Affected files/areas: `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts`, `codeRunnerWorkerPool.mts`, `codeRunnerWorkerHost.mts`, `developer-docs/PACKAGES.md`, `developer-docs/EXECUTION-DATA-FLOW.md`, `developer-docs/CORE-ENGINE.md`, `developer-docs/APP-ARCHITECTURE.md`.
    - Result in numbers: `AppExecutorWorkerCodeRunner.mts` shrank by 493 net production lines (`+14/-507`). New worker host/pool owners made production code move `+546/-509` for a net `+37`; tests moved `+4/-2` for net `+2`; docs/planning moved `+78/-8` for net `+70`.

109. **Unified JS interpolation execution helpers**
    - Why: Code, Expression, JS Filter, and JS Map shared value-backed interpolation behavior but duplicated generated-code policy around input discovery, cloned inputs, safe helper identifiers, preview text, and generated-error sanitization.
    - How: Moved the shared mechanics into `jsValueInterpolation.ts` while keeping each node's runtime wrapper, output contract, permission policy, JS-list fixed-array clone order, and Code-specific line diagnostics explicit.
    - Affected files/areas: `CodeNewNode.ts`, `ExpressionNode.ts`, `jsListCallbackHelpers.ts`, `jsValueInterpolation.ts`, interpolation/display regression tests, `developer-docs/CORE-ENGINE.md`.
    - Result in numbers: duplicated node helpers shrank together by 70 net production lines across `CodeNewNode.ts`, `ExpressionNode.ts`, and `jsListCallbackHelpers.ts` (`+83/-153`). The shared helper made production code move `+168/-154` for a net `+14`; tests moved `+58/-3` for net `+55`; docs/planning moved `+34/-2` for net `+32`.

110. **Characterized GraphProcessor before further extraction**
    - Why: `GraphProcessor.ts` remains the execution heart, so further splitting needs a focused public-behavior safety net before any policy movement.
    - How: Added characterization coverage for root event order, error/finish behavior, partial-output process identity, subgraph execution metadata, preload/run-to boundaries, pause/resume scheduling, globals, and race winner/loser handling without moving runtime code.
    - Affected files/areas: `GraphProcessor.characterization.test.ts`, `developer-docs/CORE-ENGINE.md`, `refactor.md`.
    - Result in numbers: this was deliberately not a line-saving phase: production code moved `+0/-0`. It added 565 test lines and docs/planning moved `+45/-16` for net `+29`, giving future `GraphProcessor` extractions a behavior safety net before code moves.

111. **Hardened execution-data visibility, restore, and copy boundaries after the split**
    - Why: The storage/copy split exposed subtle presence-vs-value risks: absent/nullish stored port wrappers could look like explicit `undefined`, empty or hidden-only split-output maps could hide valid final `outputData`, and warnings/internal ports could leak into body rendering or copy projection.
    - How: Added shared visible-output-port policy, skipped absent wrappers consistently, preserved explicit `{ type: 'any', value: undefined }` as real data, restored preview-only inputs per port, kept executor preload strict while rejecting malformed empty output maps, aligned inline/fullscreen warning rendering, gated custom copy projectors on visible output maps, and covered hidden-only split data for internal JSON copy when no final output fallback exists.
    - Affected files/areas: `outputPortVisibility.ts`, `executionDataReaders.ts`, `executionDataStorage.ts`, `executionDataCopy/*`, `nodeOutputCopyValueProjectors.ts`, `RenderDataValue.tsx`, `PortInfo.tsx`, `ChatViewer.tsx`, node output components, Code/Expression/JS-list/Extract Object Path preview components, Prompt Designer hydration, run-from preload helpers, execution-data and output regression tests, `developer-docs/EXECUTION-DATA-FLOW.md`, `refactor.md`.
    - Result in numbers: entries 111-113 landed in one hardening commit. Commit-wide production code moved `+372/-174` for a net `+198`; tests moved `+727/-16` for net `+711`; docs/planning moved `+147/-12` for net `+135`. This entry accounts for the broad output-boundary portion, so it intentionally added code and tests rather than saving lines.

112. **Tightened remote-run preload eligibility after the client-pipeline split**
    - Why: Run-from preload should reuse only real stored boundary outputs. A stored map whose ports are all absent/nullish is malformed history, not a reusable upstream result.
    - How: Reused the execution-data reader boundary for preload extraction, skipped malformed empty stored output maps, and kept older usable runs eligible as fallback data for editor run-from behavior.
    - Affected files/areas: `remoteExecutorHelpers.ts`, `remoteExecutorHelpers.test.ts`, `executionDataReaders.ts`, `developer-docs/EXECUTION-DATA-FLOW.md`, `refactor.md`.
    - Result in numbers: the run-from preload slice of the hardening commit moved production code `+73/-15` for a net `+58` across `remoteExecutorHelpers.ts` and shared readers, added 78 focused test lines, and moved docs/planning `+122/-10` for net `+112`.

113. **Encapsulated Remote Debugger attachment snapshots after the transport split**
    - Why: Processor-routing callbacks received the live attached-processor list, which made it possible for routing code to mutate debugger-server attachment state accidentally.
    - How: Returned snapshots of attached processors to routing callbacks, kept the attachment helper as the state owner, and added regression coverage for snapshot behavior.
    - Affected files/areas: `packages/node/src/debuggerProcessorAttachments.ts`, `packages/node/src/debugger.ts`, `packages/node/test/debugger.test.ts`, `developer-docs/EXECUTION-DATA-FLOW.md`, `refactor.md`.
    - Result in numbers: the debugger attachment slice moved production code `+3/-7` for a net `-4`, added debugger test coverage `+33/-5` for net `+28`, and shared the hardening commit's docs/planning movement of `+122/-10` for net `+112`.

114. **Centralized node-output view models and copy policy**
    - Why: Inline output, fullscreen output, body rendering, warnings, split-output fallback, and copy actions still rediscovered nearby pieces of the same output-surface policy after the first output split.
    - How: Added `nodeOutputViewModel.ts` as the pure owner for selected fullscreen process data, content kind (`output`, `custom-error`, `code-error`, `generic-error`, `empty`), warning sections, body-source selection, display-copy serialization, and JSON-copy serialization. Rewired inline/fullscreen surfaces and copy actions to consume that owner while leaving React layout, fullscreen search, wrapping, Markdown toggles, prompt-designer entry, and modal geometry in the components.
    - Follow-up reassessment: Moved the absent-wrapper and hidden-only output-map guard into `nodeOutputViewModel.ts` itself so future output surfaces cannot render phantom body content by bypassing the existing selected-process filter.
    - Affected files/areas: `NodeInlineOutput.tsx`, `NodeFullscreenOutput.tsx`, `renderNodeOutputBody.tsx`, `nodeOutputCopyActions.ts`, `nodeOutputViewModel.ts`, node-output view-model tests, `developer-docs/APP-ARCHITECTURE.md`, `developer-docs/EXECUTION-DATA-FLOW.md`.
    - Result in numbers: existing inline/fullscreen/body/copy call sites moved `+82/-74` for a net `+8`, then the new 201-line `nodeOutputViewModel.ts` made production code net `+209`. The phase also added a 217-line view-model test file and updated the developer docs/refactor notes. This was not a line-saving phase; it traded a small net increase for one tested owner of duplicated output-surface policy.

115. **Deleted obsolete app-private compatibility facades**
    - Why: After storage/copy/output ownership moved to focused modules, several app-private facades no longer protected a real migration boundary and had no production imports.
    - How: Deleted the `executionDataTransforms.ts`, `syncWrapper.ts`, and `globals.ts` barrels, removed the `syncWrapper(...)` alias from `errorHandling.ts`, and moved execution-data storage regression coverage onto `executionDataStorage.test.ts` so tests import the real owner directly.
    - Affected files/areas: `executionDataStorage.test.ts`, `errorHandling.ts`, `errorHandling.test.ts`, execution-data and async-helper developer docs.
    - Result in numbers: production code moved `+0/-45` for net `-45`. Tests moved `+512/-575` for net `-63` while preserving storage/ref coverage and removing obsolete alias coverage. Docs/planning moved `+15/-4` for net `+11`.

116. **Simplified executor-session and remote transport ownership**
    - Why: `executorSession.ts` still coordinated socket lifecycle while also owning target identity, JSON frame classification, dataset request dispatch, pending graph-run promise maps, and callback error isolation.
    - How: Kept `executorSession.ts` as the state/reconnect/socket-generation coordinator and moved focused app-private policy into `executorSessionTarget.ts`, `executorSessionTransport.ts`, `executorSessionDatasetBridge.ts`, `executorSessionPendingExecutions.ts`, and `executorSessionCallbackIsolation.ts`. The debugger server and app-executor protocol were intentionally left unchanged.
    - Affected files/areas: `executorSession.ts`, new executor-session helper modules and tests, `developer-docs/APP-ARCHITECTURE.md`, `developer-docs/EXECUTION-DATA-FLOW.md`, `refactor.md`.
    - Result in numbers: `executorSession.ts` shrank by 241 net production lines (`+99/-340`). New focused production owner modules added 403 lines after the cleanup pass, so production code moved `+502/-340` for a net `+162`; tests moved `+287/-0`; docs/planning moved `+67/-9` for net `+58`.

117. **Made canvas interaction ownership explicit**
    - Why: `NodeCanvas.tsx` and `useDraggingNode.ts` still mixed React orchestration with drag policy, selection/highlight derivation, graph-search node matching, and node context-menu hydration.
    - How: Moved node-drag decision rules into `nodeDragInteraction.ts`, moved selected/editing/fullscreen/search/hover id derivation into `nodeCanvasInteractionModel.ts`, and moved node/blank-area context-menu hydration plus `Run from here` availability into `nodeCanvasContextMenuModel.ts`. The reassessment pass made graph-search highlight inputs explicit and made malformed node context-menu targets with missing node ids or node types fall back to blank-area context. `NodeCanvas` and `useDraggingNode` now pass current state into those policy owners while keeping command dispatch, refs, atoms, and rendering local.
    - Affected files/areas: `NodeCanvas.tsx`, `useDraggingNode.ts`, `DraggableNode.tsx`, `NodeCanvasViewport.tsx`, drag-overlay execution context, new node-canvas helper modules and tests, `developer-docs/APP-ARCHITECTURE.md`, `refactor.md`.
    - Result in numbers: `useDraggingNode.ts` shrank by 149 physical lines and `NodeCanvas.tsx` shrank by 17 physical lines. New focused production owner modules added 322 lines, so the production total moved to a net `+158` while taking fragile policy out of the large owners. The existing drag helper tests moved next to the new drag owner without line growth, and the phase added 205 focused test lines for interaction-model and context-menu decisions.

118. **Clarified Chat v2 output/runtime boundaries**
    - Why: `chatV2Pipeline.ts` still mixed provider-neutral output assembly, token/cost normalization, structured-response typing, request-status/request-error output construction, retry-attempt arrays, provider-failure output shape, and streaming orchestration.
    - How: Moved Chat v2 output assembly into internal `chatV2Outputs.ts` and updated the pipeline to delegate common outputs and provider-failure outputs to that owner without widening the public Chat v2 index. Added direct output-policy tests so structured response, usage/cost, reasoning, tool-call, request-status, retry-attempt, and provider-failure output shapes are pinned without relying only on mocked full-pipeline tests.
    - Affected files/areas: `packages/core/src/model/chat-v2/chatV2Pipeline.ts`, new `chatV2Outputs.ts`, focused Chat v2 output tests, `developer-docs/CORE-ENGINE.md`, `developer-docs/PACKAGES.md`, `refactor.md`.
    - Result in numbers: `chatV2Pipeline.ts` shrank by 284 physical lines (`620` -> `336`). The new focused production output owner added 296 lines after the line-reduction cleanup, so production moved by net `+12` while separating output policy from orchestration. The phase added 187 focused test lines for the newly isolated output policy.

119. **Reduced GraphProcessor node-exclusion responsibility**
    - Why: `GraphProcessor.ts` still owned disabled-node exclusion, conditional false exclusion, control-flow-excluded input policy, missing-required-input exclusion wording, merge-node exceptions, loop wait sentinel handling, and excluded output construction alongside execution state mutation.
    - How: Added `NodeExclusionPolicy.ts` as the pure owner of node-exclusion decisions and excluded output map construction. `GraphProcessor` now asks that helper for a decision, then keeps ownership of trace/event emission, stored results, attached-data propagation, in-flight cleanup, and downstream queueing.
    - Affected files/areas: `packages/core/src/model/GraphProcessor.ts`, `packages/core/src/model/NodeExclusionPolicy.ts`, focused node-exclusion policy tests, `developer-docs/CORE-ENGINE.md`, `developer-docs/PACKAGES.md`, `refactor.md`.
    - Result in numbers: `GraphProcessor.ts` shrank by 51 physical lines (`1722` -> `1671`). The new focused production policy owner added 116 lines, so production moved by net `+65` while separating exclusion policy from processor orchestration. The phase added 160 focused test lines for disabled nodes, conditional false ports, scalar control-flow exclusions, merge-node exceptions, loop wait sentinel skips, missing required input trace decisions, and excluded output creation.

120. **Closed the completed refactor record**
    - Why: After all five planned phases landed, `refactor.md` still read partly like an active future plan. It kept stale Go/No-Go gates and future-tense implementation sections, which made the completed refactor harder to audit.
    - How: Reassessed `refactor.md` against the live owner modules, focused tests, developer docs, and this history file. Rewrote it as a completed behavior-preserving refactor record, replaced future-plan sections with implemented scope, validation coverage, and remaining-risk sections, added an overall status, and removed stale active-plan gates.
    - Affected files/areas: `refactor.md`, `refactor-history.md`, live-code audit of `NodeExclusionPolicy.ts`, `chatV2Outputs.ts`, node-canvas interaction helpers, executor-session helpers, and `nodeOutputViewModel.ts`.
    - Result in numbers: no production or test code changed. Before this history entry, the `refactor.md` cleanup moved docs/planning `+107/-141` for a net `-34`, preserving the phase results while removing stale plan wording. Focused owner tests, docs typecheck, and `git diff --check` passed.

121. **Added a headless Node graph-runner seam for runtime-speed work**
    - Why: Programmatic Node execution needed an additive fast-path API before deeper core execution changes. Existing one-shot APIs capture inputs/context at creation or create full Node runtime defaults per call, while future runtime optimizations need one public seam that can safely own stable backend execution setup.
    - How: Added `createGraphRunner(...)` to `@valerypopoff/rivet2-node`, split runner creation-time options from per-run `inputs`, `context`, and `abortSignal`, and reused stable Node runtime providers/settings while keeping each run on a run-scoped `GraphProcessor`. The reassessment pass intentionally rejected direct processor reuse because Global node values and other processor-local mutable state could leak across backend requests.
    - Affected files/areas: `packages/node/src/api.ts`, `packages/node/test/graphRunner.test.ts`, `packages/node/test/runtimeSpeedEquivalence.test.ts`, `packages/node/test/runtimeSpeedFixtures.ts`, `packages/node/bench/runtimeSpeed.bench.ts`, Node API docs, `developer-docs/PACKAGES.md`, `runtime-speed-plan.md`.
    - Result in numbers: production Node API code moved `+141/-30` for a net `+111`, mostly for the new public runner and shared Node process-context helper. Existing test fixtures/guards moved `+88/-3`, and a new 158-line runner test file covers per-run values, overlap, abort, disposal, Global-node isolation, and creation-time provider reuse. P1 averaged benchmarks preserved the original P0 baseline and showed `createGraphRunner` at `0.084ms` for the passthrough case versus loaded-project `runGraph` at `0.117ms`, while 500-node cheap graphs stayed effectively unchanged (`33.171ms` runner versus `32.908ms` `runGraph`), confirming cached graph planning/preprocessing as the next speed target.

122. **Added the cached headless Node CodeRunner fast profile**
    - Why: The runtime-speed plan called for caching Code-family JavaScript compilation behind the new headless runner seam before attempting broader scheduler or graph-plan changes.
    - How: Added `CachedNodeCodeRunner` and a shared Node CodeRunner invocation helper, wired `createGraphRunner(..., { runtimeProfile: 'headless-fast' })` to use the cached runner only when no custom `codeRunner` is provided, and kept normal `runGraph(...)`, `createProcessor(...)`, Browser mode, Remote Debugger, and app-executor CodeRunner ownership unchanged. `Code` and `Code (legacy)` now use stable per-node source URLs so repeated backend runs can reuse compiled functions while preserving line/column error enrichment.
    - Affected files/areas: `packages/node/src/native/CachedNodeCodeRunner.ts`, `packages/node/src/native/nodeCodeRunnerInvocation.ts`, `packages/node/src/native/NodeCodeRunner.ts`, `packages/node/src/api.ts`, Code-family source URL call sites, runtime-speed benchmarks/equivalence tests, Node API docs, `developer-docs/PACKAGES.md`, `developer-docs/CORE-ENGINE.md`, `runtime-speed-plan.md`.
    - Result in numbers: production code moved about `+276/-54` for a net `+222`, mostly from the new cached runner and shared invocation helper while shrinking `NodeCodeRunner.ts` by 35 net lines and simplifying the Code source-url helper. Tests moved about `+155/-1`, adding direct cache coverage, custom-runner precedence coverage for `headless-fast`, and public runtime equivalence guards. Benchmarks moved `+47/-1`, adding direct compatible-versus-fast runner rows for Code and Expression chains. Docs/planning moved about `+125/-24`. Reassessed P2 averaged benchmarks showed the cached runner is behaviorally safe but not a reliable whole-graph Code-chain win (`6.741ms` `headless-fast` runner versus `6.584ms` compatible runner in that run), while Expression chains improved slightly (`2.785ms` fast versus `2.984ms` compatible). The next substantial target remains cached immutable graph planning and dependency data.

## Residual Watchlist For Future Refactors

1. **GraphProcessor size and responsibility concentration**
   - Current state: Several targeted extractions landed, Phase 8 added a characterization suite, and node-exclusion decisions now live in `NodeExclusionPolicy.ts`. `GraphProcessor.ts` still owns many execution policies.
   - Next refactor should extract one policy at a time and extend the characterization suite before touching event order, aborts, subgraphs, loops, or races.

2. **MCP stdio config logging and env handling**
   - Current state: Deferred intentionally.
   - Candidate target: `packages/node/src/native/NodeMCPProvider.ts`; avoid logging env secrets and pass configured env correctly to stdio transports.

3. **Global app error logging policy**
   - Current state: Runtime/provider logging was redacted, but generic app `handleError(...)` can still log normalized error objects.
   - Next refactor should decide whether desktop diagnostics or stricter privacy is the desired global policy.

4. **Tracked sidecar clone size**
   - Current state: Sidecar binaries are documented and checksummed, but still increase clone size.
   - Future work would be release-engineering heavy: Git LFS or checksum-verified downloads plus release packaging validation on every supported platform.

5. **Provider implementation size**
   - Current state: OpenAI/Anthropic unsafe parse diagnostics were centralized, but provider files remain large.
   - Future extraction should only target proven shared seams, such as tool-call accumulation, after focused tests exist.

6. **Deletion targets versus helper boundaries**
   - Current state: The second refactor met its deletion target; the third did not, because two Chat v2 helper modules made high-risk policy easier to audit.
   - Future plans should measure line deltas but prefer fewer concepts and safer ownership over raw deletion.
