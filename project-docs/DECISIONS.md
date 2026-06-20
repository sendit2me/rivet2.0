# DECISIONS

> Architecture Decision Records (lightweight). Each records the choice, the evidence
> behind it, and the consequences, so the reasoning survives. Newest context dated.
>
> **Last updated:** 2026-06-20

---

## D1 — Base the work on `valerypopoff/rivet2.0`, not `Ironclad/rivet`

**Status:** Accepted (2026-06-17)

**Context.** We chose Rivet as the foundation. There are now two relevant lines:
the original `Ironclad/rivet` and the fork `valerypopoff/rivet2.0`.

**Evidence (from git history — see VERIFIED-FINDINGS §B).**
- The fork point is **2025-10-06** (`merge-base` = Ironclad commit `73c20b44`).
- Since the fork, **`Ironclad/rivet` has 6 commits total, every one a Dependabot
  dependency bump** (openssl, tar, time in the Tauri shell). Zero features, zero
  fixes. Its HEAD (`7cdd13a1`, 2026-05-13) is itself a dependabot merge.
- In the same window, **`rivet2.0` has 666 commits** — a full refactor plus new
  embedding seams, a hosted-executor mode, and an improved plugin model.
- Both are **MIT**.

**Decision.** Build on `rivet2.0` (`@valerypopoff/rivet2-*`). The original is
effectively dormant; rivet2.0 is the living continuation and is explicitly designed
to be embedded by wrapper apps.

**Consequences.**
- There is **no upstream value being left behind** — do **not** spend effort tracking
  `Ironclad/rivet`. The only thing it produces is routine Rust dependency bumps,
  which are ordinary hygiene we manage in our fork regardless.
- File layout matches the original (paths verified identical), so prior architectural
  understanding ports; only package names change and line numbers differ.

---

## D2 — Host via Rivet Studio Server, built from source

**Status:** Accepted (2026-06-17)

**Context.** We need to edit Rivet over a port on a headless VM, run graphs on a
schedule / from events, and expose workflows as endpoints. We were about to build a
service shell around `rivet-node`.

**Evidence.** `valerypopoff/Rivet-Studio-Server` (MIT) already provides: a
**browser-based Rivet editor**, **one-click endpoint publishing**, a **run-recordings
browser** (inspect/replay runs), a **remote debugger**, a **runtime-libraries
manager**, **built-in auth**, and **Docker Compose + Helm/Kubernetes** deployment. It
consumes Rivet via `RIVET_REPO_URL` / `RIVET_REPO_REF` (default `rivet2.0@main`),
treating `rivet/` as read-only input.

**Decision.** Use Studio Server as the hosting/serving/editing platform, pointing
`RIVET_REPO_URL` at **our rivet2.0 fork**, and **build from source** rather than
pulling the prebuilt `ghcr.io` images (`npm run prod`).

**Consequences.**
- Replaces the manual "build locally → sync `.rivet-project` → write a server →
  redeploy" loop. Triggers (NATS/folder/webhook) simply POST to published endpoints.
- **Build-from-source is a deliberate supply-chain choice** — the default path pulls
  prebuilt images; we do not. Pin and audit what we build.
- We do **not** get multi-agent execution primitives from this; those remain ours.

---

## D3 — Composition (Profiles × Skills), not cross-axis inheritance

**Status:** Accepted (2026-06-17)

**Context.** A node needs both a *connection* (endpoint/key/model) and a *behavior*
(pre-prompt/sampling/effort). Two models were considered: inheritance (a "skill" is a
specialized profile, e.g. `local-Qwen-developer extends local-Qwen`) vs composition
(orthogonal Profiles and Skills, chosen per node).

**Decision.** **Composition.** Profiles (connection) and Skills (behavior) are
orthogonal; default Skill is **None**. Allow `extends` **within** each axis only.
Provide a **Preset** = named `(Profile + Skill + overrides)` for one-pick selection
with a default.

**Rationale.** Our goals require *same skill across many models* (adversarial /
best-of-N) and *many skills on one model*. Inheritance forces an N×M explosion and
duplicates prompts; composition defines each skill once and applies it to any brain.

**Canonical precedence (implement exactly):**
`Node-level field > Preset.overrides > Skill > Profile > Global settings`.

> **Updated by D11 (chat-v2 re-target).** The composition principle (Profiles × Skills,
> orthogonal, single-axis `extends`) stands. The precedence is refined to fan the Skill
> generic → provider-specific: `Node > Preset.overrides > Skill.providers[provider] >
> Skill.base > Profile > Global`. See D7/D11.

---

## D4 — Build order: 001 → 002 → 003, primitives later

**Status:** Accepted (2026-06-17); **superseded by D6 + ROADMAP re-sequencing** (the layer
re-targeted onto chat-v2; 001–006 shipped on the legacy node, now excised — see D6/D10 and
`ROADMAP.md` for the 007→010 plan).

**Decision.** Ship **LLM Profiles (001)** first (smallest, closes the per-node
credential gap, unblocks multi-model), then **Skills (002)** (adds the pre-prompt
injection — the one change touching message assembly), then **Presets (003)** (sugar
on a working engine). The multi-agent orchestration nodes come after, as a separate
effort.

**Consequences.** Multi-model adversarial/arbitration is testable after 001, before
investing in the harder behavior-reuse work.

---

## D5 — Accept single-maintainer risk, mitigate by ownership

**Status:** Accepted (2026-06-17)

**Context.** Both rivet2.0 and Studio Server are single-maintainer, 2026-new projects.

**Decision.** Proceed, accepting the continuity risk because: both are **MIT**; Studio
Server's design already vendors Rivet as read-only and expects you to own the wrapper;
so if the maintainer stops, we fork/own — which is the intended model. Evaluate code
quality and test coverage before deepening reliance.

