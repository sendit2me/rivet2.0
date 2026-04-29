# Post-Chat-v2 Refactor Hardening Plan

## Summary

Use `a36014d5 Refactor and harden LLM Chat v2 runtime wiring` as the boundary for this plan. That is the latest commit in history that explicitly carried a refactor. Everything after it is treated as post-refactor feature and polish work.

Current post-refactor scope includes:

- LLM Chat v2 API-key source selection, custom OpenAI-compatible providers, provider-specific settings, response formats, reasoning output, tool choice, tool continuation observability, and editor-only cache behavior.
- App-executor Code node worker isolation and console forwarding.
- Settings/editor UI polish around segmented controls, toggles, field spacing, input-port buttons, Tool/Prompt previews, resize handles, output rendering, graph-sidebar polish, split-run controls, and clipboard shortcuts.
- Developer docs updates that describe those behaviors.

The first two refactor plans already handled broad helper boundaries and deletion pressure:

- `refactoring.md` covered settings/runtime defaults, node editor decomposition, canvas visibility/wire policy, visual node styling, structured output shells, JS list helpers, graph-input integrity, and modal/popup state.
- `refactoring2.md` hardened those helpers, removed low-return abstractions, consolidated structured output rendering, trimmed JS list helper surface, and established the helper-rent rule.

Therefore this third plan should **not** reopen the already-refactored subsystems unless post-refactor commits clearly added new complexity there. The goal is to harden what changed after `a36014d5`, keep functionality unchanged, improve transparency, reduce code where possible, and make the code feel more professional.

Approximate current source-code growth after `a36014d5`, excluding tests/docs and app-executor `.test.mts` files, is `+1986 / -466` lines, or about `+1520` net source lines. If package metadata and lockfile churn are included, the implementation diff is about `+2035 / -468`. This growth is heavily concentrated in Chat v2 runtime/editor/provider/error code and app UI control/layout components. The plan below targets those pressure points.

## Hard Rules

- Functionality must not change.
- Persisted graph/project format must not change.
- LLM Chat v2 saved-node data shape must not change.
- Programmatic graph execution must not become more editor-coupled.
- Do not build broad frameworks. Prefer small named policy modules and shared primitives with obvious ownership.
- Do not repeat `refactoring.md` and `refactoring2.md` work unless post-refactor commits created new duplication in the same area.
- Developer docs must be updated only where helper ownership or behavior contracts are clarified.
- Every substep must either delete code, make a policy boundary clearer, or remove a future-maintenance trap.
- Dependency and lockfile changes are not counted as source-code savings, but they are part of professionalism and must be audited when provider packages are added.
- New files are not the default. A new helper file must either replace repeated policy, isolate a high-risk boundary with focused tests, or reduce a large file enough to make the navigation cost worthwhile.
- Prefer in-file named helpers or named sections before extracting modules. Extraction is allowed only after the smaller option is checked and rejected.
- A substep may end as `kept intentionally` or `trimmed in place`; that is better than adding a new abstraction that does not pay rent.

## 0. Preflight And Measurement

### 0.1 DONE - Confirm The Actual Post-Refactor Boundary

Files: `refactoring3.md`, Git history only.

Change: Record `a36014d5` as the baseline and list post-refactor commits from `c2c7c8b3..HEAD`. Treat `backlog.md` as unrelated local workspace state unless explicitly included.

Improvement focus: Transparency and scope discipline.

Risk: Picking the wrong baseline would either hide recent complexity or repeat older completed refactor work.

Acceptance:

- `git log --oneline --reverse a36014d5..HEAD` is recorded or summarized.
- Source diff size excludes docs and all test files (`.test.ts`, `.test.tsx`, `.test.mts`).
- Binary dependency/cache files are not counted as maintainability code, but dependency metadata and lockfile changes are audited separately.

Estimated production lines saved: `0`.

Outcome: DONE - Confirmed the plan boundary remains `a36014d5`; `git log --oneline --reverse a36014d5..HEAD` lists the post-refactor commits from `c2c7c8b3 Add input-port API key mode to LLM Chat v2` through `3d40a7eb PRE-refactor`. Baseline diff measurement remains separated from docs/tests/generated bundle files.

### 0.2 DONE - Classify Post-Refactor Growth Before Editing

Files: `refactoring3.md`.

Change: Group the post-refactor diff into functional buckets:

- Chat v2 runtime/provider/cache/tooling.
- Chat v2 provider error normalization.
- Chat v2 settings/editor UI.
- Generic settings layout/control polish.
- Output/fullscreen rendering polish.
- App-executor Code runner isolation.
- Package/dependency metadata.
- Small graph/sidebar/shortcut polish.

Improvement focus: Better prioritization. The plan should attack concentrated complexity, not scatter across unrelated small commits.

Risk: A diff-size-only approach may over-prioritize large but cohesive files and miss small risky seams.

Acceptance:

- Each planned phase names which post-refactor commits/files made it necessary.
- Each planned phase explicitly says why it is not already covered by `refactoring.md` or `refactoring2.md`.

Estimated production lines saved: `0`.

Outcome: DONE - The plan buckets still match the live diff concentration: Chat v2 runtime/provider/cache/tooling, provider error normalization, Chat v2 settings/model catalog, shared settings controls, output/fullscreen presentation, app-executor worker isolation, package metadata, and small graph/UI patches. No older `refactoring.md` or `refactoring2.md` subsystem was reopened without a post-refactor reason.

### 0.3 DONE - Set A Realistic Deletion Target

Files: `refactoring3.md`.

Change: Use a maintainability-gated deletion target: remove roughly `180-250` net production lines if possible, without dense rewrites or behavior changes. The lower end is acceptable if larger deletion would require new abstractions that increase conceptual complexity.

Improvement focus: Professional codebase discipline without line-count cargo culting.

Risk: Chasing a number can make code terser but worse.

Acceptance:

- Each implementation phase records actual production line delta.
- Any net-positive phase must say what risk or ownership boundary improved.

Estimated production lines saved: `0`.

