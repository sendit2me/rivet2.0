# VERIFIED FINDINGS

> Dated, empirically-checked facts about the codebases, captured so the
> implementing agent does **not** repeat this investigation. Each finding states how
> it was verified and a confidence tag. **Treat `CONFIRMED-rivet2.0` items as ground
> truth**; re-verify only `MUST-VERIFY` items.
>
> **Verified on:** 2026-06-17
> **Against:**
> - `valerypopoff/rivet2.0` @ `origin/main` HEAD `4820fcbc` (2026-06-15) — *the build target*
> - `Ironclad/rivet` @ HEAD `7cdd13a1` (2026-05-13) — *pre-divergence baseline, for the fork analysis only*
>
> Confidence tags: **[C2]** confirmed in rivet2.0 · **[CI]** confirmed in Ironclad,
> conceptually applies to rivet2.0 (same continuation) · **[MV]** must-verify in rivet2.0.

---

## A. Repository facts  *(rivet2.0)*

- **[C2]** Root package is `@valerypopoff/rivet` (core is `@valerypopoff/rivet2-core`;
  node `@valerypopoff/rivet2-node`; cli `@valerypopoff/rivet2-cli`; app
  `@valerypopoff/rivet-app`; executor `@valerypopoff/rivet-app-executor`).
- **[C2]** Monorepo, **Yarn 4.6.0** (`packageManager`), workspaces under `packages/*`.
  README states **Node 20.4.x**. Commands: `yarn install`, `yarn build`, `yarn test`,
  `yarn lint`; `yarn dev` runs the Tauri/Vite desktop flow.
- **[C2]** Both rivet2.0 and Rivet-Studio-Server are **MIT** (LICENSE, "Val P", 2026).

## B. Fork & maintenance facts  *(git history)*

- **[C2]** Fork point: **2025-10-06**, `merge-base(origin/main, Ironclad/main)` =
  `73c20b44`.
- **[C2]** `Ironclad/rivet` since fork = **6 commits, all Dependabot bumps**
  (openssl `0.10.73→0.10.79`, tar `0.4.40→0.4.45`, time `0.3.36→0.3.47`). No features.
- **[C2]** `rivet2.0` since fork = **666 commits**. Massive independent divergence.
- **[C2]** rivet2.0 has **not** merged upstream since the fork (merge-base is the fork
  point), and the 3 upstream bumps are absent (patch-id check). Immaterial.

## C. Model-config resolution — the change sites for Feature 001/002/003  *(rivet2.0)*

File: **`packages/core/src/model/nodes/ChatNodeBase.ts`** — verified line numbers:

- **[C2]** L948 — endpoint resolution:
  `const configuredEndpoint = endpoint || context.settings.openAiEndpoint || DEFAULT_CHAT_ENDPOINT;`
  → per-node `endpoint` already overrides global. (`DEFAULT_CHAT_ENDPOINT` imported
  from `../../utils/defaults.js`, L21.)
- **[C2]** L949–950 — the runtime hook is consulted:
  `context.getChatNodeEndpoint ? await context.getChatNodeEndpoint(configuredEndpoint, finalModel) : ...`
- **[C2]** L957 — header merge begins with `...context.settings.chatNodeHeaders`.
- **[C2]** L1034–1035 **and** L1067–1068 — the **two** auth blocks, both global-only:
  `apiKey: context.settings.openAiKey ?? ''`, `organization: context.settings.openAiOrganization`.
  **This is the real "one config to rule them all" bottleneck** the features remove.

File: **`packages/core/src/model/Settings.ts`** — verified:

- **[C2]** L19–26: `openAiKey?`, `openAiOrganization?`, `openAiEndpoint?`,
  `chatNodeHeaders?: Record<string,string>`. **No `llmProfiles`/`llmSkills`/`llmPresets`
  yet** — greenfield confirmed.

File: **`packages/core/src/model/ProcessContext.ts`** — verified:

- **[C2]** L62–68: `getChatNodeEndpoint?: (endpoint, model) => ChatNodeEndpointInfo |
  Promise<...>` and `export type ChatNodeEndpointInfo = { endpoint; headers }`. Leave
  intact; the profile layer sits above it.

**Implication:** Feature 001's change sites are `ChatNodeBase.ts` L948 (endpoint),
L957 (headers), **L1034 and L1067** (both auth blocks), plus the new `Settings`
fields and the `resolveProfile` helper. The structure is identical to Ironclad; only
the line numbers moved (Ironclad had these near ~1011 / ~1142 / ~1255).

### C.1 Message-assembly map — for Feature 002 (Skills) pre-prompt injection  *(rivet2.0)*

Pinned 2026-06-17 during Feature 002 (line numbers vs the 001 working tree; they shift
once 001/002 edits land — re-grep for the named symbols rather than trusting the number).

- **[C2]** Messages are assembled **once per `process()`** at `ChatNodeBase.ts` ~L927 via
  `getChatNodeMessages(inputs)` (helper at ~L1152–1157): it runs
  `coercePromptToChatMessages(inputs.prompt)` then `prependSystemPrompt(messages, inputs.systemPrompt)`.
  The array is rebuilt from `inputs` every call, so the node itself never accumulates across
  loop iterations — **but** ChatLoop feeds `all-messages` (`[...messages, response]`) back into
  `prompt`, so a prior-iteration system message *can* re-enter via the input. Injection must be
  idempotent (de-dupe by exact text).
- **[C2]** Role is assigned **downstream**, not at assembly: ~L949–951
  `chatMessageToOpenAIChatCompletionMessage(msg, { useDeveloperPrompts })`. `useDeveloperPrompts`
  is derived at ~L942–947 from `data.systemPromptMode` (`'developer'|'system'`) and `isModernModel`.
  So injecting a plain `{ type: 'system', message }` ChatMessage honors `systemPromptMode`
  automatically — do **not** hand-roll a role.
- **[C2]** `prependSystemPrompt` (in `model/chat/chatMessages.ts`) already de-dupes a *leading*
  system message (splices it, then prepends the `systemPrompt` input). Feature 002 adds the
  sibling `prependSkillSystemPrompt` there: drop any prior copy of the exact skill prompt, then
  put it once at the front → composed order **skill-system → node's own system → user turns**.
- **[C2]** Behavior-param reads (the Skill-affected ones): `temperature` ~L883, `top_p` ~L885,
  `useTopP` ~L887, `stop` ~L888–893 (all via `getInputOrData`/inline), `toolChoice` (~L901,
  `resolveChatToolChoice`), `responseFormat` (~L902, `resolveOpenAIResponseFormat`), `maxTokens`
  (`let { maxTokens } = data` ~L953 — **ignores its input port**, a pre-existing quirk),
  `reasoningEffort` (~L1008, `getInputOrData`). Feature 002 routes these through a
  Skill-patched copy of `data` (Option C), leaving every other `data` read untouched.

## D. Headless execution surfaces  *(rivet2.0)*

- **[C2]** **CLI** (`packages/cli/src/commands/`): `run.ts` (run a graph) and
  `serve.ts`. `serve.ts` is a **Hono** server (`@hono/node-server` L1, `new Hono()`
  L113) with options incl. **`--openai-endpoint` (L73)**, **`--stream` / `--stream-node`**
  (SSE; L90–97), and `--port`. So
  `rivet serve <project> --openai-endpoint <oMLX-url> --stream` exposes a streaming
  REST API — the editor app is **not** required to run graphs.
- **[C2]** **Headless library** (`packages/node/src/api.ts`):
  `loadProjectFromFile()` (L85), `runGraphInFile(path, options)` (L95),
  `createProcessor()` (L130), `runGraph(project, options)` (L275). Options type is
  `NodeRunGraphOptions`. This is the embed-in-your-own-service path.

