# Refactor Plan After `PRE-refactor`

## Summary

Use `b95bfb31 PRE-refactor` as the implementation boundary for this refactor. The earlier `c93ae1e7 PRE-refactor` marker was the original planning reference, but the working refactor is applied on top of the later `PRE-refactor` commit that already includes the intervening node editor UI, canvas interaction/performance, output rendering, code/expression diagnostics, graph reference integrity, settings persistence, modal, graph list reachability, and core-node work.

This refactor must keep current behavior unchanged while improving maintainability, transparency, and code volume. Estimated line savings below refer to production/source code unless noted otherwise; tests may grow or move as behavior is locked down.

After reassessment, treat the line-savings numbers as targets with confidence, not promises. Several areas already have good helper extraction, so the safest refactor is sometimes to rename, document, or move a small boundary rather than introduce a larger abstraction.

## 0. Preflight Guardrails

### 0.1 DONE - Capture behavior baselines before code motion

Files: `refactoring.md`, focused test files named in the Test Plan

Change: Before touching each subsystem, list the current behavior that must remain true and run the focused tests for that subsystem. Add missing tests before moving code if a behavior is only protected manually.

Improvement focus: Risk isolation and transparency by making each refactor start from observable behavior instead of assumptions.

Risk: This step adds little visible product progress, but skipping it makes later cleanup harder to trust.

Estimated lines saved: 0

Outcome: Baseline coverage for the first subsystem was captured with `yarn workspace @ironclad/rivet-app exec tsx --test src/state/settings.test.ts` before changing settings helpers, then rerun after the refactor.

### 0.2 DONE - Measure real code reduction per commit

Files: commit descriptions, optional notes in `refactoring.md`

Change: For each refactor commit, compare source line counts before and after for touched production files. Record when a step improves clarity without reducing code, and do not force further abstraction just to chase a number.

Improvement focus: Transparency and complexity control by making line savings empirical.

Risk: Raw line counts can reward dense code. Treat readability and behavior safety as higher priority than total lines removed.

Estimated lines saved: 0

Outcome: The first pass records actual production diff size with `git diff --stat` before moving to the next subsystem. New or expanded tests are not counted as source-code savings.

## 1. Settings And Runtime Context Cleanup

### 1.1 DONE - Add one app editor-preferences resolver

Files: `packages/app/src/state/settings.ts`, `packages/app/src/state/settings.test.ts`

Change: Replace scattered UI fallback reads with `resolveEditorPreferences(settings)`, returning `defaultNodeColors` and `openNodeSettingsOnCreate` with current defaults. Keep `shouldOpenNodeSettingsOnCreate` only if call sites still need the narrower helper; otherwise delete it.

Improvement focus: More transparency and lower complexity by making editor preference defaults explicit in one place.

Risk: A wrong default would change legacy settings behavior. Tests must cover missing, true, and false values.

Estimated lines saved: 5-15

Outcome: `resolveEditorPreferences(settings)` now owns `defaultNodeColors` and `openNodeSettingsOnCreate` defaults, and the narrower `shouldOpenNodeSettingsOnCreate(...)` helper was removed.

### 1.2 DONE - Simplify add-node settings usage

Files: `packages/app/src/commands/addNodeCommand.ts`

Change: Read `resolveEditorPreferences(settings)` once and pass `applyDefaultColor` plus `openSettingsOnCreate` into the command path. Keep undo clearing `editingNodeState` only when it still points at the deleted node.

Improvement focus: Less code and better maintainability by reducing raw settings branching inside the command.

Risk: The command uses captured settings at command creation time; make sure this matches existing behavior and does not stale-read after setting changes.

Estimated lines saved: 5-10

Outcome: `addNodeCommand` resolves editor preferences once and uses those resolved values for default colors plus auto-opening node settings.

### 1.3 DONE - Centralize runtime settings construction

Files: `packages/core/src/api/createProcessor.ts`, `packages/node/src/api.ts`, `packages/trivet/src/api.ts`, new helper under `packages/core/src/api` or `packages/core/src/model`

Change: First audit which `Settings` fields are actually used during graph execution. Then add a pure helper such as `resolveProcessSettings(options, environmentDefaults)` only for runtime settings that truly belong in `ProcessContext`. Reuse it in core, Node, and Trivet processor creation while preserving existing defaults exactly.