Outcome: DONE - Reassessed after implementation: tracked production-source edits excluding docs/tests/generated executor bundle are `172 insertions / 554 deletions`, but the two new Chat v2 helper files add `415` production-source lines. Counting those untracked files, the honest source delta is `587 insertions / 554 deletions`, or `+33` net production lines. The original deletion target was not met; the tradeoff is accepted because the extra lines moved credential, provider-option, tool-option, and editor-cache policy out of the runtime coordinator into two cohesive high-risk seams instead of hiding that policy in one large file.

## 1. Thin The LLM Chat v2 Runtime Coordinator

### 1.1 DONE - Extract Credential Resolution

Files:

- `packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts`
- optional `packages/core/src/model/chat-v2/chatV2Credentials.ts`
- `packages/core/test/model/nodes/LLMChatV2Node.test.ts`
- `developer-docs/APP-ARCHITECTURE.md`

Change: First isolate API-key source policy into a named in-file section or helper. Extract it into `chatV2Credentials.ts` only if the helper is still large enough that keeping it in `llmChatV2NodeRuntime.ts` hides the runtime flow.

- configured provider key resolution for OpenAI, Anthropic, Google
- custom-provider env var lookup through `settings.pluginEnv` and `process.env`
- input-port key validation
- user-facing missing-key errors

Keep the runtime coordinator responsible only for calling the helper and passing the resulting key to provider/model/tool creation. If the final credential policy is short and obvious, keeping it local is preferred over another module.

Improvement focus: More transparency and lower risk. API-key source is security-sensitive and currently mixed with provider config, cache, and tool wiring.

Risk: High. Wrong key resolution breaks LLM Chat v2 at runtime and could leak editor-only assumptions into backend execution.

Acceptance:

- Configured key mode still uses existing configured provider credentials.
- Custom provider configured-key mode still supports `CUSTOM_PROVIDER_API_KEY` by default.
- Browser builds still avoid hard dependency on Node's `process`; any `process.env` lookup remains guarded through optional global access or an injected environment surface.
- Input-port mode still fails clearly when no key is connected/provided.
- Runtime does not serialize raw keys into previews or cache keys.
- Programmatic Node execution remains supported.
- The final form is either shorter in-place code or one cohesive credential helper; it must not split credential policy across multiple small files.

Estimated production lines saved: `5-25`.

Outcome: DONE - credential source policy now lives in the cohesive Chat v2 runtime-options boundary rather than inside the runtime coordinator. The helper preserves configured-provider keys, custom-provider env lookup through `settings.pluginEnv` / guarded `globalThis.process.env`, input-port validation, and user-facing missing-key errors. Focused `LLMChatV2Node.test.ts` passed after the split.

### 1.2 DONE - Extract Editor Cache Policy

Files:

- `packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts`
- optional `packages/core/src/model/chat-v2/chatV2EditorCache.ts`
- `packages/core/src/model/chat-v2/llmChatV2NodeData.ts`
- `packages/core/test/model/nodes/LLMChatV2Node.test.ts`
- `developer-docs/APP-ARCHITECTURE.md`

Change: First collapse and name editor-only cache behavior in place. Extract it into one helper file only if cache identity and cloning logic still dominate the runtime coordinator after local cleanup.

- cache-key construction
- secret/value fingerprinting
- provider-config fingerprinting
- provider-options fingerprinting
- cache output cloning
- cache hit lookup

Keep the important boundary explicit: cache works only when `context.editorExecutionCache` exists, so backend/programmatic runs do not accidentally get app cache semantics. Do not create separate helper files for fingerprinting, cloning, and lookup; if extracted, they belong together.

Improvement focus: Maintainability and safety. Cache identity currently mixes prompts, credentials, provider config, tool choice, response format, and generation settings in the runtime coordinator.

Risk: High. A bad cache key can return stale or wrong LLM outputs. A bad clone can allow cached data mutation.

Acceptance:

- Cache remains editor-only.
- Cache remains per-project/per-node through the existing cache owner.
- Changing provider, model, API key, prompt, system prompt, tools, response format, provider options, or generation parameters changes cache identity.
- Raw secrets are still fingerprinted, not serialized.
- Cached outputs are cloned before return and before store.
- Cache logic has one owner. It should not be split into tiny `fingerprint`, `clone`, and `lookup` modules.

Estimated production lines saved: `10-40`.

Outcome: DONE - editor-only cache key construction, secret/provider-option fingerprinting, provider-config fingerprinting, cache-output cloning, and cache-hit lookup now live in `chatV2EditorCache.ts`. The runtime coordinator only asks for the cache result. Focused cache tests in `LLMChatV2Node.test.ts` passed.

### 1.3 DONE - Extract Generation And Provider Options Resolution

Files:

- `packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts`
- optional `packages/core/src/model/chat-v2/chatV2RuntimeOptions.ts`
- `packages/core/src/model/chat-v2/providerOptions.ts`
- `packages/core/test/model/nodes/LLMChatV2Node.test.ts`
- `packages/core/test/model/chat-v2/chatV2Pipeline.test.ts`

Change: Simplify generation settings and provider-options assembly first. If extraction is still justified, prefer one cohesive `chatV2RuntimeOptions.ts` for generation/provider/tool-option assembly rather than several small modules.

- temperature, max output tokens, topP, topK
- presence/frequency penalties
- stop sequences
- seed
- extra provider options from JSON text or input port
- OpenAI reasoning effort/summary
- Anthropic thinking options
- Google thinking options

Keep provider-specific branches explicit. Do not hide them behind a generic option-merging table if that makes SDK behavior harder to inspect.

Improvement focus: More transparent provider behavior and smaller runtime coordinator.

Risk: Medium-high. Provider-option shapes are Vercel SDK contract surfaces, and some fields are provider-specific.

Acceptance:

- Visible settings still override conflicting extra provider options.
- Extra provider options input still accepts object values and text editor JSON still requires a JSON object.
- Provider-specific reasoning fields are emitted under the right provider key.
- Stop sequences still drop empty strings.
- Extraction must reduce the coordinator without making provider-specific SDK shapes harder to audit.

