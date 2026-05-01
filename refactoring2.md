# Maintainability-Gated Deletion Refactor Plan

## Summary

Use current `HEAD` (`29b9b889`) as the implementation boundary for this second refactor. The previous refactor improved subsystem ownership, but it missed the code-volume goal: production code ended `+186` lines compared with `b95bfb31 PRE-refactor`.

This pass has one dominant rule: **delete code only when the result is at least as clear, testable, and behavior-safe as the current code**. The successful parts of the first refactor should be hardened; the failed parts should be corrected by collapsing low-return indirection, deleting duplicate glue, and refusing new abstractions that do not immediately improve the codebase.

Target: remove at least `150` net production lines from current `HEAD`, excluding docs, tests, snapshots, generated artifacts, and build caches.

Final result after reassessment: `153` production insertions and `305` production deletions against `29b9b889`, for `152` net production lines removed. The minimum target was met by a narrow margin without accepting dense rewrites or behavior changes.

Important framing: this is not a second broad architecture pass. It is a maintainability-gated cleanup pass over the helper boundaries introduced by the first refactor. If deletion would make a subsystem harder to reason about, keep the code and mark the helper as `kept intentionally`.

Professionalism bar:

- One owner per behavior policy.
- No generic helper that hides node-specific behavior behind vague options.
- No dense code just to reduce line count.
- No loss of focused testability.
- Every kept helper has a short reason why it exists.

## 0. Measurement And Guardrails

### 0.1 DONE - Capture The New Baseline

Files: `refactoring2.md`

Change: Record the current production diff baseline before touching code. Use `29b9b889..HEAD` for this refactor, not `b95bfb31..HEAD`.

Improvement focus: Transparency and discipline. The first refactor failed the code-reduction goal partly because structural wins were not forced to pay rent in line count.

Risk: Raw line count can encourage dense, worse code. Keep behavior clarity above line count, but require every accepted-growth exception to be explicit.

Acceptance:

- `git status --short` is recorded before implementation starts.
- Production diff commands are recorded and rerun after each phase.
- The plan tracks actual savings per phase, not only estimated savings.

Estimated production lines saved: `0`

Outcome: DONE - recorded. Baseline commit is `29b9b889`. Starting tracked status included only refactor work in progress plus the untracked `refactoring2.md`; production line accounting excludes docs/tests and uses `29b9b889..HEAD`.

### 0.2 DONE - Add A Helper Rent Rule

Files: `refactoring2.md`

Change: Before keeping each helper introduced by the previous refactor, classify it as one of:

- `pays rent`: removes duplicate policy, improves testability, or protects a risky boundary
- `accepted growth`: adds code, but is justified by safety, performance, or strong readability
- `collapse candidate`: useful behavior, but too much indirection for the savings
- `delete candidate`: no longer needed or only wraps one consumer mechanically

Improvement focus: Complexity control and professional ownership boundaries. This prevents another pass where extracted files make old files smaller but total code larger.

Risk: Some helpers are valuable despite growth. Do not collapse high-risk helpers just because they are new or single-consumer.

Acceptance:

- Every new helper file from the previous refactor is classified before editing it.
- `accepted growth` entries include a reason and a test/build that protects the boundary.
- `collapse candidate` entries become concrete patch tasks.
- Single-consumer helpers can still `pay rent` if they isolate a complicated behavior or make focused tests possible.

Estimated production lines saved: `0`

Outcome: DONE - applied during implementation. Helpers were treated as keepers only when they owned policy or testable behavior; low-rent pass-through pieces were collapsed, and helpers that were already good boundaries were kept intentionally instead of forced into denser code.

### 0.3 DONE - Refuse Net-Growth Substeps Unless They Improve The Professional Boundary

Files: implementation commits and `refactoring2.md`

Change: After each substep, run a production-only `git diff --numstat 29b9b889..HEAD` check. If a substep is net-positive in production code, either tighten it immediately or document it as `accepted growth`.

Improvement focus: Real code reduction without encouraging worse code. This is the enforcement mechanism missing from the previous refactor.

