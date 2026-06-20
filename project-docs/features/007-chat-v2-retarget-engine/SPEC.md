# Feature 007 — Chat-v2 Re-target: Resolution Engine (F1)

**Status:** Specced, ready for gated implementation.
**Numbering:** 007 continuing the 001–006 sequence; renumber to fit `features/ROADMAP.md` if 007 is taken.
**Supersedes:** the *node-side wiring* of 001–006 (which targeted the deprecated `ChatNodeBase`). The
project-level layer — Settings data model, authoring panel, 006 portability, the resolution *design*
and precedence — carries forward and is re-shaped here onto chat-v2.
**Read first:** `chat-v2-retarget-scoping.md` (the investigation, the path landscape, the locked
settings model, the legacy-removal inventory). That doc is the source of truth for the direction.

This feature is the **engine**: the data-model refactor + the resolution fan-out that produces an
effective `LLMChatV2NodeData`, plus the node integration. The node **tree-selector UI** (F2/008),
**badges** (F3/009), and **legacy excision** (F4/010) are separate features — do not build them here.

---

## 1. Goal
Move the model-config layer onto the modern, vendor-agnostic **LLM Chat** (`llmChatV2`) node. A
Profile / Skill / Preset selected on an LLM Chat node resolves — via a pure pre-pass — into the node's
effective data, which the existing `resolveLLMChatV2RuntimeConfig` consumes unchanged. The
**byte-identical-when-unset rail is sacred**: a node with no model-config selected and no node-level
model-config produces request-identical behaviour to today.

---

## 2. Anchors (confirm at file:line in the pre-code report)
- Target node data: `packages/core/src/model/chat-v2/llmChatV2NodeData.ts` — `LLMChatV2NodeData`,
  `createLLMChatV2NodeData`.
- Shared common data: `packages/core/src/model/chat-v2/chatV2Shared.ts` — `ChatV2CommonNodeData`.
- Runtime seam: `packages/core/src/model/chat-v2/llmChatV2NodeRuntime.ts` —
  `resolveLLMChatV2RuntimeConfig` (reads via `getInputOrData`; the pre-pass feeds it).
- Provider fields / effort options: `chat-v2/providerOptions.ts` — `openAIReasoningEffortOptions`,
  `anthropicEffortOptions`, `googleThinkingLevelOptions`; custom provider via `createOpenAICompatible`.
- Node process: `packages/core/src/model/nodes/LLMChatV2Node.ts` — where the pre-pass is called.
- Our layer (fork): `Settings.ts` (LlmProfile / LlmSkill / LlmPreset / LlmPresetOverrides),
  `LlmPresetResolution.ts` (the resolution to re-shape), the 006 `assembleModelConfig` seam.

---

## 3. Data model (the refactor)

**LlmProfile — connection only.**
- `provider: 'openai' | 'anthropic' | 'google' | 'custom'` *(NEW — chat-v2 is provider-aware)*.
- endpoint/baseURL → `baseURL` (hosted) or `customProviderBaseURL` (custom).
- api-key source (env var name), `headers`.
- `defaultModel?` — a **fallback** model (precedence in §4).
- `extends?` (profile-extends-profile) — keep.
- No behaviour params (those belong to the Skill).

**LlmSkill — a named behaviour config = a generic *base* + per-*provider* blocks that extend it.**
- `base`: agnostic params —
  `Partial<{ temperature, maxTokens, topP, topK, presencePenalty, frequencyPenalty, stopSequences,
  seed, responseFormat, reasoningLevel, extraBody }>`. `reasoningLevel` is normalised
  `'' | 'minimal' | 'low' | 'medium' | 'high'`.
- `providers?: Partial<Record<provider, ProviderSkillBlock>>` — each `ProviderSkillBlock` a `Partial`
  of that provider's specific fields in `LLMChatV2NodeData` (openai: `model`, `openAIReasoningEffort`,
  …; anthropic: `model`, `anthropicEffort`, `anthropicThinkingMode`, `anthropicThinkingBudget`, …;
  google: `model`, `googleThinkingLevel`, `googleThinkingBudget`, …; custom: `model`, `extraBody`, …).
- `extends?` (skill-extends-skill) — keep; resolve the extends chain **before** the provider overlay
  (two orthogonal axes).
- Name is a free-form label (`high`/`med`/`low`, `dev`/`qa`/`training`) — words that fill a dropdown.

**LlmPreset — a Profile + Skill bundle + overrides.**
- `profileId`, `skillId`, `overrides?: LlmPresetOverrides`.
- `LlmPresetOverrides` — a structured partial spanning the resolved effective fields, re-keyed from the
  legacy shape to chat-v2's.

---

