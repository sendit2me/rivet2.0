# Refactor Plan: Features #54–#57

This document proposes a comprehensive, functionality-preserving refactor of the
four most recent feature batches (Monaco folding, persistent editor resizing,
`Copy value` alignment, and fullscreen output search). The goal is to reduce
code volume, remove overengineering, and make the code easier to read and
maintain — without changing any observed behavior.

All file references use the workspace-root-relative layout in
`packages/app/src/`.

---

## Shared themes across all four features

The four features share the same set of smells. Fixing them collectively (rather
than per-feature) is what produces the largest simplifications.

1. **Identifier inflation.** Helpers and types carry `Fullscreen`, `Output`,
   `Search`, `NodeEditorCode`, `CodeEditor`, `CopyValue` prefixes on almost
   every export. Names like
   `getDraggedNodeCodeEditorViewportHeight`,
   `projectFullscreenOutputSearchMatches`,
   `isFullscreenOutputSearchBoundaryTagName`,
   `getNodeEditorCodeEditorMountKey`,
   `serializeDisplayedNodeOutputsForCopyValue`,
   add reading overhead without disambiguating anything (there is only one of
   each in the codebase). Shorter, module-scoped names read better.

2. **Premature splitting into "pure helper" files.** Features #55/#56/#57 each
   introduced 2–4 helper files whose pure logic is trivially small and
   only used by one consumer. The stated rationale was testability, but the
   tests are mostly exercising logic that would be equally testable from the
   consuming hook/component module, or is too trivial to warrant a dedicated
   file.

3. **Paraphrased helpers.** Many helpers exist just to rename one-liners:
   `hasVisiblePositiveScalarMetric`, `hasPresentScalarNumberValue`,
   `isValidStoredHeight`, `hasExplicitCodeEditorHeight`,
   `normalizeFullscreenOutputSearchQuery`,
   `getWrappedFullscreenOutputSearchMatchIndex`. They are each called from one
   or two sites and hide a single expression.

4. **Parallel representations of the same data.** Feature #57 defines
   `FullscreenOutputSearchBlock` (with DOM nodes) and
   `FullscreenOutputSearchProjectableBlock` (pure), then maps one to the other
   before calling `projectFullscreenOutputSearchMatches`, which then
   re-searches text that is already available. A single block
   representation and a single text scan suffice.

5. **Passthrough components and wrappers.** `MonacoEditorViewport` is a
   pass-through to `LazyCodeEditor`. `ResizableCodeEditorViewport` and
   `NonResizableCodeEditorViewport` differ only in whether they render a
   `ResizeHandle` and read a persisted height; they otherwise render identical
   trees.

6. **Unnecessary environment fallbacks.** The global `CodeEditor` has a
   `typeof ResizeObserver !== 'undefined'` fallback path with a
   `window.addEventListener('resize', …)` branch. The app already runs in
   Tauri/Electron-like environments where `ResizeObserver` is guaranteed.

---

## DONE — Feature #54 — Scoped Monaco code folding

### Current shape

- [codeEditorOptions.ts](packages/app/src/components/codeEditorOptions.ts)
  exports `buildCodeEditorCreateOptions`, `resolveCodeEditorTheme`, and
  `getNodeEditorCodeEditorMountKey`.
- [CodeEditor.tsx](packages/app/src/components/CodeEditor.tsx) (base component)
  consumes `buildCodeEditorCreateOptions` and has an unnecessary
  `ResizeObserver` feature-check. This component is never imported directly —
  it is only accessed via `LazyCodeEditor` (lazy wrapper in `LazyComponents.tsx`).
- [editors/CodeEditor.tsx](packages/app/src/components/editors/CodeEditor.tsx)
  (node-editor wrapper) consumes `resolveCodeEditorTheme` +
  `getNodeEditorCodeEditorMountKey`.
- [ColorizedPreformattedText.tsx](packages/app/src/components/ColorizedPreformattedText.tsx)
  reuses `resolveCodeEditorTheme` for `monaco.editor.colorizeElement()` (a
  static syntax-highlight call, not an editor instance). The theme resolution
  works identically for both `editor.create()` and `colorizeElement()`.
- [codeEditorOptions.test.ts](packages/app/src/components/codeEditorOptions.test.ts)
  uses **`node:test`** (not vitest) — 6 tests across 150 lines.

### Problems

- `buildCodeEditorCreateOptions` branches each folding-related Monaco option on
  `enableFolding` to set `undefined`. The options object is not worth a
  dedicated module: it is a pure one-shot configuration used by exactly one
  `monaco.editor.create` call.