Risk: A valuable safety fix may add a few lines. Accept that only when it directly protects behavior and cannot reasonably be done smaller.

Acceptance:

- No substep is marked `DONE` without actual production line totals.
- The final refactor is net-negative by at least `150` production lines.
- Any net-positive substep says what maintainability property was improved: clearer ownership, lower bug risk, better focused tests, or less duplicated policy.

Estimated production lines saved: `0`

Outcome: DONE - enforced. Final production diff against `29b9b889`, excluding docs/tests, is `153` insertions and `305` deletions for `152` net production lines removed. One attempted editor simplification was reverted because it increased code and weakened TypeScript clarity.

## 1. Collapse Low-Return Editor Abstractions

### 1.1 DONE - Reassess `editorUtils` Against Its Real Consumer Count And Test Value

Files: `packages/app/src/components/editors/DefaultNodeEditor.tsx`, `packages/app/src/components/editors/editorUtils.ts`, `packages/app/src/components/editors/editorUtils.test.ts`

Change: Inspect whether `getEditorRenderRows(...)` and `getEditorListKey(...)` are used outside `DefaultNodeEditor`, and whether their tests protect behavior that would become harder to test if inlined. If the helper only adds indirection, inline it. If it cleanly isolates editor grouping/key policy with focused tests, keep it and trim only unnecessary types or exports.

Improvement focus: Less code and better testable policy. A helper that only reshapes data for one component is suspicious, but a single-consumer pure helper can still be professional if it keeps tricky UI grouping testable.

Risk: Editor row grouping is user-visible for inline editor fields. Stable editor keys affect React remount behavior and editor focus.

Acceptance:

- Inline editor grouping still works for adjacent `layout: 'inline'` editors.
- Editor keys remain stable for data-keyed editors, custom editors, and fallback label/index editors.
- The focused editor utility tests are updated only if the public helper boundary changes.
- Net production deletion is positive for this substep.
- If the helper is kept, the outcome must explain why focused testability is worth the file.

Estimated production lines saved: `20-40`

Actual production delta: approximately `0` in `DefaultNodeEditor` / `editorUtils`, plus the adjacent split-control cleanup in `NodeEditorGlobalControls` removed `28` net production lines.

Outcome: DONE - kept intentionally with trimming. `editorUtils` still pays rent: `getEditorRenderRows(...)`, `getEditorListKey(...)`, and the `hasEditorDataKey(...)` type guard keep editor grouping/key policy testable and prevent weaker TypeScript narrowing in JSX. The final patch only simplified the component render loop and left the focused tests intact.

### 1.2 DONE - Simplify `NodeMetadataEditor` Without Weakening Local Ownership

Files: `packages/app/src/components/nodeEditor/NodeMetadataEditor.tsx`, `packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx`

Change: Keep metadata editing out of `NodeEditorGlobalControls`, but reduce internal ceremony in `NodeMetadataEditor` only where readability improves. Reassess whether `NodeTitleInlineEditor` needs to be a separate component; keep it if inlining would mix two editing state machines and make the component harder to scan.

Improvement focus: Less code while preserving the useful ownership boundary and keeping title/description edit lifecycles obvious.

Risk: Title and description edits are command-backed and user-visible. Regressions here are easy to feel immediately: title width, live description changes, `Escape` cancel, blur confirm, and color layout must stay intact.

Acceptance:

- Title editor remains panel-width, not typed-content-width.
- Description applies live as the user types.
- `Escape` while editing title restores the title value from edit start.
- Description cancel restores the value from edit start.
- Color picker layout stays unchanged.
- The title and description edit lifecycles remain visibly separate in code.

Estimated production lines saved: `15-30`

Actual production delta: `13` net production lines removed in the surrounding node-editor styling boundary through `NodeEditor.tsx`; no final behavior change in `NodeMetadataEditor`.

Outcome: DONE - kept intentionally after trial. The attempted component-level simplification made the title/description editing lifecycle less obvious and did not pay for itself, so it was reverted. The accepted cleanup instead deduplicated repeated title/description CSS while preserving the edit-state ownership that protects live description edits, title cancel, and panel-width title layout.

