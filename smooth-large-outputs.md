# Make Large Node Outputs Smooth Without Making Them Opaque

## Summary

The current lag comes from a combination of storage and rendering behavior, not one isolated component.

Today the app still does all of the following for large outputs:

- `useNodeExecutionEvents.ts` persists large `string`, `string[]`, `object`, and `any` values directly into `lastRunDataByNodeState` after `sanitizeInputsOrOutputs(...)`
- `executionDataTransforms.ts` only externalizes `binary`, `image`, `audio`, `document`, and `chat-message`; large text-like values stay inline in reactive state
- compact node output is not truly compact:
  - generic string rendering trims by line count only, so a one-line base64 blob still renders nearly in full
  - generic object rendering does `JSON.stringify(...)` before compacting
  - `ChatNode.tsx` always runs `useMarkdown(outputText)` even when markdown is not being rendered
  - `NodeOutput.tsx` flips from compact to non-compact on hover, so merely hovering a node can trigger full inline rendering
- `partialOutput` updates repeatedly clone increasingly large values during a run

That is why the canvas can become sluggish even when the user never intentionally opens the full output.

The fix needs two coordinated changes:

1. Move oversized execution values out of reactive canvas state into ref-backed storage, while preserving the full raw value for copy/preload/inspection.
2. Make all inline output surfaces preview-first, with explicit opt-in to full rendering.

The chosen UX default for expanded inspection is:

- fullscreen opens in a chunked preview mode by default
- the user can explicitly load the full value from there if needed
- compact inline nodes never auto-render a giant payload just because they are hovered or pinned

## Important Internal API / Type Changes

No public file format or package API change.

Internal execution-data storage changes:

```ts
type StoredDataPreview =
  | {
      kind: 'text';
      excerpt: string;
      totalChars: number;
      lineCount: number;
      encodedHint?: 'base64' | 'data-uri';
    }
  | {
      kind: 'json';
      excerpt: string;
      totalChars: number;
      itemCount?: number;
    }
  | {
      kind: 'summary';
      label: string;
      totalBytes?: number;
      itemCount?: number;
    };

type StoredDataValue<P extends DataType = DataType> =
  | {
      type: P;
      storage: 'inline';
      value: Extract<DataValue, { type: P }>['value'];
    }
  | {
      type: P;
      storage: 'ref';
      refId: string;
      preview: StoredDataPreview;
    };
```

Canonical internal aliases in `state/dataFlow.ts`:

- `StoredDataValue`
- `StoredInputsOrOutputs = Record<PortId, StoredDataValue>`
- `StoredNodeRunData`

Keep temporary aliases from the old names during the migration so the change can land incrementally:

- `type DataValueWithRefs = StoredDataValue`
- `type InputsOrOutputsWithRefs = StoredInputsOrOutputs`
- `type NodeRunDataWithRefs = StoredNodeRunData`

Migration rule:

- any app code that currently treats `InputsOrOutputsWithRefs` as if it were plain core `DataValue` payloads must be routed through shared restore/preview helpers
- do not leave ad-hoc `as DataValue`, `as Outputs`, or `coerceTypeOptional(... as DataValue, ...)` casts in place once large string/object values can be ref-backed

Data ref store changes in `ProvidersContext.tsx` and `globalDataRefs.ts`:

```ts
type DataRefStore = {
  get(key: string): DataValue | undefined;
  set(key: string, value: DataValue, options?: { sizeHint?: number }): void;
  delete(key: string): void;
};
```

Execution transform helper changes:

```ts
type RefScope = {
  nodeId: NodeId;
  processId: ProcessId;
  channel: 'input' | 'output';
  splitIndex?: number;
};

storeNodeDataForHistory(
  data: Inputs | Outputs | undefined,
  refStore: DataRefStore,
  scope: RefScope,
): StoredInputsOrOutputs | undefined;

restoreStoredDataValue(
  value: StoredDataValue,
  refStore: Pick<DataRefStore, 'get'>,
): DataValue;

restoreStoredInputsOrOutputs(
  data: StoredInputsOrOutputs | undefined,
  refStore: Pick<DataRefStore, 'get'>,
): Inputs | Outputs | undefined;

collectStoredRefIds(
  data: StoredInputsOrOutputs | StoredNodeRunData | undefined,
): string[];

clearExecutionDataRefs(
  refStore: Pick<DataRefStore, 'delete'>,
  previousRunData: RunDataByNodeId,
): void;
```

## Defaults Chosen

Use shared constants in a new small module such as `outputStorageLimits.ts`:

- `REF_STORAGE_THRESHOLD_CHARS = 12_000`
- `COMPACT_PREVIEW_MAX_CHARS = 240`
- `COMPACT_PREVIEW_MAX_LINES = 3`
- `COMPACT_PREVIEW_MAX_ITEMS = 4`
- `FULLSCREEN_CHUNK_PREVIEW_MAX_CHARS = 16_000`
- `FULLSCREEN_CHUNK_PREVIEW_MAX_LINES = 200`
- `FULL_RENDER_SAFE_THRESHOLD_CHARS = 100_000`

Behavioral defaults:

- Large text-like values above the storage threshold are stored by ref, not inline.
- Compact node rendering always uses preview mode for ref-backed text/object/any values.
- Hovering a node does not bypass preview mode.
- Pinning a node does not bypass preview mode.
- Fullscreen opens in chunked preview mode, not full render mode.
- Explicit full inspection for oversized text/JSON remains chunked or paged if the payload exceeds `FULL_RENDER_SAFE_THRESHOLD_CHARS`; copy/export still uses the true full payload.
- Arbitrary base64-looking strings are not auto-decoded in this pass; they are labeled as likely encoded text and shown as text previews.
- Existing typed media outputs (`image`, `audio`, `document`, `binary`, `chat-message`) keep their specialized viewers.
- Missing ref-backed values in UI render paths degrade to a clear placeholder such as `Value no longer available in memory` instead of throwing.
- Starting a new run or clearing node output state also clears the corresponding execution-scoped refs from the in-memory ref store.

## Implementation

### 1. Replace destructive truncation with ref-backed large-value storage

In `packages/app/src/utils/executionDataTransforms.ts`:

- Keep the existing Uint8Array normalization logic.
- Remove the current destructive placeholder behavior for large `string`, `string[]`, `object`, and `any` values.
- Replace it with a two-step storage flow:
  - normalize the runtime shape
  - decide whether to keep inline or move the full value into `dataRefs`

Rules:

- `string`: store inline if `length <= REF_STORAGE_THRESHOLD_CHARS`, otherwise store by ref with a text preview
- `string[]`: compute total char length; store by ref when total exceeds threshold
- `object`: serialize once during storage decision, not during render; store by ref if serialized length exceeds threshold
- `any`:
  - if it behaves like a string, use string rules
  - if it behaves like an object/array, use JSON rules
  - otherwise keep inline
- arrays of other scalar types can stay inline unless their serialized preview crosses the threshold
- typed media values stay ref-backed exactly as they are today, but move to the new uniform `storage: 'ref'` shape

Preview generation rules:

- text preview uses the first `COMPACT_PREVIEW_MAX_CHARS` characters and up to `COMPACT_PREVIEW_MAX_LINES`
- JSON preview uses a bounded pretty-printed excerpt generated once at storage time
- base64/data-URI hints are detected with lightweight prefix/character-set heuristics only

### 2. Reuse stable ref IDs so partial outputs do not churn memory

The current `nanoid()`-per-clone approach is acceptable for one-time finished outputs but not for repeated partial updates of the same process.

Change the ref ID scheme so it is stable per process/port:

- input ref ID: `execution:${nodeId}:${processId}:input:${portId}`
- output ref ID: `execution:${nodeId}:${processId}:output:${portId}`
- split output ref ID: `execution:${nodeId}:${processId}:output:${splitIndex}:${portId}`