**Consequences.** Pin to a known-good rivet2.0 ref; keep our fork buildable
independently; do not assume upstream rivet2.0 releases will continue.

---

## D6 — Re-target the model-config layer onto chat-v2 (LLM Chat), retiring the legacy node

**Status:** Accepted (2026-06-20)

Features 001–006 built the layer on `ChatNodeBase` — the legacy Chat node, deprecated in its
own description in favour of the modern vendor-agnostic `llmChatV2` node. We re-target the layer
onto chat-v2. Rationale: chat-v2 already provides the vendor-agnostic shared surface (OpenAI/
Anthropic/Google/custom, `chatV2Shared`); our layer was built on the wrong, sunsetting node. The
project-level layer (Settings entity types, authoring panel, 006 portability, the resolution
*design* and precedence) carries forward; the node-side wiring is re-shaped. Supersedes D4's build
order; see `ROADMAP.md` for the 007→010 re-sequencing.

---

## D7 — Skill = a generic base + per-provider extension blocks (the base→provider fan-out)

**Status:** Accepted (2026-06-20)

Replaces the flat behaviour-param Skill. A Skill carries an agnostic `base` (temperature, maxTokens,
topP/K, penalties, stop, seed, responseFormat, a coarse `reasoningLevel`, extraBody) plus
`providers?: Partial<Record<provider, ProviderSkillBlock>>`, each block a
`Partial<Pick<LLMChatV2NodeData, …provider fields…>>`. Rationale: chat-v2 has provider-specific
fields; explicit per-provider blocks avoid lossy auto-mapping while keeping a portable generic base.
`base.reasoningLevel` maps cleanly to each provider's effort field (`openAIReasoningEffort` |
`anthropicEffort` | `googleThinkingLevel`); budgets and edge values go in the provider block, which
always wins.

---

## D8 — Profile = connection only; Skill owns model + behaviour (incl. per-provider model)

**Status:** Accepted (2026-06-20)

Profile holds provider, baseURL/customProviderBaseURL, key source, headers, a fallback
`defaultModel`. The Skill's provider block may set the model. Model precedence:
`Node > Skill.providers[provider].model > Profile.defaultModel`. Rationale: separates transport
(Profile) from "what model + how hard" (Skill), which suits oMLX's per-request model selection
(one Profile, many Skills, different models).

---

## D9 — The raw `extraBody` escape hatch is custom-provider-only

**Status:** Accepted (2026-06-20)

Verified in `@ai-sdk/openai-compatible` source: `getArgs()` spreads `providerOptions.custom` keys
verbatim into the request body (only `user`/`reasoningEffort` reserved), so
`{ chat_template_kwargs: … }` reaches an OpenAI-compatible server (oMLX). Hosted providers parse
`providerOptions` by vendor SDK schema, so a raw body merge only applies to `custom`. The resolved
Skill `extraBody` (object) is merged into the effective `extraProviderOptions` (string) via a
deterministic, stable-key-order deep-merge (node wins per key), only when a selector is active.

---

## D10 — Clean break on legacy; legacy node cluster deleted (commit 376b3710)

**Status:** Accepted (2026-06-20)

No migration shim for legacy projects. Verified behaviour: legacy `.rivet-project` files load with
an unknown-node placeholder (no type validation in `fromSerializedProject`) and throw only on
*executing* a `chat` node. Rationale: it's our system; no legacy graphs to preserve. The Prompt
Designer (legacy-Chat-bound) was removed wholesale; re-pointing it at chat-v2 is parked future work.

---

## D11 — The sacred byte-identical rail is now the chat-v2 rail (supersedes the prior rail record)

**Status:** Accepted (2026-06-20)

When no Preset/Profile/Skill is selected and the node carries no model-config selectors, the
resolution pre-pass returns the node's `LLMChatV2NodeData` **unchanged**, so a model-config-unset
LLM Chat node is request-identical to a vanilla one. This replaces the retired legacy-request-shape
rail (D3's `{endpoint, apiKey, organization, headers, model}` invariant on `ChatNodeBase`). The
refined precedence: `Node > Preset.overrides > Skill.providers[provider] > Skill.base > Profile >
Global`.

---

## D12 — Known limitations of the 008 resolution (accepted)

**Status:** Accepted (2026-06-20)

Two limitations are accepted for Feature 008, recorded so they are not re-discovered as bugs:

- **`gpt-5` model-default collision.** The pre-pass decides "the node wins this field" by the
  differs-from-default heuristic (`resolveEffectiveLLMChatV2Data` / the legacy `applySkillParams`
  rule). `createLLMChatV2NodeData()` defaults `model: 'gpt-5'`, so a node a user *genuinely* left at
  `gpt-5` is treated as unset and a Skill/Profile model fills it. This is legacy-consistent and does
  **not** bite the oMLX path (custom providers always use a custom model string, never `gpt-5`). The
  proper fix — per-field presence tracking (an explicit "set" marker rather than differs-from-default)
  — is a future revisit, only if a real workflow hits it.
- **`stopSequences` authoring deferred.** The 008a authoring forms do not yet surface
  `SkillBase.stopSequences` (a `string[]`); it resolves correctly if authored in a serialized project,
  but there is no form control. Drop-in when the 009-era authoring UX lands.

**Also recorded (editor-only, opt-in; not fixed in 008b).** The LLM Chat editor output cache key is
computed from node data, so it does **not** invalidate when a *referenced* Skill/Profile/Preset's
content changes — only when the selector id changes. A cached node can serve stale output after a
Skill edit. Low priority (opt-in caching, editor-only); the clean fix folds the resolved effective
config into the cache key — a future tidy.