Estimated production lines saved: `20-60`.

Outcome: DONE - generation parameters and providerOptions resolution now live in the cohesive `chatV2RuntimeOptions.ts` boundary, keeping provider-specific SDK shapes explicit while removing JSON parsing and provider-option assembly from the runtime coordinator. Focused provider-option tests passed.

### 1.4 DONE - Extract Tool Runtime Policy

Files:

- `packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts`
- optional `packages/core/src/model/chat-v2/chatV2RuntimeOptions.ts`
- `packages/core/src/model/chat-v2/toolContinuation.ts`
- `packages/core/test/model/chat-v2/toolContinuation.test.ts`
- `packages/core/test/model/nodes/LLMChatV2Node.test.ts`

Change: Trim tool-choice and built-in provider tool resolution in place first. If tool policy remains bulky, place it in the same cohesive runtime-options module considered in 1.3, unless it is clearly large enough to deserve its own module.

- `Default`, `Auto`, `Required`, `Specific tool`
- OpenAI `parallelToolCalls`
- built-in OpenAI web search/code interpreter tools
- built-in Google search grounding / URL context tools
- custom/anthropic unsupported built-in tool behavior

Keep auto-continuation pipeline logic in `toolContinuation.ts`; this step should only move option/tool-set assembly.

Improvement focus: One owner for "what tools are passed to the Vercel SDK."

Risk: Medium-high. Tool calls are graph-control behavior, not just display.

Acceptance:

- Tool use off still sends no Rivet tools.
- Specific tool still errors clearly when the tool name is empty.
- OpenAI parallel tool calls are still passed in Vercel-compatible provider options.
- Built-in provider tools still receive the resolved API key/base URL/headers.
- Delegate Tool Call legacy compatibility remains unchanged.
- Do not create a separate tool module if it only wraps two short functions.

Estimated production lines saved: `5-30`.

Outcome: DONE - tool choice and built-in OpenAI/Google provider tool assembly now live in `chatV2RuntimeOptions.ts`; tool auto-continuation remains in `toolContinuation.ts`. Focused Tool-choice and built-in-tool tests in `LLMChatV2Node.test.ts` passed.

### 1.5 DONE - Leave The Runtime Coordinator As A Readable Assembly Function

Files:

- `packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts`

Change: After substeps 1.1-1.4, `resolveLLMChatV2RuntimeConfig(...)` should read as a high-level assembly:

- provider/model/baseURL
- credentials
- provider config and model instance
- inputs/functions
- generation/options/tools/response format
- cache lookup
- returned runtime config

Improvement focus: Transparency. The coordinator should be the mental map, not the implementation dumping ground.

Risk: Medium. Too many small helpers can create "jump fatigue." Keep helper names precise and modules cohesive.

Acceptance:

- No helper has a vague name like `utils` or `helpers`.
- The coordinator has no raw JSON parsing, no secret fingerprint loops, and no provider-specific option object construction.
- Tests continue to cover behavior through node/runtime APIs, not only private helpers.
- The final runtime split should add at most two new source modules unless measured code deletion and readability clearly justify more.

Estimated production lines saved: `0-20`.

Outcome: DONE - `resolveLLMChatV2RuntimeConfig(...)` is now a high-level assembly function for provider/model/base URL, credentials, provider config/model instance, inputs/functions, runtime options/tools/response format, and editor cache lookup. The split added only two cohesive source modules for this runtime phase.

### 1.6 DONE - Harden Provider Error Normalization Without Turning It Into A Sink

Files:

- `packages/core/src/model/chat-v2/chatV2Errors.ts`
- `packages/core/test/model/chat-v2/chatV2Errors.test.ts`
- `packages/core/src/model/chat-v2/chatV2Pipeline.ts`
- `developer-docs/APP-ARCHITECTURE.md`

Change: Reassess the new Chat v2 error-normalization layer as its own behavior boundary. Keep it if it clearly converts Vercel/provider errors into user-facing messages, but trim unnecessary branches, repeated formatting, or overly broad parsing. Prefer small named helpers over one generic "format any error" pipeline.

Improvement focus: Professional error handling. The file is large because provider errors are messy, but it should not become a junk drawer for every Chat v2 failure.

Risk: Medium-high. Error normalization should improve observability without hiding aborts, losing original causes, leaking secrets, or making backend/programmatic failures less diagnosable.

Acceptance:

- Abort errors still pass through unchanged.
- API call errors still show provider, model, endpoint without query strings, recommendation, and provider message when available.
- Known SDK errors still get targeted, readable messages.
- Unknown errors remain untouched so debugging information is not destroyed.
- Raw API keys, headers, and request bodies are not rendered in normalized messages.
- Tests cover OpenAI-compatible/custom-provider 404, auth failures, validation/parse failures, unknown errors, and abort passthrough.

Estimated production lines saved: `10-40`.

Outcome: DONE - Chat v2 provider error normalization now avoids rendering whole provider data objects when no clear provider message exists, still preserves scalar/nested provider messages, and keeps original errors attached as causes. Focused tests cover custom-provider 404 guidance, endpoint query stripping, auth failures without secret/request-body leaks, scalar provider messages, known SDK API-key errors, unknown errors, and abort passthrough.

## 2. Make LLM Chat v2 Settings Definitions Easier To Audit

### 2.1 DONE - Split Provider-Specific Editor Definitions Into Named Blocks

Files:

- `packages/core/src/model/chat-v2/llmChatV2NodeEditors.ts`
- optional `packages/core/src/model/chat-v2/llmChatV2ProviderEditors.ts`

Change: Move provider-specific editor blocks into named constants/functions inside `llmChatV2NodeEditors.ts` first:

- OpenAI provider settings
- Anthropic provider settings
- Google provider settings
- Custom provider model/base URL settings remain in the Model section unless the UI contract changes later

Keep section order unchanged. Create `llmChatV2ProviderEditors.ts` only if the editor file remains difficult to scan after in-file grouping.