### 1.3 DONE - Keep Node Editor Width And Resize Boundaries Untouched Unless There Is Real Duplication

Files: `packages/app/src/components/nodeEditor/useNodeEditorWidth.ts`, `packages/app/src/components/nodeEditor/NodeEditorResizeContext.ts`, `packages/app/src/components/nodeEditor/NodeEditorGlobalControls.tsx`

Change: Audit for duplicated width/min/max calculations introduced or left behind by the first refactor. Only edit if there is clear duplicate logic. Otherwise mark this substep `kept intentionally`.

Improvement focus: Risk control. Some parts are already correctly centralized; touching them for small line savings is not worth a width persistence regression.

Risk: Panel width persistence is sticky user state. Breaking it creates confusing UI behavior across launches.

Acceptance:

- Either no code change with a written `kept intentionally` outcome, or a small net-negative cleanup with tests/manual verification.
- Existing storage keys and min/max behavior remain unchanged.

Estimated production lines saved: `0-10`

Actual production delta: `0`.

Outcome: DONE - kept intentionally. `useNodeEditorWidth` and `NodeEditorResizeContext` already own the sticky width boundary cleanly. No duplicate width/min/max logic was found that was worth touching, so this pass avoided a risky persistence regression.

## 2. Consolidate Structured Output Rendering Further

### 2.1 DONE - Make `StructuredNodeOutput` Own Only The Stable Common Shell

Files: `packages/app/src/components/nodes/StructuredNodeOutput.tsx`, `packages/app/src/components/nodes/ExpressionNode.tsx`, `packages/app/src/components/nodes/JSListNode.tsx`, `packages/app/src/components/nodes/ExtractObjectPathNode.tsx`

Change: Expand `StructuredNodeOutput` from small section primitives into a compact shared shell that renders:

- optional error text
- explicitly passed node-specific result content
- optional parsed-expression/source section

Keep node-specific output IDs, labels, language names, error/result suppression rules, and split handling outside the generic shell.

Improvement focus: Less code and more consistency in structured output views without creating a vague "one renderer to rule them all."

Risk: The output view has subtly different success/failure behavior per node. A too-generic shell could accidentally show `Resulting value` on failed Expression runs, hide split outputs behind callback props, or show parsed source when no interpolation input exists.

Acceptance:

- Expression success: shows `Resulting value`; parsed expression only when interpolation inputs exist.
- Expression failure: shows error; parsed expression only when interpolation inputs exist; does not show `Resulting value`.
- JS Filter / JS Map: show `Filtered` / `Mapped`; parsed callback only when interpolation inputs exist.
- Extract Object Path: shows `Match` and `All Matches`; parsed path only for stored path mode with interpolation.
- Compact and fullscreen output renderers use the same shell.
- The shared shell has no node-type switch and no output-port knowledge.
- If the shell requires many options to describe node-specific behavior, stop and keep the current explicit node renderers.

Estimated production lines saved: `30-60`

Actual production delta for structured output phase: `81` net production lines removed across `StructuredNodeOutput`, `CodeNode`, `ExpressionNode`, `JSListNode`, and `ExtractObjectPathNode`.

Outcome: DONE - collapsed and reassessed. `StructuredNodeOutput` now owns the common shell for optional error text, caller-provided node-specific content, and the optional parsed-source section. It has no node-type switch and no output-port knowledge; node descriptors still own their labels, IDs, render-mode choice, split handling, and show/hide rules. The reassessment fixed a subtle error-state gap by keying success-section suppression from `status.type === 'error'` instead of the truthiness of the error message string.

### 2.2 DONE - Deduplicate Split Output Sorting Only If The Helper Is Obvious

Files: `packages/app/src/components/nodes/JSListNode.tsx`, `packages/app/src/components/nodes/ExtractObjectPathNode.tsx`, optional `packages/app/src/components/nodes/StructuredNodeOutput.tsx`