- `getNodeEditorCodeEditorMountKey` is a 12-line function that joins a string
  with `'::'`. It is a template literal dressed up as an API. Inline it.
- `resolveCodeEditorTheme` is used in two places and is one ternary — it can
  stay but should drop the long name; a short name suffices.
- Two private types (`BuildCodeEditorCreateOptionsArgs`,
  `GetNodeEditorCodeEditorMountKeyArgs`) exist only for the parameter bags of
  these small functions and can be dropped when the functions are inlined.
- `enableFolding` is set from `CodeEditorDefinition` at node definition time
  and never changes dynamically — the editor is created once (the base
  `CodeEditor.tsx` has `useEffect(…, [])` with an empty dependency array).
  This makes inlining into the creation effect safe.

### Proposed changes

1. **Inline `buildCodeEditorCreateOptions` into `CodeEditor.tsx`** (the base
   component). Move the create-options object directly into the one `useEffect`
   that instantiates Monaco. **Keep the conditional `undefined` pattern for
   folding sub-options** (see Risks below). Drop the two private parameter
   types.
2. **Inline `getNodeEditorCodeEditorMountKey`** as a template literal in
   `editors/CodeEditor.tsx` (the one call site). Drop its parameter type.
3. **Move `resolveCodeEditorTheme`** to a small shared export — either add it
   to `utils/monaco.ts` or keep it in a tiny `codeEditorTheme.ts` — renamed
   to `resolveMonacoTheme`. Update imports in `editors/CodeEditor.tsx` (line 11)
   and `ColorizedPreformattedText.tsx` (line 5).
4. **Delete `codeEditorOptions.ts`** entirely once steps 1–3 are done.
5. **Drop the `ResizeObserver` fallback** in `CodeEditor.tsx` (lines 60–70,
   93–97). `ResizeObserver` is available in all supported targets (Tauri
   webview). This removes ~15 lines and a `window.addEventListener` branch.