Improvement focus: More transparent review of provider-specific UI contracts.

Risk: Low-medium. Settings visibility can subtly regress through `hideIf` mistakes.

Acceptance:

- Provider-specific sections still appear immediately after Model.
- OpenAI/Anthropic/Google controls remain hidden for other providers.
- Custom provider still shows model text input and Provider base URL.
- In-file grouping is preferred unless extraction removes enough code or isolates a clearly testable provider-settings contract.

Estimated production lines saved: `0-20`.

Outcome: DONE - Provider-specific editor sections now have named in-file builders for OpenAI, Anthropic, and Google, with a small `providerGroup(...)` helper preserving the existing `hideIf` policy. Section order remains Model, provider-specific groups, Parameters, Reasoning, Response format, Tools, Outputs, Provider Advanced.

### 2.2 DONE - Add Small Field Builder Helpers Only Where They Remove Repetition

Files:

- `packages/core/src/model/chat-v2/llmChatV2NodeEditors.ts`

Change: Add local helpers for common patterns only if they clearly reduce code and keep the settings manifest readable:

- `numberField(...)`
- `stringField(...)`
- `toggleField(...)`
- `providerOnly(provider)`
- `inputToggle(...)` if useful

Do not create a broad settings DSL. If a helper needs more than a few options or makes the call site cryptic, keep the explicit editor object.

Improvement focus: Less repeated editor-definition boilerplate while keeping definitions readable.

Risk: Medium. A generic DSL would be worse than explicit definitions.

Acceptance:

- The resulting file still reads like a settings manifest.
- Helper calls preserve labels, helper messages, min/max/step, placeholders, and `hideIf`.
- The refactor deletes more code than it adds.
- Helpers stay file-local unless reused by another Chat v2 editor module.

Estimated production lines saved: `15-60`.

Outcome: DONE - Audited the editor manifest and intentionally did not add generic field-builder helpers. The repeated fields carry enough local labels, helper text, ranges, input toggles, and visibility rules that a generic mini-DSL would increase indirection without deleting meaningful code. The only helper added is provider-section specific and keeps the call sites readable.

### 2.3 DONE - Create A Settings Snapshot Test For LLM Chat v2 Editors

Files:

- `packages/core/test/model/nodes/LLMChatV2Node.test.ts`
- optional new `packages/core/test/model/chat-v2/llmChatV2NodeEditors.test.ts`

Change: Add a focused test only if editor refactoring changes enough structure that existing node tests do not protect section order and provider visibility. This should be a structural contract test, not a visual snapshot.

Improvement focus: Risk isolation for future settings UI refactors.

Risk: Overly brittle tests can block harmless copy changes. Keep it structural, not exact prose-heavy.

Acceptance:

- Tests assert section order only if the refactor makes accidental reordering likely.
- Tests assert provider-specific controls only belong to their providers when that behavior is not already covered.
- Tests do not fail on helper-message punctuation changes unless the message is a behavior-critical warning.
- If no new helper boundary is created, do not add a test file just to mirror implementation details.

Estimated production lines saved: `0`; tests may grow.

Outcome: DONE - Existing structural `LLMChatV2Node` tests already cover section order, provider-specific grouping, Tools/Outputs placement, reasoning placement, Custom provider editor behavior, and parameter/input-port contracts. No brittle snapshot file was added; the focused test suite passes after the editor split.

## 3. Simplify The LLM Chat v2 Model Catalog Editor

### 3.1 DONE - Keep Or Collapse Refresh Status State

Files:

- `packages/app/src/components/editors/custom/LLMChatV2ModelCatalogEditor.tsx`
- optional `packages/app/src/components/editors/custom/useLLMChatV2ModelRefreshStatus.ts`

Change: Reassess the module-level `modelCatalogRefreshStatus` map and `statusKey` behavior. Keep it in the component file if it is short and self-contained. Extract a hook only if it becomes shared with refresh-flow cleanup or materially reduces component noise.

Improvement focus: Component transparency without unnecessary file splitting.

Risk: Low. Status is editor-only observability.

Acceptance:

- Refresh messages persist while the same node/provider editor is mounted/reopened.
- Changing provider switches to the provider-specific status.
- No stale status appears for a different node.
- No new hook file is created if the status logic remains a small map plus two setters.

Estimated production lines saved: `0-10`.

Outcome: DONE - Refresh status remains a small module-level map in the component file. Provider and status-key derivation are now named helpers, so the persistence scope is explicit: same node plus same provider keeps its refresh message, different node/provider does not inherit it.

### 3.2 DONE - Extract Refresh Flow Only If It Removes Render Noise

Files:

- `packages/app/src/components/editors/custom/LLMChatV2ModelCatalogEditor.tsx`
- optional `packages/app/src/components/editors/custom/useLLMChatV2ModelRefresh.ts`
- `packages/app/src/utils/chatV2ModelCatalog.ts`
- `packages/app/src/utils/chatV2CustomProviderEnv.ts`

Change: First move small pure helpers out of the render body and simplify `handleRefresh`. Extract a hook only if the refresh flow remains too large or needs isolated tests:

- fill missing settings from environment variables
- invalidate provider catalog cache
- fetch discovered/built-in model options
- produce success/warning messages
- call `onRefreshEditors`

Improvement focus: Separate side effects from rendering.

Risk: Medium. Model refresh already touches settings, plugins, env-backed credentials, and async state.

Acceptance:

- Re-fetch button still uses the current provider.
- OpenAI missing-key fallback still gives a helpful warning.
- Custom provider still hides refresh.
- No raw API keys are logged or shown.
- If extracted, refresh status and refresh flow should probably live in one hook, not two tiny hooks.

Estimated production lines saved: `10-30`.

Outcome: DONE - Refresh message construction was moved into a small pure helper in the same file. The async refresh flow still lives in the component because it owns current settings/plugins and editor refresh callbacks, but the success/fallback message policy is no longer embedded in the render-local handler.

### 3.3 DONE - Extract The Model Row Only If The Parent Remains Too Large

