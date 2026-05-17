# Refactor Plan

This plan was created after reviewing `refactor-history.md`, the executor-session
architecture audit, and recent commit history.

The goal is not to change behavior. The goal is to make the repository easier to
understand, safer to modify, and smaller where a reduction does not hide policy in
overly dense code.

This is not a single mega-refactor. Implement one phase at a time, keep each
phase behavior-preserving, and stop after each phase for verification and a
fresh reassessment.

## Baselines Used

Use two different baselines depending on the question:

- `refactor-history.md` is the durable refactor history. It was last updated by
  `cd1ff539` (`Refresh Rivet 2.0 docs and developer release flow`) on
  2026-05-03, so it is useful history but not a current-change boundary by
  itself.
- `591d6ebd` (`PRE Executor refactor`) opened the executor-session refactor
  audit; `13d3afef` (`Refactor executor session lifecycle for hosted Rivet`)
  completed that refactor. Unless the executor refactor itself is being compared,
  "post-refactor" in this plan means `13d3afef..HEAD`.

## Guardrails

- Do not change project, graph, node, execution, websocket, copy/export, or UI
  behavior unless a step explicitly discovers a bug and the fix is approved.
- Preserve public APIs, graph serialization, node data shapes, websocket message
  schemas, and hosted-wrapper seams.
- Prefer deleting duplication and moving policy into named helpers over adding a
  broad framework.
- Optimize for maintainability and reviewability. Do not hide product-visible
  behavior changes inside "cleanup" commits; if a phase discovers a real bug,
  split that fix into an explicit bug-fix change.
- Do not use file size alone as refactor evidence. Prioritize areas that combine
  size, recent churn, bug density, and risky ownership boundaries.
- Keep existing tests passing before each phase; add characterization tests before
  touching core execution behavior or websocket/session lifecycles.
- Update developer documentation when a phase changes an ownership boundary.
- Treat "kept intentionally" as a valid outcome when an abstraction would add more
  concepts than it removes.

## Phase Implementation Rules

- Start each phase by recording the current behavior with focused tests or a
  manual baseline.
- Move code before reshaping code. Pure extraction should be the first commit
  whenever possible.
- Keep public imports stable through compatibility re-exports when that avoids
  noisy caller churn.
- Delete compatibility re-exports only after all callers have moved and tests
  have passed.
- Update `developer-docs/*` and the refactor bookkeeping section in the same
  phase that changes ownership.
- Prefer "deferred" or "kept intentionally" over a weak abstraction that makes
  future changes harder.
- Treat line reduction as secondary to clearer ownership. Some helpers created by
  recent fixes intentionally add lines because they protect fragile policy such
  as output refs, remote upload caching, and canvas visibility.

## What Was Refactored Already

The existing history shows several mature cleanup waves:

- `GraphProcessor` preprocessing, cycle detection, recording replay, context
  building, subprocessors, split runs, and loop-controller policy were partially
  extracted.
- Executor-session lifecycle now has explicit target/capability/product-state
  modeling, plus coordinator tests.
- Workspace transitions, graph-editing domain helpers, project editor state, and
  undo/redo flows were separated from raw UI components.
- Render-data-value, structured output, large-output refs, display-copy behavior,
  fullscreen output search, and node-output visibility were already moved toward
  shared helpers.
- LLM Chat v2 runtime policy, provider options, credential resolution, model
  catalog behavior, provider error normalization, and unsafe stream parse logging
  were extracted.
- App platform boundaries, hosted wrapper seams, and package/build documentation
  were improved.

Do not reopen those areas just because they were touched before. Reopen them only
when post-refactor commits introduced new complexity or drift.

## What Changed After The Last Completed Refactor

The largest post-`13d3afef` growth and churn is concentrated in:

- executor/session/runtime code:
  - `packages/app/src/hooks/executorSession.ts`
  - `packages/app/src/hooks/useRemoteExecutor.ts`
  - `packages/app/src/hooks/useExecutorSessionCoordinator.ts`
- node output, fullscreen output, output copy, and ref-backed execution data:
  - `packages/app/src/components/NodeOutput.tsx`
  - `packages/app/src/utils/executionDataTransforms.ts`
  - `packages/app/src/utils/executionDataCopyValue.ts`
  - `packages/app/src/utils/nodeOutputCopyValueProjectors.ts`
- graph tree and project settings UI:
  - `packages/app/src/components/GraphList.tsx`
  - `packages/app/src/components/ProjectInfoModal.tsx`
  - `packages/app/src/components/ProjectContextConfiguration.tsx`
- app-executor Code/Expression worker optimization:
  - `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts`
- remote debugger websocket transport:
  - `packages/node/src/debugger.ts`
- new and recently polished core nodes:
  - `packages/core/src/model/nodes/CodeNewNode.ts`
  - `packages/core/src/model/nodes/CoalesceNode.ts`
  - `packages/core/src/model/nodes/ObjectNode.ts`
  - `packages/core/src/model/nodes/PromptNode.ts`
- release/build/docs surface:
  - GitHub release workflows
  - desktop icon generation and macOS download publishing
  - package/docs version and download pages

## Phase 1: Split Node Output Surface (DONE)

Priority: highest.

Payoff check:

- Worth doing. `NodeOutput.tsx` is about 800 lines, has high post-refactor churn,
  and owns several policies that recently caused regressions: fullscreen modal
  placement, hover cleanup, output blinking, copy behavior, wrapping, search, and
  process paging.
- This aligns directly with the refactor goals because it should reduce future
  bug-fix blast radius without changing output behavior.

Targets:

- `packages/app/src/components/NodeOutput.tsx`

Problem:

`NodeOutput.tsx` now owns too many concerns at once: inline output rendering,
fullscreen modal rendering, process paging, output fade behavior, replacement
grace, copy buttons, prompt-designer actions, fullscreen search, wrapping state,
header elevation, and error short-circuit behavior.

Step-by-step plan:

1. Establish the behavior baseline.
   - In `packages/app/src/components/NodeOutput.tsx`, list the current exported
     contracts: `NodeOutput` and `FullscreenNodeOutputModalRenderer`.
   - Keep `RivetApp.tsx` and `NormalVisualNodeContent.tsx` import behavior stable
     unless moving the public export clearly reduces overall complexity.
   - Run the current node-output tests before extraction so any later failure is
     clearly from the refactor.
2. Extract content-key, fade, and replacement-grace policy first.
   - Move `getNodeOutputContentKey`, `NodeOutputContentFade`, the bounded
     `seenNodeOutputContentKeys` set, and `useOutputDataWithReplacementGrace`
     into a small
     `packages/app/src/components/nodeOutput/NodeOutputContentState.tsx`
     module.
   - Why: these policies caused recent blink regressions and should be testable
     without reading fullscreen modal code.
   - How: keep the exact content-key shape and
     `NODE_OUTPUT_REPLACEMENT_GRACE_MS` behavior; only move code and imports.
3. Extract the process pager.
   - Move the shared process-page controls into
     `packages/app/src/components/nodeOutput/NodeOutputPager.tsx`.
   - Keep selected-process-page reads/writes in the component unless a pure
     selected-page helper falls out naturally.
   - Add focused coverage for single process, multi-process, split process, and
     selected-process fallback.
4. Extract fullscreen output orchestration.
   - Move `ResizableNodeFullscreenOutputModal`, `NodeFullscreenOutput`,
     fullscreen search context wiring, toolbar integration, wrap/Markdown state,
     and scroll container helpers into
     `packages/app/src/components/nodeOutput/NodeFullscreenOutput.tsx`.
   - Either keep `FullscreenNodeOutputModalRenderer` re-exported from
     `NodeOutput.tsx` or update `RivetApp.tsx` in the same commit. Do not leave
     two public owners.
   - Preserve `useDependsOnPlugins()` at the app-level modal mount so plugin
     output renderers still refresh.
5. Extract inline output rendering.
   - Move inline output orchestration, single-process rendering, and
     multi-process rendering into
     `packages/app/src/components/nodeOutput/NodeInlineOutput.tsx`.
   - Keep inline action wiring in a small presentational action-bar component if
     it removes repeated copy/fullscreen/unfold button glue.
   - Continue passing `renderMode` from `resolveNodeOutputPreviewMode(...)`
     rather than letting custom renderers infer it from `isCompact`.
6. Reduce `NodeOutput.tsx` to an adapter.
   - It should read expansion/hover/fullscreen atoms, clear hover when opening or
     closing fullscreen output, and select inline versus fullscreen components.
   - It should not own search, pager rendering, copy serialization, or content
     animation internals after the split.
