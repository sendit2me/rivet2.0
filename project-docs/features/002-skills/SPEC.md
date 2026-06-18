# SPEC 002 — Skills

> Target: fork of `valerypopoff/rivet2.0`. Verified file paths/line numbers in
> `../../VERIFIED-FINDINGS.md` (§C/§F).

| | |
|---|---|
| **Status** | Blocked on 001 |
| **Order** | Feature 2 of 3 |
| **Depends on** | 001 (LLM Profiles) merged and passing |
| **Blast radius** | `core` package; includes **message-assembly** changes |

## 1. Problem

Profiles cover *connection*. They do not cover *behavior* — system/pre-prompt,
sampling, reasoning effort, tool/format preferences. We want a **named, reusable
behavior bundle** that can be applied to *any* profile, so a "developer" or
"reviewer" role is defined once and runs on any model. This is the layer that turns
"a node" into "a role".

## 2. Design principle

Skills are **orthogonal to Profiles** (composition). A node selects a Profile *and*
a Skill independently. Default Skill is **None** → passthrough = exactly today's
behavior. Skills support single-axis `extends` (Skill may extend Skill). A Skill may
carry an **optional** `preferredProfileId` as a *hint only* (never forces a model).

## 3. Data model

Add to `Settings.ts`:

```ts
export interface LlmSkill {
  id: string;
  name: string;
  extends?: string;                 // single-axis inheritance (Skill → Skill)

  /** Prepended to the message array at run time (the "pre-prompt"). */
  systemPrompt?: string;

  // Behavior / sampling overrides (all optional; omitted = inherit lower layer)
  temperature?: number;
  top_p?: number;
  useTopP?: boolean;
  maxTokens?: number;
  reasoningEffort?: '' | 'low' | 'medium' | 'high';
  toolChoice?: 'none' | 'auto' | 'function';
  responseFormat?: '' | 'text' | 'json' | 'json_schema';
  stop?: string;
}
```

```ts
export interface Settings {
  // ...existing...
  llmProfiles?: LlmProfile[];       // from 001
  llmSkills?: LlmSkill[];
}
```

> **Pure behavior, no selection metadata** (decided). `isDefault` and `preferredProfileId`
> were dropped: `isDefault` is the inert default-metadata already rejected on Profiles
> (default-*selection* lives at the Preset layer, 003), and `preferredProfileId` is a
> skill→profile binding — itself a bundling/selection concern, i.e. exactly what a Preset
> is. Keeping a soft binding on the Skill would blur the Profile×Skill orthogonality that
> makes the model work.

Add to `ChatNodeConfigData`:

```ts
/** Id of the Skill to apply. Empty/undefined = No-Skill (passthrough). */
llmSkillId?: string;
```

## 4. Resolution

Add `resolveSkill(settings, skillId): ResolvedSkill` mirroring `resolveProfile`
(walk `extends`, child overrides parent, cycle-guard, depth-cap, `{}` for unknown).

**Behavior-param precedence** (extends the 001 chain):

```
Node-level field  >  Skill  >  Profile-derived default  >  Global settings
```

i.e. for `temperature`, `reasoningEffort`, `responseFormat`, etc.:
`data.<field> (if node sets it) ?? skill.<field> ?? <existing profile/global/default>`.

> Take care: many `ChatNodeData` params have a paired `use<Field>Input` boolean and
> may arrive via input ports. The rule: **an explicit node value always wins**; the
> Skill only fills fields the node left unset. Do not override a value the user
> wired into the node.

**"Node-set" detection — Option C (decided).** A field counts as *node-set* (and the node
wins) when **either** it arrives via an input port (`use<Field>Input` on and an input is
present) **or** its `data.<field>` differs from the node's own default
(`ChatNodeBase.defaultData()`). The Skill fills a field only when it is *not* node-set.

Why Option C and not the alternatives:
- *Rejected A (input-port is the only "explicit" signal):* would let a Skill override a
  temperature **typed into the node UI** — an explicit user value — breaking the precedence
  rail.
- *Rejected B (Skill touches only sentinel fields like `reasoningEffort`/`responseFormat`):*
  would make `skill.temperature/top_p/maxTokens` inert — a "developer" skill that can't set
  temperature is half a feature.
- *Chosen C:* makes "the Skill fills only what the node left unset" literally true and
  **uniform** across sentinel and numeric fields, while any user-changed value — typed or
  wired — wins. Sole corner: re-typing the exact default reads as "unset" (negligible).