Files:

- `packages/app/src/components/editors/custom/LLMChatV2ModelCatalogEditor.tsx`
- optional `packages/app/src/components/editors/custom/LLMChatV2ModelRow.tsx`

Change: Keep dropdown/text input + input-port plug + refresh button layout in the same file unless the parent remains difficult to scan after refresh cleanup. If extracted, use a simple child component in the same folder with no independent state.

Improvement focus: Component readability and future-proofing. The parent should decide state; the row should render controls.

Risk: Low-medium. This row has had visual polish and alignment fixes; moving it can disturb layout.

Acceptance:

- Provider-backed mode shows dropdown, plug, horizontal gap, and blue refresh button.
- Custom provider mode shows text field and plug, no refresh button.
- Input-port plug still toggles `useModelInput`.
- Select menu portal still works.
- Do not create three new files for this component. At most one hook and one row component are allowed, and only if both pay rent.

Estimated production lines saved: `0-20`.

Outcome: DONE - The model row remains in the same component. After local helper cleanup, extracting a separate row component would add prop plumbing without reducing meaningful complexity; the existing layout contract for dropdown/text input, input-port plug, refresh button, and select portal stays intact.

## 4. Standardize Settings Field Layout Without A New Framework

### 4.1 DONE - Standardize Field Layout With The Smallest Effective Mechanism

Files:

- `packages/app/src/components/editors/DefaultNodeEditorField.tsx`
- `packages/app/src/components/editors/EditorGroup.tsx`
- `packages/app/src/components/editors/KeyValuePairEditor.tsx`
- `packages/app/src/components/editors/StringListEditor.tsx`
- `packages/app/src/components/editors/SegmentedEditor.tsx`
- settings pages under `packages/app/src/components/settings/pages`

Change: First inventory the existing node-settings and app-settings field wrappers. Prefer CSS class/token cleanup over a new React shell. Create or strengthen one shared layout shell only if CSS/token cleanup cannot remove the duplication:

- label
- hint/helper message
- control
- optional input-port button slot
- bottom spacing

Do this only for current editor/settings controls that already share the same visual policy. Keep Monaco/code editors, custom catalog rows, and unusual multi-control editors out of the shell unless they naturally fit the same contract.

Improvement focus: Reduce repeated margin/alignment fixes and make future settings polish safer.

Risk: Medium-high. Settings spacing has been tuned repeatedly and is easy to regress.

Acceptance:

- Hint appears after label and before control.
- Switcher hints align with label text, not the switcher knob.
- Input-port buttons align with their controls.
- String-list editors do not add extra top margins.
- Foldable section content has a consistent first-control top gap.
- Controls that intentionally need custom layout are listed as exceptions instead of being forced into the shell.
- A new React shell is created only if it deletes repeated wrappers; a CSS-only cleanup is preferred.

Estimated production lines saved: `25-100`.

Outcome: DONE - Node-editor field layout remains owned by `DefaultNodeEditor` and `EditorGroup`, without a new React shell. The important gaps are now named CSS variables, so label, helper, side-control, toggle, row, and group-content spacing can be adjusted from one place instead of scattered literals.

### 4.2 DONE - Move Settings Spacing To Named CSS Variables

Files:

- `packages/app/src/index.css`
- `packages/app/src/components/nodeStyles.ts`
- settings/editor components

Change: Define the smallest useful set of spacing tokens. Start with existing variables if possible, and avoid adding tokens that only have one consumer:

- `--settings-field-gap`
- `--settings-label-hint-gap`
- `--settings-hint-control-gap`
- `--settings-section-content-gap`
- `--settings-inline-control-gap`

Use these in app settings and node settings where the same policy applies.

Improvement focus: Professional visual system. Repeated one-off margin edits are a maintainability smell.

Risk: Medium. CSS cascade can affect more controls than intended.

Acceptance:

- App settings modal and node settings panel use the same spacing contract where controls are equivalent.
- Monaco/editor content spacing is not accidentally changed.
- The LLM Chat v2 settings examples that were manually polished still look right.
- Any new token has at least two real consumers or replaces a repeated magic number.

Estimated production lines saved: `10-40`.

Outcome: DONE - Settings-modal page spacing now uses named CSS variables in `settingsPageStyles.ts`, while node-editor group padding and row gaps are named and font-scale aware. No shared global settings framework was added because the current CSS owners are still clearer.

### 4.3 DONE - Consolidate Toggle And Segmented Control Sizing

Files:

- `packages/app/src/components/LabeledToggle.tsx`
- `packages/app/src/components/ScalableToggle.tsx`
- `packages/app/src/components/editors/SegmentedEditor.tsx`
- `packages/app/src/components/settings/pages/UiSettingsPage.tsx`
- `packages/app/src/index.css`

Change: Reassess toggle and segmented control sizing after field-layout cleanup. Make active color, scalable dimensions, label/hint click behavior, and font-size scaling come from one control contract only where duplication still exists. Keep `ScalableToggle` as the visual primitive and `LabeledToggle` as the label/hint wrapper if that boundary still pays rent.

Improvement focus: Prevent future "node settings fixed, app settings still broken" drift.

Risk: Medium. Toggle hover/click behavior has specific UX requirements: switcher, label, and hint should be hoverable/clickable consistently.

Acceptance:

- Toggle active color uses primary color everywhere.
- Checkmark and cross remain vertically centered at UI font sizes `14-20px`.
- App settings and node settings toggles match.
- Segmented controls keep the improved modern styling and offset.
- Do not merge toggle and segmented implementations; they are different controls that should share tokens, not component code.

Estimated production lines saved: `10-35`.

Outcome: DONE - Toggle label/control spacing now scales through the shared `LabeledToggle` component, and node-editor toggle row spacing is named in `DefaultNodeEditor`. The existing segmented editor already had a single scaled sizing owner, so it was intentionally left in place instead of being wrapped in another abstraction.

## 5. Reunify Output And Fullscreen Presentation Polishes

### 5.1 DONE - Move List Item Hover Styling Into Shared Output Styles