7. Update `developer-docs/APP-ARCHITECTURE.md`.
   - Document the new file ownership and keep the existing output-mode, copy, and
     fullscreen-modal placement contracts intact.

Non-goals:

- Do not change compact/hover/full/fullscreen render modes.
- Do not change copy JSON/value behavior.
- Do not change large stored value loading/search behavior.
- Do not change custom node output renderer contracts.

Risks:

- Fullscreen output is mounted outside the canvas on purpose. Moving the modal
  renderer back under `GraphBuilder`, `NodeCanvas`, or a transformed node subtree
  can reintroduce iframe clipping and viewport jumps.
- Hover state cleanup is subtle. Copy, unfold, fullscreen open, fullscreen close,
  and portal focus-lock transitions must not leave the node in a sticky hover
  state or clear hover while the pointer is still legitimately over the node.
- Custom error renderers are exceptions to the generic error short-circuit.
  `Code`, `Expression`, `JS Filter`, `JS Map`, and `Extract Object Path` must
  keep their parsed-source/error-location sections on failures.
- Large stored values must stay preview-first. A refactor that accidentally
  restores full values for hover previews can make the canvas slow again.
- Search and wrapping are fullscreen-only. Do not leak fullscreen search
  providers, Markdown mode, or wrap-line classes into compact canvas previews.
- Process paging combines node-level process history with split-output pages.
  Changing selected-page fallback can make old recordings or run-from preserved
  outputs appear to disappear.
- Animation state is intentionally bounded. Unbounded content-key tracking would
  create a memory leak; removing the key memory entirely would bring back output
  blink regressions.

Verification:

- Run existing `nodeOutput*` tests.
- Run focused `RenderDataValue` and execution-data-copy tests.
- Manually check inline collapsed, hover, unfolded, multi-process, fullscreen,
  wrap/no-wrap, Markdown, search, copy value, and JSON copy.

Expected result:

- Lower cognitive load in the hottest UI file.
- A modest line reduction is possible by sharing pager/action/header glue.
- Future output fixes should touch smaller ownership surfaces.

Conclusion:

- Status: implemented on 2026-05-17 in `ca22606c` as a
  behavior-preserving ownership split.
- What was done:
  - `NodeOutput.tsx` became the stable adapter and fullscreen renderer
    re-export.
  - `NodeInlineOutput.tsx` now owns in-canvas output rendering and action
    buttons.
  - `NodeFullscreenOutput.tsx` now owns fullscreen modal output orchestration.
  - `NodeOutputContentState.tsx` now owns content-key fade and replacement
    grace.
  - `NodeOutputPager.tsx` now owns shared process-page controls.
- How it went:
  - The refactor stayed inside the planned public behavior boundary. Inline,
    hover, expanded, fullscreen, copy, wrapping, Markdown, search, stored-output,
    and custom renderer behavior were preserved.
  - The hottest file was simplified substantially: `NodeOutput.tsx` had 858
    deleted lines and 9 added lines, for a local reduction of 849 lines.
  - The production output surface as a whole changed by about +18 lines after
    adding the focused modules. The win was clearer ownership rather than a
    meaningful total line reduction.
- Plan corrections during implementation:
  - The public `NodeOutput.tsx` export was kept as the compatibility owner
    instead of moving imports outward. This avoided caller churn and preserved
    the fullscreen renderer seam.
  - No extra generic action-bar abstraction was introduced because the extracted
    inline module already made the repeated action glue understandable.
- Problems solved and goals achieved:
  - Fullscreen placement, inline rendering, animation/replacement grace, and
    process paging are no longer interleaved in one long component.
  - Future fixes for hover blinking, output copy, fullscreen wrapping/search, or
    process paging should touch a smaller module with a clearer responsibility.
  - The phase met the main refactor goal: lower future-change risk in a
    high-churn UI surface without changing node output behavior.
- Verification recorded for this phase:
  - focused node-output regression tests;
  - focused app lint check;
  - app TypeScript check;
  - diff whitespace check.

## Phase 2: Extract Graph Tree Context Menu And Derived Models (DONE)

Priority: high.

Payoff check:

- Worth doing. `GraphList.tsx` is about 840 lines and has the highest
  post-refactor churn among the listed UI targets.
- The payoff is strongest if the phase extracts menu construction and
  presentation derivation while leaving drag/drop and modal ownership stable.
  A broader tree rewrite would not pay off.

Targets:

- `packages/app/src/components/GraphList.tsx`
- `packages/app/src/components/graphList/FolderItem.tsx`

Problem:

`GraphList.tsx` combines graph-list layout, context-menu configuration, context-menu
actions, project-settings modal ownership, graph-info modal ownership, reachability
presentation, selected-graph reference indicators, drag/drop setup, and filtering.

Step-by-step plan:

1. Freeze the visible menu contract.
   - In `packages/app/src/components/GraphList.tsx`, record the current graph,
     folder, and empty-list menu item ids, labels, icons, disabled states, and
     order before moving code.
   - Add or extend tests for menu construction before extracting behavior.
2. Extract pure menu construction.
   - Create `packages/app/src/components/graphList/graphListContextMenu.ts`.
   - Move graph-item, folder, and graph-list menu item builders there.
   - Inputs should be plain facts such as `selectedGraphId`, `isMainGraph`,
     `canDelete`, `hasFolder`, `showReachability`, plugin support, and
     reachability facts. The module should not read Jotai atoms or call graph
     operations.
3. Extract command dispatch only after menu construction is stable.
   - Prefer a small `useGraphListContextMenuActions(...)` hook if dispatch needs
     React state, graph operations, modal setters, and confirmation state.
   - Keep destructive commands such as delete behind the existing confirmation
     modal flow; the extracted hook should open the same modal rather than
     deleting directly.
   - If a pure command helper creates more indirection than it removes, keep the
     dispatch switch local and document why.
4. Extract presentation derivation.
   - Create `packages/app/src/components/graphList/useGraphListPresentation.ts`
     for active-folder highlighting, graph reference indicators, reachability
     labels, and selected-graph display flags.
   - Reuse existing domain helpers such as
     `buildGraphListReachabilityPresentation(...)` and graph reachability utils
     instead of duplicating traversal rules in the component.
5. Keep DnD and row rendering in place during the first pass.
   - `GraphList.tsx` should continue composing `DndContext`,
     `useGraphListDragDrop`, `FolderItem`, row clicks, search input, and modal
     ownership until menu/presentation extraction is verified.
   - Only split row components later if the first pass leaves obvious repeated
     render glue.
6. Remove duplication and update docs.
   - Delete old inline menu builders from `GraphList.tsx`.
   - Update `developer-docs/APP-ARCHITECTURE.md` or graph editor docs with the
     new graph-tree ownership boundary.

Non-goals:

- Do not change menu labels, order, visibility, or command behavior.
- Do not change folder highlighting, filtering, drag/drop, or graph selection.
- Do not introduce a generic tree framework.

Risks:

- Context-menu target classification depends on DOM dataset values and right-click
  location. A sloppy extraction can turn folder clicks into list clicks or graph
  clicks into folder commands.
- Menu item order and visibility are user-visible behavior. Reordering "Delete",
  "Graph info", "Make main", or creation commands can break muscle memory even
  if commands still work.
- Delete and rename flows interact with modal state and selected graph state.
  Moving dispatch can accidentally bypass confirmation or leave stale pending
  delete state.
- Drag/drop and context menus share the same tree rows. Adding wrappers or
  changing event boundaries can break graph dragging, folder dragging, or search
  focus behavior.
- Active collapsed-folder highlighting depends on the currently open graph, not
  only the selected row. Presentation extraction must preserve that distinction.
- Reachability and reference indicators depend on plugin-supported built-ins.
  Recomputing them in a new place without the same inputs can make references
  disappear or show for unsupported projects.
- `ProjectInfoModal` and `GraphInfoModal` are still owned by the tree surface.
  Pulling them into a generic modal layer would be a broader refactor than this
  phase and is likely not worth it.

Verification:

- Existing graph-list tests.
- Context-menu pure tests for graph, folder, and empty-list menus.
- Manual check: right-click graph/folder/list, collapsed active folder highlight,
  rename, duplicate, graph info, make main, delete, new graph/folder, import.

Expected result:

- `GraphList` becomes a readable shell.
- Context-menu regressions become easier to test.
- Some line reduction is likely from removing repeated menu container glue.