Improvement focus: Less code and more transparency by removing three duplicated runtime settings construction blocks.

Risk: Node package can use `process.env`; core cannot. The helper must accept environment-derived values rather than import Node globals. Editor-only fields such as `openNodeSettingsOnCreate` should not become more deeply coupled to graph execution just because they are currently present on `Settings`.

Estimated lines saved: 20-45

Outcome: `resolveProcessSettings(...)` now lives in `packages/core/src/api/processSettings.ts` and is shared by core, Node, and Trivet processor creation while preserving explicit runtime settings such as `recordingPlaybackLatency`, existing defaults, and host-provided environment fallbacks.

### 1.4 DONE - Document editor-only settings boundary

Files: `packages/core/src/model/Settings.ts`, `developer-docs/APP-ARCHITECTURE.md`

Change: Keep `openNodeSettingsOnCreate?` for public compatibility, but clarify that it is editor-facing and currently ignored by graph execution. Add a follow-up note that a future breaking API cleanup can split editor settings from runtime settings if maintainers want a cleaner public type.

Improvement focus: More transparency and risk isolation by documenting the boundary between editor preferences and runtime execution.

Risk: Removing the field now could break consumers compiling against `Settings`; do not remove in this pass.

Estimated lines saved: 0

Outcome: `APP-ARCHITECTURE.md` documents the split between app editor preferences and runtime graph settings normalization.

## 2. Node Editor Decomposition

### 2.1 DONE - Extract metadata editing

Files: `packages/app/src/components/NodeEditor.tsx`, new `packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx`

Change: Move title and description editing into a focused component only if it reduces `NodeEditor.tsx` complexity without creating prop-heavy glue. The component should own live updates and layout while preserving title/description full-width behavior and immediate description updates.

Improvement focus: Maintainability and transparency by giving metadata editing a clear owner outside the main editor component.

Risk: Metadata updates currently interact with edit commands and selected node state. Preserve command/undo behavior.

Estimated lines saved: 0-20

Outcome: Title, description, and color metadata editing now live in `packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx`, leaving `NodeEditorGlobalControls.tsx` focused on split-run, variant, and conditional controls.

### 2.2 DONE - Extract editor rendering list

Files: `packages/app/src/components/NodeEditor.tsx`, `packages/app/src/components/editors/DefaultNodeEditor.tsx`, `packages/app/src/components/editors/DefaultNodeEditorField.tsx`

Change: Move editor-definition mapping and wrapper layout into one path so field labels, helper text, toggles, and groups are not repeated across node editor files. Do this incrementally: first extract the pure mapping/field wrapper, then decide whether custom editors still benefit from additional movement.

Improvement focus: Less code and maintainability by removing repeated editor field rendering glue.

Risk: Custom editors may rely on subtle wrapper spacing. Compare Code, Text, HTTP, Comment, and StringList editors manually.

Estimated lines saved: 20-60

Outcome: `packages/app/src/components/editors/editorUtils.ts` now exports `getEditorRenderRows(...)`, and `DefaultNodeEditor` renders the returned row model instead of rebuilding inline-editor grouping in JSX.

### 2.3 DONE - Consolidate resize state

Files: `packages/app/src/components/NodeEditor.tsx`, `packages/app/src/components/nodeEditor/useNodeEditorWidth.ts`, `packages/app/src/components/nodeEditor/NodeEditorResizeContext.ts`

Change: Keep persistent width logic in `useNodeEditorWidth`; remove duplicated local calculations from `NodeEditor` and global controls only after confirming the hook already owns the full min/max/persistence contract.

Improvement focus: More transparency and lower complexity by keeping panel sizing rules in the sizing hook.

Risk: Width persistence is user-visible and can break across reloads. Keep existing storage key and min/max behavior.

Estimated lines saved: 5-20

Outcome: The existing `useNodeEditorWidth` / `NodeEditorResizeContext` boundary was audited and left as the single panel-width owner; the refactor did not add a second width path.

### 2.4 DONE - Make connection recovery an explicit editor side effect

Files: `packages/app/src/commands/editNodeCommand.ts`, `packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts`, `packages/app/src/domain/graphEditing/stringListPortBinding.ts`

Change: Keep domain helpers as the single source of truth for recoverable dynamic-port connections. Commands should call helpers, not duplicate port filtering or connection rules.

