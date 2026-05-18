# Refactor Plan

This is the active behavior-preserving refactor plan for the five highest-value
remaining code health targets after the work recorded in `refactor-history.md`.

The goal is not to add features. The goal is to make the code easier to reason
about, safer to change, and smaller where that is realistic, while preserving
current graph results, UI behavior, public APIs, persisted formats, and runtime
protocols.

## Global Rules

- Re-read the live code before starting a phase. This file is a map, not a
  substitute for the current checkout.
- Implement one phase at a time.
- Add or extend behavior-level tests before moving a policy.
- Move code by ownership policy, not by line range.
- Keep compatibility facades only while they protect a real migration boundary.
  Delete them once all imports have moved.
- Update developer docs and `refactor-history.md` whenever ownership changes.
- Reject abstractions that only make files shorter without reducing concepts,
  duplication, or bug surface.
- Pause the phase if preserving behavior requires a product decision.

## Goal Gates

Every phase must satisfy these gates:

- **No functionality change:** public behavior, graph results, event shapes,
  persisted data, websocket protocols, and editor affordances stay the same.
- **Clearer ownership:** the touched policy has one named owner after the phase.
- **More professional code:** boundaries are typed, names are explicit, and
  lifecycle or rendering rules are visible rather than implicit.
- **Less code if possible:** deletion and duplicated-policy removal are preferred;
  added helper code is acceptable only when it reduces real bug surface.
- **Less bug surface:** the phase must reduce a concrete risk such as duplicated
  behavior, ambiguous cleanup, mutable shared state, hook-order hazards, stale
  transport state, or unclear provider/runtime ownership.

## Cross-Phase Ownership

The phase numbers are stable topic IDs. The recommended implementation order is
listed later.

- **Phase 5 owns output presentation policy:** visible sections, warning
  sections, display copy, JSON copy, split-output selection, and missing-ref
  fallback labels. It must not change graph results, node outputs, execution data
  storage, or transport payloads.
- **Phase 4 owns executor and transport policy:** socket lifecycle, target
  identity, upload cache, request IDs, dataset bridge requests, run controls, and
  sidecar request ownership. It must not change output rendering, provider
  behavior, or core execution semantics.
- **Phase 3 owns editor interaction policy:** canvas, graph-tree, drag, hover,
  viewport, context-menu, and interaction timing decisions. It must not change
  graph execution, transport, output rendering, or persisted graph shape.
- **Phase 2 owns provider runtime policy:** provider adapters, chat pipeline
  helpers, streaming assembly, provider errors, retry behavior, and legacy
  compatibility wrappers. It must not change executor transport, output surface
  policy, or persisted node types.
- **Phase 1 owns core execution policy:** `GraphProcessor` scheduling,
  control-flow, lifecycle, run state, and execution events. It must not absorb
  app/editor run UI, websocket transport, provider adapters, or output
  presentation.

If a file appears in more than one phase, the phase must state which policy it is
touching before editing. No phase should re-open a boundary that a previous phase
already clarified unless the plan is updated first.

## Recommended Order

1. **Phase 5: Centralize Output Surface View Models And Copy Policy** is landed;
   see `refactor-history.md` entry 114.
2. **Phase 4: Simplify Executor Session And Remote Transport Ownership** is
   landed; see `refactor-history.md` entry 116.
3. **Phase 3: Make Canvas Interaction Ownership Explicit** is landed; see
   `refactor-history.md` entry 117.
4. **Phase 2: Clarify Chat And Provider Runtime Boundaries** is landed; see
   `refactor-history.md` entry 118.
5. **Phase 1: Reduce `GraphProcessor` Responsibility Concentration** is landed;
   see `refactor-history.md` entry 119.

Small residual issues noted in `refactor-history.md`, such as MCP stdio
env/logging hygiene and generic app error logging policy, are not broad phases.
Fix or ticket them separately when touched.

## Phase 1: Reduce `GraphProcessor` Responsibility Concentration (DONE)

Status: landed; see `refactor-history.md` entry 119.

