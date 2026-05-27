# Repo File Tree Refactor Plan

## Goal

Improve the repository file tree without changing runtime behavior, public package APIs, project YAML shape, CLI behavior, app UI behavior, docs routes, or build outputs.

This is a structural cleanup plan only. Every phase must be mechanically verifiable, small enough to review, and reversible. Do not delete or move a file only because it "looks old"; prove it is unused or replace it through a compatibility-preserving move.

## Current Observations

- The monorepo is organized as Yarn workspaces under `packages/*`: `core`, `node`, `app`, `app-executor`, `cli`, `trivet`, and `docs`.
- The tracked package file counts are roughly:
  - `packages/app`: 869 tracked files
  - `packages/docs`: 432 tracked files
  - `packages/core`: 336 tracked files
  - `packages/node`: 48 tracked files
  - `packages/cli`: 16 tracked files
  - `packages/app-executor`: 15 tracked files
  - `packages/trivet`: 11 tracked files
- The working directory contains generated/local folders such as `dist`, `node_modules`, `.rivet-built-packages`, local runtime folders, temporary icon/signing folders, and build stats. These appear ignored or untracked today, but they still make local tree inspection noisy.
- `packages/native-runtime/native/src` currently exists as an empty local directory tree. Because it has no package manifest or tracked files, it should be treated as local workspace residue unless future evidence proves otherwise.
- `developer-docs/APP-ARCHITECTURE.md` has grown very large. It should probably be split by domain, but only after adding a discoverable index and preserving existing links.
- `packages/app/src/components` is the largest app source area and contains both broad component buckets and more domain-specific subfolders (`nodeCanvas`, `graphList`, `nodeOutput`, `visualNode`, `promptDesigner`, etc.).
- `packages/app/src/domain` currently has very little content compared with `components`, `hooks`, `state`, and `utils`. Pure graph-editing rules can gradually move there when they are not React-specific.
- Several very small files are legitimate public contracts or focused helpers, but they should be audited for unnecessary shim/barrel layers before any move/delete work.
- `packages/core/src/model/nodes` contains many built-in node implementations. Node-adjacent tests, fixtures, and metadata should be reviewed for consistent locality.
- `packages/node/bench` contains important performance benchmarks. These should remain easy to discover and should not be confused with product runtime code.
- `scripts/` is small but mixes wrapper build targets, packaging, CI timing, version sync, and test-style checks. A light grouping may make intent clearer if imports and package scripts stay stable.

## Non-Goals

- No behavior changes.
- No package renames.
- No public export removals.
- No node type id, port id, graph YAML, recording, or Remote Debugger wire-shape changes.
- No test rewrite for its own sake.
- No dependency upgrades.
- No formatting-only churn across unrelated files.
- No "big bang" app folder reshuffle.

## Hard Compatibility Boundaries

Treat these as contracts:

- Published package entrypoints:
  - `@valerypopoff/rivet2-core`
  - `@valerypopoff/rivet2-node`
  - `@valerypopoff/rivet2-cli`
  - `@valerypopoff/trivet`
- Hosted app exports from `packages/app/package.json`:
  - `.`
  - `./host`
  - `./styles`
- CLI command names, flags, input parsing, Docker files, and shell entrypoints.
- Tauri app sidecar expectations under `packages/app/src-tauri` and `packages/app-executor`.
- Wrapper-facing build scripts:
  - `build:runtime`
  - `build:hosted-web-deps`
  - `build:executor-runtime`
  - `build:npm-public`
  - `build:packages:local`
- Developer docs and user docs links.
- GitHub workflow paths and artifact/script names.

## Complexity Budget

Use these rules to keep the refactor from becoming a second architecture project:

- Do not create empty folders to match a desired shape. Create a folder only when a real file moves into it.
- Prefer deleting or inlining proven-unused shims over adding new abstraction layers.
- Keep compatibility shims temporary, named, and documented. If a shim cannot have a clear removal condition, reconsider the move.
- Do not add import-boundary enforcement until at least two cleanup batches prove the boundary is stable.
- One batch should improve one ownership boundary. If a batch needs app, core, docs, and scripts changes at once, split it.
- A move must make ownership clearer, imports shorter, tests more local, or docs easier to find. If it only makes the tree look nicer, do not do it.
- The program can stop after any phase if the remaining cleanup is mostly aesthetic.

## Phase 0 - Baseline Inventory (Required Before Any Refactor)

Purpose: produce a checked-in or attached inventory that separates tracked source structure from local build noise.