Conclusion:

- Status: implemented on 2026-05-17 in `49638865` as a targeted extraction,
  not a tree rewrite.
- What was done:
  - `graphListContextMenu.ts` now owns graph/folder/root menu construction and
    captured target normalization.
  - `useGraphListPresentation.ts` now owns graph-list reachability/reference
    derivation plus row presentation facts used by `FolderItem`.
  - `GraphList.tsx` still owns drag/drop composition, recursive row composition,
    modal ownership, and command dispatch.
  - `FolderItem.tsx` still owns recursive row rendering, rename input behavior,
    and DnD row wiring.
- How it went:
  - The implementation followed the planned narrow extraction and avoided a
    broader tree rewrite.
  - `GraphList.tsx` shrank by 84 net lines, and `FolderItem.tsx` stayed roughly
    flat at 1 net line removed.
  - The production graph-list surface grew by about 256 lines overall because
    formerly inline policy moved into explicit pure helpers with defensive target
    validation. This was accepted because the helpers are testable and make the
    component ownership clearer.
- Plan corrections during implementation:
  - Command dispatch intentionally stayed in `GraphList.tsx`. Extracting it into
    a hook would have mixed graph operations, modal state, and confirmation flow
    into a new abstraction without reducing risk.
  - The context target helper became a little more defensive than the original
    plan: graph targets re-resolve by id against `savedGraphs`, and
    path-sensitive commands use the current saved graph name when a captured DOM
    path is stale.
- Problems solved and goals achieved:
  - Menu construction is now pure and covered by focused tests for graph, folder,
    root, stale, and malformed targets.
  - Reachability, reference, selected/open graph, collapsed-folder highlight, and
    running-row presentation facts are derived outside the recursive component
    rendering path.
  - Drag/drop, rename, modal ownership, and command behavior stayed in their
    existing runtime places, reducing the chance of user-visible regressions.
  - The phase met the main refactor goal: graph-tree behavior is easier to test
    and reason about while preserving menu labels, order, visibility, and tree
    interactions.
- Verification recorded for this phase:
  - graph-list layout/source contract test;
  - pure context-menu and presentation helper tests;
  - graph-list action, reachability, folder, and shared context-menu tests;
  - full app test suite;
  - focused app lint check;
  - app TypeScript check;
  - app production build.

## Phase 3: Separate Execution Data Storage, Preview, And Copy Policy (DONE)

Priority: high.

Payoff check:

- Worth doing. The execution-data utilities are more than 1,100 lines combined
  and sit on a sensitive boundary used by node output, fullscreen output, copy,
  preload, recording inspection, and large ref-backed values.
- This phase pays off if it clarifies storage, preview, read, and copy ownership.
  It does not pay off if it creates new overlapping "reader" or "serializer"
  modules with unclear authority.

Targets:

- `packages/app/src/utils/executionDataTransforms.ts`
- `packages/app/src/utils/executionDataCopyValue.ts`
- `packages/app/src/utils/nodeOutputCopyValueProjectors.ts`

Problem:

Execution display utilities now mix storage decisions, ref cleanup, preview text,
missing-ref behavior, copy projection, special `any` / `undefined` rules, and
node-specific visible-output overrides. The behavior is important and currently
well covered, but the ownership is too broad.

Step-by-step plan:

1. Map the current utility responsibilities before moving code.
   - `executionDataTransforms.ts` owns sanitization, Uint8Array repair,
     history/ref storage, preview creation, ref cleanup, and run-data splitting.
   - `executionDataReaders.ts` already owns restore/coerce/warning read paths.
   - `executionDataCopyValue.ts` owns display-aligned copy serialization.
   - `nodeOutputCopyValueProjectors.ts` owns node-specific visible-copy
     overrides.
2. Extract storage/ref ownership.
   - Create `packages/app/src/utils/executionDataStorage.ts`.
   - Move `RefScope`, storage decisions, ref id construction, store-by-ref
     helpers, ref collection, ref deletion, and removed/preserved ref cleanup.
   - Keep public compatibility re-exports from `executionDataTransforms.ts` for
     one phase so callers do not churn while behavior is being verified.
3. Extract preview/excerpt ownership.
   - Create `packages/app/src/utils/executionDataPreview.ts`.
   - Move preview construction, excerpt creation, encoded-hint detection, size
     hints, and preview stringification there.
   - Keep preview thresholds and "preview only" semantics byte-for-byte the same.
4. Keep readers separate.
   - Do not move `restoreStoredPortMap`, `restoreStoredPortValue`,
     `restoreDisplayedNodeOutputs`, or warning extraction out of
     `executionDataReaders.ts` unless a later audit proves it helps.
   - Update imports only where the new storage/preview modules are the true
     owners.
5. Split display-copy helpers only if it reduces file size clearly.
   - Candidate shape:
     `packages/app/src/utils/executionDataCopy/projectDataValue.ts`,
     `packages/app/src/utils/executionDataCopy/serializeDisplayedOutputs.ts`,
     and `packages/app/src/utils/executionDataCopy/displayCopySections.ts`.
   - Keep the top-level `executionDataCopyValue.ts` exports stable so UI and
     tests keep using the same entrypoint.
6. Keep node-specific copy policy out of UI.
   - Leave Chat, User Input, Loop Controller, and Subgraph copy projectors in
     `nodeOutputCopyValueProjectors.ts` or a sibling folder.
   - Do not move these policies into `NodeOutput.tsx` or individual node
     components.
7. Update developer docs.
   - In `developer-docs/EXECUTION-DATA-FLOW.md` and
     `developer-docs/APP-ARCHITECTURE.md`, document the split between storage,
     readers, preview, and display-copy policy.

Non-goals:

- Do not change ref id format.
- Do not change preview thresholds, missing-value text, undefined display/copy
  behavior, JSON copy/export, or preload restoration.
- Do not change when values are stored by ref.

Risks:

- Ref cleanup is correctness-critical. Deleting the wrong ref makes old output,
  fullscreen search, copy value, preload, or recording inspection show "Value no
  longer available in memory" even when the value should still exist.
- Storing too little inline can break compact previews; storing too much inline
  can bring back sluggish canvas renders for huge outputs.
- `undefined` display/copy behavior is intentionally different from raw JSON
  export. A shared serializer that uses JSON too early will regress visible copy
  for explicit `{ type: "any", value: undefined }`.
- Run-from preload depends on restoring ref-backed upstream outputs. Moving
  restore or cleanup policy without focused tests can change editor execution
  results even though the refactor is supposed to be UX/storage-only.
- Circular, binary, document, image, audio, chat-message, function, and `any`
  payloads all have special preview or storage paths. New helper signatures must
  not narrow them to plain JSON values.
- Compatibility re-exports can become permanent clutter. Schedule their removal
  or explicitly mark them as compatibility exports after callers are migrated.
- `executionDataReaders.ts` already exists. Creating a second "reader" module
  with overlapping restore helpers would make ownership worse, not better.

Verification:

- `executionDataTransforms.test.ts`
- `executionDataCopyValue.test.ts`
- `nodeOutputCopyValueProjectors.test.ts`
- focused manual check with large object/string output, `undefined`, missing refs,
  copy value, JSON copy, fullscreen search.

Expected result:

- Less risk when changing output UX.
- More professional utility boundaries.
- Line reduction may be modest; clarity is the main win.

Conclusion:

- Status: implemented on 2026-05-17 as a behavior-preserving utility ownership
  split.
- What was done:
  - `executionDataStorage.ts` now owns history storage, stable ref-id
    construction, stored-value restore, ref collection, preserved/removed ref
    cleanup, and run-data splitting for partial reruns.
  - `executionDataPreview.ts` now owns storage decisions, preview thresholds,
    text/json excerpts, encoded hints, media/chat summaries, and malformed
    payload fallback decisions.
  - `executionDataSanitization.ts` now owns runtime `Uint8Array` repair for
    inputs/outputs before they are stored.
  - `executionDataTransforms.ts` was reduced to a compatibility facade so older
    imports keep working while new implementation code can import from the real
    owner modules.
  - Display-copy internals moved under `executionDataCopy/`:
    `projectDataValue.ts`, `serializeDisplayedOutputs.ts`, and
    `displayCopySections.ts`. The public `executionDataCopyValue.ts` entrypoint
    remains stable.