Result in numbers: `GraphProcessor.ts` shrank from 1722 physical lines to 1671
physical lines (net `-51`). The new focused `NodeExclusionPolicy.ts` owner added
116 production lines, so production physical line count moved by net `+65` while
removing node-exclusion decision policy from the processor class. The phase added
160 focused test lines for disabled nodes, conditional false ports, ordinary and
scalar control-flow exclusions, merge-node excluded-value consumption, loop-wait
sentinel skips, missing required input formatting, and excluded output creation.

Conclusion: the phase kept `GraphProcessor` as the evented execution/state owner
and extracted only one complete policy: node exclusion decisions plus excluded
output construction. The implementation avoided a generic state wrapper, did not
move scheduling, event emission, attached-data propagation, queue cleanup, races,
or loop lifecycle, and preserved the public behavior pinned by the existing
GraphProcessor characterization suite. The plan was narrowed during
implementation from "classify every private field" to the safer first slice:
required-input/control-flow exclusion, because that was a complete bounded
policy with existing behavior coverage and no public API changes.

`GraphProcessor` remains the execution heart of Rivet. Earlier refactors
extracted planning, preprocessing, split-run behavior, and subprocessor wiring,
but the class still mixes mutable run state, scheduling, control-flow exclusion,
loop/race coordination, subgraph creation, user input, pause/resume/abort,
preload/replay behavior, metadata, and event emission.

### Implementation

- **What:** Extracted required-input/control-flow exclusion decisions and
  excluded output construction into
  `packages/core/src/model/NodeExclusionPolicy.ts`.
- **Why:** Execution fixes are risky because unrelated policies currently live
  in one class. One named owner per policy makes future changes easier to audit.
- **How:** Kept public `GraphProcessor` APIs/events unchanged. The helper returns
  pure decisions and output maps; `GraphProcessor` still applies those decisions
  to mutable state, event emission, attached data, and queue progression.
- **Files:** `packages/core/src/model/GraphProcessor.ts`,
  `packages/core/src/model/NodeExclusionPolicy.ts`,
  `packages/core/test/model/NodeExclusionPolicy.test.ts`, and
  `developer-docs/CORE-ENGINE.md`.

### Validation

- Core graph processor characterization tests.
- Existing core node tests.
- Existing run-from, preload, pause/resume, abort, replay, subgraph, and
  split-run characterization coverage stayed unchanged because the extraction did
  not move their lifecycle policies.
- Remote debugger event-shape tests were not required because event timing,
  payload shapes, and execution metadata were not touched.

### Risks

- **Event order drift:** graph results may stay correct while debugger/editor
  event order changes. Mitigate with public event-stream assertions.
- **Preload/run-from regressions:** editor behavior can break even if core
  output tests pass. Mitigate with run-from and preload coverage.
- **Subgraph/split metadata mixups:** lineage and split indexes can be confused.
  Mitigate with characterization tests that assert metadata, not only values.
- **Lifecycle leaks:** abort, pause, and repeated runs can leak state if per-run
  and per-instance state are split incorrectly. Mitigate with repeated-run and
  abort-while-paused cases.
- **Over-extraction:** a generic state owner can hide invariants. Mitigate by
  accepting only helpers that own a complete cleanup or decision policy.

### Go/No-Go

Proceed only if the phase reduces at least one mixed execution policy. Defer if
the result is mainly a new object wrapping the same mutable state.

## Phase 2: Clarify Chat And Provider Runtime Boundaries (DONE)

Status: landed; see `refactor-history.md` entry 118.

Result in numbers: `chatV2Pipeline.ts` shrank from 620 physical lines to 336
physical lines (net `-284`). The new focused `chatV2Outputs.ts` owner added
296 production lines, so production physical line count moved by net `+12`
while removing output-shape policy from the pipeline coordinator. The phase
added 187 focused test lines for output assembly,
request-status/request-error outputs, retry-attempt arrays, provider-failure
outputs, structured responses, and usage/cost normalization.