Implementation details:

- `useExecutionDataFlow.setDataForNode(...)` must pass `nodeId`, `processId`, and `channel` into the storage helper
- `useNodeExecutionEvents.onPartialOutput(...)` must pass `splitIndex` when storing split partials
- writing a new partial output for the same node/process/port must overwrite the same ref key, not allocate a fresh one
- overwriting a previously ref-backed port with an inline value must delete the stale ref entry
- overwriting a ref-backed port with a different ref-backed value under the same stable key must replace that entry in-place
- `onNodeOutputsCleared(...)` and any previous-process pruning path must delete the stored ref IDs they remove from state
- `onStart(...)` and `onTrivetStart(...)` must bulk-clear all execution-scoped refs before they wipe `lastRunDataByNodeState`
- `globalDataRefs.ts` must support `delete(...)`
- `globalDataRefs.ts` should use the optional `sizeHint` when available so it does not re-`JSON.stringify(...)` giant objects inside cache accounting

### 3. Split output rendering into explicit modes

Add a small render contract in the output rendering layer:

```ts
type OutputRenderMode = 'compact' | 'expanded-preview' | 'full';
```

Then update `RenderDataValue.tsx` and the `renderDataValue/*` helpers so they render by mode, not just by `isCompact`.

Rules:

- `compact`
  - never resolve ref-backed large text/object/any values to their full payload
  - never run `marked(...)`
  - never run Monaco colorization for preview summaries
  - show a lightweight summary card with type, size/count metadata, and a short excerpt
- `expanded-preview`
  - show the first chunk using `FULLSCREEN_CHUNK_PREVIEW_MAX_*`
  - provide explicit actions: `Load Full Value`, `Copy Full Value`, `Copy JSON`
  - keep markdown disabled for large ref-backed previews even if the markdown toggle is on
- `full`
  - resolve the full value and render it using the existing renderer path only when the payload is under `FULL_RENDER_SAFE_THRESHOLD_CHARS`
  - if the payload exceeds `FULL_RENDER_SAFE_THRESHOLD_CHARS`, switch to a paged/chunked full-data viewer instead of mounting one giant DOM text block
  - this is only entered by explicit user action from the expanded preview

Implementation shape:

- add a new small component such as `LargeStoredValuePreview.tsx`
- add helpers like:
  - `isPreviewOnlyStoredValue(...)`
  - `getStoredValuePreview(...)`
  - `restoreStoredDataValue(...)`
- add a shared chunk-browser helper for oversized text/JSON full inspection instead of duplicating paging logic in each surface
- `RenderDataValue` remains the main dispatcher, but it must branch early on `storage: 'ref'` plus preview kind before falling through to scalar/object renderers
- `RenderDataValue.tsx` must stop using the `getDefaultProviders()` singleton directly; it should read `dataRefs` from React context via `useDataRefs()`
- `RenderDataValue.tsx` must also stop rebuilding renderer maps on every render; memoize or hoist the renderer factory so repeated canvas rerenders do not recreate the dispatch tables
- the current fullscreen/chunk-page/full-inspection mode for a node output should stay in local component state inside the relevant surface; do not persist it in Jotai or command/history state

### 4. Stop hover from upgrading inline output to full rendering

In `packages/app/src/components/NodeOutput.tsx`:

- stop treating hover as “render full inline output”
- keep hover only for showing overlay controls and interaction affordances
- inline node output must always pass `mode='compact'` for large ref-backed values
- fullscreen modal must pass `mode='expanded-preview'` initially

This is a required behavioral change. It directly fixes the “I did not open the text, but the app still lagged” failure mode.

### 5. Make every output surface use the same preview-first behavior

Update all output consumers that currently render raw stored values directly.

Required surfaces:

- `packages/app/src/components/NodeOutput.tsx`
- `packages/app/src/components/RenderDataValue.tsx`
- `packages/app/src/components/renderDataValue/createScalarRenderers.tsx`
- `packages/app/src/components/renderDataValue/createDataValueRendererMap.tsx`
- `packages/app/src/components/PortInfo.tsx`
- `packages/app/src/components/ChatViewer.tsx`
- `packages/app/src/components/promptDesigner/usePromptDesignerAttachedNode.ts`

Required custom-node audits:

- `packages/app/src/components/nodes/ChatNode.tsx`
  - do not call `useMarkdown(outputText)` unless markdown is actually enabled and the value is not in preview-only mode
  - route response text and function-call rendering through the shared preview/full logic
- `packages/app/src/components/nodes/UserInputNode.tsx`
  - respect `isCompact`
  - use shared preview rendering for long question/answer items
- `packages/app/src/components/nodes/LoopControllerNode.tsx`
  - pass compact/full mode through to nested values
- `packages/app/src/components/nodes/SubGraphNode.tsx`
  - keep its meta rows, but let `RenderDataOutputs` own preview/full behavior

Also fix the type-unsound warnings path:

- `NodeOutput.tsx` must stop casting stored outputs directly to `Outputs` for `getWarnings(...)`
- add a small helper that resolves only the warnings port when needed, or derive warnings from the stored preview value if it stayed inline

Copy/export rules:

- `NodeOutput` copy buttons must resolve and copy the original full value, never the preview excerpt or ref metadata
- JSON copy for multi-port outputs must resolve each output port back to full `DataValue` before stringifying
- `ChatViewer` and any other export-like surface must follow the same restore-first rule
- `PortInfo` remains preview-only and must not offer full-value rendering actions
- shared helpers should exist for whole-port-map restore so copy/export, warnings, prompt-designer hydration, and preload do not each hand-roll their own per-port restore loop

### 6. Cover partial-output UX explicitly

The partial-output path must stay observable without reintroducing lag.

Behavior:

- while a node is streaming, the inline node continues to show a compact preview summary
- the summary excerpt should update as the latest partial output grows
- fullscreen shows the chunked preview of the latest partial output
- when `nodeFinish` arrives, the final value replaces the partial preview in-place without changing the interaction model
- if a partial-output port crosses the ref threshold mid-stream, the UI should transition from inline preview to ref-backed preview without a crash or stale ref leak

Split-run compatibility:

- split outputs continue to live in `splitOutputData[index]`
- each split index gets its own stable ref namespace
- paging between split outputs must not force full-value restoration unless the user explicitly loads that page’s full value

### 7. Keep preload and run-from behavior intact

Ref-backed large values must still round-trip through dependency preload.

Update:

- `packages/app/src/hooks/remoteExecutorHelpers.ts`
- any helper that currently assumes only binary/chat/media values are ref-backed

Rules:

- `restoreStoredDataValue(...)` must resolve full `string`, `string[]`, `object`, `any`, and media values from refs
- run-from preload must receive the real original `DataValue`, not the preview summary
- this must work identically for locally executed and remotely executed runs

### 8. Define missing-ref behavior and failure handling

Render-time behavior:

- preview/fullscreen UI must not throw if a stored ref is missing from `globalDataRefs`
- missing refs should render a stable placeholder explaining that the value is no longer available in memory
- copy/export actions for a missing ref should fail gracefully with a user-facing error toast instead of copying preview metadata

Execution behavior:

- preload/run-from should still treat a missing ref as an error, because replaying a downstream node with incomplete dependency data is incorrect
- the thrown error should mention that the dependency output was evicted or cleared from execution memory

### 9. Update the maintainer docs when the implementation lands

After implementation, update:

- `developer-docs/EXECUTION-DATA-FLOW.md`
- `developer-docs/APP-ARCHITECTURE.md`

Document:

- large execution values are now ref-backed, not destructively truncated
- inline node rendering is preview-first
- fullscreen output opens in chunked preview mode
- partial outputs reuse stable ref IDs
- run-from preload resolves stored refs back to full `DataValue`s