Files:

- `packages/app/src/components/renderDataValue/renderDataValueStyles.ts`
- `packages/app/src/components/NodeOutput.tsx`
- `packages/app/src/components/FullScreenModal.tsx`
- `packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx`

Change: Ensure node preview and fullscreen output use the same section header, list item, hover background, and item-border CSS classes.

Improvement focus: One output visual language. This prevents Array and LLM Chat v2 outputs from diverging again.

Risk: Medium. Output rendering touches many node types and data shapes.

Acceptance:

- Array node output and LLM Chat v2 list outputs use the same list item style.
- Fullscreen modal group headers use the same accent color as compact node output.
- Hover background works in both compact and fullscreen output.

Estimated production lines saved: `20-60`.

Outcome: DONE - Compact and fullscreen generic outputs already share `RenderDataOutputs`, `multiOutputStyles`, and `outputSectionLabelStyles`. The shared list-item hover and section-label color live in render-data-value styles, so Array and LLM Chat v2 list outputs use the same presentation path.

### 5.2 DONE - Keep Fullscreen Toolbar Ownership Clear Without Moving For Its Own Sake

Files:

- `packages/app/src/components/FullScreenModal.tsx`
- `packages/app/src/components/nodeOutput/FullscreenNodeOutputToolbar.tsx`

Change: Audit what still lives in `FullScreenModal` versus `FullscreenNodeOutputToolbar`. Move toolbar visual state, sticky/flat styling, search navigation, markdown toggle, copy button, and JSON label only if they are currently duplicated or still mixed into modal geometry. `FullScreenModal` should own modal geometry, edge resize, content scrolling, and selected node state only.

Improvement focus: Better component ownership.

Risk: Medium. The toolbar recently had visual jump fixes and search-control layout changes.

Acceptance:

- Toolbar does not jump when content scrolls underneath.
- Search controls show `< 1/n >` only when results exist.
- Markdown toggle and JSON/copy controls keep current layout.
- Modal edge resize still works and highlights exactly on the edge.
- If the toolbar component already owns the behavior clearly, mark this step kept intentionally.

Estimated production lines saved: `10-40`.

Outcome: DONE - `FullScreenModal` continues to own modal geometry, edge resize, and shell bounds, while `FullscreenNodeOutputToolbar` owns markdown/search/copy/prompt-designer controls. No additional extraction was made because the current boundary is already clear and avoids reintroducing toolbar-jump risk.

### 5.3 DONE - Keep Structured Node Output Shell Intact

Files:

- `packages/app/src/components/nodes/StructuredNodeOutput.tsx`
- node-specific output components

Change: Do not refactor the structured shell again unless new post-refactor commits duplicated it. `refactoring2.md` already consolidated this area.

Improvement focus: Avoid churn. Professional refactoring includes knowing what not to touch.

Risk: Low. Reopening this area would risk regressions for Expression, JS List, Extract Object Path, and Code diagnostics.

Acceptance:

- No changes unless concrete new duplication is found.

Estimated production lines saved: `0`.

Outcome: DONE - `StructuredNodeOutput` remains the single structured-output shell for Expression, JS list nodes, Extract Object Path, and Code error presentation. Parsed-source and section-label styling continue to reuse shared output label styles instead of node-specific copies.

## 6. App-Executor Worker Code Runner Cleanup

### 6.1 DONE - Extract Shared Console Serialization

Files:

- `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts`

Change: The worker source string and current-thread fallback both define console-level behavior and argument serialization. First check whether the duplication is cheaper than a bundling/string-generation abstraction. Extract only plain constants or tiny serialization policy if it stays obvious; otherwise keep duplication and add a comment explaining why.

Improvement focus: Reduce duplication while keeping the worker code debuggable.

Risk: Medium. The worker source is string-evaluated; over-sharing with host functions is not possible without bundling complexity.

Acceptance:

- `console.log` from Code node works in Node executor mode.
- Worker mode and `includeRivet` current-thread fallback both forward console messages.
- Serialization remains bounded and does not throw on complex values.
- No helper is introduced if it makes the worker source harder to inspect or debug.

Estimated production lines saved: `0-15`.

Outcome: DONE - Audited the worker and fallback console paths and intentionally kept the small serialization duplication. The worker source is string-evaluated, so sharing host functions would require bundling/string-generation complexity and make debugging harder. Existing worker and fallback console tests cover both paths.

### 6.2 DONE - Document The Worker Fallback Boundary

Files:

- `packages/app-executor/bin/AppExecutorWorkerCodeRunner.mts`
- `developer-docs/APP-ARCHITECTURE.md`
- `developer-docs/CORE-ENGINE.md`

Change: Add a short code comment or docs note that `includeRivet` intentionally falls back to current-thread execution because worker support is not guaranteed in the sidecar bundle.

Improvement focus: Transparency. This is a non-obvious behavior boundary.

Risk: Low. Documentation only unless a small code comment is added.

Acceptance:

- Future maintainers can see why worker isolation is not universal.
- Programmatic `@ironclad/rivet-node` behavior remains unchanged.

Estimated production lines saved: `0`.

Outcome: DONE - Added an inline code comment documenting why `includeRivet` falls back to current-thread execution in the app executor sidecar: ordinary Code node JavaScript remains worker-isolated, while Rivet-capable code preserves packaged sidecar module-resolution compatibility.

## 7. Prompt And Tool Body Preview Polishing Without App-Specific Drift

### 7.1 DONE - Extract Reusable Body Line Rendering Only If There Is A Second Consumer

Files:

- `packages/app/src/components/nodes/PromptNode.tsx`
- `packages/app/src/components/NodeBody.tsx`
- optional new `packages/app/src/components/nodes/nodeBodyLinePreview.tsx`

Change: Prompt body preview now has custom empty-line preservation, word wrapping, and interpolation token highlighting. Do not generalize it unless Tool or another node needs the same line-preview behavior.

Improvement focus: Avoid premature abstraction while keeping a known drift point visible.