Conclusion: the phase avoided a broad provider framework and extracted one
complete shared policy instead. Chat v2 output assembly now has a clear owner:
the internal `chatV2Outputs.ts` builds common outputs, provider-failure outputs,
structured response values, reasoning/usage outputs, and
request-status/request-error ports. `chatV2Pipeline.ts` now coordinates message
shaping, retries, provider error decisions, streaming, and tool plumbing, then
delegates final output shape to the output owner. Existing pipeline and LLM Chat
node tests stayed green, and the new direct tests pin the policy without needing
to run a mocked provider pipeline for every output-shape edge case.

Chat/provider runtime code still carries large overlapping concepts: message
shaping, runtime-option resolution, provider request construction, streaming
assembly, tool calls, retries, provider errors, request-status outputs, and
cost/token output assembly. Legacy and Chat v2 behavior must remain compatible,
but shared policies should not keep growing inside provider node classes.

### Implementation

- **What:** Inventory provider-neutral behavior duplicated across legacy chat,
  Chat v2, OpenAI, Anthropic, and Google paths.
- **What:** Move one proven shared policy at a time, such as streaming assembly,
  provider error normalization, request-status output construction, retry status,
  tool-call accumulation, or token/cost output construction.
- **What:** Split catch-all provider utilities only by clear API domain or proven
  shared policy. Do not create a broad provider framework.
- **Why:** Provider bugs are hard to review when shared policy and
  provider-specific API details are mixed in large files.
- **How:** Pin legacy and Chat v2 behavior with tests, extract a focused helper
  through package-safe exports, keep legacy nodes as compatibility adapters, and
  update docs with the new provider ownership map.
- **Files:** `packages/core/src/model/nodes/ChatNodeBase.ts`,
  `packages/core/src/utils/openai.ts`, `packages/core/src/model/chat-v2/*`,
  provider chat nodes under `packages/core/src/plugins/*/nodes/*Chat*`, focused
  provider/runtime tests, `developer-docs/CORE-ENGINE.md`, and
  `developer-docs/PACKAGES.md` if package exports move.

### Validation

- Legacy chat node tests.
- Chat v2 pipeline tests.
- Provider error, retry, streaming, tool-call, request-status, and token/cost
  output tests for the moved policy.
- Typecheck in packages affected by export or dependency movement.

### Risks

- **Legacy compatibility drift:** persisted legacy nodes may subtly change
  outputs. Mitigate with before/after tests for legacy nodes and Chat v2
  separately.
- **Provider-specific behavior hidden as shared behavior:** a helper may erase
  valid differences between providers. Mitigate by keeping provider adapters
  explicit and fixtures provider-specific.
- **Bundling/export regressions:** moving utilities can break app, node, or PnP
  resolution. Mitigate with package-safe exports and package typechecks.
- **Streaming timing changes:** stream assembly can alter partial outputs or
  request status. Mitigate with tests that assert sequence and final payloads.
- **Over-frameworking:** a generic provider abstraction can add more code than it
  removes. Mitigate by extracting only duplicated or hard-to-test policy.

### Go/No-Go

Proceed only when the phase removes duplicated provider policy or makes a fragile
provider behavior directly testable. Defer broad provider framework work.

## Phase 3: Make Canvas Interaction Ownership Explicit (DONE)

Status: landed; see `refactor-history.md` entry 117.

Result in numbers: `useDraggingNode.ts` shrank from 502 lines to 353 lines
(net `-149`), and `NodeCanvas.tsx` shrank from 680 lines to 663 lines (net
`-17` after the reassessment pass). Import-only touch files stayed line-neutral.
The phase added 322 production lines in focused canvas interaction owner modules, so physical
production lines moved from large owners into smaller owners for a net `+158`.
The existing drag-policy test moved next to its new owner without line growth,
and the phase added 205 new test lines for canvas interaction-model and
context-menu decisions.