Implement via a pure helper that compares against `defaultData()`. **Caveat for `maxTokens`:**
`process()` reads `data.maxTokens` directly and ignores its input port (pre-existing quirk,
not fixed here), so its node-set detection rests **only** on differs-from-default — slightly
weaker than the other fields, consistent with existing behavior.

Note: Profiles (001) carry **no** sampling params, so for behavior fields the "Profile" rung
is effectively empty; the live chain is `Node > Skill > node default`. Profiles still own
connection + `defaultModel`.

## 5. The hard part — pre-prompt injection (read carefully)

A Skill's `systemPrompt` must be **prepended into the message array** inside
`ChatNodeBase.process()`, after messages are assembled from inputs and **before**
the request is sent.

Rules:

1. **Role / mode.** Inject as a system message, honouring the node's existing
   `systemPromptMode` (`'developer' | 'system'`). Reuse whatever message-construction
   helper the node already uses; do not hand-roll a divergent message shape.
2. **Ordering.** Skill `systemPrompt` goes **first**, then any system message the
   node itself already contains, then the conversation/user turns. (Skill sets the
   role frame; node-specific system text refines it.)
3. **No duplication.** Injection happens once per node execution. In loops
   (`LoopController` / `ChatLoop`) ensure the prepend is computed from the node's
   inputs each run and not accumulated across iterations. Add a guard/marker if the
   message array is reused.
4. **Empty skill / empty systemPrompt** → inject nothing (passthrough).
5. **Interaction with existing system prompt input** → concatenation, not replace;
   document the final composed order in a code comment.

This is the one change that touches message construction rather than just config
resolution. Prototype it behind a focused unit test before wiring params.

## 6. Editor (UI)

- **Phase 1 (required):** string editor **"Skill ID"** bound to `llmSkillId`
  (blank = No-Skill).
- **Phase 2 (optional):** dropdown from `settings.llmSkills`, and a Skill editor
  panel in `packages/app`.

## 7. Edge cases

1. Node + Skill both set a param → **node wins**.
2. Skill `systemPrompt` + node already has a system message → concatenate (Skill
   first); never silently drop the node's.
3. `preferredProfileId` is advisory; if the node also selects a profile, the node's
   profile wins.
4. `extends` cycle / unknown parent → same handling as 001 (`trace` + safe partial).
5. Skill applied with No-Profile selected → Skill behavior + global connection.
6. Reasoning/tool fields the target model doesn't support → pass through; let the
   provider error surface as today (do not silently strip).

## 8. Testing requirements

- **Unit (`resolveSkill`)** — extends merge, cycle guard, unknown id.
- **Unit (param precedence)** — Node > Skill > Profile > Global per field.
- **Unit (message assembly)** — Skill `systemPrompt` is prepended exactly once, in
  the correct position and role, with and without a pre-existing node system
  message; loop execution does not duplicate it.
- **Headless harness** — one Profile, two Skills (e.g. terse vs verbose, or
  different system prompts) → observably different requests/outputs for the same
  input.

## 9. Acceptance criteria

- [ ] `LlmSkill` + `Settings.llmSkills` + `ChatNodeConfigData.llmSkillId` exist.
- [ ] `resolveSkill` implemented + tested (extends, cycles, unknown).
- [ ] Behavior-param precedence Node > Skill > Profile > Global implemented + tested.
- [ ] Pre-prompt injection implemented, single-injection guaranteed, ordering tested.
- [ ] No-Skill behavior is byte-identical to post-001 behavior.
- [ ] Headless harness shows two skills diverging on one profile.
- [ ] `llmSkills` reach the processor for headless runs (thread-through only if
      `createProcessor` doesn't already pass `Settings` wholesale — see `[MV]`).
- [ ] `yarn build` / `yarn test` pass; lint clean; diff confined to model path.

## 10. Files expected to change

- `packages/core/src/model/Settings.ts`
- `packages/core/src/model/LlmSkillResolution.ts` — **new**
- `packages/core/src/model/nodes/ChatNodeBase.ts` — data field, editor, param
  resolution, **message-assembly injection**
- `packages/core/src/api/createProcessor.ts` — thread-through **only if needed**
  (see VERIFIED-FINDINGS §F / `[MV]`: rivet2.0 may pass `Settings` wholesale)
- tests + headless harness