- How it went:
  - The refactor preserved the visible output, copy, JSON copy/export, missing
    ref, explicit `any` `undefined`, large preview, and run-from preload
    behavior covered by the existing focused tests.
  - `executionDataTransforms.ts` shrank by 777 net lines, and
    `executionDataCopyValue.ts` shrank by 308 net lines.
  - The total production execution-data utility surface grew by about 60 lines
    because the implicit policies are now explicit owner modules. This was an
    acceptable tradeoff for reviewability at a sensitive storage/display
    boundary.
- Plan corrections during implementation:
  - A small `executionDataSanitization.ts` module was added even though the plan
    did not name it explicitly. This avoided a circular dependency between the
    compatibility facade and the new storage owner.
  - Low-level stored-value restore moved with storage/ref ownership, while
    `executionDataReaders.ts` kept the app-facing displayed-output restore,
    port-level restore/coercion, and warning helpers as planned.
  - Display-copy helpers were split because the boundary was clean and the
    top-level public entrypoint could remain a facade without caller churn.
  - Later reassessments found that absent/nullish port wrappers were too easy
    to preserve as malformed stored values or display/copy as user-visible
    `undefined`. The storage, reader, generic render, custom output renderers,
    output-visibility, port-inspector, Chat Viewer, display-copy, node-specific
    copy projectors, and JSON-copy paths were tightened to skip absent wrappers
    consistently while preserving explicit `{ type: 'any', value: undefined }`
    as real runtime data.
  - Another extrapolation pass found preview-only parsed-source sections using
    strict whole-map input restore. Code, Expression, JS list, and Extract Object
    Path now use safe per-port input restore for parsed-source text so an
    evicted ref-backed input cannot break an otherwise renderable output preview
    or hide unrelated available interpolation values.
  - The same pass tightened editor-assist restore and run-from preload:
    Prompt Designer attached-node hydration now uses safe per-port input restore,
    while run-from preload remains strict but skips malformed empty output maps
    instead of treating them as reusable boundary data.
  - A further "what else could go sideways" pass found the same presence-vs-value
    risk on split-output rendering and copy paths: a present `splitOutputData`
    object with only absent port wrappers could hide valid `outputData`. Split
    output render/copy selection now requires at least one real visible stored
    port wrapper before preferring split output data, and generic render now
    shares display-copy's warning/internal-port visibility rule.
  - The final reassessment pass found the paired fullscreen edge: warnings are
    visible output status, but they are not body ports. Fullscreen output now
    renders warning messages through the same dedicated warning UI contract as
    inline output instead of showing a blank body for warning-only runs.
  - The next extrapolation pass found two sibling gaps in the same boundary:
    split-output ref cleanup treated a nullish split entry as proof that the
    whole node-run record was not node-run-shaped, and custom display-copy
    projectors still ran for hidden/absent split maps once any split was
    visible. Ref cleanup now tolerates nullish split entries, and custom copy
    projection only runs for output maps that pass the visible-wrapper policy.
  - A final JSON-copy pass found that the visible split-output guard was
    correct for body/copy text but needed an explicit regression target for
    warning-only split runs with no final-output fallback. Displayed-output
    restore now has documented coverage for the intended order: visible split
    outputs first, valid final `outputData` second, and hidden-only split data
    only when it is the sole stored representation.
- Problems solved and goals achieved:
  - Storage/ref lifecycle, preview/excerpt policy, runtime sanitization, and
    display-copy projection are no longer interleaved in two broad files.
  - Future changes to large-output storage, missing-ref cleanup, preview
    generation, or copy text should have a smaller and more obvious target file.
  - The compatibility facades keep behavior and imports stable while new code
    can depend on the more precise owner modules.
  - The reassessment hardening closed a concrete policy gap at the exact boundary
    this phase split: missing `DataValue` wrappers now remain distinct from
    explicit `any` `undefined` across generic and node-specific output
    rendering, output visibility, port inspectors, Chat Viewer prompt display,
    display copy, node-specific copy projectors, and internal JSON copy.
  - Preview-only restore now fails soft per port while executor preload remains
    strict, which keeps display resilience separate from runtime data
    requirements.
  - Run-from preload now uses the same real-wrapper boundary as output
    visibility, so malformed empty stored maps cannot seed a rerun with empty
    boundary outputs.
  - Split-output render and display-copy paths now share that boundary too, so
    empty, warnings-only, or internal-port-only split partial-output maps do not
    blank a later valid final output payload.
  - Warning-only output remains visible without leaking warning ports into the
    generic body renderer; inline and fullscreen output surfaces now both show
    those warnings explicitly.
  - Split-output ref cleanup can no longer miss refs in valid sibling split
    entries because one legacy/malformed split entry is nullish.
  - Custom display-copy projectors no longer create phantom copied sections for
    split entries or output maps that the visible output UI skipped.
  - Internal JSON copy/export can still inspect warning-only split runs when no
    final output payload exists, without allowing hidden split maps to blank a
    valid final output payload.
- Verification recorded for this phase:
  - execution-data transform/storage/preview regression tests;
  - execution-data reader tests;
  - display-copy and node-specific copy projector tests;
  - regression tests for absent port wrappers versus explicit `any`
    `undefined`;
  - output visibility regression tests for absent wrappers;
  - safe per-port restore regression coverage for evicted ref-backed values;
  - run-from preload regression tests for absent wrappers and fallback to older
    usable outputs;
  - split-output helper, visible-port, displayed-output restore, and
    display-copy fallback regression tests for empty and hidden-port-only split
    maps;
  - fullscreen warning rendering checked during the final output-surface pass;
  - ref-cleanup regression coverage for nullish split-output entries;
  - custom display-copy regression coverage for absent output maps and hidden
    split entries;
  - internal JSON-copy restore regression coverage for hidden split output data
    without an `outputData` fallback;
  - app TypeScript check;
  - full app test suite;
  - focused app lint check;
  - diff whitespace check.

## Phase 4: Simplify Remote Execution Client Pipeline (DONE)

Priority: medium-high.

Payoff check:

- Worth doing, but narrowly. `useRemoteExecutor.ts` is about 500 lines and owns a
  high-risk integration path: internal Node executor runs, external Remote
  Debugger runs, request-scoped events, upload caching, run-from preload, Trivet,
  user input, and abort/pause/resume commands.
- The refactor pays off if it makes run/upload/request lifecycle decisions easier
  to audit. It does not pay off if it duplicates the executor-session runtime or
  hides React state behind generic helper layers.

Targets:

- `packages/app/src/hooks/useRemoteExecutor.ts`
- `packages/app/src/hooks/remoteExecutorHelpers.ts`
- `packages/app/src/hooks/remoteExecutorUploadCache.ts`
- `packages/app/src/hooks/useExecutionDataFlow.ts`

Problem:

Remote execution grew after the executor-session refactor: request-scoped runs,
project/settings/static-data upload caching, run-from preload preservation,
ref-backed execution data restoration, recording playback routing, and transport
capability checks all meet around `useRemoteExecutor.ts`. The hook still needs to
own React/session integration, but it should not also be the only place where
upload decisions, send-result handling, and pending-run cleanup are readable.

Step-by-step plan:

1. Preserve the hook boundary first.
   - Keep `packages/app/src/hooks/useRemoteExecutor.ts` as the React adapter that
     reads atoms, gets the active executor-session runtime, subscribes to process
     messages, and updates `useCurrentExecution()`.
   - Do not move atom reads or side effects into pure helpers.
2. Split upload planning from upload sending.
   - Add a pure helper near `remoteExecutorUploadCache.ts` that compares
     `project`, `settings`, `projectData`, and `sessionKey`, then returns a
     decision object such as `{ type: 'reuse-upload' }` or
     `{ type: 'upload-required', uploadKey }`.
   - Keep the actual websocket sends in an imperative function that marks the
     cache only after every required `sendDynamicData` and `sendStaticData` call
     succeeds.
   - Why: recent speed work relies on caching, but cache correctness should be
     readable without following all of `tryRunGraph()`.
3. Extract run-request lifecycle helpers if they reduce branching.
   - Candidate module: `packages/app/src/hooks/remoteExecutorRunRequest.ts`.
   - It may own request-id creation, active request registration, send-failure
     cleanup, completion cleanup, and disconnect/replacement cleanup.
   - It must call through existing executor-session APIs rather than owning
     websocket state itself.
4. Keep run-from planning where it is already pure.
   - `remoteExecutorHelpers.ts` already contains `getEditorRunFromPlan(...)`,
     preload extraction, unavailable-preload detection, Trivet test selection,
     and process-event dispatch.
   - Only split this file further if one group becomes independently large after
     request/upload extraction.