Also add a completed entry to `past-refactors.md`.

## Tests

### Pure helper tests

Add `packages/app/src/utils/executionDataTransforms.test.ts` or an adjacent storage-focused test file.

Required cases:

- large single-line `string` becomes `storage: 'ref'` with a text preview and preserved full value in `dataRefs`
- smaller `string` stays inline
- large `string[]` stores by ref and records `itemCount`
- large `object` stores by ref with a bounded JSON preview
- `any` wrapping a large string follows string rules
- stable ref IDs are reused for repeated partial updates of the same node/process/port
- overwriting a ref-backed port with an inline value deletes the stale ref
- deleting cleared node outputs removes the stored ref entry
- starting a fresh run clears execution-scoped refs from the previous run
- `restoreStoredDataValue(...)` round-trips large string/object values correctly

### Selector / preload tests

Extend `packages/app/src/hooks/remoteExecutorHelpers.test.ts`.

Required cases:

- preload restores a large ref-backed string output correctly
- preload restores a large ref-backed object output correctly
- mixed inline + ref-backed outputs restore correctly together
- preload throws a clear error for a missing ref-backed dependency output

### Rendering tests

Add lightweight server-render tests with `react-dom/server` for the shared preview components.

Required cases:

- compact rendering of a large base64-like string does not include the full payload in markup
- expanded-preview rendering includes the chunk preview and `Load Full Value`
- full rendering includes the actual payload only after explicit mode switch
- compact rendering of a large object does not trigger full JSON output
- `ChatNode` non-markdown mode does not eagerly produce markdown HTML for large outputs
- oversized full inspection stays chunked/paged instead of rendering one giant DOM block
- missing ref-backed values render a placeholder instead of throwing

### Regression tests around behavior

Add or extend tests around these behaviors:

- hovering a node with a large output does not switch it to full inline rendering
- pinned nodes with large outputs remain preview-first
- `PortInfo` on a large output shows metadata/excerpt, not the full payload
- split-output paging keeps preview behavior per page
- `usePromptDesignerAttachedNode` restores the real full prompt input from stored refs instead of receiving a truncated preview
- node-output copy actions resolve the full original payload rather than the stored preview

## Manual Verification

Run these scenarios manually after implementation:

1. Produce a 500 KB single-line base64 string on a node.
2. Pan, zoom, drag-select, and hover nearby nodes without opening fullscreen.
3. Confirm the node stays responsive and only shows a summary/excerpt inline.
4. Open fullscreen on that node.
5. Confirm fullscreen opens in chunked preview mode.
6. Click `Load Full Value` and confirm the full value appears only then.
7. Copy full value and confirm the clipboard gets the original payload.
8. Repeat with a large JSON object output.
9. Repeat with a streaming/partial-output node so the preview updates while the graph is running.
10. Repeat with `ChatViewer` open on a large response.
11. Repeat with `Run From` on downstream nodes that depend on the large output.
12. Confirm typed `image`, `audio`, and `document` outputs still render their specialized viewers.
13. Start a second run after a large-output run and confirm old execution memory is cleared without breaking the new run.
14. Force a missing-ref case if possible and confirm UI surfaces show a placeholder while `Run From` reports a clear error.

## Out of Scope

- No automatic semantic decoding of arbitrary base64 strings into image/audio previews
- No change to saved project format
- No change to node body rendering for nodes whose configuration text is large; this plan is about execution input/output payloads
- No change to the existing typed media output UX beyond routing them through the new shared storage contract

## Assumptions

- Preserving the full original large value is mandatory; destructive truncation is not acceptable.
- Smooth canvas interaction takes precedence over automatically rendering full payloads inline.
- A pinned node should keep its output visible, but it should not bypass the preview-first safety rules for large values.
- A large value’s fullscreen view should be inspectable immediately via chunked preview, not blank, but full render should always be explicit.