Improvement focus: Risk isolation and maintainability by moving connection recovery policy out of UI/editor flow.

Risk: Undo/redo snapshots are sensitive. Run edit-node command tests after each move.

Estimated lines saved: 25-60

Outcome: The current edit-command path was audited and kept on the existing domain helpers (`editNodeConnectionRecovery.ts`, `connectionValidation.ts`, and string-list binding helpers) instead of moving recovery policy into editor UI.

### 2.5 DONE - Collapse duplicate node editor styling

Files: `packages/app/src/components/nodeStyles.ts`, editor components under `packages/app/src/components/editors`

Change: Move repeated field/group spacing into shared class names or component-level wrappers. Avoid changing Monaco-specific styling. Skip any extraction that makes the DOM less obvious or spreads one visual rule across more files.

Improvement focus: Less code and visual transparency by reducing repeated layout rules across editor components.

Risk: Visual regressions are easy here. Verify Monaco editors, color editors, toggle rows, collapsed editor groups, and AI assist panels.

Estimated lines saved: 10-40

Outcome: No broad editor-style extraction was added because it would have spread single-use layout rules across more files; the concrete duplicate CSS cleanup happened in the visual-node header-control selectors in step 4.2.

## 3. Canvas Interaction And Visibility Simplification

### 3.1 DONE - Introduce explicit visibility bounds helper

Files: `packages/app/src/hooks/useVisibleCanvasNodes.ts`, `packages/app/src/hooks/useVisibleCanvasNodes.test.ts`

Change: Replace the local Comment-height special case with `getCanvasVisibilityBounds(node)`, returning width and height. Comment nodes use `data.height`; normal nodes keep height `0`.

Improvement focus: More transparency by naming the visibility bounds contract directly instead of hiding it in inline math.

Risk: If normal-node height changes from `0`, viewport culling behavior changes. Keep tests proving only Comment nodes use vertical extent.

Estimated lines saved: 0-10

Outcome: `packages/app/src/hooks/canvasVisibilityBounds.ts` now names the culling bounds contract, with tests proving Comment nodes use configured height, legacy Comment nodes without `data.height` fall back to width, non-finite widths fall back to the default node width, and normal nodes keep height `0`.

### 3.2 DONE - Reduce visibility hook argument duplication

Files: `packages/app/src/hooks/useVisibleCanvasNodes.ts`

Change: Build the snapshot input object once per hook render only if it keeps exhaustive-deps lint clean and makes the hook easier to read. If the inline object form is clearer and lint-safe, keep it.

Improvement focus: Lower complexity and less code by reducing repeated snapshot argument assembly.

Risk: React hook dependency changes can trigger extra recalculation or stale snapshots during viewport motion.

Estimated lines saved: 0-10

Outcome: `useVisibleCanvasNodes` now memoizes the shared visibility snapshot options once and uses the same object for current and initial snapshot calculation.

### 3.3 DONE - Consolidate live drag visibility exceptions

Files: `packages/app/src/components/NodeCanvas.tsx`, `packages/app/src/components/nodeCanvas/useNodeCanvasInteractions.ts`, `packages/app/src/hooks/useDraggingNode.ts`, `packages/app/src/hooks/useDraggingWire.ts`

Change: Move "interactive drags refresh visibility immediately" policy into one named boolean or helper after confirming every consumer of viewport-moving state. Feed it to visibility and wire layers without weakening the existing freeze policy for passive pan/zoom.

Improvement focus: More transparency and risk isolation by making the drag-vs-viewport-freeze policy explicit.

Risk: A missed interactive case can break live wire previews or drag overlays. Test node drag, wire drag, and auto-scroll.

Estimated lines saved: 20-45

Outcome: `packages/app/src/components/nodeCanvas/viewportVisibilityPolicy.ts` now owns the drag-overlay node id merge and the passive-motion freeze decision, with focused tests for both.

### 3.4 DONE - Tighten wire candidate refresh ownership

Files: `packages/app/src/components/WireLayer.tsx`, `packages/app/src/components/nodeCanvas/getRenderableWireCandidates.ts`

Change: Keep candidate selection outside SVG element render loops. Prefer a `useRenderableWireCandidates` hook or a small pure state helper near `WireLayer` over pushing too much wire state up into `NodeCanvas`.