5. Keep process-event suppression explicit.
   - `useExecutionDataFlow.ts` owns preloaded-node event suppression through the
     current execution flow. Do not hide that policy inside the remote upload
     cache.
   - Document the seam if a helper starts returning both run plan and suppression
     metadata.
6. Update tests in layers.
   - Pure tests for upload decision and cache invalidation.
   - Hook/helper tests for send failure and request cleanup.
   - Existing run-from and preload tests must still prove preserved upstream data
     does not create duplicate process pages.
7. Update developer docs.
   - In `developer-docs/EXECUTION-DATA-FLOW.md`, document the client-side remote
     run pipeline: upload decision, project upload, run send, request-scoped
     events, preload preservation, and cleanup.

Non-goals:

- Do not change websocket protocol messages.
- Do not change upload-cache invalidation behavior.
- Do not change run-from/run-to, recording playback, preload, abort, pause,
  resume, or external Remote Debugger reconnect policy.
- Do not merge this with the server-side debugger transport refactor.

Risks:

- The upload cache must never be marked fresh before all sends succeed. A failed
  static-data send followed by a cached run would make the executor run stale
  project data.
- Session identity matters. Reusing an upload key across reconnects, external
  debugger replacement, or internal executor replacement can send a run to a
  socket that never received the matching project upload.
- Request ids protect overlapping remote events. Losing request filtering can
  attach a previous run's node events to the current graph or make test runs
  consume normal workflow results.
- Run-from behavior is intentionally editor-only and preserves upstream data.
  Refactoring preload flow can accidentally rerun preserved nodes, duplicate
  process pages, or drop upstream outputs.
- Browser mode, internal Node mode, external Remote Debugger mode, and loaded
  recording playback route differently. A helper named too generally can make
  recording playback or Browser mode look like a remote run.
- Abort, pause, resume, user input, dataset messages, console forwarding, and
  code logs all share the same remote transport surface. Do not optimize the run
  path by bypassing those lifecycle messages.
- React stale-closure bugs are easy here. Any callback extracted from the hook
  must still use current selected graph, project, settings, context values, and
  executor-session runtime state at action time.

Verification:

- `remoteExecutorHelpers.test.ts`
- `remoteExecutorUploadCache.test.ts`
- focused tests for consecutive identical runs, project/settings/static-data
  changes, send failures, reconnect/disconnect cache reset, run-from preload, and
  request cleanup on session replacement.
- manual check: Browser executor, internal Node executor, external Remote
  Debugger, recording playback, run-from, abort/pause/resume.

Expected result:

- Remote execution becomes easier to audit without reopening the completed
  executor-session runtime refactor.
- Upload caching stays fast but less entangled with run-request lifecycle.
- Future transport bugs should localize to the session layer, protocol helpers,
  or run-request helper instead of one broad hook.

Conclusion:

- Status: implemented on 2026-05-17 as a behavior-preserving client-pipeline
  extraction.
- What was done:
  - `useRemoteExecutor.ts` remains the React/session adapter that reads atoms,
    resolves environment-backed settings, subscribes to process messages, sends
    commands, and updates `useCurrentExecution()`.
  - `remoteExecutorUploadCache.ts` now exposes
    `planRemoteExecutorProjectUpload(...)`, which makes reuse-vs-upload-required
    decisions explicit before any websocket sends happen.
  - `uploadRemoteExecutorProjectIfNeeded(...)` still owns the imperative send
    path and marks the cache fresh only after dynamic project/settings upload and
    every static-data upload succeeds.
  - `remoteExecutorRunRequest.ts` now owns active request-id filtering,
    registration before send, matching completion cleanup, disconnect cleanup,
    editor-send failure cleanup, and Trivet pending-run send-failure rejection.
- How it went:
  - The extraction stayed narrow. Run-from planning, preload extraction, Trivet
    test selection, and process-event dispatch stayed in
    `remoteExecutorHelpers.ts`.
  - Preloaded-node event suppression stayed explicit in `useExecutionDataFlow.ts`
    and was not hidden behind upload/cache helpers.
  - No websocket protocol messages, executor-session runtime behavior, upload
    invalidation rules, run-from semantics, recording playback routing, or
    abort/pause/resume command behavior were changed.
- Plan corrections during implementation:
  - The request lifecycle extraction was worth doing, so
    `remoteExecutorRunRequest.ts` was added rather than leaving request-id
    bookkeeping embedded in the hook.
  - No additional split of `remoteExecutorHelpers.ts` was made because the
    remaining helper groups were still cohesive after upload/request extraction.
  - A later extrapolation pass kept that helper ownership but tightened preload
    extraction: dependency runs with only absent output wrappers no longer count
    as preloadable output, and older usable runs remain eligible.
- Problems solved and goals achieved:
  - Upload cache correctness is now auditable through a pure decision helper and
    focused tests.
  - Request-scoped event filtering and cleanup no longer require reading the
    entire run hook.
  - Send-failure cleanup is explicit for both editor runs and Trivet pending
    graph runs.
  - Run-from preload now rejects or skips malformed empty output maps instead of
    silently preloading an empty object into a rerun.
- Verification recorded for this phase:
  - `remoteExecutorUploadCache.test.ts`;
  - `remoteExecutorRunRequest.test.ts`;
  - `remoteExecutorHelpers.test.ts`;
  - run-from preload regression tests for absent wrappers;
  - `executorSession.test.ts`;
  - `executionSelectors.test.ts`;
  - app TypeScript check;
  - focused app lint check;
  - full app test suite;
  - production app build;
  - diff whitespace check.

## Phase 5: Split Remote Debugger Server Transport (DONE)

Priority: medium-high.

Payoff check:

- Worth doing. `debugger.ts` is about 480 lines and recent fixes made it the
  owner of heartbeat, safe-send, processor attachment cleanup, dynamic graph
  upload, and websocket command handling.
- The payoff is resilience and auditability around proxy/CDN websocket behavior.
  This remains worthwhile even if the line reduction is modest.

Targets:

- `packages/node/src/debugger.ts`

Problem:

The debugger server now owns websocket startup, graph-upload handling, dynamic
run messages, dataset forwarding, processor event attachment, broadcast routing,
safe send, error emission, and heartbeat behavior in one file. Recent proxy-idle
and stale-socket fixes made this surface more important.

Step-by-step plan:

1. Characterize the current server behavior.
   - In `packages/node/src/debugger.ts`, identify public exports that must stay:
     `DEBUGGER_HEARTBEAT_INTERVAL_MS`, `DEBUGGER_HEARTBEAT_TIMEOUT_MS`,
     `RivetDebuggerServer`, `currentDebuggerState`, and
     `startDebuggerServer(...)`.
   - Run existing debugger tests before extraction.
2. Extract transport send policy.
   - Create `packages/node/src/debuggerTransport.ts`.
   - Move `stringifyDebuggerMessage`, `sendDebuggerMessage`,
     `terminateDebuggerSocket`, and `emitDebuggerError` there.
   - The helper should stringify once, send best-effort to each socket, emit the
     existing debugger `error` event on serialization/send failure, and terminate
     only the failed socket.
3. Extract heartbeat policy.
   - Create `packages/node/src/debuggerHeartbeat.ts`.
   - Move `DebuggerSocketHeartbeat`, `startDebuggerSocketHeartbeat`, and
     `unrefTimer` there.
   - Keep the existing default 30s ping / 10s timeout constants exported from the
     public entrypoint or re-exported without changing names.
   - Preserve the behavior that inbound messages and outbound debugger traffic
     reset outstanding heartbeat timeouts.
4. Extract processor attachment lifecycle.
   - Create `packages/node/src/debuggerProcessorAttachments.ts`.
   - Move attach/detach listener registration, cleanup tracking, request-id
     association, partial-output throttling, and finish-detach behavior.
   - Keep `detach(...)` idempotent and keep automatic finish cleanup.
5. Leave protocol handling in `debugger.ts`.
   - `startDebuggerServer(...)` should still own websocket server creation,
     message parsing, dynamic graph upload/run commands, dataset forwarding, and
     public API assembly.
   - After extraction, it should compose transport, heartbeat, and attachment
     helpers rather than owning their internal policy.
6. Update API docs.
   - Update `packages/docs/docs/api-reference/node/startDebuggerServer.mdx`,
     `RivetDebuggerServer.mdx`, and developer docs that mention heartbeat,
     best-effort broadcast, or attach/detach ownership.