6. **Shrink the test file.** Delete tests that exercise
   `buildCodeEditorCreateOptions` (they test Monaco's own option surface) and
   the mount-key join tests. Keep only tests for `resolveMonacoTheme`. The
   test file uses `node:test`, which continues to work in the new location.

### Risks

- **Folding sub-options and `folding: false`.** The original plan proposed
  "always set the folding keys unconditionally" (e.g., set
  `foldingStrategy: 'auto'` even when `folding: false`). However, Monaco's
  behavior with `folding: false` + `foldingStrategy: 'auto'` set
  simultaneously is not clearly documented and could be version-dependent.
  **Mitigation:** Keep the existing conditional pattern
  (`foldingStrategy: enableFolding ? 'auto' : undefined`) to avoid risk. The
  savings from unconditional setting are only ~4 lines — not worth the
  behavioral uncertainty.
- **Import path updates.** Deleting `codeEditorOptions.ts` requires updating
  imports in 3 files: `editors/CodeEditor.tsx` (line 11),
  `ColorizedPreformattedText.tsx` (line 5), and the test file.
  **Mitigation:** Mechanical rename; verify with `tsc --noEmit`.
- **No direct CodeEditor.tsx imports.** Verified: no file in the codebase
  imports the base `CodeEditor.tsx` directly; all access goes through
  `LazyCodeEditor`. The Suspense/lazy boundary is unaffected.

### Net effect
- Delete `codeEditorOptions.ts` (~67 lines).
- Shrink `codeEditorOptions.test.ts` from ~150 lines to ~20 lines (just the
  `resolveMonacoTheme` tests).
- Simplify `CodeEditor.tsx` (~15 lines removed).

---

## DONE — Feature #55 — Persistent per-node-type resizing

### Current shape

- [nodeEditorCodeEditorSizing.ts](packages/app/src/components/editors/nodeEditorCodeEditorSizing.ts):
  5 exports (`DEFAULT_…`, `MIN_…`, `isResizableNodeCodeEditorLanguage`,
  `clampNodeCodeEditorViewportHeight`, `getDraggedNodeCodeEditorViewportHeight`,
  `resolveResizableNodeCodeEditorViewportHeight`) + 1 private predicate.
- [useNodeEditorCodeViewportHeight.ts](packages/app/src/components/editors/useNodeEditorCodeViewportHeight.ts):
  Hook that combines the storage atom, drag state, and event callbacks.
- [editors/CodeEditor.tsx](packages/app/src/components/editors/CodeEditor.tsx):
  Splits the editor viewport into `ResizableCodeEditorViewport` vs
  `NonResizableCodeEditorViewport`, plus a `MonacoEditorViewport` pass-through.
- [nodeEditorCodeEditorSizing.test.ts](packages/app/src/components/editors/nodeEditorCodeEditorSizing.test.ts):
  Tests for each small helper (uses `node:test`). No test file exists for
  the hook itself (`useNodeEditorCodeViewportHeight`).
- [ResizeHandle.tsx](packages/app/src/components/ResizeHandle.tsx):
  Reusable component, also used for node-canvas resizing in
  `NormalVisualNodeContent.tsx`. No changes needed here.
- CSS rules in [DefaultNodeEditor.tsx](packages/app/src/components/editors/DefaultNodeEditor.tsx)
  target specific class names and DOM nesting (see Risks).

### Problems

- The `*Sizing.ts` module is a splintered set of one-line helpers built around
  a single concept: "resolve & clamp a height". Each helper is called from
  exactly one place (the hook), and `clampNodeCodeEditorViewportHeight` is
  wrapped by `getDraggedNodeCodeEditorViewportHeight` and
  `resolveResizableNodeCodeEditorViewportHeight` for no added clarity.
- `isValidStoredHeight` (in `nodeEditorCodeEditorSizing.ts` line 6) and
  `hasExplicitCodeEditorHeight` (in `editors/CodeEditor.tsx` line 170) are
  identical checks with different names. Consolidate into one.
- `MonacoEditorViewport` is a pure pass-through to `LazyCodeEditor`.

### Proposed changes

1. **Fold `nodeEditorCodeEditorSizing.ts` into
   `useNodeEditorCodeViewportHeight.ts`.** Keep only: `MIN_HEIGHT`,
   `DEFAULT_HEIGHT`, `RESIZABLE_LANGUAGES`. Replace the three "resolve /
   clamp / drag" helpers with one inline expression each. Export the
   height-validation predicate (consolidating `isValidStoredHeight` /
   `hasExplicitCodeEditorHeight` into one `isValidHeight`). The resulting hook
   file is self-contained and ~50 lines.
2. **Inline `isResizableNodeCodeEditorLanguage`** in `editors/CodeEditor.tsx`
   as `RESIZABLE_LANGUAGES.has(language ?? '')` or
   `['javascript', 'json'].includes(language ?? '')`. There is only one
   call site (line 96).
3. **Keep the two viewport components separate** rather than collapsing into
   one. The original plan proposed a single component that always calls the
   hook with `nodeType: undefined` for non-resizable editors, but this creates
   atom subscription overhead (see Risks). Instead, the simplification is:
   - **Delete `MonacoEditorViewport`** (the pass-through) and render
     `<LazyCodeEditor>` directly in both viewport components.
   - **Simplify `NonResizableCodeEditorViewport`** to remove the
     `hasExplicitCodeEditorHeight` helper (use the consolidated `isValidHeight`
     from the hook module).
   - This still saves ~25 lines (the pass-through component + shared type)
     while avoiding the atom subscription issue.
4. **Port the sizing test assertions** into the hook's module (or a companion
   `.test.ts`). Since no hook tests currently exist, do not delete the
   assertions — relocate the meaningful ones (clamp-to-min, prefer-persisted,
   fallback chain) alongside the hook. The trivial
   `isResizableNodeCodeEditorLanguage` tests can be dropped after inlining.

### Risks

- **Atom subscription in non-resizable editors.** The hook calls
  `useAtom(codeEditorHeightsByNodeTypeState)`, which subscribes the component
  to the entire persisted-heights map. If always called (even for
  non-resizable editors), every height persistence event (any node type's
  resize-end) would trigger a re-render of every open non-resizable editor.
  **Mitigation:** Keep separate viewport components so that only resizable
  editors call the hook. The `MonacoEditorViewport` pass-through can still be
  eliminated without this coupling.
- **CSS class/DOM structure dependencies.** The CSS in `DefaultNodeEditor.tsx`
  targets specific class names with specific nesting:
  - `.editor-viewport-shell` (resizable outer shell with explicit `height`)
  - `.editor-wrapper` (inner flex container, used in both paths)
  - `.node-editor-static-code-editor` (non-resizable path, sets `min-height`
    and `flex: 1 1 auto`)
  - `.node-editor-code-resize-handle` (drag handle styling)
  Any collapsed component must produce the same DOM class structure.
  **Mitigation:** By keeping the two viewport components separate (revised
  plan), no DOM structure changes are needed. The pass-through removal is
  purely internal.