Improvement focus: Maintainability and performance transparency by separating wire selection policy from SVG rendering.

Risk: Freezing wire candidates during pan must still allow active drag wires to render live. Moving too much state into `NodeCanvas` could increase prop churn instead of reducing it.

Estimated lines saved: 10-40

Outcome: Static wire candidate selection, clipping, and frozen settled-candidate reuse now live in `packages/app/src/components/nodeCanvas/useRenderableWires.ts`, keeping `WireLayer.tsx` focused on SVG rendering.

### 3.5 DONE - Simplify canvas scene props

Files: `packages/app/src/components/NodeCanvas.tsx`, `packages/app/src/components/nodeCanvas/NodeCanvasViewport.tsx`, `packages/app/src/components/nodeCanvas/NodeCanvasOverlays.tsx`

Change: Group scene-only props into a stable `sceneProps` object only where it reduces prop threading. Keep transform-only values outside the scene. Remove pass-through props that are only used to reassemble data.

Improvement focus: Less code and better maintainability by reducing prop threading across the canvas render tree.

Risk: Over-memoizing can make stale UI; under-memoizing reintroduces pan stalls. Use focused render-count profiling in dev.

Estimated lines saved: 10-35

Outcome: The existing `NodeCanvasViewport` split was audited and left intact: transform-only props stay on the outer shell, scene props stay in the memoized scene, and no extra scene-prop wrapper was added because it would increase indirection without reducing churn.

## 4. Visual Node Styling Consolidation

### 4.1 DONE - Reorganize node state CSS blocks

Files: `packages/app/src/components/nodeStyles.ts`

Change: Group selectors by state: selected/hover/focus, Comment behavior, header controls, split summary, output status. Keep declarations identical while moving them, and split `nodeStyles.ts` only if a local pattern already supports imported CSS fragments cleanly.

Improvement focus: More transparency by making the visual-state cascade easier to inspect.

Risk: Pure movement can still cause cascade changes. Preserve order where selectors have equal specificity.

Estimated lines saved: 0-5

Outcome: The CSS cascade was audited and kept in-place except for targeted selector cleanup and explanatory comments; a broad reorder was skipped to avoid equal-specificity cascade regressions.

### 4.2 DONE - Collapse header-control reveal selectors

Files: `packages/app/src/components/nodeStyles.ts`, `packages/app/src/components/visualNode/NormalVisualNodeContent.tsx`

Change: Use `:is(:hover, .hovered, :focus-within)` or an equivalent grouped selector for the edit-button and tooltip reveal rules.

Improvement focus: Less code and lower CSS complexity by collapsing repeated reveal selectors.

Risk: Browser support is fine for modern Chromium/Tauri, but test CSS output visually.

Estimated lines saved: 8-18

Outcome: Header edit-button and tooltip reveal selectors now use a grouped `:is(:hover, .hovered, :focus-within)` selector instead of repeated state selectors.

### 4.3 DONE - Make Comment stacking rules explicit

Files: `packages/app/src/components/nodeStyles.ts`, `packages/app/src/components/VisualNode.tsx`

Change: Keep Comment nodes at background z-index and selected border visible. Add or preserve one narrow comment explaining why selected comments do not get normal selected z-index.

Improvement focus: More transparency and risk isolation by documenting a non-obvious stacking exception.

Risk: If selected comments rise above normal nodes, overlapping node headers become ungrabbable.

Estimated lines saved: 0-5

Outcome: `nodeStyles.ts` now documents why selected Comment nodes keep background stacking so overlapping normal-node headers remain grabbable.

### 4.4 DONE - Extract split-run header summary component styling names

Files: `packages/app/src/components/VisualNode.tsx`, `packages/app/src/components/visualNode/SplitRunModeIcon.tsx`, `packages/app/src/components/nodeStyles.ts`

Change: Keep markup minimal and avoid spans used only for styling when CSS can target existing elements. Preserve icon/order/text/bold mode behavior.

Improvement focus: Less code and maintainability by reducing presentational markup in the visual node header.

Risk: The summary position is delicate and user-adjusted; avoid changing top/left/width behavior.

Estimated lines saved: 0-10

Outcome: The split-run summary markup now uses the existing mode element directly (`strong.split-run-summary-mode`) and removed the extra label wrapper span.