Tasks:

1. Record tracked file counts by top-level area and workspace:
   ```powershell
   git ls-files | ForEach-Object { ($_ -split '/')[0] } | Group-Object | Sort-Object Count -Descending
   git ls-files packages | ForEach-Object { ($_ -split '/')[1] } | Group-Object | Sort-Object Count -Descending
   ```
2. Record ignored/untracked local-noise directories:
   ```powershell
   git status --short --ignored
   ```
3. Record public package entrypoints and scripts:
   ```powershell
   Get-Content package.json
   Get-Content packages/core/package.json
   Get-Content packages/node/package.json
   Get-Content packages/app/package.json
   Get-Content packages/app-executor/package.json
   Get-Content packages/cli/package.json
   Get-Content packages/trivet/package.json
   ```
4. Record import-boundary violations and deep imports:
   ```powershell
   rg -n 'from ["'']@valerypopoff/.+/src|from ["'']\.\./\.\./\.\.' packages -g "*.ts" -g "*.tsx" -g "*.mts"
   ```
5. Record thin files for manual review, not automatic deletion:
   ```powershell
   Get-ChildItem packages -Recurse -File -Include *.ts,*.tsx,*.mts |
     Where-Object { (Get-Content $_.FullName | Measure-Object -Line).Lines -le 12 } |
     Select-Object FullName
   ```
6. Record large source directories:
   ```powershell
   git ls-files packages/app/src | ForEach-Object { ($_ -split '/')[3] } | Group-Object | Sort-Object Count -Descending
   git ls-files packages/core/src | ForEach-Object { ($_ -split '/')[3] } | Group-Object | Sort-Object Count -Descending
   ```

Exit criteria:

- A current inventory exists in the refactor PR description or a temporary local note.
- No files moved or deleted yet.
- Baseline verification commands pass.