Change: Remove duplicated `getSortedSplitOutputEntries(...)` implementations. Prefer a tiny local export from `StructuredNodeOutput` only if it reduces net code. If the generic helper adds more code than it removes, keep one local implementation and inline the other.

Improvement focus: Less code and fewer repeated utility functions without creating a "utilities junk drawer."

Risk: Split output order must remain numeric by split index. String sort would be wrong for indexes like `10`.

Acceptance:

- Split outputs remain sorted numerically.
- No new helper is kept if it does not produce net deletion.
- The helper name describes the domain (`split output entries`), not a vague generic sorting operation.

Estimated production lines saved: `8-18`

Actual production delta: included in the `81` net lines removed for the structured output phase.

Outcome: DONE - deleted duplicate policy. `getSortedSplitOutputEntries(...)` lives beside the structured output shell because it is a small domain-named helper, not a generic sorting utility. Split output ordering remains numeric.

### 2.3 DONE - Collapse Wrapper Components In JS List Output Rendering Without Type Games

Files: `packages/app/src/components/nodes/JSListNode.tsx`

Change: Reduce thin wrapper components that only pass through props for `Output` and `FullscreenOutput`. Keep separate exported descriptors for `jsFilter` and `jsMap`, but avoid duplicated wrapper component definitions where a typed inline function or shared factory is shorter and still readable.

Improvement focus: Less code without hiding node identity or fighting TypeScript.

Risk: Generic component factories can become less readable than explicit components. Use the shortest readable form, not the cleverest form.

Acceptance:

- `jsFilterNodeDescriptor` and `jsMapNodeDescriptor` remain explicit.
- TypeScript still preserves the correct node type for each descriptor.
- Compact and fullscreen modes still pass the correct render mode.
- No casts or generic factory machinery are introduced just to save a few lines.

Estimated production lines saved: `10-25`

Actual production delta: included in the `81` net lines removed for the structured output phase.

Outcome: DONE - collapsed. Thin `JS Filter` / `JS Map` output wrapper components were replaced by explicit descriptor render functions. Node descriptors remain separate and readable, with no casts or generic factory machinery.

## 3. Trim JS Filter / JS Map Helper Surface Without Hiding Runtime Logic

### 3.1 DONE - Remove Unneeded Helper Exports Without Reducing Test Intent

Files: `packages/core/src/model/nodes/jsListCallbackHelpers.ts`, `packages/core/src/model/nodes/JSFilterNode.ts`, `packages/core/src/model/nodes/JSMapNode.ts`

Change: Search every export from `jsListCallbackHelpers.ts`. Convert exports to file-local declarations when they are not imported outside the helper file or tests do not need them as public helper surface.

Improvement focus: More transparent internal API and less accidental coupling while keeping useful contract tests.

Risk: Some helper exports may be intentionally tested directly. If direct tests protect generated wrapper contracts, keep the exports or move tests to a better public behavior seam rather than deleting coverage.

Acceptance:

- No production import breaks.
- Core tests still cover wrapper behavior and runtime interpolation.
- The helper file exports only node-facing functions and deliberately tested wrapper builders.
- Tests remain intent-focused; they should not merely assert private implementation details.

Estimated production lines saved: `5-15`

Actual production delta for JS-list helper phase: `2` net production lines removed across core and app JS-list helper files.

Outcome: DONE - collapsed narrowly. Preview-only exports that did not need to be part of the core helper surface were removed. Runtime-facing wrapper builders and deliberately tested helper boundaries remain exported because the tests protect generated-code behavior and dynamic-code-disable semantics.

### 3.2 DONE - Keep Wrapper Strings Readable And Avoid Premature Template Abstraction

Files: `packages/core/src/model/nodes/jsListCallbackHelpers.ts`

Change: Compare `buildJSFilterWrapper(...)` and `buildJSMapWrapper(...)`. Share only identical wrapper scaffolding if it reduces net code without making generated source opaque. Do not convert the main runtime loop into a mode-heavy puzzle if that saves only a few lines.

Improvement focus: Less code while protecting debuggability.

Risk: The generated code is what users effectively debug through CodeRunner errors. Over-abstraction here makes future failures harder to interpret.

