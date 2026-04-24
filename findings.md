# Current Findings

Last reassessed from the current working tree on 2026-04-24.

This document now tracks the post-audit resolution state. The actionable top-five findings from the codebase audit are marked `DONE` where the targeted fix is implemented. The broad architectural risks that cannot be honestly "finished" in one patch are called out as residual watchlist items instead of being hidden behind the DONE label.

Known deferred issue:

- `MCP Stdio Server Config Is Logged and Env Is Not Passed` remains intentionally out of scope because MCP work is deferred.

Verification used for the implemented fixes:

- `yarn workspace @ironclad/rivet-app run lint`
- `yarn workspace @ironclad/rivet-core exec tsx --test test/utils/runtimeLogging.test.ts test/utils/providerStreamParsing.test.ts test/model/loopControllerBreak.test.ts`
- `yarn workspace @ironclad/rivet-core build:esm`
- `yarn workspace @ironclad/rivet-node build:esm`
- `yarn workspace @ironclad/trivet build:esm`
- `yarn workspace @ironclad/rivet-app-executor run build`
- `yarn workspace @ironclad/rivet-app run build`
- `yarn workspace @ironclad/rivet-core run test`
- `git diff --check`

## 1. DONE - P1 - App lint was red, including a real React hook-order bug

Resolution:

- `PortInfo` now has a wrapper/inner component split.
- The wrapper resolves the live port definition and returns early before rendering the hook-heavy inner content.
- The inner component only mounts when the definition has a valid `dataType`, so React hook order cannot vary based on dynamic-port definition availability.
- Mechanical lint failures were cleaned up: duplicate imports, `prefer-const`, async click handler return shape, and missing hook dependencies.
- `yarn workspace @ironclad/rivet-app run lint` passes.

Adjacent code reviewed:

- `packages/app/src/components/PortInfo.tsx`
- `packages/app/src/components/NavigationBar.tsx`
- `packages/app/src/components/editors/custom/LLMChatV2ModelCatalogEditor.tsx`
- `packages/app/src/components/nodeOutput/useFullscreenOutputSearch.ts`
- `packages/app/src/components/promptDesigner/usePromptDesignerAttachedNode.ts`
- `packages/app/src/components/renderDataValue/useLargeStoredValueFullscreenSearch.ts`
- `packages/app/src/hooks/useExecutionDataFlow.ts`
- `packages/app/src/hooks/useMenuCommands.ts`
- `packages/app/src/hooks/useNodeExecutionEvents.ts`
- `packages/app/src/utils/platform/shell.ts`

Why this is considered fully implemented:

- The original high-risk issue was not "lint aesthetics"; it was a conditional hook path in `PortInfo`.
- That conditional path is gone.
- Lint now works as a regression gate again, so future hook/order mistakes should not be hidden among accepted failures.

Residual risk:

- There is no dedicated component test for the missing-port-definition hover case. The lint/build coverage catches the hook-order class of bug, but a focused UI test would still be useful if this component changes again.

## 2. DONE - P1 - Runtime execution paths logged graph data without redaction

Resolution:

- Added shared runtime logging helpers in `packages/core/src/utils/runtimeLogging.ts`.
- Default runtime logs now prefer lifecycle metadata and counts, not raw graph values.
- Port-map summaries are available but moved behind explicit debug logging where audited runtime paths need shape diagnostics.
- Provider stream JSON parsing now uses `parseProviderJsonChunk(...)`, which logs provider/chunk shape under debug mode without logging raw provider chunks.
- Executor sidecar stdout/stderr content is not logged by default; stderr is reported by byte length and the raw text is debug-only.
- Runtime logging policy is documented in `developer-docs/CORE-ENGINE.md`.

Adjacent code reviewed:

- `packages/app-executor/bin/executor.mts`
- `packages/app/src/hooks/executorSidecarRuntime.ts`
- `packages/app/src/hooks/useGetAdHocInternalProcessContext.ts`
- `packages/app/src/hooks/useLocalExecutor.ts`
- `packages/app/src/hooks/useProjectPlugins.ts`
- `packages/app/src/hooks/useRemoteExecutor.ts`
- `packages/core/src/plugins/anthropic/anthropic.ts`
- `packages/core/src/plugins/anthropic/nodes/ChatAnthropicNode.ts`
- `packages/core/src/utils/openai.ts`
- `packages/core/src/utils/providerStreamParsing.ts`
- `packages/core/src/utils/runtimeLogging.ts`
- `packages/trivet/src/api.ts`

Why this is considered fully implemented:

- The original payload-bearing logs were replaced or debug-gated.
- Provider parse failures no longer print raw chunks.
- Trivet normal logs no longer include output/input maps.
- App-executor normal logs no longer include input maps.
- Sidecar stderr no longer sends raw child-process text into the generic app error logger by default.

Remaining intentionally allowed logs:

- Lifecycle/status logs such as executor startup, plugin loaded, run started, test started, test finished.
- Missing Trivet graph diagnostics with graph ids.
- Redacted error summaries that include error name and a truncated message but omit stacks and original objects.

Residual risk:

- `handleError(...)` elsewhere in app code can still log full normalized errors. That is outside the runtime/provider paths fixed here. If the product wants one global no-raw-error policy, `handleError` should become the next audit target.
- Debug logging is explicit but still diagnostic logging. Developers should not enable `RIVET_DEBUG_RUNTIME_LOGS=true` or `rivet.debugRuntimeLogs=true` in shared/customer environments unless they accept the diagnostic exposure.