Baseline verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs test:core
node .yarn\releases\yarn-4.6.0.cjs test:node
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet-app run build
node .yarn\releases\yarn-4.6.0.cjs test:docs
git diff --check
```

Risks:

- Inventory can become stale quickly if local generated folders differ between machines.
- Thin-file and deep-import searches can produce false positives; treat them as review queues, not deletion lists.
- Baseline commands can be slow on a cold checkout; slowness is not itself evidence that the file tree needs restructuring.

## Phase 1 - Local Noise And Ignore Hygiene

Purpose: make local tree inspection trustworthy before moving source files.

Tasks:

1. Confirm ignored generated folders are not tracked:
   - `dist`
   - `node_modules`
   - `.rivet-built-packages`
   - `.local-node`
   - `.node-runtime`
   - `packages/app/stats.html`
   - `packages/app/tmp-icon-test`
   - `tmp-macos-signing-test`
   - `tmp-rivet-icon-test`
2. Remove or ignore empty local residue only when it is untracked and reproducible. Candidate: `packages/native-runtime/native/src`.
3. Confirm `.fixtures/` is intentionally ignored but documented as local benchmark input. If any fixture should be shared, move it to a tracked, clearly named location such as `bench/fixtures` or `packages/node/bench/fixtures`.
4. Add or adjust `.gitignore` only for reproducible local/build artifacts.
5. Do not delete any tracked artifact in this phase unless its generation path and consumers are proven.

Exit criteria:

- `git status --short --ignored` is readable.
- Generated/local paths are either ignored or intentionally documented.
- No source imports changed.

Verification:

```powershell
git status --short --ignored
git ls-files | rg "(^|/)(dist|node_modules|tsconfig\\.tsbuildinfo|stats\\.html|tmp-|\\.rivet-built-packages|\\.local-node|\\.node-runtime)/|stats\\.html|tsconfig\\.tsbuildinfo"
git diff --check
```

Risks:

- A local-only folder may still be useful to a developer for benchmarks, signing, or temporary fixtures.
- A broad ignore pattern can hide files that should have been reviewed or committed.
- Moving shared fixtures out of `.fixtures/` can accidentally change benchmark reproducibility.

## Phase 2 - Public Entrypoint And Shim Audit

Purpose: identify thin shims that are useful contracts versus shims that only add navigation friction.

Tasks:

1. Classify every `index.ts`, `api.ts`, short `types.ts`, and short helper under `packages/*/src`.
2. Mark each as one of:
   - public package entrypoint
   - internal barrel needed to keep imports stable
   - type-only contract
   - test helper
   - obsolete shim candidate
3. For public entrypoints, add comments only if the file is easily mistaken for unused.
4. For obsolete shim candidates, either:
   - inline imports and delete the shim in a tiny PR, or
   - keep the shim and document why it exists.
5. Avoid deleting compatibility barrels in published packages unless a deprecation path is added.

Likely audit areas:

- `packages/core/src/index.ts`
- `packages/core/src/model/chat-v2/index.ts`
- plugin `index.ts` files under `packages/core/src/plugins/*`
- `packages/trivet/src/index.ts`
- `packages/app/src/components/trivet/api.ts`
- short app hooks that only forward another hook
- short state files that only re-export atom state

Exit criteria:

- Every retained shim has a reason.
- Every removed shim has updated imports and focused tests.
- Public exports are unchanged unless explicitly intended and documented.

Verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-core run build
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-node run build
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/trivet run build
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-cli run build
git diff --check
```

Risks:

- Short files are often deliberate API contracts; deleting them can break external users even when internal imports still build.
- Adding explanatory comments to too many retained shims can add noise instead of clarity.
- Replacing barrels with deep imports can make later package-boundary cleanup harder.

## Phase 3 - App Source Domain Boundaries

Purpose: reduce the pressure on `packages/app/src/components`, `hooks`, `state`, and `utils` by moving pure rules to domain folders without changing UI behavior.

Possible end-state shape, not a required skeleton:

```text
packages/app/src/
  assets/
  commands/
  components/
    graphList/
    nodeCanvas/
    nodeEditor/
    nodeOutput/
    promptDesigner/
    settings/
    trivet/
    visualNode/
  domain/
    graphEditing/
    graphNavigation/
  hooks/
  io/
  providers/
  state/
    atoms/
    selectors/
    snapshots/
  utils/
```

Rules:

- Create domain subfolders only when multiple pure helpers naturally belong together.
- React components stay in `components`.
- Pure model/rule functions move to `domain/<feature>`.
- Jotai atoms/selectors stay under `state`.
- Browser/environment adapters stay under `io` or `providers`, not `utils`.
- Generic utilities stay under `utils` only when they are truly cross-feature.
- Tests should move with the pure helper they test.

Candidate moves to audit:

- Pure node canvas helpers in `components/nodeCanvas` that do not render React.
- Pure node output formatting helpers in `components/nodeOutput`.
- Graph list sorting, filtering, and reference-indicator logic.
- Frozen-output menu and visual rules, if they keep growing.
- Pure graph-editing helpers currently in hooks or components.

Exit criteria:

- No component imports from a deeper component folder unless it is a local sibling feature.
- Pure helpers have focused tests near their new location.
- Imports get shorter or clearer, not just different.

Verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet-app exec tsx --test "src/**/*.test.ts"
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet-app run build
git diff --check
```

Risks:

- Over-splitting app code can make small UI features harder to follow.
- Moving React-adjacent helpers too far from their components can create awkward imports or accidental cycles.
- Test relocation can hide behavior context if the test is more about UI composition than pure rules.

## Phase 4 - Core Runtime Structure

Purpose: make `packages/core/src` easier to navigate while preserving node ids, exports, and runtime behavior.

Possible end-state shape, not a required skeleton:

```text
packages/core/src/
  api/
  integrations/
  model/
    nodes/
    chat/
    chat-v2/
  plugins/
  recording/
  utils/
  vendor/
```

Tasks:

1. Audit `model` files that are graph execution concepts and consider grouping them only if a clear cluster emerges.
2. Keep built-in nodes discoverable under `model/nodes`.
3. Keep plugin-owned nodes under `plugins/<provider>/nodes`.
4. Avoid moving anything that would destabilize serialized node type names or public imports.
5. Add internal README files only for directories where naming alone is not enough.

Candidate areas:

- Graph processor and run planning files.
- Recording player versus recorder ownership.
- Chat v1/v2 compatibility helpers.
- Native/runtime bridge helpers if any are no longer used after removing the opt-in native runtime experiment.

Exit criteria:

- Core public exports remain stable.
- Runtime tests pass before and after each batch.
- Important moved files have compatibility import updates in one commit.

Verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-core run test
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-core run build
git diff --check
```

Risks:

- Core file moves can break public exports, wrapper deep imports, benchmarks, or tests that intentionally exercise source paths.
- Runtime concepts such as recordings, debugger lifecycle, graph outputs, and subprocessors are tightly coupled; separating them too aggressively can obscure invariants.
- Node ids, serialized data, and port ids must remain unchanged even if files move.

## Phase 5 - Node Package, App Executor, And CLI Boundaries