### 4.5 DONE - Normalize Subgraph header link sizing

Files: `packages/app/src/components/visualNode/SubGraphHeaderLink.tsx`, `packages/app/src/components/visualNode/SubgraphLinkIcon.tsx`, `packages/app/src/hooks/useContextMenuConfiguration.ts`, `packages/app/src/components/nodeStyles.ts`

Change: Keep one icon component with size controlled by context class names. Header and menu should not duplicate SVG sizing logic.

Improvement focus: Less code and visual consistency by keeping Subgraph link icon sizing controlled at usage sites.

Risk: Context menu row alignment regressed once; verify text alignment.

Estimated lines saved: 0-8

Outcome: The Subgraph header/context-menu icon path was audited and left on the existing shared icon component plus usage-specific classes; no new sizing abstraction was added because the current alignment fix is already localized.

## 5. Output Rendering And Diagnostics Unification

### 5.1 DONE - Add shared parsed-source display helper

Files: `packages/app/src/components/nodes/expressionOutputUtils.ts`, `packages/app/src/components/nodes/jsListOutputUtils.ts`, `packages/app/src/components/nodes/extractObjectPathOutputUtils.ts`, new helper under `packages/app/src/components/nodes` or `packages/app/src/utils`

Change: Centralize "only show parsed source when interpolation variables exist" and final `.trim()` behavior. Keep raw JS and JSONPath substitution semantics separate. The helper should describe display policy, not perform runtime interpolation.

Improvement focus: Less code and more transparency by making parsed-source display rules shared and explicit.

Risk: Accidentally using raw JS rules for JSONPath would break Extract Object Path display.

Estimated lines saved: 10-30

Outcome: `packages/app/src/components/nodes/parsedSourceDisplayUtils.ts` now owns the display-only "has interpolation-created inputs" check for Expression, JS List, and Extract Object Path, while raw JS and JSONPath runtime substitution remain separate in their node-specific helpers.

### 5.2 DONE - Consolidate structured node output shell

Files: `packages/app/src/components/nodes/ExpressionNode.tsx`, `packages/app/src/components/nodes/JSListNode.tsx`, `packages/app/src/components/nodes/ExtractObjectPathNode.tsx`, `packages/app/src/components/nodes/CodeNode.tsx`

Change: Create a tiny presentational component for labeled output sections, error section, and colorized parsed source only if it removes repeated JSX without hiding node-specific error behavior. Do not change actual graph outputs.

Improvement focus: Less code and maintainability by removing repeated structured-output JSX across node renderers.

Risk: Error styling must remain red for failed runs. Compact and fullscreen output must both use the right path.

Estimated lines saved: 15-50

Outcome: `packages/app/src/components/nodes/StructuredNodeOutput.tsx` now provides labeled sections, error text, shared structured-output CSS, and parsed-source rendering for Expression, JS List, Extract Object Path, and Code diagnostics.

### 5.3 DONE - Isolate Code node diagnostics view model

Files: `packages/app/src/components/nodes/CodeNode.tsx`, `packages/app/src/components/nodes/codeNodeOutputUtils.ts`, `packages/core/src/model/nodes/codeNodeErrorDiagnostics.ts`

Change: Keep core diagnostics extraction separate from app display. App component should consume a view model with message, line, column, and highlight info.

Improvement focus: More transparency and risk isolation by separating diagnostic data extraction from UI formatting.

Risk: Diagnostics must remain failure-only and safe for backend/programmatic execution.

Estimated lines saved: 15-35

Outcome: `packages/app/src/components/nodes/codeNodeOutputUtils.ts` now exposes the Code-node error view model consumed by `CodeNode.tsx`; core still owns diagnostic extraction.

### 5.4 DONE - Delete stale/duplicate output preview paths

Files: `packages/app/src/components/NodeOutput.tsx`, `packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx`, node-specific output components

Change: After shell consolidation, remove branches that only duplicate node-specific structured renderer behavior. Treat this as conditional cleanup after tests prove the shared path covers compact and fullscreen rendering.

Improvement focus: Less code and lower complexity by deleting redundant output-rendering paths after shared pieces exist.

Risk: Output rendering has many data types; compare scalar, object, function call, split, large stored value, and error outputs.

Estimated lines saved: 0-30