Conclusion: the phase preserved canvas behavior while making ownership explicit.
The implementation corrected the plan by leaving graph-tree presentation/context
menu helpers alone because an earlier graph-tree refactor had already given them
clear tested owners.
Instead, the phase focused on the remaining canvas ambiguity: node drag decision
rules now live in `nodeDragInteraction.ts`; selected/editing/fullscreen,
graph-search, and hover-highlight derivation lives in
`nodeCanvasInteractionModel.ts`; and node/blank-area context-menu hydration plus
`Run from here` availability lives in `nodeCanvasContextMenuModel.ts`. The
reassessment pass tightened the new boundaries by making graph-search highlight
inputs explicit instead of depending on the whole search state object, and by
making malformed node context-menu targets with missing node ids or node types
fall back to blank-area context. The
hook and component now coordinate state and commands around those policies
instead of owning the policies inline.

Canvas and graph-tree interaction logic has improved, but interaction rules are
still spread across components, hooks, atoms, and helpers. The fragile areas are
drag/hover timing, output-preview state, viewport visibility, context-menu target
selection, graph-tree presentation, and fullscreen-output side effects.

### Implementation

- **What:** Audit current interaction policies and keep helpers that already have
  clear ownership.
- **What:** Extract only decision rules that still require cross-file reasoning,
  such as viewport eligibility, hover/drag preview policy, context-menu target
  resolution, or graph-tree presentation derivation.
- **Why:** Interaction regressions often come from timing and ownership ambiguity
  rather than component size.
- **How:** Add pure decision tests first, keep mutations in command or component
  orchestration layers, avoid moving local UI state into global atoms unless
  multiple independent surfaces need it, and update docs with the ownership map.
- **Files:** `packages/app/src/components/NodeCanvas.tsx`,
  `packages/app/src/components/nodeCanvas/*`,
  `packages/app/src/hooks/useDraggingNode.ts`,
  `packages/app/src/components/WireLayer.tsx`,
  `packages/app/src/components/GraphList.tsx`,
  `packages/app/src/components/graphList/*`,
  `packages/app/src/domain/graphEditing/*`, and
  `developer-docs/APP-ARCHITECTURE.md`.

### Validation

- Existing canvas interaction tests.
- Drag, hover, output-preview, context-menu, graph-tree, viewport, and wire
  rendering tests.
- Manual browser check for pan, zoom, select, drag, comment Ctrl-drag,
  context-menu, graph-tree selection, and fullscreen-output open/close.

### Risks

- **Pointer behavior drift:** mouse, trackpad, and touchpad paths can differ.
  Mitigate with thin event adapters and manual interaction checks.
- **Viewport optimization regressions:** offscreen rendering optimizations can be
  lost or made too aggressive. Mitigate with tests for newly visible nodes/wires
  and offscreen exclusion.
- **Hover/drag blink or stale state:** fixing one transition can reintroduce
  another. Mitigate with drag-release tests for pointer-over and pointer-outside
  cases.
- **Graph-tree mutation leakage:** presentation helpers can accidentally gain
  command side effects. Mitigate by keeping presentation helpers pure.
- **Cosmetic-only refactor:** splitting JSX without moving a tested decision does
  not meet the phase goal. Mitigate by requiring a named policy owner.

### Go/No-Go

Proceed only if the phase removes duplicated interaction decisions or reduces a
known timing hazard. Defer changes that only rearrange components.

## Phase 4: Simplify Executor Session And Remote Transport Ownership (DONE)

Status: landed; see `refactor-history.md` entry 116.

Result in numbers: `executorSession.ts` shrank from 829 lines to 588 lines
(`+99/-340`, net `-241`). The new focused production owners added 403 lines,
so production code moved `+502/-340` for a net `+162`. The phase added 287
focused test lines for target identity, transport classification/safe-send,
dataset bridging, and pending graph-run promises. Developer docs and planning
notes moved `+67/-9` for net `+58`.

Conclusion: the phase preserved executor protocol shapes and left the debugger
server/app-executor boundaries alone, as planned. The implementation corrected
the plan by avoiding a larger websocket-lifecycle rewrite and instead extracting
only policies with clear app-private owners: target identity
(`executorSessionTarget.ts`), JSON frame classification and safe-send policy
(`executorSessionTransport.ts`), dataset request/response dispatch
(`executorSessionDatasetBridge.ts`), pending remote graph-run promises
(`executorSessionPendingExecutions.ts`), and callback failure isolation
(`executorSessionCallbackIsolation.ts`). This reduced the main runtime
coordinator's scope while keeping reconnect, replacement, upload-capability,
request-id, and dataset behavior covered by focused tests plus the existing
session regression suite.