## 4. The resolution fan-out (the pre-pass)
A pure core function — `resolveEffectiveLLMChatV2Data(modelConfig, selectors, nodeData) →
LLMChatV2NodeData` (or a partial overlaid onto `nodeData`).

**Order — most-specific wins:**
`createLLMChatV2NodeData() defaults` → **Profile** (connection: provider, baseURL/customProviderBaseURL,
headers, key source, fallback `defaultModel`) → **Skill.base** (agnostic) → **Skill.providers[provider]**
(provider-specific) → **Preset.overrides** → **Node** (the node's own explicitly-set fields).

**Provider selection:** `provider = resolved Profile.provider`. This selects which
`Skill.providers[provider]` block overlays.

**Reasoning mapping (clean — every provider has an effort-level field):** `Skill.base.reasoningLevel`
maps to the resolved provider's effort field — `openAIReasoningEffort` | `anthropicEffort` |
`googleThinkingLevel` — as a **fallback**. An explicit value in `Skill.providers[provider]` (including
budgets like `anthropicThinkingBudget`) always wins. Levels aren't perfectly aligned across providers
(anthropic adds `max`, google adds `minimal`); map the common cases and leave edge/precise values to
the provider block. No lossy auto-guessing of budgets.

**Model precedence:** `Node.model` > `Skill.providers[provider].model` > `Profile.defaultModel`.

**Byte-identical rail (SACRED):** if no Preset/Profile/Skill is selected on the node **and** the node
carries no model-config selectors, the pre-pass returns `nodeData` **unchanged** (no overlay). Cover
with a regression test asserting equality of produced data to input when unset.

---

## 5. Node integration
- `LLMChatV2NodeData` gains selector fields: `llmPresetId?`, `llmProfileId?`, `llmSkillId?` (default
  unset).
- `LLMChatV2NodeImpl.process()` calls the pre-pass → effective data → `resolveLLMChatV2RuntimeConfig({
  data: effectiveData, … })`. Runtime otherwise untouched.
- The assembled `modelConfig` (006 `assembleModelConfig` in `context.settings`) is the source the
  pre-pass reads — so headless/published runs resolve identically (portability preserved).
- **F1 UI is a plain dropdown** for the three selectors (Preset / Profile / Skill), options sourced
  from the project modelConfig — enough to author and test. The tree selector + progressive disclosure
  is **F2 (008)** — do **not** build it here.

---

## 6. The escape hatch (raw body for custom / oMLX)
The custom provider must support an explicit **raw `extraBody`** merged into the request body
(precedence Node > Preset-override > Skill.base / providers[custom]) for params like
`{ "chat_template_kwargs": { "enable_thinking": false } }` that oMLX reads from the raw body.

**Investigation item:** determine how `@ai-sdk/openai-compatible` accepts extra body params — whether
`extraProviderOptions` → `providerOptions.custom` already reaches the body, or a request-body / fetch
mechanism is needed. Implement the **predictable explicit path**; verify with a live oMLX request that
`enable_thinking` lands in the body. Do not rely on SDK namespacing without verifying.

---

## 7. Acceptance & tests (pure-core, fast)
- Fan-out: base ⊕ provider-block ⊕ overrides ⊕ node, per provider (openai/anthropic/google/custom) —
  the right fields land.
- Reasoning-level map: `base.reasoningLevel` → the correct provider effort field; explicit
  provider-block value wins.
- Model precedence: Node > Skill-block > Profile.
- `extends`: skill-extends-skill resolves before the provider overlay.
- **Byte-identical rail:** unset → node data returned unchanged (equality assertion).
- Portability: same selectors + assembled modelConfig → same effective data with no browser/global
  (006 invariant holds on chat-v2).
- Escape hatch: a custom-provider Skill with `extraBody` produces effective data carrying it; (live)
  it reaches oMLX's body.

---

## 8. Investigation items for the pre-code report
- Confirm the §2 anchors at file:line.
- The `@ai-sdk/openai-compatible` extra-body mechanism (§6).
- The exact `ProviderSkillBlock` field set per provider (mirror `LLMChatV2NodeData`'s provider fields).
- Whether `LlmPresetOverrides` is cleanly re-keyable or needs reshaping.
- Any fork test fixtures using the old Profile/Skill/Preset shape that need updating (we take the clean
  break on legacy *projects*, but our own fork test data may need migrating).

---

## 9. Commit boundary
F1 is the engine. If the pre-code report finds it too large for one clean commit, propose a sub-split —
likely **F1a** (data model + resolution + unit tests, engine-only, no node change) and **F1b** (node
integration + selector dropdown + escape hatch + live verify). State the proposed boundary in the
report; one commit per agreed slice; STOP at the boundary.