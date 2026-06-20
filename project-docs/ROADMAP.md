# ROADMAP — Reusable Model-Configuration Layer for Rivet 2

> North-star document. Read `../PROJECT-CONTEXT.md` first for the wider framing,
> `../DECISIONS.md` for why these choices were made, and
> `../VERIFIED-FINDINGS.md` for dated, checked code facts. Operating constraints
> for the implementing agent are in `../../CLAUDE.md`.
>
> **Build target:** a fork of **`valerypopoff/rivet2.0`** (`@valerypopoff/rivet2-*`, MIT).
> See DECISIONS D1 for why rivet2.0 and not `Ironclad/rivet`.
> **Last updated:** 2026-06-20
>
> **Re-targeted onto chat-v2 (DECISIONS D6).** Features 001–006 built this layer on the
> legacy `ChatNodeBase` node, now **deleted** (commit 376b3710). The layer is re-targeted
> onto the modern vendor-agnostic `llmChatV2` node. §1–2 below are historical framing (the
> *why*); the current plan is the re-sequenced **§3 (007→010)**. Precedence and the sacred
> rail are updated in §5.

## 1. Why this exists

Rivet configures models with a single global credential set — effectively "one model
config to rule them all". Verified in rivet2.0 (see VERIFIED-FINDINGS §C):

- **Endpoint** is already per-node (`ChatNodeConfigData.endpoint` overrides
  `Settings.openAiEndpoint`, `ChatNodeBase.ts:948`).
- **API key and organization are global only** — both auth blocks read
  `context.settings.openAiKey` / `openAiOrganization` (`ChatNodeBase.ts:1034` & `:1067`).
- There is **no reusable behavior layer** (system/pre-prompt, sampling, effort).

This blocks the thing we want: **graphs where different nodes use different brains and
different roles** — adversarial agents, an arbiter reviewing drafts, and role-based
pipelines (spec → developer → tester → reviewer). Today you cannot give two nodes
different credentials.

The original Rivet's issue **#333** ("per-project API keys") documents this pain and
is unresolved; rivet2.0 inherits the same gap. Feature 001 is a superset of #333.

## 2. The bigger arc this serves

This layer is the foundation for a visual multi-agent workflow harness
(ticket → spec → parallel dev + test → combine → review gate → commit-or-loop, with
best-of-N and arbitration). There **an agent is a model + a skill**. These three
features make that expressible per-node. Build with that destination in mind, but
**scope is strictly the three features below.** The harness primitives are a later,
separate effort and are **not** provided by Rivet Studio Server (which only publishes
graphs as endpoints).

## 3. The work, re-sequenced around the chat-v2 re-target

The model-config work re-sequenced around the chat-v2 re-target. **Numbering note:** the
excision took the `007` slot (branch `feature/007-legacy-excision`), so the engine reshape
moves to `008`. Features 001–006 (the layer on the now-deleted legacy node) are historical —
their project-level design carries forward into 008.

- **007 — Legacy excision (re-sequenced from F4). DONE** (commit 376b3710). Deleted the
  legacy Chat node cluster (`ChatNode`, `ChatNodeBase`, `ChatLoopNode`, `openAIChatRequest`,
  `openAIChatRuntime`), the legacy resolvers, the Prompt Designer, and the legacy-bound
  tests. Single-shape clean.
- **008 — Engine reshape (was F1).** Reshape the Settings entity types to the fan-out shape;
  write `resolveEffectiveLLMChatV2Data` (the pre-pass: defaults ⊕ Profile ⊕ Skill.base ⊕
  Skill.providers[provider] ⊕ Preset.overrides ⊕ Node; the reasoning-level map; the
  byte-identical rail); update the surviving authoring forms + 006 to the new shape; node
  integration (selectors + `process()` pre-pass + plain dropdowns); the custom-provider
  escape hatch; live oMLX verify.
- **009 — Node UI (was F2).** Tree-selector + progressive disclosure on the chat-v2 shared
  surface (bind at any level, inherited-collapsed, "Show overrides"). `extraBody` surfaced
  for custom only.
- **010 — Badges (was F3).** Re-keyed to "overridden vs the resolved fan-out" on chat-v2's
  data shape.

**Parked:** Prompt Designer on chat-v2 (if interactive prompt tuning is wanted); the global
library (cross-project model-config reuse + materialise-on-use); the `ui-testing` Playwright
suite rebuilt on chat-v2 (the legacy-node suite is retired by 007).

## 4. The model: composition, not cross-axis inheritance

Two orthogonal axes (see DECISIONS D3; shapes refined for chat-v2 in D7/D8):

| Axis | Owns | Concept |
|------|------|---------|
| **Connection** | provider, baseURL, key source, headers, *fallback* defaultModel | LLM Profile |
| **Behavior + model** | a generic `base` + per-provider blocks (model, effort, sampling, format, extraBody) | Skill |

Composition (not inheritance) is decisive because our goals require *same skill across
many models* (adversarial / best-of-N) and *many skills on one model*; inheritance
forces an N×M explosion. We keep ergonomics via **single-axis `extends`** (Profile→Profile,
Skill→Skill) and **Presets** (named Profile+Skill bundles).

## 5. Invariants (the rails — non-negotiable)

1. **Sacred rail (chat-v2).** With no Preset/Profile/Skill selected and no node-level
   model-config, the resolution pre-pass returns the node's `LLMChatV2NodeData` unchanged —
   a model-config-unset LLM Chat node is request-identical to a vanilla one. (Replaces the
   retired legacy-request-shape rail; see DECISIONS D11.)
2. **Explicit precedence, implemented exactly:**
   `Node > Preset.overrides > Skill.providers[provider] > Skill.base > Profile > Global`,
   with the Skill fanning generic → provider-specific internally (DECISIONS D7/D11).
3. **Composition over inheritance** across axes; `extends` only within an axis, always
   cycle-guarded and depth-capped.
4. **Minimal blast radius.** Changes live in the model-resolution path
   (`core/src/model/...`). Do not modify unrelated node types or restructure the monorepo.
5. **Typed throughout.** No `any` on the new types; everything is `Settings`-typed.
6. **Stay portable.** Keep Feature 001 clean — it is the natural fix for the #333-style
   gap and should be contributable upstream to rivet2.0.

## 6. Out of scope (explicitly, for now)

- Native Anthropic/Google plugin nodes honouring profiles (follow-up; same pattern).
- The visual multi-agent harness and its primitives (worktree node, Ralph loop, best-of-N).
- Cloud sync of profiles; secrets-vault / keychain integration.
- Tracking `Ironclad/rivet` upstream (dormant; nothing of value to pull — see DECISIONS D1).

## 7. Glossary

- **LLM Profile** — connection config: provider, baseURL/customProviderBaseURL, key source,
  headers, a *fallback* default model (D8).
- **Skill** — reusable behavior+model config: a generic `base` (sampling, effort via
  `reasoningLevel`, format, extraBody) + per-provider blocks (model, provider-specific
  effort/fields) (D7).
- **Preset / Agent** — named (Profile + Skill + overrides) bundle.
- **Precedence** — the fixed override order in §5.2.
- **Headless run** — executing a `.rivet-project` via `@valerypopoff/rivet2-node`
  (`runGraph` / `runGraphInFile` / `loadProjectFromFile`) with no GUI; the validation
  method here.