Follow-up line-reduction cleanup: the dataset bridge was simplified from a
generic matcher chain to a direct protocol `switch`, the transport parser dropped
redundant process-event guards, and pending execution state stopped storing an
unused request id copy. That removed 30 production helper lines without merging
ownership boundaries back into `executorSession.ts`.

Executor/session behavior covers browser execution, desktop sidecar execution,
hosted internal execution, external Remote Debugger sessions, upload caching,
reconnect policy, request IDs, run-from preload, dataset requests, and debugger
heartbeat behavior. The code works, but the ownership model is still large.

### Implementation

- **What:** Map every executor and debugger message type to its current owner:
  websocket lifecycle, target identity, capabilities, reconnects, pending
  requests, upload cache, dataset bridge, run controls, request-scoped
  completion, and sidecar request execution.
- **What:** Split remaining mixed concerns inside `executorSession.ts` only when
  the new owner is narrower and more testable. Likely candidates are dataset
  bridge handling and websocket lifecycle callback handling.
- **What:** Leave the already-split debugger transport, heartbeat, and processor
  attachment helpers alone unless a debugger-specific bug crosses that boundary.
- **Why:** Transport bugs are hard to diagnose when lifecycle ownership is split
  implicitly between hooks, sessions, sidecars, and debugger helpers.
- **How:** Add reconnect, replacement, failed-send, pending-cleanup,
  upload-cache, dataset, and request-error tests before extracting; preserve all
  websocket message shapes and reconnect policies; update execution docs.
- **Files:** `packages/app/src/hooks/executorSession.ts`,
  `packages/app/src/hooks/useRemoteExecutor.ts`,
  `packages/app/src/hooks/remoteExecutorHelpers.ts`,
  `packages/app/src/hooks/remoteExecutorUploadCache.ts`,
  `packages/app/src/hooks/remoteExecutorRunRequest.ts`,
  `packages/app-executor/bin/executor.mts`,
  `packages/node/src/debugger*.ts` only for debugger-specific work,
  `developer-docs/EXECUTION-DATA-FLOW.md`, and
  `developer-docs/APP-ARCHITECTURE.md`.

### Validation

- Executor session tests.
- Remote executor helper and upload-cache tests.
- App-executor tests.
- Remote debugger server tests if debugger behavior is touched.
- Manual check for Browser mode, desktop Node mode, hosted internal executor,
  and external Remote Debugger mode.

### Risks

- **Reconnect policy mixups:** internal executor reconnect and external debugger
  reconnect policies can merge accidentally. Mitigate with target-specific tests.
- **Stale upload cache:** remote execution can run old graph/settings/plugin data.
  Mitigate with invalidation tests for graph, project, settings, plugins,
  reconnect, and failed sends.
- **Request failure misclassification:** provider/node failures can be treated as
  socket failures. Mitigate with tests that keep the session alive after request
  errors.
- **Hosted iframe regressions:** wrapper-hosted editor behavior can break if
  target classification changes. Mitigate with hosted target coverage or manual
  wrapper checks.
- **Multiple lifecycle owners:** splitting transport code can increase bug
  surface if socket state or pending cleanup gets more than one owner. Mitigate
  by naming the single owner in the phase conclusion.

### Go/No-Go

Proceed only if the phase makes lifecycle ownership easier to name. Defer if the
result creates more owners for socket state, target identity, or pending cleanup.

## Phase 5: Centralize Output Surface View Models And Copy Policy (DONE)

Status: landed; see `refactor-history.md` entry 114.

Result in numbers: existing inline/fullscreen/body/copy call sites moved
`+82/-74` for a net `+8`, then the new 201-line
`nodeOutputViewModel.ts` made production code net `+209`. The phase also added
a 217-line view-model test file and updated the developer docs/refactor notes.
This was not a line-saving phase; it traded a small net increase for one tested
owner of duplicated output-surface policy.