- **Dual height defaults.** The hook defaults to `DEFAULT_HEIGHT` (500) and
  the CSS `.node-editor-static-code-editor` sets `min-height: 500px`. These
  are currently aligned but fragile. **Mitigation:** Add a comment linking
  these two definitions so future changes keep them in sync.

### Net effect
- Delete `nodeEditorCodeEditorSizing.ts` (~50 lines).
- Shrink `nodeEditorCodeEditorSizing.test.ts` from ~90 to ~30 lines (just the
  resolve/clamp tests, moved into the hook module's test file).
- Remove ~25 lines from `editors/CodeEditor.tsx` (pass-through component +
  shared type + duplicate height predicate).

---

## DONE — Feature #56 — `Copy value` matches displayed output

### Current shape

- [executionDataCopyValue.ts](packages/app/src/utils/executionDataCopyValue.ts):
  Generic projection (`projectDataValueForCopyValue`, restore/visible helpers,
  serializer). Exports 6 functions + 2 types.
- [executionDataCopyValue.test.ts](packages/app/src/utils/executionDataCopyValue.test.ts):
  8 tests using `node:test` (183 lines) — tests for the generic projector.
- [executionDataReaders.ts](packages/app/src/utils/executionDataReaders.ts):
  `restoreStoredPortMap`, `restoreStoredPortValue`, `coerceStoredPortValue`,
  `restoreDisplayedNodeOutputs`, `getStoredWarningsForNodeOutput`.
- [nodeOutputCopyValueProjectors.ts](packages/app/src/utils/nodeOutputCopyValueProjectors.ts):
  Per-node projectors (chat, user input, loop, sub-graph) + 9 private metric
  helpers.
- [nodeOutputCopyValueProjectors.test.ts](packages/app/src/utils/nodeOutputCopyValueProjectors.test.ts):
  9 tests using `node:test` (256 lines).
- [nodeOutputCopyActions.ts](packages/app/src/components/nodeOutput/nodeOutputCopyActions.ts):
  `copyNodeOutputValueToClipboard` + `copyNodeOutputJsonToClipboard`.

### Problems

- **Thin layering.** `nodeOutputCopyActions.ts` is a ~50-line wrapper whose
  sole job is to `try/catch` around `serializeDisplayedNodeOutputsForCopyValue`
  and `restoreDisplayedNodeOutputs`, plus call `copyToClipboard`. It is
  consumed from exactly two components inside `NodeOutput.tsx`:
  `NodeFullscreenOutput` (lines 210–213) and `NodeOutputSingleProcess`
  (line 384).
- **Redundant helpers.** In `nodeOutputCopyValueProjectors.ts`:
  - 8 metric-visibility predicates can be unified into 2.
  - `getChatNodeCopyValueData` computes per-port values twice.
  - The `CHAT_META_PORT_IDS` array is paired with a hand-written if/else if
    chain.
- **Naming.** All projection functions have verbose `ForCopyValue` suffixes.
- **`projectStoredOutputPortMapForCopyValue` is used in 3 call sites** — it
  is not single-use and must remain a callable helper.
- **`NodeOutputCopyValueProjector` type** is imported in 4 locations; its home
  needs to be stable after renames.

### Proposed changes

1. **Keep `nodeOutputCopyActions.ts` as a utility file** rather than merging
   into `NodeOutput.tsx`. `NodeOutput.tsx` is already 503 lines; adding copy
   logic would make it larger. Additionally, `handleError` is the standard
   error-handling pattern used in 41+ files across the codebase — preserving
   the try/catch + `handleError` wrapper in a dedicated file keeps the pattern
   consistent and available for potential future consumers. Rename functions to
   shorter names (`copyOutputValue`, `copyOutputJson`).
2. **Rename exports in `executionDataCopyValue.ts`** to shorter names:
   `projectDataValue`, `projectStoredValue`, `projectStoredMap`,
   `projectDisplayedOutputs`, `serializeDisplayedOutputs`,
   `isVisiblePort`. Keep `projectStoredMap` as a standalone helper (it has
   3 call sites). Keep the `NodeOutputCopyValueProjector` type here as the
   canonical home; update imports in `useNodeTypes.ts` and the projectors
   file.
3. **Shrink `nodeOutputCopyValueProjectors.ts`:**
   - Replace the eight metric-visibility helpers with two:
     `isPositiveMetric(value, index?)` (for scalar or array check) and
     `hasAnyCarrier(metrics, index?)`.
   - Rewrite `getChatNodeCopyValueData` to restore each port value once,
     check its visibility, and push the projected value straight into the
     result array. Drop `CHAT_META_PORT_IDS` constant and the redundant
     per-port if/else chain.
   - Simplify `getSubGraphNodeCopyValueData` ceremony but **preserve the
     `bodyPortIds.length === 1` key-preserving branch** (see Risks).
   - Drop `compareNumericPortSuffixes` in favor of a direct inline
     numeric-suffix extraction (one call site in
     `getLoopControllerNodeCopyValueData`).
4. **Keep `executionDataReaders.ts` as is.** It has 9+ external consumers.
   Only shorten `getStoredWarningsForNodeOutput` to `getStoredOutputWarnings`
   (blast radius: 3 files — the definition, `NodeOutput.tsx`, and
   `executionDataReaders.test.ts`).
5. **Update both test files** (`executionDataCopyValue.test.ts` and
   `nodeOutputCopyValueProjectors.test.ts`) to use the new import paths/names.
   Both use `node:test` and will continue to work.

### Risks

- **`getSubGraphNodeCopyValueData` single-port key-preservation behavior.**
  When there is exactly 1 body port, `projectStoredMap` returns the
  **unwrapped value** (not a `{ portId: value }` object). Then
  `getSubGraphNodeCopyValueData` re-wraps it using the actual port ID as the
  property key: `result[bodyPortIds[0]!] = projectedBody`. This preserves the
  port name (e.g., `"response"`, `"data"`) in the output. Removing this
  branch would lose the key and silently change copy behavior.
  **Mitigation:** Explicitly preserve the `bodyPortIds.length === 1` branch.
  Simplify only the surrounding ceremony (fewer intermediate variables, less
  branching for the no-metrics case).
- **`isVisibleCopyValuePort` semantic fit.** This filtering utility is in
  `executionDataCopyValue.ts` but is conceptually a port-classification
  concern, not a projection concern. After renaming the file, consider whether
  it should move to `executionDataReaders.ts` (where the port-map restore
  functions live) or stay put. Moving it would add an import cycle risk since
  `executionDataCopyValue.ts` imports from `executionDataReaders.ts`.
  **Mitigation:** Keep it in the renamed file; the slight semantic mismatch
  is harmless and avoids import-cycle complications.
- **Rename blast radius for `executionDataCopyValue.ts`.** The file is
  imported by 5 modules + 2 test files. Renaming the file (not just exports)
  requires updating all of them. **Mitigation:** Do the rename as one atomic
  commit with `tsc --noEmit` verification. Alternatively, only rename the
  exports and keep the filename to reduce churn.

### Net effect
- `nodeOutputCopyValueProjectors.ts` shrinks from ~256 to ~130 lines.
- `executionDataCopyValue.ts` shrinks modestly (~20 lines through name
  shortening).
- `nodeOutputCopyActions.ts` renamed/shortened (~10 lines saved).
- Both test files stay, updated for renames.

---

## DONE — Feature #57 — Fullscreen in-preview search

This is the largest feature by code volume and the biggest opportunity.

### Current shape

- [fullscreenOutputSearchDom.ts](packages/app/src/components/nodeOutput/fullscreenOutputSearchDom.ts)
  (~309 lines): DOM tokenization, block building, highlight apply/clear,
  boundary tag set, provider attribute constants.
- [fullscreenOutputSearch.ts](packages/app/src/components/nodeOutput/fullscreenOutputSearch.ts)
  (~112 lines): Pure search helpers (`normalize`, `findMatchOffsets`,
  `getWrappedIndex`, `projectMatches`).
- [useFullscreenOutputSearch.ts](packages/app/src/components/nodeOutput/useFullscreenOutputSearch.ts)
  (~277 lines): Main hook orchestrating state, provider registry,
  `Ctrl/Cmd+F`, highlighting, scroll-into-view.
- [FullscreenOutputSearchContext.tsx](packages/app/src/components/nodeOutput/FullscreenOutputSearchContext.tsx)
  (~13 lines): Provider context.
- [FullscreenNodeOutputToolbar.tsx](packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx)
  (~178 lines): Toolbar UI with search group.
- [useLargeStoredValueFullscreenSearch.ts](packages/app/src/components/renderDataValue/useLargeStoredValueFullscreenSearch.ts)
  (~177 lines): Provider hook for ref-backed large previews.
- [fullscreenOutputSearch.test.ts](packages/app/src/components/nodeOutput/fullscreenOutputSearch.test.ts)
  (~95 lines, `node:test`): 8 tests for pure helpers + boundary tags.

### Problems

1. **Dual block representations.** `FullscreenOutputSearchBlock` (DOM-backed)
   and `FullscreenOutputSearchProjectableBlock` (pure) carry the same
   information. `useFullscreenOutputSearch` maps the DOM blocks to pure ones
   then calls `projectFullscreenOutputSearchMatches`, which re-searches each
   block's `text`. A single block type with `matches: number[]` attached
   during build removes the mapping step and the separate projection pass.

2. **Token-then-block two-phase build.** `buildFullscreenOutputSearchBlocks`
   first produces tokens (`text | separator | provider`) and then folds
   adjacent text tokens into blocks. The same output can be produced with one
   recursive DOM walk that pushes directly to `blocks` and uses a "current
   block" accumulator. This removes one data structure and ~30 lines.

3. **Boundary-tag allowlist.** The 30-element set includes tags like
   `ARTICLE`, `ASIDE`, `FIELDSET`, `FIGCAPTION`, `FIGURE`, `FOOTER`, `FORM`,
   `HEADER`, `MAIN`, `NAV`, `SECTION` — none of which are generated by
   the markdown renderer (`marked`) or by any of the output renderers
   (verified: `createScalarRenderers.tsx` produces `<div>`, `<pre>`, `<span>`;
   `marked` produces `<p>`, `<h1-6>`, `<ul>`, `<ol>`, `<li>`, `<table>`,
   `<thead>`, `<tbody>`, `<tr>`, `<td>`, `<th>`, `<blockquote>`, `<hr>`,
   `<pre>`, `<code>`). The set can be reduced to ~15 actually-used tags.

4. **Naming.** Almost every export begins with `FullscreenOutputSearch` or
   `fullscreenOutputSearch`. Module-scoped names would read better.

5. **`useFullscreenOutputSearch` hook is too large.** The layout effect
   (~110 lines, starting at line 137) has `currentMatchIndex` in its
   dependency array (line 245), meaning **every arrow-key navigation
   rebuilds all blocks, re-searches all text, tears down all DOM highlights,
   and re-applies them from scratch**. This is the main performance issue.

6. **Highlight spans lack index attributes.** `applyFullscreenOutputSearchHighlights`
   creates `<span>` elements with only `data-fullscreen-output-search-match="true"`
   and a CSS class — **no match-index data attribute**. A split-effect design
   needs index attributes to find the active span without re-walking.

### Proposed changes

1. **Merge `fullscreenOutputSearch.ts` and `fullscreenOutputSearchDom.ts`**
   into one module `fullscreenOutputSearch.ts` under
   `components/nodeOutput/`. Remove the pure/DOM duplication.

2. **Single `SearchBlock` type** with this shape:
   ```ts
   type SearchBlock =
     | { kind: 'text'; textNodes: Text[]; text: string; matches: number[] }
     | { kind: 'provider'; providerId: string; matches: number[] };
   ```
   Build it in one DOM pass with `matches` populated as each text block is
   closed (providers carry offsets sourced from the provider's
   `getMatchOffsets(query)`). This removes `FullscreenOutputSearchToken`,
   `FullscreenOutputSearchProjectableBlock`, and `projectMatches`.

3. **Shorten all search-related identifiers** to module-scoped names:
   `buildSearchBlocks`, `applyHighlights`, `clearHighlights`,
   `collectTextNodes`, `MATCH_CLASS`, `MATCH_ACTIVE_CLASS`,
   `PROVIDER_ATTRIBUTE`, `findMatchOffsets`, `wrapMatchIndex`.

4. **Reduce the boundary tag set** to the tags actually produced by
   `marked` and the output renderers:
   ```ts
   // DL included for completeness; DT/DD omitted as marked doesn't produce
   // them without extensions. If definition-list markdown is enabled in the
   // future, add DT and DD here.
   const BOUNDARY_TAGS = new Set([
     'BLOCKQUOTE', 'DIV', 'DL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
     'HR', 'LI', 'OL', 'P', 'PRE', 'TABLE', 'TBODY', 'TD', 'TH',
     'THEAD', 'TR', 'UL',
   ]);
   ```

5. **Split the main layout effect into two phases within one effect.**

   The original plan proposed two separate `useLayoutEffect` hooks, but React
   does **not guarantee execution order** between multiple layout effects on
   the same component when their dependencies change simultaneously. If query
   changes and `currentMatchIndex` resets to 0 in the same render, Effect B
   could run before Effect A, finding stale or missing highlight spans.

   **Revised approach:** Keep a **single `useLayoutEffect`** but restructure
   it into two phases:
   - **Phase 1 (rebuild):** When `contentKey`, `query`, or `providersVersion`
     changed since the last run (tracked via a ref holding previous values),
     clear all highlights, build the one-pass block list, compute a flat
     `matches[]` array, and apply all highlights to the DOM **with
     `data-match-index="N"` attributes** on each `<span>`. Store `matches`
     on a ref. Update `totalMatchCount` state. No match is marked active.
   - **Phase 2 (activate):** Runs every time (after Phase 1 if applicable).
     Finds the previously active span (via `MATCH_ACTIVE_CLASS`) and removes
     the active class. Finds the new active span via
     `[data-match-index="${currentMatchIndex}"]`, adds the active class, and
     calls `scrollIntoView`. For provider matches, calls
     `provider.activateMatch(localIndex)` / `clearActiveMatch()`.

   This keeps navigation cheap (Phase 1 is skipped when only
   `currentMatchIndex` changed — the ref-tracked previous values of
   `contentKey`/`query`/`providersVersion` haven't changed, so Phase 1 is
   a no-op) while avoiding the effect-ordering race condition.

6. **Keep `providersVersion` as-is.** The manual bump counter is the correct
   pattern for tracking mutations to a mutable ref.

7. **Keep `useStableCallback` for `goToNextMatch`/`goToPreviousMatch`.**
   These are passed as props to `FullscreenNodeOutputToolbar`; using plain
   `useCallback` would cause unnecessary toolbar re-renders.

8. **Keep all refs in `useLargeStoredValueFullscreenSearch`.**
   The original plan proposed replacing `currentSearchQueryRef` and
   `currentSearchMatchOffsetsRef` with `useMemo`, but this is architecturally
   unsound: the provider's `getMatchOffsets(query)` receives `query` as a
   callback parameter from the parent hook's layout effect, not as a prop or
   state the child can memo on. The child has no knowledge of what query value
   to use until the callback fires. The refs must stay.

   Simplifications that **are** safe:
   - Reduce `showFullRef` / `chunkPageRef` to one combined ref object.
   - Inline the provider object construction to reduce closure nesting.

9. **FullscreenNodeOutputToolbar** — collapse CSS by merging the identical
   `.copy-button` / `.prompt-designer-button` rules into a shared
   `.toolbar-icon` class. Save ~20 lines of CSS.

10. **Trim the test file.** Drop tests for `normalizeFullscreenOutputSearchQuery`
    (it's `toLocaleLowerCase`), `getWrappedFullscreenOutputSearchMatchIndex`
    (it's `%`), and the exhaustive `isFullscreenOutputSearchBoundaryTagName`
    assertions (the tag set is self-documenting). Keep the `findMatchOffsets`
    and `projectFullscreenOutputSearchMatches` tests (updated for the new
    single-block-type API).

### Risks

- **Effect-ordering race condition.** Two separate `useLayoutEffect` hooks
  whose dependencies change in the same render do not have a guaranteed
  execution order in React. If Effect A (highlight rebuild) and Effect B
  (activate match) are separate effects, Effect B may query the DOM before
  Effect A has applied the new highlight spans, finding nothing or stale data.
  **Mitigation:** Use a single `useLayoutEffect` with two phases (Phase 1:
  rebuild if inputs changed, Phase 2: toggle active). The "did inputs change?"
  check is a ref comparison, not a dependency split.

- **`clearFullscreenOutputSearchHighlights` correctness with new attributes.**
  The clear function queries `[data-fullscreen-output-search-match="true"]`
  and unwraps the spans. Adding `data-match-index` to those same spans does
  not interfere: the query selector matches on the primary attribute
  regardless of other attributes, and `normalize()` cleans up text nodes
  after unwrapping. **Verified safe.**

- **Highlight clear scope isolation.** `clearHighlights` is called from both
  the parent hook (on `fullscreenOutputBodyRef.current` — the entire output
  panel) and the child large-preview hook (on `contentRef.current` — a nested
  chunk preview div). These are different DOM subtrees; clearing one does not
  affect the other. **Verified safe.**

- **Provider registration timing.** The child's layout effect registers a
  provider, which bumps `providersVersion`, which re-triggers the parent's
  layout effect. React guarantees child layout effects run before parent
  cleanup, so the provider is registered before the parent reads it.
  **Verified safe.**

- **Markdown toggle and DOM rebuilds.** `contentKey` includes
  `renderMarkdown`, so toggling markdown triggers Phase 1 (full highlight
  rebuild). React's VDOM reconciliation replaces the DOM content (plain
  `<pre>` vs `<div dangerouslySetInnerHTML>`), and Phase 1 then re-applies
  highlights to the new DOM. **Verified safe.**

- **Boundary tag reduction.** `marked` does not produce `<dl>`, `<dt>`, or
  `<dd>` tags by default (definition lists require a GFM extension that is
  not currently enabled). If definition lists are enabled in the future, `DT`
  and `DD` must be added to the boundary set. **Mitigation:** Add a comment
  in the code documenting this dependency.

### Net effect
- `fullscreenOutputSearch.ts` + `fullscreenOutputSearchDom.ts` merge into one
  ~220-line file (from ~420 lines combined).
- `useFullscreenOutputSearch.ts` shrinks from ~277 to ~190 lines by the
  single-effect two-phase rewrite.
- `useLargeStoredValueFullscreenSearch.ts` shrinks from ~177 to ~155 lines
  (combine two refs into one, inline provider construction).
- `FullscreenNodeOutputToolbar.tsx` loses ~20 CSS lines.
- `fullscreenOutputSearch.test.ts` shrinks from ~95 to ~60 lines.

---

## Execution order

The refactors are mostly independent but share the naming overhaul and the
`resolveCodeEditorTheme` helper. Recommended order:

1. **Feature #54** first — smallest surface, unlocks test cleanup.
2. **Feature #55** next — inlines `isResizableNodeCodeEditorLanguage`, merges
   sizing module, removes pass-through component. Changes are localized to
   `editors/CodeEditor.tsx` and its hook.
3. **Feature #56** — rename & collapse in `executionDataCopyValue.ts`,
   `nodeOutputCopyValueProjectors.ts`, shorten `nodeOutputCopyActions.ts`.
   Verify with existing test files (both `node:test`, updated for renames).
4. **Feature #57** — the largest change. Do the single-block-type refactor
   first, then the two-phase effect rewrite (including adding
   `data-match-index` attributes to highlight spans), then the toolbar CSS
   cleanup last.

## Verification

All test files in this area use **`node:test`** (run via
`npx tsx --test src/**/*.test.ts` in `packages/app`), not vitest.

Each step should be guarded by:
- `npx tsx --test src/**/*.test.ts` in `packages/app` (for the `node:test`
  unit tests covering copy-projectors, search helpers, sizing helpers).
- `npx tsc --noEmit` in `packages/app`.
- Manual smoke of: Monaco folding gutter visible only in opted-in editors,
  resize drag persists per node type, `Copy value` for Chat/UserInput/Loop/
  SubGraph nodes matches the preview, fullscreen `Ctrl/Cmd+F` navigates
  matches inside both plain text output and ref-backed large previews
  (including cross-chunk matches).

## Quantitative summary (approximate lines saved)

| Area | Before | After | Saved |
|------|-------:|------:|------:|
| Feature #54 (options + tests) | ~230 | ~50  | ~180 |
| Feature #55 (sizing + viewports + tests) | ~280 | ~180 | ~100 |
| Feature #56 (projectors + actions + tests) | ~720 | ~560 | ~160 |
| Feature #57 (search + DOM + hooks + tests) | ~970 | ~650 | ~320 |
| **Total** | **~2200** | **~1440** | **~760** |

These are revised estimates after three rounds of reassessment. The reduction
is ~35% — more conservative than the original ~45% estimate, reflecting the
following discoveries:
- Feature #55: Viewport components cannot be fully collapsed due to atom
  subscription overhead; only the pass-through is removed.
- Feature #56: `nodeOutputCopyActions.ts` is kept (shortened, not deleted)
  to avoid bloating `NodeOutput.tsx`; `getSubGraphNodeCopyValueData`'s
  single-port key-preservation branch must stay.
- Feature #57: The two-effect split was revised to a single effect with
  two phases (avoids effect-ordering race); `useLargeStoredValueFullscreenSearch`
  refs must largely stay (parent calls child callbacks from layout effects,
  not from props/state).