Non-goals:

- Do not add app-side reconnect for external debugger sessions.
- Do not change websocket message schema.
- Do not change hosted `/ws/latest-debugger` behavior.

Risks:

- Debugger send failures must not throw into graph execution. Reintroducing a
  thrown websocket send can make a stale remote debugger client fail a real
  workflow.
- Heartbeat behavior must remain activity-aware. If real outbound workflow events
  do not clear an outstanding ping timeout, the original post-idle disconnect can
  come back.
- One bad client must not block other clients. Transport extraction should keep
  per-client send isolation.
- Processor listener cleanup is easy to leak. Missing detach cleanup can make
  later runs broadcast duplicate events, retain request ids, or keep processors
  alive after finish.
- Message schema and event names are public behavior for hosted wrappers and
  debugger clients. Even "small" payload reshaping is out of scope.
- Dataset forwarding and dynamic graph upload are in the same server file but
  not the same policy as heartbeat/send. Moving them too early would make the
  refactor harder to verify.
- Tests may pass with local websockets while proxy/CDN behavior is still wrong.
  Keep a manual hosted-wrapper idle/post-idle check in the verification notes.

Verification:

- `packages/node/test/debugger.test.ts`
- `packages/node/test/api.test.ts`
- manual or integration check through hosted wrapper if available: idle external
  debugger, post-idle workflow event, disconnect, reconnect.

Expected result:

- Debugger transport policies become independently reviewable.
- Future proxy/CDN websocket fixes stop modifying one long server file.

Conclusion:

- Status: implemented on 2026-05-17 as a behavior-preserving transport-policy
  extraction.
- What was done:
  - `startDebuggerServer(...)` stayed in `packages/node/src/debugger.ts` and
    still owns websocket server creation, message parsing, graph upload/run
    commands, dataset forwarding, and public API assembly.
  - `debuggerTransport.ts` now owns debugger message stringification,
    best-effort websocket sends, debugger `error` event emission, and failed
    socket termination.
  - `debuggerHeartbeat.ts` now owns heartbeat defaults, ping scheduling, timeout
    cleanup, inbound activity handling, outbound activity handling, and timer
    `unref`.
  - `debuggerProcessorAttachments.ts` now owns attach/detach listener
    registration, cleanup tracking, request-id lookup, partial-output
    throttling, and root-`finish` auto-detach.
- How it went:
  - The split stayed below the public API. `DEBUGGER_HEARTBEAT_INTERVAL_MS`,
    `DEBUGGER_HEARTBEAT_TIMEOUT_MS`, `RivetDebuggerServer`,
    `currentDebuggerState`, and `startDebuggerServer(...)` are still exported
    from `debugger.ts`.
  - Dynamic graph upload/run command handling and dataset forwarding remained in
    `debugger.ts` because those are protocol concerns, not heartbeat/send
    policy.
  - No websocket message schemas, event names, app-side reconnect policy,
    hosted `/ws/latest-debugger` behavior, or graph execution semantics were
    changed.
- Plan corrections during implementation:
  - The heartbeat constants moved into `debuggerHeartbeat.ts` and are re-exported
    from `debugger.ts`, keeping the public import path stable while colocating
    defaults with heartbeat policy.
  - No additional protocol-handler module was added because that would have
    exceeded the phase boundary and made dynamic upload/dataset behavior harder
    to audit.
  - A later reassessment found that processor routing callbacks received the
    live internal attached-processor array. The attachment helper now returns a
    snapshot, so custom routing can inspect or reshape its local list without
    mutating debugger server state. The pass also removed an unnecessary
    dataset-response cast in `debugger.ts`.
- Problems solved and goals achieved:
  - Best-effort transport behavior is independently reviewable and reusable by
    connection-time messages and broadcasts.
  - Heartbeat behavior is isolated from debugger protocol parsing, making
    proxy/CDN idle fixes easier to reason about.
  - Processor listener cleanup and request-id association are no longer buried in
    the server factory.
  - Processor attachment state is now encapsulated behind the attachment helper;
    routing callbacks cannot accidentally detach or hide processors by mutating
    the array they were handed.
- Verification recorded for this phase:
  - pre-extraction `debugger.test.ts`;
  - post-extraction `debugger.test.ts`;
  - regression coverage for routing callbacks receiving an attached-processor
    snapshot;
  - `api.test.ts`;
  - full node package test suite;
  - node package TypeScript check;
  - node package lint;
  - node package build;
  - docs typecheck;
  - docs production build;
  - diff whitespace check.

## Phase 6: Clarify App-Executor Code Worker Ownership (DONE)

Priority: medium.

Payoff check:

- Worth doing after higher-churn app surfaces. `AppExecutorWorkerCodeRunner.mts`
  is about 570 lines and mixes performance-sensitive worker pooling with
  package-sensitive stringified worker code.
- This phase pays off only if it preserves fresh-worker isolation and packaging
  behavior while making pool lifecycle and host request handling easier to test.
  It should not chase a "normal worker file" unless the desktop package pipeline
  is proven.

Targets:

- `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts`
- `packages/app-executor/bin/codeRunnerWorkerPool.mts`
- `packages/app-executor/bin/codeRunnerWorkerHost.mts`

Problem:

Worker prewarming improved performance, but the file now contains the stringified
worker runtime, worker-pool lifecycle, worker request/response handling,
current-thread fallback, console bridging, error serialization, and environment
configuration.

Step-by-step plan:

1. Lock down performance and isolation behavior.
   - In `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts`, identify
     three separate contracts: prewarmed single-use workers, current-thread
     fallback for `includeRivet`, and runtime permission behavior.
   - Run `AppExecutorWorkerCodeRunner.test.mts` before moving code.
2. Extract pool configuration and lifecycle.
   - Create `packages/app-executor/bin/codeRunnerWorkerPool.mts`.
   - Move `DEFAULT_CODE_WORKER_POOL_SIZE`,
     `RIVET_CODE_RUNNER_WORKER_POOL_SIZE` parsing, pool-size normalization, idle
     worker entries, prewarm, checkout, replenish, stats, and shutdown.
   - Keep shared-pool module-level ownership in the app-executor package so a
     new `AppExecutorWorkerCodeRunner` per graph run still reuses prewarmed
     workers.
3. Extract host-side worker request handling.
   - Create `packages/app-executor/bin/codeRunnerWorkerHost.mts`.
   - Move worker creation, response message handling, exit-before-result errors,
     console message forwarding, and deserialization of worker errors.
   - Keep request/response payload types exported only as narrowly as tests need.
4. Keep worker source close to worker creation unless packaging is proven.
   - The stringified `WORKER_SOURCE` may stay in the host module or a sibling
     `codeRunnerWorkerSource.mts`.
   - Do not replace it with a normal imported worker file unless `pkg`, esbuild,
     Windows sidecar compilation, and macOS sidecar compilation are all verified.
5. Leave `AppExecutorWorkerCodeRunner` as orchestration.
   - It should choose worker-pool execution versus current-thread fallback,
     prepare `require` support, pass runtime permissions, and expose the same
     `CodeRunner` interface.
   - Shared `prewarmSharedAppExecutorCodeWorkerPool()` and
     `shutdownSharedAppExecutorCodeWorkerPool()` exports must remain available to
     `executor.mts`.
6. Update developer docs.
   - In `developer-docs/PACKAGES.md` and
     `developer-docs/EXECUTION-DATA-FLOW.md`, document the new host/pool/source
     ownership and the reason fresh-worker isolation is preserved.

Non-goals:

- Do not switch to persistent shared user-code workers.
- Do not change fresh-worker isolation.
- Do not change runtime permissions, console forwarding, `require`, `fetch`,
  `process`, error serialization, or `includeRivet` fallback.

Risks:

- Fresh-worker isolation is compatibility-critical. Accidentally reusing a worker
  after user code runs can leak `globalThis`, module cache, timers, or monkey
  patches between Code/Expression executions.
- The current-thread fallback is intentionally different. Moving too much shared
  code into worker-only helpers can break `includeRivet` and require-capable
  legacy Code paths.
- `pkg` and esbuild packaging are fragile around dynamic worker files. A refactor
  that works in `tsx` can fail in the compiled desktop sidecar.
- Worker exit/error handling must still reject exactly once. Double rejection or
  missed rejection can strand a graph run forever.
- Console forwarding must stay tied to the active run. A pooled worker that emits
  late console messages after checkout can attach logs to the wrong node.