Follow-up line-reduction cleanup: after the view-model phase landed, obsolete
app-private compatibility facades with no production imports were deleted.
Production code moved `+0/-45` for net `-45`; tests moved `+512/-575` for net
`-63` by consolidating execution-data storage coverage under the real owner and
removing legacy alias tests. See `refactor-history.md` entry 115.

Output rendering and copying are better separated than before, but this area has
regressed repeatedly: hook ordering, display-copy drift, visible/hidden output
ports, missing execution refs, split-output paging, and wrapped object output.
The same decisions are still easy to rediscover in multiple surfaces.

### Implementation

- **What:** Introduce pure view-model builders for inline and fullscreen output
  surfaces. They should decide visible sections, warning sections, selected
  process/split data, display-copy text, JSON-copy payloads, fallback labels, and
  available actions.
- **What:** Keep value rendering in `RenderDataValue` and scalar renderers. Keep
  modal geometry, sticky headers, search, wrap, and Markdown UI state in
  fullscreen components.
- **What:** Keep custom node output renderers supported as first-class view-model
  outputs rather than forcing them through generic rendering.
- **Why:** Output bugs come from duplicated policy between inline output,
  fullscreen output, port inspectors, copy actions, warnings, split entries, and
  hidden/internal ports.
- **How:** Build pure helpers and tests first, wire inline and fullscreen
  surfaces one at a time, separate display copy from JSON copy at the view-model
  boundary, and keep hook-using renderers inside React component boundaries.
- **Files:** `packages/app/src/components/nodeOutput/*`,
  `packages/app/src/components/RenderDataValue.tsx`,
  `packages/app/src/components/renderDataValue/*`,
  `packages/app/src/utils/executionDataCopy/*`,
  `packages/app/src/utils/outputPortVisibility.ts`,
  `packages/app/src/components/nodeOutput/nodeOutputVisibility.ts`,
  `packages/app/src/components/nodeOutput/renderNodeOutputBody.tsx`,
  output/copy/visibility tests, `developer-docs/EXECUTION-DATA-FLOW.md`, and
  `developer-docs/APP-ARCHITECTURE.md`.

### Validation

- Node output regression tests.
- Display-copy and JSON-copy tests.
- DataValue rendering tests for null, undefined, objects, arrays, media, chat,
  and malformed typed payloads.
- Manual check for inline output, fullscreen output, search, wrap mode, process
  paging, custom renderers, and missing large-value refs.
- App lint, especially React hook-order rules.

### Risks

- **Copy policy drift:** normal copy and JSON copy can collapse back to one
  internal representation. Mitigate with separate assertions for both actions.
- **Hidden/internal port leaks:** internal outputs can become visible. Mitigate
  with shared visibility-policy tests.
- **Modal coupling:** fullscreen layout and search/wrap state can get mixed with
  value-section policy. Mitigate by keeping UI state outside the view model.
- **Hook-order regressions:** renderer dispatch can call hooks outside stable
  component boundaries. Mitigate with lint and explicit React component wrappers.
- **Custom renderer regression:** generic view models can make node-specific
  renderers harder to reason about. Mitigate by preserving custom renderer paths.
- **Text/payload changes:** visible output, copy text, missing-ref text, and JSON
  payload shape must not change. Mitigate with focused before/after assertions.

### Go/No-Go

Proceed only if the phase makes visible-output selection and copy policy
discoverable from one owner. Defer if the view model starts absorbing value
rendering, modal layout, search, Markdown, or wrap state.

## Completion Criteria

The plan is complete when:

- each phase has landed or been explicitly deferred with a reason
- every landed phase has behavior-level tests for moved policy
- developer docs and `refactor-history.md` describe the final ownership map
- no public graph/runtime/editor behavior changed unintentionally
- phase conclusions record production-line movement, concept-count movement,
  bug surfaces reduced, and any deliberate remaining duplication
- cross-phase boundaries held, with no phase reintroducing an owner that a prior
  phase clarified