Acceptance:

- Generated wrappers still visibly contain the array validation, callback definition, synchronous-result check, and return object.
- Filter truthiness semantics and Map return-value semantics stay obvious.
- Sync callback rejection message remains unchanged.
- The generated source remains easy to paste into a debugger or reason about from a stack trace.

Estimated production lines saved: `5-20`

Actual production delta: `0` direct deletion from wrapper-string abstraction.

Outcome: DONE - kept intentionally. The filter and map wrapper strings remain explicit because their generated source is a debugging surface. A mode-heavy wrapper builder would save little code and make filter truthiness, map return semantics, and sync-callback rejection harder to inspect.

### 3.3 DONE - Simplify Callback Preview Helpers

Files: `packages/core/src/model/nodes/jsListCallbackHelpers.ts`

Change: Reassess `buildJSListNodeBodyPreview(...)`, `wrapJSListCallbackPreview(...)`, and `getJSListNodeBody(...)`. Keep the preview behavior, but collapse helpers if they only add names around one short expression.

Improvement focus: Less code and lower helper surface.

Risk: Canvas body previews should remain trimmed and consistently wrapped as `(item, index, array) => { ... }`.

Acceptance:

- JS Filter and JS Map canvas bodies still show the callback signature and body.
- Preview line cap remains unchanged.
- No behavior change for empty or whitespace-heavy callback bodies.

Estimated production lines saved: `5-12`

Actual production delta: included in the `2` net lines removed for the JS-list helper phase.

Outcome: DONE - collapsed. Core body preview now builds its small wrapped callback snippet inline in `getJSListNodeBody(...)`; app-side parsed callback display owns its own display wrapper because it is presentation-only and should not expand the core helper API.

## 4. Audit Accepted-Growth Helpers And Harden Only

### 4.1 DONE - Keep `useRenderableWires` Unless It Can Be Simplified Without Rejoining Rendering And Policy

Files: `packages/app/src/components/WireLayer.tsx`, `packages/app/src/components/nodeCanvas/useRenderableWires.ts`, `packages/app/src/components/nodeCanvas/getRenderableWireCandidates.ts`

Change: Audit whether `useRenderableWires` meaningfully separates wire selection/clipping/freeze policy from SVG rendering. Treat this helper as likely professional structure. Trim types, options, and local helpers where possible, but do not merge it back into `WireLayer` unless the merged version is clearly smaller and easier to understand.

Improvement focus: Hardening and small deletion. This helper is likely useful, but it should still be lean.

Risk: Wire rendering is performance-sensitive and recently fixed. Collapsing it back into `WireLayer` could recreate the old "rendering plus policy plus freeze state" tangle.

Acceptance:

- Dragging a connected node keeps wires live.
- Dynamic port changes redraw wires immediately.
- Passive pan/zoom can freeze static wires and settle afterward.
- Active dragging wire remains live during viewport motion.
- `WireLayer` remains mostly SVG/event orchestration, not candidate-selection policy.

Estimated production lines saved: `5-15`

Actual production delta: `10` net production lines removed in `useRenderableWires`.

Outcome: DONE - kept intentionally with trimming. The hook still pays rent by keeping static wire candidate selection, clipping, and freeze policy out of SVG rendering. Only the connection-list equality helper was simplified.

### 4.2 DONE - Keep Visibility Helpers If They Name Bug-Prone Canvas Policy

Files: `packages/app/src/hooks/useVisibleCanvasNodes.ts`, `packages/app/src/hooks/canvasVisibilityBounds.ts`, `packages/app/src/components/nodeCanvas/viewportVisibilityPolicy.ts`

Change: Audit `canvasVisibilityBounds` and `viewportVisibilityPolicy` for duplicate naming or overly broad helper boundaries. Keep them if they directly protect Comment culling and live-drag visibility exceptions.

Improvement focus: Hardening. These helpers are likely accepted growth because they encode bug-prone canvas policies.

Risk: Comment nodes previously disappeared when partially out of view; drag overlays and wire endpoints previously had live-update problems. Regressions here are visually disruptive.