Outcome: Generic output selection paths were audited and left in place because they still handle broad data-type rendering; duplication was reduced only in node-specific structured renderers where behavior was shared.

## 6. Raw JS Interpolation And JS List Nodes

### 6.1 DONE - Share raw-source interpolation tests and helpers

Files: `packages/core/src/model/nodes/rawJsSourceInterpolation.ts`, `packages/core/test/model/nodes/ExpressionNode.test.ts`, `packages/core/test/model/nodes/JSFilterNode.test.ts`, `packages/core/test/model/nodes/JSMapNode.test.ts`

Change: Audit current call sites of `interpolateRawJsSource` first; it already exists and is shared by Expression / JS Filter / JS Map runtime paths. Only add or rename helpers where display code still duplicates raw-source semantics.

Improvement focus: Maintainability and transparency by protecting the existing single-owner raw-source interpolation semantics.

Risk: Inputs are raw JS source strings, not typed values. Any autoquoting would be a behavior change.

Estimated lines saved: 0-10

Outcome: Raw JS source interpolation remains centralized in `rawJsSourceInterpolation.ts`; JS List callback-local names are exported as one shared reserved-name set, and focused JS Filter/JS Map tests were rerun to protect the existing shared semantics.

### 6.2 DONE - Reduce JS Filter / JS Map duplication

Files: `packages/core/src/model/nodes/JSFilterNode.ts`, `packages/core/src/model/nodes/JSMapNode.ts`, `packages/core/src/model/nodes/jsListCallbackHelpers.ts`

Change: Extract shared node-definition/editor/body-preview/process scaffolding into helper functions only if the resulting code keeps JS Filter and JS Map differences obvious. Keep separate node files and separate output ids.

Improvement focus: Less code by removing duplicated JS Filter / JS Map scaffolding while preserving their visible distinction.

Risk: Over-abstracting can hide the differences between filter truthiness and map values. Keep wrappers explicit.

Estimated lines saved: 20-50

Outcome: JS Filter and JS Map now share input/editor/body/process scaffolding through `jsListCallbackHelpers.ts`, while their wrapper generation and output ids remain explicit.

### 6.3 DONE - Centralize callback body preview generation

Files: `packages/core/src/model/nodes/JSFilterNode.ts`, `packages/core/src/model/nodes/JSMapNode.ts`, `packages/core/src/model/nodes/jsListCallbackHelpers.ts`

Change: Use one helper to render `(item, index, array) => { ... }` previews.

Improvement focus: Less code and consistency by generating callback previews from one source.

Risk: Preview formatting must stay stable for canvas body output.

Estimated lines saved: 8-18

Outcome: Callback preview wrapping now lives in `wrapJSListCallbackPreview(...)` / `getJSListNodeBody(...)`.

### 6.4 DONE - Keep runtime wrappers transparent

Files: `packages/core/src/model/nodes/jsListCallbackHelpers.ts`

Change: Leave generated wrapper strings readable. Add names to helper functions only where they reduce duplication without turning code into string-template puzzle pieces.

Improvement focus: More transparency by keeping generated runtime code easy to inspect and debug.

Risk: Too much abstraction makes generated code hard to debug when CodeRunner errors surface.

Estimated lines saved: 0-10

Outcome: Wrapper strings remain readable in `jsListCallbackHelpers.ts`; only shared scaffolding and validation moved behind helper names.

## 7. Graph Reference And Dynamic-Port Integrity

### 7.1 DONE - Define one graph input usage model

Files: `packages/app/src/domain/graphEditing/graphInputUsage.ts`, `packages/app/src/domain/graphEditing/graphInputUsage.test.ts`, `packages/app/src/components/DeleteGraphInputConfirmModal.tsx`

Change: Ensure the usage model returns display-ready references without UI components recomputing graph names or node labels.

Improvement focus: More transparency and maintainability by making graph-input usage output directly consumable by UI.

Risk: Modal text can regress, especially Call Graph display de-duplication.

Estimated lines saved: 15-35

Outcome: `graphInputUsage.ts` now returns `callerLabel` and `displayPath`, so the delete-confirmation modal no longer formats graph names or caller labels itself.

### 7.2 DONE - Consolidate rename and deletion guard lookup

Files: `packages/app/src/domain/graphEditing/graphInputRenamePropagation.ts`, `packages/app/src/domain/graphEditing/graphInputUsage.ts`, `packages/app/src/commands/editNodeCommand.ts`, `packages/app/src/commands/deleteNodeCommand.ts`