## 3. DONE - P2 - GraphProcessor had risky suppressed loop-controller logic

Resolution:

- Added `packages/core/src/model/loopControllerBreak.ts`.
- `GraphProcessor` now delegates loop-controller break detection to `didLoopControllerBreak(...)`.
- The `loop-not-broken` sentinel is exported from that helper and reused by `GraphProcessor`, so the policy no longer depends on duplicated string literals.
- The suspicious inline expression with an unreachable nullish fallback was removed.
- The loop break sentinel behavior is covered by `packages/core/test/model/loopControllerBreak.test.ts`.
- The broader `GraphProcessor` god-object risk is not falsely claimed as solved; only the concrete unsafe loop-controller branch is fixed.

Adjacent code reviewed:

- `packages/core/src/model/GraphProcessor.ts`
- `packages/core/src/model/loopControllerBreak.ts`
- `packages/core/test/model/loopControllerBreak.test.ts`

Current loop-controller policy:

- `control-flow-excluded` with value `loop-not-broken` means the loop continues.
- Missing break output means the loop is treated as broken.
- Ordinary break output means the loop is broken.
- Other `control-flow-excluded` values mean the loop is treated as broken.

Why this is considered fully implemented:

- The code path that had the type suppression and confusing expression is now explicit and tested.
- The helper is narrow and does not introduce a broad abstraction layer over scheduling.

Residual risk:

- `GraphProcessor.ts` remains large and central. That is a watchlist architecture risk, not something this targeted fix can honestly complete.
- There is still an unrelated `@ts-expect-error` on `#nodesNotInCycle`; it was not part of the suspicious loop-controller branch.

## 4. DONE - P2 - Large platform sidecar binaries were tracked without an explicit policy

Resolution:

- The pnpm sidecar binaries remain tracked because Tauri consumes them directly and moving them to downloads or LFS would be a release-pipeline change.
- Added `.gitattributes` entries to classify the sidecars as vendored binary artifacts.
- Added `packages/app/sidecars/pnpm/README.md` documenting why they are tracked, who consumes them, how to update them, and what future LFS/download work would require.
- Added `packages/app/sidecars/pnpm/SHA256SUMS` with checksums for the tracked binaries.
- Documented the sidecar policy in `developer-docs/BUILD-AND-CI.md` and `developer-docs/PLUGIN-SYSTEM.md`.

Adjacent code/config reviewed:

- `.gitattributes`
- `packages/app/sidecars/pnpm/README.md`
- `packages/app/sidecars/pnpm/SHA256SUMS`
- `packages/app/src/hooks/useLoadPackagePlugin.ts`
- `packages/app/src-tauri/tauri.conf.json`

Why this is considered fully implemented:

- The audit finding was not that tracked sidecars are automatically wrong; it was that the repo had large opaque binaries without a clear policy.
- The policy is now explicit and auditable.
- Checksums give reviewers a concrete artifact-integrity reference.

Residual risk:

- Clone size is unchanged. Reducing clone size requires a future packaging/bootstrap change such as Git LFS or checksum-verified downloads.
- Release packaging on every supported platform remains the real proof for any future sidecar relocation.

## 5. DONE - P2 - Provider stream parse diagnostics were duplicated and unsafe

Resolution:

- Added `packages/core/src/utils/providerStreamParsing.ts`.
- OpenAI and Anthropic stream parsing now share the JSON chunk parse/error-diagnostic policy.
- Malformed provider chunks are not logged raw by default.
- Anthropic tool-call JSON parse diagnostics now log only shape and error summary under debug mode.
- The broader provider-file-size issue is not falsely claimed as complete; only the duplicated unsafe parse-diagnostics seam was extracted.

Adjacent code reviewed:

- `packages/core/src/utils/openai.ts`
- `packages/core/src/plugins/anthropic/anthropic.ts`
- `packages/core/src/plugins/anthropic/nodes/ChatAnthropicNode.ts`
- `packages/core/src/utils/providerStreamParsing.ts`
- `packages/core/test/utils/providerStreamParsing.test.ts`

Why this is considered fully implemented:

- The repeated OpenAI/Anthropic JSON parse failure policy now has one owner.
- The helper deliberately avoids normalizing provider response shapes, so it reduces duplication without creating a premature provider mega-abstraction.

Residual risk:

- Provider implementations are still large. Future reductions should extract only proven shared seams such as tool-call accumulation after focused tests exist.
- Google and other provider paths may have separate future duplication, but they were not part of the confirmed raw-chunk logging path fixed here.

## Additional Watchlist

### MCP stdio config logging/env handling

Still deferred by choice. `packages/node/src/native/NodeMCPProvider.ts` should eventually be fixed so env secrets are not logged and configured env values are passed correctly to stdio transports.

### Global app error logging policy

`handleError(...)` still logs normalized error objects for app-level failures. That can be useful for desktop debugging, but it is a separate privacy/diagnostics policy from runtime graph/provider logging. If stricter privacy is desired, this should become a dedicated finding.

### GraphProcessor size and responsibility concentration

The loop-controller branch was fixed, but `GraphProcessor` still owns many execution policies. Any future refactor should start with characterization tests for event order, aborts, subgraphs, loop/race behavior, and control-flow exclusion.

### Tracked sidecar clone size

The sidecar policy is documented and checksummed, but the repository still carries the binary weight. Moving sidecars out of normal Git remains a separate release-engineering project.