Acceptance:

- Comment nodes remain visible when partially in viewport.
- Normal nodes keep current culling behavior.
- Drag overlays remain visible while dragged.
- Visibility freeze behavior still distinguishes passive viewport motion from active drag interaction.
- Any kept helper has a one-sentence policy comment or self-explanatory name that justifies its existence.

Estimated production lines saved: `0-10`

Actual production delta: `0`.

Outcome: DONE - kept intentionally. The visibility helpers encode bug-prone policy around partial Comment visibility, passive viewport freezing, and active drag exceptions. No duplicate boundary was found that could be safely removed without making those policies less explicit.

### 4.3 DONE - Keep Runtime And Popup Helpers Unless They Have Dead Branches Or Overbroad API

Files: `packages/core/src/api/processSettings.ts`, `packages/app/src/utils/debuggerPanelPosition.ts`

Change: Audit `processSettings` and `debuggerPanelPosition` for redundant options, dead fallbacks, and exported types that can be file-local. Do not merge either helper back into callers unless there is clear net deletion and no loss of API clarity.

Improvement focus: Hardening and API clarity.

Risk: `processSettings` affects backend/programmatic graph execution. `debuggerPanelPosition` affects a visible popup anchor that was manually tuned.

Acceptance:

- Runtime settings defaults remain unchanged for core, node, and trivet packages.
- Editor-only preferences do not leak into backend execution requirements.
- Remote debugger popup remains immediately under the Run block and horizontally clamped.
- Public exports from core are intentional and documented.

Estimated production lines saved: `5-15`

Actual production delta: `10` net production lines removed in `debuggerPanelPosition`; `processSettings` was unchanged.

Outcome: DONE - kept intentionally with API trimming. `resolveDebuggerPanelPosition(...)` still owns debugger popup anchoring and clamp math, but its explicit return type export was removed. `processSettings` remains unchanged because it is a programmatic execution boundary and no dead branch was found.

### 4.4 DONE - Keep Graph Input Usage Display-Model Boundary

Files: `packages/app/src/domain/graphEditing/graphInputUsage.ts`, `packages/app/src/components/DeleteGraphInputConfirmModal.tsx`

Change: Keep the display-ready graph input usage model if it prevents UI graph traversal. Trim only redundant labels or intermediate data that no consumer needs.

Improvement focus: Hardening graph integrity UI while reducing small bits of excess model shape.

Risk: Graph input deletion warnings are safety-critical. The modal must still explain direct Subgraph and conservative Call Graph usage clearly without duplicate labels.

Acceptance:

- Deleting used graph inputs still shows the confirmation popup.
- Direct Subgraph and Graph Reference + Call Graph usages are still detected.
- Display paths no longer duplicate `Call Graph`.
- The modal remains presentational.

Estimated production lines saved: `5-15`

Actual production delta: `8` net production lines removed in `graphInputUsage`.

Outcome: DONE - kept intentionally with trimming. The graph input usage model still keeps traversal out of the modal and protects Subgraph / Call Graph warning behavior. Redundant label helpers were collapsed and unused display-model surface was kept private.

## 5. Documentation And Plan Truthfulness

### 5.1 DONE - Replace Stale `DONE` Semantics With Real Outcomes

Files: `refactoring2.md`

Change: During implementation, mark substeps only with concrete outcomes:

- `DONE - deleted`
- `DONE - collapsed`
- `DONE - kept intentionally`
- `DONE - accepted growth`

Do not use `DONE` for "looked at it" without an outcome.

Improvement focus: Transparency. The previous plan became too generous with `DONE` labels.

Risk: None to runtime, but weak outcome language makes future reassessment slower.

Acceptance:

- Each completed substep includes actual line delta.
- Any `accepted growth` entry includes a reason and the tests/builds that protect it.

Estimated production lines saved: `0`

Actual production delta: `0`.

Outcome: DONE - documented. Each substep header is marked `DONE`, and each outcome now says whether the work was collapsed, deleted, kept intentionally, or applied with trimming. Substeps that did not change code include a reason instead of pretending inspection was deletion.

