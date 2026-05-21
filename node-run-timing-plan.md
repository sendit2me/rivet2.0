# Per-Node Run Duration Plan

## Summary

Add an app setting that controls whether individual node run durations are shown in node outputs.

Default behavior stays unchanged: the setting is off, node output surfaces do not show timing, and normal workflow execution does not add per-node timing work just to support this UI.

When the setting is enabled, Rivet captures and displays per-node run duration for:

- Browser/editor graph runs
- Node executor graph runs
- external Remote Debugger runs
- loaded run recordings when duration metadata exists, or when it can be derived from existing recorded event timestamps

This must not change project YAML, graph schema, node data, node output definitions, DataValue output maps, or graph execution results.

## Goals

- Add a persisted app setting: `Show node run durations`, default off.
- When the setting is off, do not show node run time anywhere in the node output UI.
- When the setting is off, do not do extra per-node timing work for ordinary live editor runs or Node executor runs.
- When the setting is on, show `Duration: {n}ms` in the inline node output and the full output modal.
- When one node has multiple visible finished runs, show `Total duration: {n}ms` plus one `Run {n}: {n}ms` line per finished run instead of showing only the selected run's duration.
- Keep nodes that already expose a runtime-like `duration` output from showing duplicate duration lines.
- Keep recordings backward-compatible and readable.
- Keep the feature as transient execution metadata, not as node outputs.

## Non-Goals

- Do not add a `duration` output port to every node.
- Do not change `.rivet-project` / YAML architecture.
- Do not change project serialization or node data shapes.
- Do not change copy-value or JSON-copy output semantics.
- Do not change workflow results, graph scheduling, connection validation, or node processing behavior.
- Do not make production headless `createProcessor(...)` / `runGraph(...)` capture durations by default when nothing asked for them.

## User Setting

Add a new app-only persisted setting:

- storage key: `showNodeRunDurations`
- default: `false`
- UI label: `Show node run durations`
- suggested helper text: `Displays each node's run duration in node outputs. Timing is captured only when needed for this view, remote debugging, or recording replay.`

Implementation shape:

- Add `showNodeRunDurationsState = atomWithStorage<boolean>('showNodeRunDurations', false, storage)` in `packages/app/src/state/settings.ts`.
- Add the toggle to the Graphs settings page, next to execution/recording-related settings, because this is an execution-output preference rather than a visual theme preference.
- Do not add this field to the core `Settings` interface. `Settings` is uploaded to executors as provider/runtime configuration; this preference is an app display preference plus an explicit run option.

## Core Execution Metadata

Add optional node duration metadata to existing execution events:

- `ProcessEvents['nodeFinish']` gets `durationMs?: number`
- `ProcessEvents['nodeError']` gets `durationMs?: number`
- split-run `nodeFinish` / `nodeError` events also get `splitRunDurationMs?: Record<number, number>`, keyed by split item index
- `ExecutorProtocol.SerializedProcessEventMap['nodeFinish' | 'nodeError']` gets the same optional field so app-executor and debugger websocket traffic remains typed.
- recorded `nodeFinish` / `nodeError` event data gets the same optional field

Add a core execution option that gates timing capture:

- `captureNodeTimings?: boolean` on `GraphProcessor` constructor options.
- `captureNodeTimings?: boolean` on `RunGraphOptions` / `createProcessor(...)` options, passed through by `coreCreateProcessor`.
- matching `captureNodeTimings?: boolean` pass-through on Node/app-executor run paths that construct processors.

Behavior:

- If `captureNodeTimings` is false or omitted, do not read timestamps and do not attach `durationMs`.
- If true, measure only actual node processing time, not React rendering or websocket receive time.
- Explicit `captureNodeTimings: false` must win even when a remote debugger is attached.
- Use a monotonic timestamp source such as `performance.now()` where available.
- Round only for display; keep event metadata numeric.
- Include duration for successful and errored node runs.
- Do not include duration for `nodeExcluded`.
- Do not include duration for synthetic `preload` process events used by run-from-here.
- Split-run nodes should report the aggregate split node duration from aggregate `nodeStart` to aggregate `nodeFinish` / `nodeError`, plus per-item `splitRunDurationMs` so many parallel/sequential runs can show total duration and one duration line per run.
- Subprocessors must inherit the parent processor's `captureNodeTimings` value so Subgraph, Call Graph, and referenced-graph internals do not drift from the top-level run.

Implementation note:

- Keep timing helpers local to `GraphProcessor` or a small core helper.
- Do not create DataValues or output ports.
- Do not format `Duration: ...` in core.
- Prefer a tiny helper such as `withNodeTiming(...)` over a central mutable timing map unless split-run/error paths require the map; the goal is less branching in the hot node path, not a new timing subsystem.

## App Execution Capture Policy

Browser/editor executor:

- Read `showNodeRunDurationsState`.
- Construct `GraphProcessor` with `captureNodeTimings: showNodeRunDurations`.
- When replaying a loaded recording, do not rerun timing; replay should use recorded metadata or timestamp fallback.
- Prompt Designer, AI-assist, Trivet, and other ad-hoc processors do not need timing unless they render the same node output surface; leave them unchanged unless tests reveal they feed visible node outputs.

Node executor/app-executor:

- Extend the app-to-executor `run` message payload with `captureNodeTimings?: boolean`.
- `useRemoteExecutor` should send `captureNodeTimings: showNodeRunDurations`.
- `packages/node/src/debugger.ts` should include this optional field in `DynamicGraphRunOptions`.
- `packages/app-executor/bin/executor.mts` should pass the value to `createProcessor(...)` / the underlying `GraphProcessor`.
- If the field is absent, app-executor should explicitly pass `captureNodeTimings: false` to preserve existing app-controlled Node executor behavior. This matters because app-executor uses the debugger transport internally even for ordinary Node executor runs.

External Remote Debugger:

- The app setting controls rendering unconditionally.
- `createProcessor(..., { remoteDebugger })` should enable timing by default when `captureNodeTimings` is omitted, because remote debugger runs are already observed and the editor cannot reliably push its display preference into an externally triggered backend run.
- A backend can still pass `captureNodeTimings: false` explicitly if it wants to suppress this metadata.
- If incoming debugger events include `durationMs`, show it only when the app setting is enabled.
- If incoming debugger events do not include `durationMs`, omit duration rather than inventing live remote timings in the app.

Recordings:

- New recordings should preserve `durationMs` when processor events include it.
- Old recordings without `durationMs` remain valid.
- Recording replay should derive an approximate duration from existing recorded `nodeStart.ts` and terminal event `ts` when `durationMs` is absent.
- Current app setting controls display during replay: if `Show node run durations` is off, do not render duration even if the recording contains it.
- `ExecutionRecorder.recordSocket(...)` should preserve incoming remote `durationMs`; it should not synthesize runtime durations while recording socket traffic.

## App Run Data And Rendering

Extend transient app run data:

- Add `durationMs?: number` to `NodeRunDataBase`.
- Add `splitRunDurationMs?: Record<number, number>` to `NodeRunDataBase`.
- Store `durationMs` and `splitRunDurationMs` from `nodeFinish` and `nodeError` in `useNodeExecutionEvents`.
- Preserve it in `storeNodeDataForHistory(...)` only as app execution state, not project data.

Rendering rules:

- Add shared node-output run metadata helpers, for example `getNodeRunDurationMs(data)`, `NodeRunDurationMeta`, and a multi-run summary helper.
- Inline node output and fullscreen output should use the same helper.
- Thread the setting through the node-output view-model/visibility helpers as an explicit option, instead of reading atoms inside pure helpers. `nodeRunDataHasVisibleOutput`, `getSelectedVisibleOutputProcess`, `useOutputDataWithReplacementGrace`, and fullscreen view-model selection all need to agree on whether duration-only output is visible.
- The output line should read `Duration: {roundedMs}ms`.
- The multi-run summary should sum visible finished run durations, including split-run item durations, while skipping running/not-ran/missing-duration entries.
- If a completed/errored node has no visible output values but has duration metadata and the setting is enabled, show the output surface with only the duration line.
- Error outputs should show duration too, including Code/Expression custom error output surfaces.
- When the setting is disabled, hide duration for inline outputs, fullscreen outputs, and loaded recordings.
- Avoid duplicate duration display for node types that already expose a visible runtime-like `duration` output, currently `subGraph`, `callGraph`, `referencedGraphAlias`, and legacy `chat`. Prefer a small helper such as `nodeTypeHasOwnDurationOutput(node.type)`. Custom renderers that hide those raw metric ports must still support split-run metric arrays; Subgraph output, for example, formats `duration: number[]` and `cost: number[]` as total values plus per-run metric lines.
- Do not include run-duration metadata in copy-value or JSON-copy output payloads. Those buttons copy displayed/output values, not transient run metadata.

## Recording Replay Details

Add replay-time duration fallback without changing recording format version:

- Track node start timestamps while iterating `recorder.events`.
- Key starts by execution identity plus node id and process id.
- On `nodeFinish` / `nodeError`, emit:
  - `durationMs: data.durationMs` if present
  - otherwise `Math.max(0, terminalEvent.ts - startEvent.ts)` when a matching start exists
  - otherwise omit `durationMs`

This gives useful approximate durations for older recordings using metadata already present in recordings today, while preserving exact recorded `durationMs` for new recordings. The fallback is intentionally replay-only: it should not be used for live remote debugger runs, where event receive timing would be misleading.

## Compatibility And Performance

Runtime compatibility:

- Existing workflow outputs must be byte-for-byte unchanged.
- Existing node output copy behavior must be unchanged.
- Existing recordings must deserialize and replay.
- Existing remote-debugger clients should tolerate the optional `durationMs` field.

Performance policy:

- Default setting off means no new per-node timestamp reads in normal editor or Node executor runs.
- Recording replay fallback uses timestamps already stored by the recorder, so it does not add runtime capture overhead to old recordings.
- Enabling the setting adds only lightweight timestamp reads and number fields on existing events.
- Headless API users keep control: no duration capture unless they opt in through the new processor/run option or attach a remote debugger without explicitly disabling capture.
- External Remote Debugger runs may capture timing even when a local viewer has the setting disabled, because the backend cannot know that viewer preference in externally triggered runs; the setting still controls whether the app shows it.

## Tests

Core tests:

- `GraphProcessor` omits `durationMs` when `captureNodeTimings` is false.
- `GraphProcessor` includes `durationMs` on `nodeFinish` when enabled.
- `GraphProcessor` includes `durationMs` on `nodeError` when enabled.
- `nodeExcluded` and preloaded `processId: 'preload'` events do not include duration.
- Split-run nodes include aggregate duration and per-item `splitRunDurationMs` when enabled.
- Subprocessors inherit timing capture from parent processors.
- `coreCreateProcessor` / Node `createProcessor` pass `captureNodeTimings` through, and `remoteDebugger` defaults capture on unless explicitly false.

Recording tests:

- `ExecutionRecorder` preserves `durationMs` and `splitRunDurationMs` on recorded node terminal events.
- `ExecutionRecorder.recordSocket(...)` preserves remote `durationMs` and `splitRunDurationMs`.
- `RecordingPlayer` replays recorded `durationMs` and `splitRunDurationMs` exactly.
- `RecordingPlayer` derives duration from legacy `ts` values when duration is missing.
- Missing start events do not crash replay and simply omit duration.

App tests:

- Settings default is disabled.
- Graphs settings toggle writes `showNodeRunDurationsState`.
- Browser executor passes `captureNodeTimings` only when the setting is enabled.
- Remote executor run payload includes `captureNodeTimings` from the setting.
- App-executor defaults missing `captureNodeTimings` to false.
- `useNodeExecutionEvents` stores duration on finish/error.
- Inline output renders duration only when the setting is enabled.
- Fullscreen output renders duration only when the setting is enabled.
- Duration-only output data is visible when enabled.
- Nodes with existing duration outputs do not show duplicate duration lines.
- Error output surfaces include duration when enabled.
- Copy-value and JSON-copy output behavior stays unchanged.

Validation commands:

- Core focused tests around `GraphProcessor`, `ExecutionRecorder`, and `RecordingPlayer`.
- App focused tests around settings, local/remote executor run requests, node output view models, and fullscreen output.
- App-executor focused tests around run payload handling.
- `tsc --noEmit --pretty false` for affected workspaces.
- `yarn lint`
- `git diff --check`

## Documentation Updates

Developer docs:

- Document `captureNodeTimings` as optional execution metadata capture, not a graph-output feature.
- Document that the app setting controls display and editor/app-executor capture.
- Document that `remoteDebugger` attached processors capture durations by default unless `captureNodeTimings: false` is passed.
- Document recording fallback behavior for legacy recordings.

User docs:

- Add a short note under graph/output/settings docs:
  - `Show node run durations` is off by default.
  - When enabled, node outputs show `Duration: ...`.
  - Recordings and Remote Debugger runs show duration only when timing metadata is available.

## Rollout Order

1. Add core optional event metadata and gated capture.
2. Add recording serialization/replay support.
3. Add app setting and pass it into Browser/Node executor run paths.
4. Add app run-data storage and output rendering.
5. Add tests.
6. Update developer and user docs.
7. Run focused checks, typechecks, lint, and `git diff --check`.