Change: Share traversal helpers for "which graphs call this graph" and "which Subgraph nodes expose this input" only after confirming the existing `graphInputUsage` model does not already provide the needed traversal. Keep rename and delete policies separate.

Improvement focus: Less code and risk isolation by sharing traversal while keeping destructive/edit policies explicit.

Risk: Rename and delete have different outcomes; do not merge policy logic.

Estimated lines saved: 10-35

Outcome: Rename and deletion traversal were audited and deliberately kept separate because their policies differ: deletion warnings include conservative Call Graph object-input usages, while rename propagation only rewrites direct Subgraph terminals.

### 7.3 DONE - Unify stale connection validation entrypoints

Files: `packages/app/src/domain/graphEditing/connectionValidation.ts`, `packages/app/src/domain/graphEditing/editNodeConnectionRecovery.ts`, `packages/app/src/commands/editNodeCommand.ts`

Change: Commands should call one validation/recovery orchestration helper after node shape changes if that helper can preserve the current ordering of recovery, validation, and undo snapshot capture. Keep lower-level helpers pure.

Improvement focus: More transparency and maintainability by giving stale connection validation a single entrypoint.

Risk: Incorrect order can drop recoverable connections or preserve invalid duplicates.

Estimated lines saved: 15-45

Outcome: The edit-command stale-connection flow was audited and kept on the existing orchestration path; no new wrapper was added because the current helper ordering is already explicit and undo-sensitive.

### 7.4 DONE - Simplify edit command applied-data snapshots

Files: `packages/app/src/commands/editNodeCommand.ts`, `packages/app/src/commands/editNodeCommand.test.ts`

Change: Name snapshot fields by purpose and remove redundant storage only where tests prove current graph/project graph snapshots already include the needed state.

Improvement focus: Less code and transparency by making undo/redo snapshot data purpose-driven.

Risk: Undo/redo and merged edits are fragile. Keep tests for merged rename edits and external caller graph restoration.

Estimated lines saved: 5-25

Outcome: Snapshot fields were audited and left unchanged because they document distinct undo/redo responsibilities for current graph state, external caller graphs, and recoverable connection state.

### 7.5 DONE - Keep Call Graph object inputs out of rename rewrite

Files: domain tests under `packages/app/src/domain/graphEditing`

Change: Document and test that direct Subgraph terminals are rewritten but Graph Reference / Call Graph input objects are not.

Improvement focus: Risk isolation by locking an intentional scope boundary into tests.

Risk: Future refactors may accidentally broaden rewrite behavior.

Estimated lines saved: 0-5

Outcome: Existing rename-propagation tests continue to lock the direct-Subgraph-only rewrite boundary, and graph-input usage tests cover conservative Call Graph warnings separately.

## 8. Modal And Popup State

### 8.1 DONE - Keep fullscreen modal bounds pure

Files: `packages/app/src/components/FullScreenModal.tsx`, `packages/app/src/utils/fullScreenModalBounds.ts`, `packages/app/src/utils/fullScreenModalBounds.test.ts`

Change: Audit `FullScreenModal.tsx` first; most horizontal bounds math already lives in `fullScreenModalBounds.ts`. Move only remaining geometry or clamping logic out of the component. Component should only wire pointer events and state.

Improvement focus: More transparency and maintainability by keeping geometry math pure and tested.

Risk: Resize handles must stay on the modal edges, not content padding.

Estimated lines saved: 0-15

Outcome: Fullscreen modal resize math was audited and remains isolated in `fullScreenModalBounds.ts`; no additional geometry logic needed moving.

### 8.2 DONE - Extract remote debugger anchor calculation

Files: `packages/app/src/components/DebuggerConnectPanel.tsx`, `packages/app/src/components/ActionBar.tsx`, optional new utility under `packages/app/src/utils`

Change: Put anchor-position calculation in a small helper receiving trigger/action-bar rects. Keep panel immediately under the Run block.

Improvement focus: More transparency by separating DOM measurement inputs from popup positioning math.

Risk: Positioning depends on live DOM rects and viewport bounds. Test on narrow and wide windows.

Estimated lines saved: 5-15