## E. Plugin system — for custom nodes (e.g. a future "Coding Agent" node)  *(rivet2.0/Ironclad)*

- **[C2]** `packages/core/src/model/RivetPlugin.ts` exposes the plugin contract:
  `register(...)` for custom nodes, `configSpec` (L15), `contextMenuGroups` (L20).
- **[CI]** A plugin is a function `(rivet) => RivetPlugin`; the built-in HuggingFace
  plugin is a ~40-line template (config + context-menu group + node registration).
  Verified in Ironclad; rivet2.0 is a continuation, so the pattern holds — confirm the
  exact HuggingFace example path in rivet2.0 if used as a template.

## F. Settings thread-through for headless runs — RESOLVED  *(was MUST-VERIFY)*

- **[C2]** *(resolved 2026-06-17, Feature 001)* The original `[MV]` hypothesis — that
  rivet2.0 passes `Settings` as a whole object so new fields propagate automatically — is
  **WRONG**. `createProcessor.ts` (`coreCreateProcessor`) itself never names the model
  fields, but it builds settings via **`resolveProcessSettings(options)`**
  (`packages/core/src/api/processSettings.ts`), which **reconstructs a `Required<Settings>`
  from an explicit field allowlist with no `...settings` spread**. Two consequences, both
  confirmed by building:
  1. A new `Settings` field does **not** propagate to the processor unless it is added to
     `resolveProcessSettings`.
  2. Because the return type is **`Required<Settings>`**, adding an optional field to
     `Settings` *forces* a matching addition in `resolveProcessSettings` — omitting it is a
     compile error, not a silent drop. This is a useful guardrail: the type makes the
     thread-through mandatory.
  - **The thread-through is therefore a one-liner in `processSettings.ts`**
    (`llmProfiles: settings.llmProfiles ?? []`); `createProcessor.ts` needs no edit, and
    `RunGraphOptions` being `& Settings` means callers can already seed `llmProfiles` via
    `runGraph` options. Two existing assertions in `test/api/processSettings.test.ts` snapshot
    the resolved object shape and must include the new field.

## G. Rivet Studio Server facts  *(from its docs, raw @ branch `main-rivet2`)*

- **[C2]** Consumes Rivet via `RIVET_REPO_URL` / `RIVET_REPO_REF` (default
  `https://github.com/valerypopoff/rivet2.0.git` @ `main`); `rivet/` is read-only
  input. → point this at our fork.
- **[C2]** Route map (nginx-fronted): `/` dashboard · `/?editor` browser Rivet editor
  (iframe) · `/api/*` control plane · `/workflows/:name` published-endpoint execution ·
  `/workflows-latest/:name` latest-draft execution · `/ws/latest-debugger` · 
  `/ws/executor/internal` (hosted-editor executor) · `/ws/executor` (compat).
- **[C2]** Ports: dashboard default **8080** (`RIVET_PORT`); executor websocket is a
  separate internal service on **21889** (does not follow the API `PORT`). API has
  `combined | control | execution` profiles (`RIVET_API_PROFILE`).
- **[C2]** Deploy: `npm run prod` pulls **prebuilt `ghcr.io` images** (we choose
  build-from-source instead — see DECISIONS D2). Helm chart + K8s topology documented
  (control-plane singleton; execution plane scales).
- **[C2]** Features: browser editor, project manager, one-click endpoint publishing,
  run-recordings browser (filter/replay), remote debugger, runtime-libraries manager,
  built-in auth (+ optional external UI gate).

## H. How these findings were obtained (method, for auditability)

- Repo/paths/line numbers: shallow + blobless `git clone`, `git ls-tree`,
  `git show origin/main:<path> | grep -n` against rivet2.0.
- Fork analysis: blobless clone of rivet2.0, added Ironclad as `upstream`, computed
  `git merge-base`, `git log <mb>..upstream/main`, `git rev-list --count`, `git cherry`.