Risk: Low-medium. Prompt body preview was fiddly and user-visible.

Acceptance:

- Prompt role has no unwanted blank line.
- Empty prompt lines in the middle render.
- Long prompt text wraps by word and stays inside node body.
- Other node bodies keep the improved font and wrapping behavior.

Estimated production lines saved: `0-20`.

Outcome: DONE - Prompt remains the only node body that needs line-by-line empty-line preservation plus interpolation-token highlighting. No reusable body-line renderer was created because Tool uses markdown body rendering and generic bodies use `NodeBody`; forcing them through the Prompt preview path would increase coupling.

### 7.2 DONE - Keep Tool Description Editor Reuse Explicit

Files:

- `packages/core/src/model/nodes/ToolNode.ts`
- `developer-docs/APP-ARCHITECTURE.md`

Change: Do not add a Tool-specific description editor. The Tool Description editor should continue reusing the Text node's resizable prompt/markdown editor shell while not creating description interpolation ports.

Improvement focus: Maintainability by reusing an existing editor path rather than adding another bespoke editor.

Risk: Low. The visual editor may suggest interpolation; docs must stay explicit that this is presentation only.

Acceptance:

- Tool Description bottom resize handle remains available.
- Tool description runtime remains unchanged.
- `{{var}}` in Tool descriptions still does not create input ports unless a separate product decision changes that.

Estimated production lines saved: `0`.

Outcome: DONE - Tool Description continues to use the resizable code editor shell with prompt-interpolation markdown styling, while schema interpolation remains the only Tool `{{var}}` source that creates ports. The Strict hint stays explicit as legacy Chat-only behavior.

## 8. Package And Dependency Hygiene

### 8.1 DONE - Audit The OpenAI-Compatible Provider Dependency

Files:

- `packages/core/package.json`
- `packages/app/package.json`
- `yarn.lock`
- `.pnp.cjs`
- `.yarn/cache/*openai-compatible*`
- `packages/core/src/model/chat-v2/providerOptions.ts`
- `developer-docs/PACKAGES.md`

Change: Verify that `@ai-sdk/openai-compatible` and any transitive provider packages are declared in the correct package, are actually needed by runtime code, and do not get duplicated in app package metadata unnecessarily. This is an audit/cleanup step, not a dependency upgrade.

Improvement focus: Professional package ownership. Custom provider support is a real feature, but dependency churn should be intentional and minimal.

Risk: Medium. Removing or moving the dependency incorrectly can break Vite, PnP resolution, app-executor builds, or programmatic core consumers.

Acceptance:

- `providerOptions.ts` imports provider factories only from packages declared where PnP expects them.
- App Vite build still resolves Chat v2 provider imports.
- Core build still resolves Chat v2 provider imports.
- Zero-install cache additions match the lockfile and are not stale orphan files.
- Docs mention custom OpenAI-compatible provider support at the package/architecture level if they discuss Chat v2 provider dependencies.

Estimated production lines saved: `0-10`; dependency metadata may stay net-positive if the dependency is required.

Outcome: DONE - `@ai-sdk/openai-compatible` is intentionally declared in `packages/core` for runtime provider construction and in `packages/app` because the app/Vite workspace resolves Chat v2 core source during development/builds under PnP. No package metadata was removed; this avoids reintroducing the Vite resolution failure for Custom provider support.

### 8.2 DONE - Keep Binary Cache And Lockfile Churn Out Of Source Metrics

Files:

- `refactoring3.md`
- Git diff commands only.

Change: When measuring this refactor, report source-code delta separately from dependency/lockfile churn. Do not use `.pnp.cjs` or `.yarn/cache` binary changes to claim source-code deletion or growth.

Improvement focus: Honest measurement.

Risk: Low. This is process discipline, but misleading metrics can push bad code choices.

Acceptance:

- Final report includes source-code delta excluding tests/docs/binary cache.
- Final report separately mentions dependency metadata/cache status if it changed.

Estimated production lines saved: `0`.

Outcome: DONE - No binary cache or lockfile changes were made in this refactor pass. Source-code changes remain separate from dependency metadata in the verification/reporting scope.

## 9. Small Post-Refactor Patch Audit

### 9.1 DONE - Audit Small UI And Graph Patches Before Refactoring Them

Files:

- `packages/app/src/hooks/useCopyNodesHotkeys.ts`
- `packages/app/src/utils/graphReachability.ts`
- `packages/app/src/components/visualNode/SplitRunSummary.tsx`
- `packages/core/src/model/SplitRunProcessor.ts`
- `packages/core/src/model/NodeBase.ts`
- `packages/app/src/utils/resizeCursors.ts`

Change: Inspect the smaller post-refactor feature patches: Ctrl+X, Delegate Tool Call graph-reference exclusion, split-run concurrency summary, max concurrent runs, and resize cursor normalization. Only refactor if there is repeated policy or accidental duplication. Otherwise mark them as kept intentionally.

Improvement focus: Avoid churn. Small cohesive patches should not be refactored just because they are post-refactor.

Risk: Medium if changed unnecessarily. These features are small but user-visible and touch graph integrity, execution concurrency, or interaction feel.

Acceptance:

- Ctrl+X still cuts selected nodes without breaking copy/paste.
- Delegate Tool Call nodes remain excluded from graph-reference markers.
- Old workflows without max concurrency still default safely.
- Split summary still shows `max N, conc M` in parallel mode.
- Resize cursor helper remains the single cursor-token owner.

Estimated production lines saved: `0-25`.

Outcome: DONE - Audited Ctrl+X hotkeys, graph-reference reachability, split-run summary/concurrency, split-run core concurrency, and resize cursor ownership. Each patch is small and cohesive; no refactor was applied because the current files already keep the relevant policy local and readable.

### 9.2 DONE - Explicitly Skip Stable Completed Areas

Files:

- `refactoring3.md`

Change: Record that graph-input rename/recovery, interpolation rename preservation, structured node-output shell, and canvas visibility/wire policy should not be touched unless a concrete post-refactor regression is found.