### 5.2 DONE - Update Developer Docs Only For Real Contract Changes

Files: `developer-docs/*`

Change: Because this pass should preserve behavior, docs should change only if:

- current docs describe a helper boundary that is removed or renamed
- current docs still describe the pre-refactor structure
- implementation reveals an actual doc/code mismatch

Improvement focus: Documentation correctness without noisy docs churn.

Risk: The repo instruction requires developer docs updates when code changes. Avoid fake docs updates; make targeted updates that reflect the refactor boundary or explicitly state there was no user-facing contract change if appropriate.

Acceptance:

- Developer docs remain synchronized with final helper ownership.
- No docs claim behavior changed if this refactor only moved/deleted code.

Estimated production lines saved: `0`

Actual production delta: `0`.

Outcome: DONE - updated. Developer docs were changed only to describe final helper ownership after the refactor: structured node-output shell ownership, the Code node joining that shell, node-specific renderer policy remaining local, and JS-list app-side parsed-source display owning its presentation wrapper.

## Public API / Interface Notes

No persisted graph or schema changes are planned.

No external API changes are intended.

Internal helper exports may be removed if they have no production consumer outside their defining subsystem.

Runtime behavior must remain unchanged for:

- node execution
- app editor settings
- canvas wire rendering
- canvas visibility and Comment-node culling
- graph input deletion/rename integrity
- structured output rendering
- modal and debugger positioning

## Code Reduction Target

Minimum desired result: `150` net production lines removed from current `HEAD`.

Actual result: `152` net production lines removed from current `HEAD` (`153` insertions, `305` deletions), excluding docs/tests.

Stretch target: `220-300` net production lines removed.

Expected savings by area:

- Measurement and guardrails: `0`
- Editor abstraction cleanup: `41` net production lines removed (`28` from split-control cleanup and `13` from node-editor CSS cleanup)
- Structured output consolidation: `81` net production lines removed
- JS List helper trimming: `2` net production lines removed
- Accepted-growth helper hardening: `28` net production lines removed
- Documentation and plan truthfulness: `0`

Total actual: `152` production lines removed.

If the implementation lands below `150` lines removed, the final report must say plainly that the deletion target was missed. That is acceptable only if the missed deletion would have made the repo less maintainable.

Quality gates:

- Do not delete named pure helpers if that forces complex behavior back into large React components.
- Do not introduce generic option-heavy components to remove duplicated JSX.
- Do not replace small explicit branches with dense conditional expressions if it makes behavior harder to scan.
- Do not remove tests just because helper boundaries change; move tests to behavior seams instead.

## Test Plan

Run after each subsystem, not only at the end:

```bash
git diff --check
```

Focused app tests:

```bash
yarn workspace @ironclad/rivet-app exec tsx --test src/components/editors/editorUtils.test.ts src/components/nodes/expressionOutputUtils.test.ts src/components/nodes/jsListOutputUtils.test.ts src/components/nodes/extractObjectPathOutputUtils.test.ts src/components/nodeCanvas/getRenderableWireCandidates.test.ts src/hooks/useVisibleCanvasNodes.test.ts src/domain/graphEditing/graphInputUsage.test.ts src/utils/debuggerPanelPosition.test.ts
```

Focused core tests:

```bash
yarn workspace @ironclad/rivet-core exec tsx --test test/model/nodes/JSFilterNode.test.ts test/model/nodes/JSMapNode.test.ts test/model/nodes/ExpressionNode.test.ts test/model/nodes/ExtractObjectPathNode.test.ts test/api/processSettings.test.ts
```

Builds:

```bash
yarn workspace @ironclad/rivet-core build:esm
yarn workspace @ironclad/rivet-node build:esm
yarn workspace @ironclad/trivet build:esm
yarn workspace @ironclad/rivet-app run build
```

Final production size check:

```bash
git diff --stat 29b9b889..HEAD -- . ":(exclude)*.md" ":(exclude)**/*.md" ":(exclude)*.test.ts" ":(exclude)**/*.test.ts" ":(exclude)*.test.tsx" ":(exclude)**/*.test.tsx" ":(exclude)test/**" ":(exclude)**/test/**" ":(exclude)tests/**" ":(exclude)**/tests/**"
git diff --numstat 29b9b889..HEAD -- . ":(exclude)*.md" ":(exclude)**/*.md" ":(exclude)*.test.ts" ":(exclude)**/*.test.ts" ":(exclude)*.test.tsx" ":(exclude)**/*.test.tsx" ":(exclude)test/**" ":(exclude)**/test/**" ":(exclude)tests/**" ":(exclude)**/tests/**"
```

Implementation verification:

- `git diff --check` passed; Git reported only existing CRLF normalization warnings.
- Focused app tests passed:
  `yarn workspace @ironclad/rivet-app exec tsx --test src/components/editors/editorUtils.test.ts src/components/nodes/expressionOutputUtils.test.ts src/components/nodes/jsListOutputUtils.test.ts src/components/nodes/extractObjectPathOutputUtils.test.ts src/components/nodeCanvas/getRenderableWireCandidates.test.ts src/hooks/useVisibleCanvasNodes.test.ts src/domain/graphEditing/graphInputUsage.test.ts src/utils/debuggerPanelPosition.test.ts`
- Focused core tests passed:
  `yarn workspace @ironclad/rivet-core exec tsx --test test/model/nodes/JSFilterNode.test.ts test/model/nodes/JSMapNode.test.ts test/model/nodes/ExpressionNode.test.ts test/model/nodes/ExtractObjectPathNode.test.ts test/api/processSettings.test.ts test/model/nodes/jsListCallbackHelpers.test.ts`
- Builds passed:
  `yarn workspace @ironclad/rivet-core build:esm`
- Builds passed:
  `yarn workspace @ironclad/rivet-node build:esm`
- Builds passed:
  `yarn workspace @ironclad/trivet build:esm`
- Builds passed:
  `yarn workspace @ironclad/rivet-app run build`

## Manual Regression Checklist

This checklist was not executed in the automated reassessment pass. It remains the live-app smoke test to run before merging if a desktop app session is available.

Verify:

- Node settings title/description live edit and cancel behavior.
- Color picker layout in node settings.
- Inline editor grouping in node settings.
- Expression output with no interpolation variables: no parsed expression section.
- Expression output with interpolation variables: parsed expression section appears and matches evaluated source.
- Expression failure with interpolation variables: error plus parsed expression, no resulting value.
- JS Filter / JS Map output with and without interpolation.
- Extract Object Path output with stored-path interpolation and with `usePathInput=true`.
- Code node error location and editor highlight.
- Drag nodes and dynamic ports; wires redraw immediately.
- Pan/zoom medium graph; static wires freeze and settle correctly.
- Comment nodes remain visible when partially in viewport.
- Delete/rename graph inputs used by Subgraph and Call Graph paths.
- Remote debugger panel anchors under the Run block.
- Fullscreen output modal resize remains edge-based.

## Sequencing

1. Run baseline measurement and write actual starting numbers into this file.
2. Do structured output consolidation first; it has the clearest duplication and focused tests.
3. Trim JS List helpers next; it is small and core tests should catch behavior drift.
4. Clean editor abstractions after output/core work; editor behavior needs more manual validation.
5. Audit accepted-growth helpers last; most are likely keepers, so this should be a hardening pass, not a rewrite.
6. Update developer docs and final line-count outcomes.
7. Run builds and keep the manual regression checklist available for the live-app smoke test.

## Assumptions And Defaults

This refactor is maintainability-gated deletion-first.

Current `HEAD` (`29b9b889`) is the baseline.

Behavior preservation and maintainability beat line count if there is a real conflict, but every accepted growth point must be named.

New abstractions are disallowed unless they immediately remove more code than they add.

Tests and docs may grow if needed; only production/source code is judged for the line-savings target.

Do not broaden this pass into new UX, performance, or API changes. If a behavior bug is discovered, fix it only if it blocks safe deletion; otherwise document it as follow-up.
