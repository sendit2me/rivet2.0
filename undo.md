# Fix Canvas Undo/Redo So `Ctrl+Z` Cannot Corrupt Graph Connections

## Goals
- Make rewiring an occupied input a single undoable action.
- Preserve the current disconnect gesture: dragging a connected input to empty canvas should still break that connection, but it should do so as one history entry.
- Preserve `Ctrl/Cmd` continuation behavior so wire dragging can continue after a committed action.
- Keep drag preview visuals consistent across wires and port connected state.
- Fix the concrete rewire bug first, then extend undo coverage to the remaining canvas edits that still bypass history.

## Implementation Principles
- Treat the bug as a transactional rewire problem in `useDraggingWire.ts`, not as a required full rewrite of `Command.ts`.
- Do not mutate the graph at drag start when the user begins from a connected input.
- Use preview state for rendering during rewire instead of temporarily removing real connections.
- Keep Phase 1 focused on the corruption bug. Broader command-runtime cleanup is follow-up work only if the Phase 1 tests expose a real need.

## Current Undo Surface To Preserve
- `Ctrl/Cmd+Z` currently undoes these command-backed actions:
  - add node
  - delete node
  - drag-move node positions
  - node edits from the editor and resize-finish commits
  - create a connection from an output to an input
  - replace an occupied input by dragging from an output
  - disconnect a connected input by dragging it to empty canvas
- `Ctrl/Cmd+Z` currently does not undo these direct graph mutations:
  - duplicate node
  - paste nodes
  - auto-layout
  - prompt designer node edits
  - AI graph builder graph replacements
  - historical graph loading
- Phase 1 must not reduce the current command-backed surface. In particular:
  - dragging a connected input to empty canvas must remain a one-step disconnect that undo restores
  - dragging from an output to an occupied input must remain a one-step replace that undo restores
  - `Ctrl/Cmd` continuation after a committed wire action must keep working
  - existing add, delete, move, and edit undo behavior must remain unchanged

## Phase 1: Transactional Rewire and Disconnect
- `useDraggingWire.ts` is the failure point to fix first: rewiring from a connected input currently breaks the old connection on drag start and makes the new connection on drop, which creates two undo entries for one gesture.
- The Phase 1 design keeps the graph unchanged during drag and commits exactly one command when the gesture is finalized.

### Canvas Preview State
- Add a derived preview-connections source for canvas drag interactions, for example `canvasPreviewConnectionsState`, instead of a local `NodeCanvas.tsx` helper.
- `canvasPreviewConnectionsState` should:
  - return the real `connectionsState` when there is no input-origin rewire in progress
  - return `connectionsState` minus `draggingWire.originalConnection` while an input-origin rewire is in progress
- Add a canvas-only IO selector or hook, for example `canvasIoDefinitionsForNodeState` / `useCanvasNodeIO`, that derives port definitions from preview connections instead of real connections.
- Use the preview-aware IO layer in:
  - `NodePorts.tsx`
  - `LoopControllerNodePorts.tsx`
  - `WireLayer.tsx` when resolving hovered input definitions
  - `useDraggingWire.ts` when validating the drop target
- Keep non-canvas consumers such as `NodeOutput.tsx` on the real IO definitions so drag preview does not leak into unrelated UI.
- This is required because several nodes derive visible ports from the current connection set. A wire-only preview would otherwise leave dynamic ports in the wrong state during drag.

### Drag State
- Extend `DraggingWireDef` in `packages/app/src/state/graphBuilder.ts` with:
  - `originalConnection?: NodeConnection`
  - `rewireSourceInput?: { nodeId: NodeId; portId: PortId }`
- `originalConnection` identifies that the drag started from an already-connected input and that the graph must remain unchanged until the gesture is finalized.
- `rewireSourceInput` makes same-endpoint detection explicit and avoids reconstructing it indirectly.

### Connection Helpers
- In `packages/app/src/domain/graphEditing/connectionActions.ts`, add semantic helpers that compare connections by endpoint values, not object identity:
  - `areConnectionsEqual(a, b)`
  - `removeMatchingConnection(connections, connection)`
  - `createRewireConnectionChange(connections, originalConnection, params)`
  - `undoRewireConnectionChange(...)`
- Keep `createConnectionChange(...)` for normal output-to-input connect behavior.
- Update existing removal helpers to use endpoint equality. Reference equality is fragile once graphs are cloned or replaced.

### New Command
- Add `useRewireConnectionCommand()` beside `makeConnectionCommand` and `breakConnectionCommand`.
- `apply(...)` must:
  - remove `originalConnection`
  - remove any connection already occupying the new target input
  - add the new connection
  - return `appliedData` containing `originalConnection`, `newConnection`, and `replacedTargetConnection` if one existed
- `undo(...)` must:
  - remove `newConnection`
  - restore `originalConnection`
  - restore `replacedTargetConnection` if one existed
- A completed rewire must always be one undo step.