- Prewarming should improve the hot path without keeping the process alive.
  Timers/workers that are not unrefed or shut down can prevent executor exit.
- Environment tuning should remain centralized. Scattered reads of
  `RIVET_CODE_RUNNER_WORKER_POOL_SIZE` make tests and hosted deployments harder
  to reason about.

Verification:

- `AppExecutorWorkerCodeRunner.test.mts`
- app-executor `tsc --noEmit`
- performance smoke check for minimal Code/Expression run in Node executor mode.

Expected result:

- Performance optimization code becomes easier to reason about.
- Smaller blast radius for future speed work.

Conclusion:

- Done. `AppExecutorWorkerCodeRunner.mts` is now the orchestration adapter again:
  it implements the core `CodeRunner` interface, prepares hosted runtime
  libraries, chooses worker-pool execution versus the `includeRivet`
  current-thread fallback, and keeps fallback console bridging close to fallback
  execution.
- `codeRunnerWorkerPool.mts` owns pool-size configuration, shared
  prewarm/shutdown lifecycle, idle-worker checkout, replenishment, stats, and
  cleanup. The shared pool remains module-level in the app-executor package so a
  new runner per graph run still reuses prewarmed workers.
- `codeRunnerWorkerHost.mts` owns the string-evaluated worker source, worker
  creation, ready/result message handling, exit-before-result errors,
  worker-side console forwarding, and worker-error deserialization. The worker
  source stayed string-evaluated instead of moving to a normal worker file, so
  the fragile `pkg`/esbuild desktop sidecar packaging contract was not widened.
- The plan held without behavior corrections: fresh-worker isolation,
  `includeRivet` fallback, runtime permissions, console forwarding, `require`
  resolution, `fetch`/`process` access, and worker error semantics stayed under
  the existing focused worker test coverage.
- The main runner shrank from 569 lines to 180 lines. The extracted pool module
  is 196 lines and the host module is 334 lines, which reduces ownership
  concentration without merging the package-sensitive worker source into pool
  policy.

Verification recorded for this phase:

- pre-extraction `AppExecutorWorkerCodeRunner.test.mts`;
- post-extraction `AppExecutorWorkerCodeRunner.test.mts`;
- full app-executor test suite;
- app-executor TypeScript check;
- app-executor lint;
- app-executor sidecar bundle/native Windows build;
- docs typecheck;
- diff whitespace check.

## Phase 7: Unify JS Interpolation Execution Helpers Carefully (DONE)

Priority: low-medium, conditional.

Payoff check:

- Conditional. The combined Code/Expression/interpolation surface is meaningful,
  but the individual files are smaller and have lower post-refactor churn than
  the output, graph tree, execution-data, remote-run, debugger, and worker
  surfaces.
- Do this phase only if the first pass proves duplicated generated-code policy is
  causing real maintenance cost. If extraction would hide Code and Expression
  wrapper differences behind a generic builder, defer it.

Targets:

- `packages/core/src/model/nodes/CodeNewNode.ts`
- `packages/core/src/model/nodes/ExpressionNode.ts`
- `packages/core/src/model/nodes/jsValueInterpolation.ts`
- `packages/app/src/components/nodes/codeNewOutputUtils.ts`
- `packages/app/src/components/nodes/expressionOutputUtils.ts`
- `packages/app/src/components/nodes/parsedSourceDisplayUtils.ts`

Problem:

The new Code node, Expression node, and preview UI now share a conceptual
interpolation model but still have node-specific source wrapping, preview,
input-port discovery, and error-sanitization glue.

Step-by-step plan:

1. Compare the runtime wrappers before changing code.
   - In `packages/core/src/model/nodes/CodeNewNode.ts`, map Code-specific
     behavior: async function body, runtime permissions, `return` value
     wrapping, output validation, and returned-value output id.
   - In `packages/core/src/model/nodes/ExpressionNode.ts`, map
     Expression-specific behavior: expression evaluation, resulting-value output,
     and expression preview.
   - Keep these differences explicit in tests before extracting shared helpers.
2. Move duplicated interpolation glue into `jsValueInterpolation.ts`.
   - Candidate helper responsibilities: input-name discovery for `{{value}}`
     tokens, safe internal identifier selection, cloned-input assignment source,
     preview interpolation, and generated-text sanitization for user-facing
     errors.
   - Keep generated wrapper strings readable. Do not hide Code and Expression
     body construction behind a generic "build JS node" helper.
3. Keep runtime wrappers node-specific.
   - Code should still generate an async function body that allows declarations,
     `await`, and `return`.
   - Expression should still evaluate the authored expression directly.
   - Both can call shared interpolation helpers, but each node should own its
     wrapper shape, output label semantics, and validation boundary.
4. Align app preview helpers without over-sharing UI.
   - Let `codeNewOutputUtils.ts`, `expressionOutputUtils.ts`, and
     `parsedSourceDisplayUtils.ts` call shared display-policy helpers for "show
     parsed source only when interpolation-created inputs exist".
   - Keep result labels and section composition in `CodeNewNode.tsx` and
     `ExpressionNode.tsx`.
5. Strengthen tests around generated source and errors.
   - Add fixtures where user code already contains the default internal
     identifier names so safe identifier selection is proven.
   - Cover null, undefined, arrays, objects, functions, mutation attempts,
     syntax errors, runtime errors, and compact versus hover output display.
6. Update developer and user docs only if ownership or wording changes.
   - `developer-docs/CORE-ENGINE.md` should explain the shared interpolation
     helper boundary.
   - User docs should not change unless behavior or node wording changes.

Non-goals:

- Do not change Code or Expression node behavior.
- Do not change runtime permission handling.
- Do not change generated source-map/source-url behavior.
- Do not change node titles or documentation names.

Risks:

- Code and Expression look similar but are not the same node. A generic wrapper
  can accidentally remove Code's ability to declare locals/return explicitly or
  change Expression's direct expression semantics.
- Generated identifier collision avoidance is security and correctness policy.
  If extraction misses a collision case, user locals can shadow interpolation
  values or internal helpers can shadow user variables.
- Input cloning protects upstream graph values from mutation. Sharing code must
  not skip clone assignment for objects, arrays, Maps, Sets, functions with
  properties, or circular structures.
- Error sanitization affects user debugging. Over-sanitizing hides useful line
  locations; under-sanitizing exposes internal generated helper names too loudly.
- App parsed-source previews use captured run inputs, not current editor state.
  Moving preview logic into the wrong layer can make old output previews change
  when the user edits the node after a run.
- Compact output behavior is intentionally different from hover/fullscreen for
  Code and Expression. Shared structured-output helpers must not reintroduce
  labels into compact previews.
- Runtime permission handling belongs to Code-family execution, not the shared
  interpolation helper. Pulling it into the helper would blur node ownership.

Verification:

- `CodeNewNode.test.ts`
- `ExpressionNode.test.ts`
- `codeNewOutputUtils.test.ts`
- `expressionOutputUtils.test.ts`
- manual check: null/undefined interpolation, object/array interpolation,
  syntax/runtime errors with line numbers, compact/hover output previews.

Expected result:

- Less duplicated generated-code policy.
- Easier future changes to interpolation behavior.

Conclusion:

- Status: implemented on 2026-05-17 in `160df7af` as a conservative helper
  extraction rather than a generic JavaScript-node abstraction.
- `jsValueInterpolation.ts` now owns the shared Code/Expression/JS-list
  mechanics for interpolation input definitions, safe generated input
  identifiers, cloned-input initializer source, body-preview truncation, preview
  interpolation, and generated-error sanitization.
- `CodeNewNode.ts`, `ExpressionNode.ts`, and `jsListCallbackHelpers.ts` still
  own their wrapper shapes, output contracts, runtime permissions, and
  Code-specific source-url/line-diagnostic behavior explicitly.
- The original app-preview plan was corrected during implementation: the app
  keeps using the existing public core `extractInterpolationVariables` export
  through `parsedSourceDisplayUtils.ts` instead of depending on a new source-only
  core export that would be invisible to app tests until the core package is
  rebuilt. The app-side display policy remains centralized and covered.
- A reassessment pass preserved the JS Filter/JS Map fixed `array` clone before
  interpolation-input clones in the generated wrapper, matching the previous
  helper order while still sharing the clone preamble and assignment helpers.
- Focused tests were expanded for generated helper-name collisions, function
  input property cloning, reserved display names, escaped tokens, and malformed
  interpolation openers.