Improvement focus: Scope control. The repo has already paid for those refactors.

Risk: Low. The risk is mostly wasting time or introducing regressions by reopening stable code.

Acceptance:

- Implementation phases do not edit these areas unless they document a post-refactor reason.

Estimated production lines saved: `0`.

Outcome: DONE - Stable completed areas remain untouched in this implementation pass: graph-input rename/recovery, interpolation rename preservation, structured output shell internals, and canvas visibility/wire policy. They should only be reopened for concrete regressions, not refactor churn.

## 10. Verification Plan

### Focused Core Tests

Run after Chat v2 runtime/editor phases:

```powershell
node .yarn/releases/yarn-4.6.0.cjs workspace @ironclad/rivet-core exec tsx --test test/model/nodes/LLMChatV2Node.test.ts test/model/chat-v2/chatV2Pipeline.test.ts test/model/chat-v2/toolContinuation.test.ts test/model/chat-v2/chatV2Errors.test.ts
```

Run after app-executor phase:

```powershell
node .yarn/releases/yarn-4.6.0.cjs workspace @ironclad/rivet-app-executor exec tsx --test bin/AppExecutorWorkerCodeRunner.test.mts
```

### Focused App Tests

Run after UI/settings/output phases:

```powershell
node .yarn/releases/yarn-4.6.0.cjs workspace @ironclad/rivet-app exec tsx --test src/components/editors/useNodeEditorCodeViewportHeight.test.ts src/hooks/executorSession.test.ts src/utils/chatV2CustomProviderEnv.test.ts src/utils/graphReachability.test.ts
```

Add targeted tests if new helper boundaries are introduced:

- Chat v2 model refresh hook tests, if refresh logic becomes pure enough.
- Settings field shell rendering tests, if a shared shell is introduced.
- Output toolbar layout tests, if practical.

### Builds

Run after each major phase or at least before final handoff:

```powershell
node .yarn/releases/yarn-4.6.0.cjs workspace @ironclad/rivet-core build:esm
node .yarn/releases/yarn-4.6.0.cjs workspace @ironclad/rivet-node build:esm
node .yarn/releases/yarn-4.6.0.cjs workspace @ironclad/rivet-app-executor run build
node .yarn/releases/yarn-4.6.0.cjs workspace @ironclad/rivet-app run build
git diff --check
```

### Dependency And Boundary Checks

Run after package/dependency or provider-import changes:

```powershell
git diff -- package.json packages/*/package.json yarn.lock .pnp.cjs .yarn/cache
rg "@ai-sdk/openai-compatible|createOpenAICompatible" packages -n
rg "core/src|@ironclad/rivet-core/src" packages -n
```

The last boundary scan should ignore sanctioned Vite/Yarn internals if they appear, but app/core/runtime source should not deep-import private core internals.

### Manual Regression Smoke

Verify in the app:

- LLM Chat v2 normal prompt for OpenAI.
- LLM Chat v2 custom provider with configured env var.
- LLM Chat v2 API key input port with missing key and valid key.
- LLM Chat v2 tool use, specific tool, auto-continue, and parallel tool-call settings.
- LLM Chat v2 response format and reasoning output.
- LLM Chat v2 editor-only cache across repeated runs.
- Code node `console.log` in Node executor mode.
- Tool Description editor bottom resize.
- Prompt node body empty lines and word wrapping.
- App settings and node settings toggle/segmented/field spacing.
- Fullscreen output modal toolbar, search controls, markdown toggle, copy button, and edge resizing.

## Expected Savings

Conservative target: `180-250` net production lines removed. The lower end is acceptable if the plan avoids unnecessary new abstractions and leaves cohesive code in place intentionally.

Actual implementation result after counting untracked helper files: `+33` net production lines. This missed the deletion target, but avoided denser code and kept the new helper count to two cohesive Chat v2 runtime seams. The main win is maintainability and auditability of high-risk LLM runtime policy, not net source shrinkage.

Possible savings by phase:

- Chat v2 runtime coordinator split: `40-155`.
- Chat v2 error-normalization hardening: `10-40`.
- Chat v2 editor definition cleanup: `15-80`.
- Model catalog editor simplification: `0-50`.
- Settings field layout standardization: `45-175`.
- Output/fullscreen presentation cleanup: `30-100`.
- App-executor runner cleanup: `0-15`.
- Prompt/Tool body preview cleanup: `0-20`.
- Package/dependency hygiene: `0-10`.
- Small patch audit: `0-25`.

The total range is intentionally broad. Some phases may add small helper files while improving ownership; those should be accepted only when they make future changes safer. If a phase would add more files than it removes meaningful complexity, mark it `kept intentionally` and move on.

## Sequencing

1. Measure and classify post-refactor growth.
2. Refactor Chat v2 runtime coordinator first, because it is the highest-risk policy concentration.
3. Refactor Chat v2 editor definitions second, while the runtime policy is fresh.
4. Simplify the model catalog editor; extract only if local cleanup is not enough.
5. Standardize settings layout and controls with CSS/tokens first, React shells second.
6. Reunify output/fullscreen presentation polish.
7. Trim app-executor worker runner duplication.
8. Audit Prompt/Tool preview code and only extract if reuse is real.
9. Audit package/dependency ownership.
10. Audit small post-refactor patches and skip stable completed areas unless a concrete issue exists.
11. Update developer docs and run final builds.

## Assumptions

- `LLM Chat v2` behavior should stay exactly as it is now.
- Existing post-refactor feature work is mostly valid; this plan targets maintainability, not product redesign.
- `refactoring.md` and `refactoring2.md` are considered completed and should not be reimplemented.
- If a suspected bug is found during refactoring, fix it only if it blocks behavior preservation; otherwise document it separately.
- UI polish should become more systematic, but not by introducing a heavy design-system layer or one-off wrapper components.
- Source line-count reporting excludes tests/docs and binary cache files; dependency metadata is reported separately.
- The preferred final shape is fewer concepts, not just smaller files. Splitting one complex file into four medium-complexity files is not a win unless each new file owns a clear policy.