### `useDraggingWire.ts`
- Do not mutate graph state on drag start from a connected input.
- On input drag start:
  - look up the existing connection
  - seed `draggingWire` from that connection's output
  - store `originalConnection` and `rewireSourceInput`
  - do not call `breakConnection`
- On output drag start:
  - keep current behavior
  - `originalConnection` stays `undefined`
- Extract a shared finalize helper inside `useDraggingWire.ts` so both port mouseup and window mouseup go through the same logic.

### Finalize Rules
- Drop on a valid input with no `originalConnection`:
  - run existing `makeConnectionCommand`
- Drop on a valid input with `originalConnection`:
  - if the drop target is the same input as `rewireSourceInput` and the source output is unchanged, clear drag state and do nothing
  - otherwise run `rewireConnectionCommand`
- Release on empty canvas with no `originalConnection`:
  - clear drag state only
  - no history entry
- Release on empty canvas with `originalConnection`:
  - execute one `breakConnectionCommand`
  - this preserves the current disconnect gesture
- After a successful connect, rewire, or disconnect:
  - if `Ctrl/Cmd` is not pressed, clear drag state
  - if `Ctrl/Cmd` is pressed, keep dragging from the same output so existing multi-connect behavior still works
  - when continuing after a finalized rewire or disconnect, clear `originalConnection` and `rewireSourceInput` from the ongoing drag so the next drop behaves like a normal output drag

### Preview Rendering
- Use `canvasPreviewConnectionsState` consistently for canvas rendering paths that currently read live connections.
- Thread preview connections through:
  - `nodesWithConnections`
  - `draggingNodeConnections`
  - `WireLayer`
  - `VisualNode` / `DraggableNode` connection props
- Keep connected port badges, conditional `$if` ports, and rendered wires aligned to the same preview connection set.
- Do not special-case only `WireLayer.tsx`. The canvas must present one coherent preview state while rewiring.

## Phase 2: Undo Coverage Cleanup

### Canvas Actions That Should Become Commands
- Convert `useDuplicateNode.ts` to `duplicateNodeCommand`.
- Convert `usePasteNodes.ts` to `pasteNodesCommand`.
- Convert `NodeCanvas.tsx` auto-layout path to `autoLayoutCommand`.
- These are normal canvas edits and currently bypass history, so `Ctrl+Z` undoes an older command instead of the action the user just performed.
- Preserve current UI behavior when converting them:
  - duplicate should keep selection behavior the same as today
  - paste should continue selecting the newly pasted nodes, and undo should restore the prior selection
  - auto-layout should keep selection unchanged and recalculate port positions after apply, undo, and redo

### Out-of-Band Graph Replacements
- Add targeted history clearing only for flows that replace `nodes` or `connections` for the current graph without going through commands.
- Start with:
  - `useAiGraphBuilder.ts`
  - `useChooseHistoricalGraph.ts`
  - any future import/apply flow that wholesale replaces the active graph contents
- Do not blanket-clear history for metadata-only updates such as `GraphInfoSidebarTab.tsx` or `GentracePipelinePicker.tsx`. Those write `graphState`, but they do not explain the connection corruption bug and do not inherently invalidate node/connection undo.
- Keep `useWorkspaceTransitions.ts` out of this pass unless testing shows a real invalidation problem. Graph switching is already partitioned by graph ID and should not be treated the same as replacing the active graph in place.

## Tests
- Add pure tests for `connectionActions.ts`:
  - endpoint equality helpers
  - rewire change creation
  - rewire undo
- Add command tests for:
  - rewire to a free input, then undo once restores the original connection
  - rewire to an occupied input, then undo once restores both displaced connections
  - disconnect by dragging a connected input to empty canvas, then undo once restores the original connection
  - dropping a rewire back onto the original input creates no history entry
- Extract the finalize decision logic from `useDraggingWire.ts` into a pure helper if needed, then test:
  - normal output drag to empty canvas is a no-op
  - input-origin empty-canvas release becomes one disconnect action
  - `Ctrl/Cmd` continuation clears rewire metadata after the action is committed
- Add follow-up tests for duplicate, paste, and auto-layout only when those commands are added in Phase 2.

## Manual Verification
- Rewire one connected input to another input, then press `Ctrl/Cmd+Z` once. The original connection must come back immediately.
- Rewire to an input that was already occupied, then undo once. Both original connections must be restored.
- Drag from a connected input and release on empty canvas. The connection must break once, and one undo must restore it.
- Drag from an output and release on empty canvas. Nothing should change.
- Hold `Ctrl/Cmd` while connecting from an output. The drag should remain active after the connection is made.
- Hold `Ctrl/Cmd` while disconnecting or rewiring from a connected input. The action should commit once, then continue as a normal output drag.
- Verify the original input port and wire both look disconnected during a rewire preview.

## Assumptions
- Per-graph history stacks stay in place.
- Rewire is one undoable action.
- Disconnect-from-input-to-empty-canvas remains a supported gesture.
- Phase 1 does not require a new global command API.
- If a deeper `Command.ts` cleanup is still wanted after Phase 1, do it as a separate refactor with its own tests.