Outcome: `packages/app/src/utils/debuggerPanelPosition.ts` now owns remote debugger popup fallback, anchored placement, and horizontal clamping, with focused tests.

### 8.3 DONE - Keep graph input confirmation modal focused

Files: `packages/app/src/components/DeleteGraphInputConfirmModal.tsx`, `packages/app/src/domain/graphEditing/graphInputUsage.ts`

Change: Modal should receive display-ready usage info and callbacks; it should not perform graph traversal.

Improvement focus: Lower complexity and maintainability by keeping modal code presentational.

Risk: Losing context in warning copy would make destructive deletion less clear.

Estimated lines saved: 5-20

Outcome: `DeleteGraphInputConfirmModal.tsx` now receives display-ready usage paths and stays presentational.

### 8.4 DONE - Avoid a generic modal framework

Files: existing modal components

Change: Do not build a shared modal abstraction unless two components share real behavior after steps 8.1-8.3. Prefer pure helpers over a broad component hierarchy.

Improvement focus: Complexity control by explicitly avoiding an abstraction that may add more code than it removes.

Risk: A premature modal framework would likely add code rather than save it.

Estimated lines saved: 0

Outcome: No generic modal framework was introduced; pure geometry and display-model helpers covered the shared behavior without adding a broad component abstraction.

## Code Reduction Targets

Preflight guardrails: 0 source lines saved.

Settings and processor defaults: 30-70 source lines saved.

Node editor decomposition and styling: 60-200 source lines saved.

Canvas visibility/wire prop simplification: 40-140 source lines saved.

Visual node CSS consolidation: 8-46 source lines saved.

Output and diagnostics rendering: 40-145 source lines saved.

Raw JS list node/runtime helper cleanup: 28-88 source lines saved.

Graph editing integrity helpers: 45-145 source lines saved.

Modal and popup state helpers: 10-50 source lines saved.

Expected total source-code reduction: approximately 261-884 lines, depending on how much duplicated component glue can be removed without harming clarity. Test code may increase modestly where behavior is currently protected only by manual testing.

## Test Plan

- Run focused tests for each refactor area:
  - `packages/app/src/state/settings.test.ts`
  - `packages/app/src/domain/graphEditing/*.test.ts`
  - `packages/app/src/hooks/useVisibleCanvasNodes.test.ts`
  - `packages/app/src/components/nodeCanvas/*.test.ts`
  - `packages/app/src/components/nodes/*OutputUtils.test.ts`
  - `packages/core/test/model/nodes/*.test.ts`
  - `packages/core/test/utils/interpolation.test.ts`
- Run integration/build checks:
  - `yarn workspace @ironclad/rivet-core build:esm`
  - `yarn workspace @ironclad/rivet-app run build`
  - `yarn workspace @ironclad/rivet-app exec eslint <touched files>`
- Manual regression scenarios:
  - add nodes with auto-open on/off
  - pan/zoom medium graphs
  - drag nodes with connected wires
  - edit dynamic ports and verify wires redraw
  - use Expression / JS Filter / JS Map parsed-source output
  - trigger Code node syntax/runtime errors and verify line highlight
  - resize fullscreen output modal
  - delete/rename graph inputs with Subgraph and Call Graph usage
  - verify Comment node selection, resize, overlap, and partial viewport visibility

## Sequencing

1. Start with the preflight guardrails and baseline tests so later line-savings claims are grounded.
2. Refactor settings/runtime defaults because it is small and gives an early code reduction win.
3. Refactor output/diagnostics helpers next, since the behavior is well covered by focused tests and has visible duplication.
4. Refactor raw JS list nodes after output helpers, so display and runtime semantics can be checked together.
5. Refactor graph-editing integrity helpers in their own commit; this is the riskiest area and should not be mixed with UI cleanup.
6. Refactor canvas visibility/wire interactions separately from visual CSS.
7. Refactor node editor decomposition last, because it touches broad UI surfaces and benefits from the smaller helper boundaries created earlier.

## Assumptions

- The real implementation boundary is `b95bfb31 PRE-refactor`; `c93ae1e7 PRE-refactor` is only the older planning marker.
- Functionality must not change.
- Public graph formats and persisted project data must not change.
- Existing dirty root files unrelated to this effort should be left alone unless explicitly included later.
- This refactor should be done in small commits by subsystem, with tests run after each subsystem.