- The source refactor reduced repeated generated-code policy in the node files
  while keeping total line count roughly flat after adding regression tests and
  documentation. The payoff is clearer ownership and fewer places to update when
  interpolation cloning or sanitization policy changes.
- Verification recorded for this phase:
  - core Code, Expression, JS-list, and interpolation input-definition tests;
  - app Code/Expression parsed-source display helper tests;
  - core and app TypeScript checks;
  - focused lint checks;
  - diff whitespace check.

## Phase 8: Characterize GraphProcessor Before Further Extraction (DONE)

Priority: medium for characterization, conditional for extraction.

Payoff check:

- Characterization is worth doing. `GraphProcessor.ts` is still about 1,400
  lines and remains the execution heart.
- Extraction is not automatically worth doing yet. Recent churn is lower than
  the UI/output surfaces, and behavior risk is much higher. Only extract after
  characterization tests expose a policy boundary that can move cleanly without
  changing graph results or event order.

Targets:

- `packages/core/src/model/GraphProcessor.ts`

Problem:

`GraphProcessor.ts` remains large and still owns many execution policies:
scheduling, queueing, node exclusion, errors, run-from/run-to, preloads, loops,
races, subprocessors, event emission, finalization, pause/resume/abort, globals,
and tokenizer behavior.

Step-by-step plan:

1. Do not start by moving code.
   - Add characterization tests in `packages/core/test/model/GraphProcessor.test.ts`
     or focused sibling files for each policy before extraction.
   - Use existing public processor APIs and event streams; avoid tests that only
     assert private method structure.
2. Expand event-order coverage.
   - Cover graph start/finish, node start/finish, node error, graph error,
     partial outputs, subprocess events, split runs, pause/resume, abort, and
     finish-after-error behavior.
   - Why: later extraction must preserve both graph results and what the editor
     records.
3. Expand boundary-condition coverage.
   - Cover run-from preload preservation, run-to terminal selection,
     control-flow exclusion, missing required inputs, loop-controller break
     policy, races, subgraphs, globals, tokenizer use, and max concurrency.
   - Include both editor-shaped runs and programmatic
     `@valerypopoff/rivet2-node` processor smoke cases where practical.
4. Extract one policy at a time after tests are green.
   - Candidate 1: graph finalization and result selection.
   - Candidate 2: node exclusion and control-flow propagation.
   - Candidate 3: queue/scheduling and concurrency decisions.
   - Candidate 4: preload plus run-from/run-to boundary handling.
   - Each candidate should produce one small helper/module and one focused test
     group; do not split multiple policies in one commit.
5. Keep the public class stable.
   - `GraphProcessor` should remain the public evented orchestration surface.
   - New helpers should be private implementation modules unless there is a real
     downstream consumer.
6. Measure performance and behavior.
   - Run the full core test suite after every extraction.
   - Run a minimal graph performance smoke check before and after any scheduler
     or queue change so a readability refactor does not make cheap graphs slower.
7. Update docs only after ownership changes.
   - `developer-docs/CORE-ENGINE.md` should describe any new helper module and
     the policy it owns.
   - Do not update user docs unless behavior changes, which should be a separate
     approved bug fix.

Non-goals:

- Do not change graph execution results.
- Do not change event payloads or event order without an explicit product bug.
- Do not change graph recording/replay semantics.
- Do not change public processor APIs.

Risks:

- This is Rivet's execution heart. A small scheduling change can alter graph
  results, event order, run duration, or editor recordings.
- Event order is product behavior. The editor, remote debugger, recordings,
  output previews, and tests can all depend on when `nodeStart`, `nodeFinish`,
  partial outputs, and graph finish events happen.
- Run-from/run-to and preload behavior was recently fixed. Extraction can easily
  bring back lost upstream outputs, duplicate preserved process pages, or rerun
  nodes that should stay preserved.
- Control-flow exclusion is both a data value and an execution policy. Treating
  it like ordinary node output in a helper can break Coalesce, Did Run, optional
  inputs, and skipped branches.
- Subgraphs, split runs, races, and loops multiply event identities. Helpers must
  preserve root run id, graph run id, process id, and child event forwarding.
- Concurrency changes can make race bugs intermittent. A test passing once is not
  enough for queue/scheduler refactors.
- Public API stability matters for `@valerypopoff/rivet2-node`, CLI, Trivet, and
  hosted wrappers. Do not expose new helper APIs just because internal modules
  exist.
- Characterization tests can ossify bugs. If a test documents a suspicious
  behavior, label it as compatibility behavior and open a separate bug-fix plan
  instead of silently blessing it forever.

Verification:

- full core test suite for any GraphProcessor phase
- focused recording/replay tests
- editor run-from/run-to regression tests where available
- programmatic `@valerypopoff/rivet2-node` smoke tests

Expected result:

- Safer future core work.
- Possible line reduction, but the main win is making the execution heart less
  fragile.

Conclusion:

- Status: implemented on 2026-05-17 in `0c7ac94a` as a
  characterization-only pass. No `GraphProcessor` runtime code was moved or
  behavior changed.
- Added
  `packages/core/test/model/GraphProcessor.characterization.test.ts` as a
  public-behavior safety net beside the existing broad GraphProcessor tests.
- The new coverage pins successful root event order; graph-error, generic-error,
  and finish behavior after node failures; partial-output `processId` identity;
  subgraph root/parent/executor metadata; preload plus run-to boundary behavior;
  run-to terminal selection; pause/resume scheduling; graph-global sharing across
  concurrently-started nodes; and race winner/loser handling.
- The plan was corrected during implementation by treating node failures as the
  processor actually exposes them: `processGraph(...)` throws a graph-level
  error and keeps the original node error as its cause, rather than throwing the
  node error directly.
- The payoff is risk reduction rather than line deletion. The processor is now
  safer to split one policy at a time because future extraction can compare
  event/result behavior against a focused test fixture instead of relying only
  on scattered node-level regressions.
- Verification recorded for this phase:
  - focused `GraphProcessor.characterization.test.ts`;
  - full core test suite;
  - core TypeScript check;
  - core lint check;
  - docs typecheck;
  - app production build;
  - diff whitespace check.

## Deferred Or Lower-Return Areas

Do not prioritize these unless a concrete bug or product goal appears:

- Release workflow/icon code: recent changes are important but not a maintainability
  hotspot compared with output/execution surfaces.
- Project settings modal styling: large but mostly presentation; refactor only
  when touching project settings again. Prefer extracting graph-tree action
  policy before splitting `ProjectInfoModal`.
- Provider implementation size: provider stream parse diagnostics were already
  centralized; only extract more if a repeated tool-call accumulation seam becomes
  obvious.
- Tracked sidecar binary size: this is release-engineering work, not a code
  maintainability refactor.
- Generic modal framework: previous refactor history explicitly rejected it as
  higher complexity than benefit.

## Refactor Bookkeeping

After each phase, update the planning record instead of leaving future work to
guess what happened:

- Append the completed outcome to `refactor-history.md` or update this plan with
  a clearly dated "done/deferred/kept intentionally" note.
- Record the commit baseline used for the phase.
- Record the payoff decision: implemented, narrowed, deferred, or kept
  intentionally.
- Record the tests run and any manual verification that mattered.
- Record the production line delta excluding docs/tests, but do not treat a
  negative delta as success if the resulting ownership is harder to understand.
- Update developer docs for ownership or behavior-contract changes, even if the
  user-visible behavior is unchanged.

## Implementation Order

Completed phases:

1. Split `NodeOutput.tsx`.
2. Extract graph-list context-menu and presentation helpers.
3. Split execution data storage/preview/copy policy.
4. Simplify the remote execution client pipeline.
5. Split remote debugger transport helpers.
6. Split app-executor Code worker pool/host helpers.
7. Unify JS interpolation execution helpers carefully.
8. Characterize `GraphProcessor` before further extraction.

Future GraphProcessor extraction should happen only after the Phase 8
characterization suite is extended for the specific policy boundary being moved.
That keeps the previous order's core principle intact: collect maintainability
wins and behavior coverage before touching the most dangerous execution-core
code.

## Measurement

For each phase, record:

- behavior-preservation tests added or run;
- files deleted, created, and meaningfully simplified;
- production line delta excluding docs/tests;
- ownership boundaries changed;
- areas intentionally left alone.

Refactor success should be judged by lower future-change risk first, and line
reduction second. When both are possible, prefer the smaller code.