- Licenses & Studio Server docs: `raw.githubusercontent.com` fetches.
- Re-run any of the above to refresh; update the "Verified on" date if you do.

## I. Feature 004 anchors — reasoning output + extraBody  *(rivet2.0, verified 2026-06-18)*

> SPEC 004 §234 calls this "§G", but §G/§H were already taken — it lives here as §I. Verified
> against the `integration` working tree (001–003 merged). Line numbers shift as edits land —
> re-grep for the named symbols. These correct two anchors SPEC 004 §5/§10 got slightly off.

- **[C2]** `reasoning_content` was **never read** anywhere in `packages/core/src` before 004
  (grep clean). E1 is purely additive.
- **[C2] Streaming delta type is in `utils/openai.ts`, not local to the runtime.** The streaming
  chunk delta is `ChatCompletionChunkChoice.delta` (`utils/openai.ts`, `content?: string`) — the
  typed home for the new `reasoning_content?: string | null`. (SPEC §5's "runtime.ts L17" actually
  points at the **non-streaming** `message` type inside `applyOpenAINonStreamingResponse`, which also
  gains `reasoning_content?`.) So 004 touches `openai.ts` (one field) beyond SPEC §10's list.
- **[C2] Runtime return shape.** `applyOpenAINonStreamingResponse` / `applyOpenAIStreamingResponse`
  (`model/chat/openAIChatRuntime.ts`) mutated `output` and returned `void`; called **only** from
  `ChatNodeBase` (non-streaming + streaming branches). 004 changes both to return
  `{ reasoning: string }` (non-streaming: `message.reasoning_content`; streaming: a parallel
  `reasoningChoicesParts[0]` buffer joined). `ChatNodeBase` writes `output['reasoning']` only when
  `data.outputReasoning`, **before** the existing `Object.freeze(output)` in each branch.
- **[C2] Reasoning port declaration** mirrors `outputUsage`: a conditional push in
  `getOutputDefinitions` beside the `usage` block. Default off ⇒ port-list is the hardcoded set
  `['response','in-messages','all-messages','responseTokens']`.
- **[C2] Body-assembly / extraBody application point.** The request body is the `options` object
  (`Omit<ChatCompletionOptions,'auth'|'signal'>`); `auth` (apiKey/org) and `headers` are **separate
  args**, out of `extraBody`'s reach. `endpoint` **is** in `options`. 004 deep-merges the effective
  `extraBody` over `options` **after** the `max_completion_tokens`/`temperature` block and **before**
  the `cacheKey` (so two extraBody values don't cache-collide), then re-asserts essentials.
  **D2 sharpened:** extraBody contributes body params only — protected keys are `model`, `messages`,
  `endpoint` (re-asserted from the node) and `stream` (dropped; not a real `options` key).
  Implemented as pure `applyExtraBody` in `model/chat/openAIChatRequest.ts`; returns the **same
  `options` reference** when extraBody is empty (byte-identical rail).
- **[C2] extraBody composition** lives in `resolveNodeModelComposition` (`LlmPresetResolution.ts`):
  `deepMerge(deepMerge(skill.extraBody, preset.overrides.extraBody), node.extraBody)` (Node wins).
  Within a Skill `extends` chain, `extraBody` deep-merges in `mergeSkillInto` (not replace). Shared
  pure helper `utils/deepMerge.ts` (nested objects recurse; arrays/scalars replace).
- **[C2] Editor note.** `extraBody` is a typed object (`Record<string,unknown>`) used directly by the
  merge and headless seeding. The `code`/JSON editor binds only **string** dataKeys
  (`DataOfType<T,string>`; cf. ObjectNode/HttpCallNode), so an object-bound inline JSON editor is not
  type-possible without app-layer parse-on-edit machinery (out of scope: "No app UI in this feature").
  004 ships the `outputReasoning` toggle; the node-level `extraBody` JSON editor is deferred to the
  Phase-2 override-aware UI. (No §9 acceptance criterion covers the editor.)