Purpose: keep headless runtime, debugger transport, executor sidecar, and CLI responsibilities distinct.

Tasks:

1. Audit `packages/node/src` for files that are really:
   - public Node API
   - debugger transport
   - Node code runner
   - native Node adapters
2. Keep benchmarks in `packages/node/bench`, but make benchmark fixtures and output paths explicit.
3. Audit `packages/app-executor/bin`. If non-entrypoint implementation files keep growing, consider moving internals to `src` and keeping `bin` for executable entrypoints only.
4. Audit `packages/cli/src` versus Docker/shell files at package root. Keep Docker-facing files where Docker build context expects them unless the Dockerfile is updated in the same commit.
5. Confirm wrapper-facing scripts continue to consume the same build outputs.

Exit criteria:

- `bin` directories contain true entrypoints or documented exceptions.
- Node debugger/runtime files are grouped by responsibility.
- CLI package layout remains friendly to npm users and Docker builds.

Verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs test:node
node .yarn\releases\yarn-4.6.0.cjs test:app-executor
node .yarn\releases\yarn-4.6.0.cjs test:cli
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet-app-executor run build
git diff --check
```

Risks:

- Moving app-executor files can break `pkg`, sidecar naming, Tauri bundling, or wrapper Docker assumptions.
- Moving CLI root files can break npm package consumers or Docker build contexts even if TypeScript still builds.
- Benchmarks lose value if fixtures or output paths become harder to reproduce.

## Phase 6 - Docs Tree Split And Indexing

Purpose: make developer docs easier to maintain without breaking user docs routes.

Tasks:

1. Add `developer-docs/README.md` or a root developer-docs index if not present.
2. Split oversized developer docs by domain:
   - app canvas and graph list
   - app execution UI
   - core graph processor
   - remote debugger and recordings
   - build, packaging, and wrapper contracts
3. Keep old file names as short redirect/index documents when external references may exist.
4. Update links from root README and related docs.
5. Keep user docs under `packages/docs/docs` route-stable unless intentionally changing docs navigation.

Exit criteria:

- Every developer doc has a clear owner/topic.
- No duplicated stale behavior descriptions remain after split.
- User docs typecheck still passes.

Verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs test:docs
rg -n "APP-ARCHITECTURE|CORE-ENGINE|EXECUTION-DATA-FLOW|BUILD-AND-CI|PACKAGES" README.md developer-docs packages/docs/docs
git diff --check
```

Risks:

- Splitting docs can create stale duplicate behavior descriptions.
- Short redirect documents can become permanent clutter if they are not treated as compatibility shims.
- Broken links in developer docs are easy to miss because not every doc path is route-checked like user docs.

## Phase 7 - Scripts And Build Tooling Layout

Purpose: keep root `scripts/` discoverable as build tooling grows.

Possible target shape if script count keeps growing:

```text
scripts/
  build/
  ci/
  release/
  checks/
```

Candidate classification:

- `build-wrapper-target.mjs` -> `scripts/build/`
- `create-built-package-artifacts.mjs` -> `scripts/build/` or `scripts/release/`
- `measure-build-phases.mjs` -> `scripts/ci/` or `scripts/build/`
- `ci-timing.mjs` -> `scripts/ci/`
- `publish-npm-packages.mjs` -> `scripts/release/`
- `sync-desktop-version.mjs` -> `scripts/release/` or `scripts/checks/`
- `check-test-style.mjs` -> `scripts/checks/`

Rules:

- Do not move scripts only to satisfy the folder shape; move them when callers and ownership are clear.
- Update package scripts in the same commit as moves.
- Check GitHub workflows for script paths.
- Check docs that mention script paths.
- Keep script names stable where wrapper developers or release automation may call them directly; otherwise provide a compatibility shim for one release.

Exit criteria:

- Root `scripts/` no longer mixes unrelated concerns in a flat list.
- All package scripts and workflows still resolve.

Verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs build:runtime
node .yarn\releases\yarn-4.6.0.cjs build:hosted-web-deps
node .yarn\releases\yarn-4.6.0.cjs test:style
git diff --check
```

Risks:

- Wrapper repos, release scripts, or humans may call root script paths directly.
- Compatibility shims for moved scripts can outlive their usefulness and add the same clutter this phase is trying to remove.
- Some verification commands are expensive; use focused smoke checks before full build timing runs.

## Phase 8 - Dependency And Import Boundary Enforcement

Purpose: prevent the tree from drifting back after cleanup.

Tasks:

1. Add an import-boundary check only after the cleanup has produced stable, repeatedly useful boundaries.
2. Block cross-package imports from another package's `src` except explicitly allowed app host/editor seams.
3. Block app components from importing deep sibling feature internals where a domain helper or public feature index exists.
4. Add a repo-structure check script only after the desired structure is stable.
5. Document exceptions in the check script, not in scattered comments.

Exit criteria:

- Either the new structure is enforced by CI, or this phase is explicitly skipped because enforcement would add more churn than protection.
- Allowed exceptions are few, named, and documented when enforcement exists.

Verification:

```powershell
node .yarn\releases\yarn-4.6.0.cjs lint
node .yarn\releases\yarn-4.6.0.cjs test:style
git diff --check
```

Risks:

- Enforcing boundaries too early can freeze a bad intermediate structure.
- Broad lint rules can create high-churn mechanical fixes with little tree-quality gain.
- Exception lists can become a hiding place for real violations if they are not reviewed regularly.

## Unused File Audit Method

Use multiple signals before deleting anything:

1. Static import search:
   ```powershell
   rg -n "fileBaseNameWithoutExtension" packages scripts developer-docs .github README.md
   ```
2. TypeScript build reachability:
   ```powershell
   node .yarn\releases\yarn-4.6.0.cjs workspace <workspace> run build
   ```
3. Package export reachability:
   - inspect `package.json` `exports`, `bin`, `files`, `main`, `module`, `types`
4. Runtime/config reachability:
   - Vite config
   - Tauri config
   - GitHub workflows
   - package scripts
   - Dockerfiles
   - docs imports/assets
5. Test reachability:
   - direct test imports
   - test fixtures
   - benchmark fixtures

Only delete a file when all relevant signals agree or when a replacement compatibility path is present.

## Batch Strategy

Each refactor batch should be one of:

- local-noise cleanup
- docs split/index update
- one package public-entrypoint audit
- one app feature folder move
- one core runtime folder move
- one script folder move
- one import-boundary enforcement change

Avoid batches that mix app UI moves, core runtime moves, and docs restructuring.

## Stop Conditions

Pause or stop the refactor program when any of these are true:

- The next change is mostly aesthetic and does not improve ownership, imports, tests, docs, or local tree inspection.
- A proposed move needs more compatibility shims than files it clarifies.
- Import cycles appear and the fix requires broader design work.
- Verification cost for a batch is larger than the likely maintenance benefit.
- External wrapper, CLI, package export, or docs-route compatibility becomes uncertain and cannot be checked locally.

## Required Verification Matrix

Use the smallest useful verification per batch, then run the full matrix before declaring the refactor complete.

Focused checks:

```powershell
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-core run test
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-node run test
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet-app exec tsx --test "src/**/*.test.ts"
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet-app-executor run test
node .yarn\releases\yarn-4.6.0.cjs workspace @valerypopoff/rivet2-cli run test
node .yarn\releases\yarn-4.6.0.cjs test:docs
```

Full checks:

```powershell
node .yarn\releases\yarn-4.6.0.cjs test
node .yarn\releases\yarn-4.6.0.cjs lint
node .yarn\releases\yarn-4.6.0.cjs build
git diff --check
```

## Definition Of Done

The refactor is done when:

- No runtime behavior, public API, CLI behavior, docs route, project YAML shape, recording shape, or Remote Debugger wire shape changed.
- Every moved or deleted file has an evidence trail from the inventory, import search, build reachability, and runtime/config reachability checks.
- Developer docs explain the resulting structure and any compatibility shims that remain.
- Full verification passes or any skipped command has a documented, non-structural reason.
- The working tree contains only intentional source/doc changes.

## Rollback Plan

- Move files with `git mv` so renames are easy to review.
- Keep compatibility shims for public or externally referenced paths until all callers are updated.
- If a batch breaks behavior, revert only that batch instead of rolling back the entire refactor program.
- Preserve user/unrelated work in the worktree; do not use destructive cleanup commands to make the tree look neat.

## Suggested First Implementation Batch

Start with the lowest-risk cleanup:

1. Confirm whether `packages/native-runtime/native/src` is untracked empty residue.
2. Add a developer-docs index if missing.
3. Add a script or documented command set for repo tree inventory.
4. Audit the shortest app/core shim files and classify them without moving anything.
5. Pick one tiny internal app helper move from `components` to `domain` only after the inventory is reviewed.

This creates evidence and guardrails before touching the risky app/core layout.
