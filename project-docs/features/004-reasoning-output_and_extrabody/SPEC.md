# SPEC 004 — Reasoning Output + ExtraBody (reasoning-model-aware chat node)

> Target: fork of `valerypopoff/rivet2.0`. Verified file paths/line numbers in
> `../../VERIFIED-FINDINGS.md` and inline below. Both changes validated against
> live oMLX before writing (see §1).

| | |
|---|---|
| **Status** | Ready — 001/002/003 merged to `integration` and green |
| **Order** | Feature 4 |
| **Depends on** | 001 (Profiles) + 002 (Skills) + 003 (Presets) merged |
| **Blast radius** | `core`: chat-node streaming runtime + Skill/Preset merge. Two **opt-in** fields; default-default stays byte-identical. (No `app` UI in this feature — see §6.) |

## 1. Problem

The chat node is **reasoning-model-naive**, and every model in the target stack is a
reasoning model. Two concrete gaps, both proven on live oMLX:

1. **`reasoning_content` is discarded.** The streaming loop reads only `delta.content`
   (`runtime.ts` L161–164); the separate `reasoning_content` field is never read. The
   probe showed a thinking model returning **3413 chars of reasoning** against 208 of
   answer — thrown away. An arbiter that could weigh *how* each agent reasoned can't,
   and debugging is blind to it.
2. **No channel to carry nested per-request body params on the behaviour axis.** The
   only existing escape hatch, `additionalParameters`, is `{key, value: string}[]` —
   it can carry a flat value but the type can't express a nested object, and **Skills
   and Presets have no body-param mechanism at all**. The lever that matters most —
   `chat_template_kwargs: { enable_thinking: false }` — is a nested object. The probe
   proved this lever works (reasoning → 0) and that routing it through the real node
   collapsed the arbiter from **15.5 s to 193 ms**. We want that as a *behaviour*
   (a "terse-fast" Skill carries it), not a per-node hand-edit.

**Out of scope (already handled):** branch parallelism — the executor already runs
independent nodes concurrently (arena: two answerers overlapped, 1.5 s wall vs 2.9 s
serial-sum). Position bias in arbitration is a harness-design concern, not engine.

This feature adds exactly two things, both opt-in, both byte-identical when unset:
**E1** a `reasoning` output port, **E2** a structured `extraBody` on the behaviour
axis (Skill / Preset.override / Node).

## 2. Data model

### E1 — reasoning output (mirrors the existing `outputUsage` pattern)

Add to `ChatNodeConfigData`:

```ts
/** When true, expose a `reasoning` output port carrying the model's
 *  reasoning_content (separate from `response`). Default false → no port,
 *  byte-identical node. Mirrors `outputUsage`. */
outputReasoning?: boolean;
```

### E2 — structured extraBody (the behaviour-axis body channel)

Add the **same optional field** at three levels (and *only* these three — see §4 D3):

```ts
// LlmSkill  (behaviour carries it — e.g. thinking off, a json_schema response_format)
extraBody?: Record<string, unknown>;

// LlmPresetOverrides  (a Preset can override/add to the Skill's)
extraBody?: Record<string, unknown>;

// ChatNodeConfigData  (per-node direct override — wins)
extraBody?: Record<string, unknown>;
```

No `Settings`-level and no `LlmProfile` field (Profile stays pure connection). All
three default `undefined` ⇒ the merged result is empty ⇒ nothing added to the body ⇒
byte-identical. This is the "add the field, make it overridable, keep the
default-default clean" rule applied: power is present, the base is untouched.

## 3. Merge & precedence

### E2 merge — deep, per-key, behaviour-axis order

`extraBody` does **NOT** follow the scalar Option-C logic (replace-only-if-node-at-default).
It is **deep-merged per key** in the canonical order, node winning:

```
Node.extraBody  >  Preset.override.extraBody  >  Skill.extraBody
```

- Start from `Skill.extraBody`, deep-merge `Preset.override.extraBody` over it, then
  deep-merge `Node.extraBody` over that.
- **Deep** = nested plain objects recurse (so a Skill's
  `chat_template_kwargs:{enable_thinking:false}` and a Node's
  `chat_template_kwargs:{add_generation_prompt:true}` combine); non-object values
  replace at their key.
- Folded in `resolveNodeModelComposition` (the single helper ChatNodeBase already
  calls), alongside the existing profile/skill fold — not a new precedence engine.

### E2 application — wins over managed optional params, never over transport

The merged `extraBody` is applied as the **final step** of request-body assembly
(after the managed fields near `ChatNodeBase` L1007 `...additionalParameters`):

- It **wins** over the node's managed *optional* params it collides with —
  `temperature`, `top_p`, `max_tokens`, `response_format`, `stop`, `reasoning_effort`,
  and `additionalParameters`. (This is what lets a Skill carry a full
  `response_format` or override sampling.)
- It **cannot** override the **transport essentials** — `model`, `messages`,
  `stream` — which the node always controls. Implement by deep-merging `extraBody`
  over the assembled options, then re-asserting `model` / `messages` / `stream` from
  the node.

### E1 — no precedence; additive port

`reasoning` is an output, not a config value. No merge. When `outputReasoning` is on,
the port carries accumulated `reasoning_content`; `response` is unchanged.

## 4. Decisions to pin (confirm in the pre-code report)

- **D1 — extraBody merge = deep, per-key, Node > Preset > Skill.** *(Alt: shallow
  top-level replace. Recommend deep: it's the compositional behaviour, and it matches
  how `headers` already merge.)*
- **D2 — extraBody override scope = wins over managed optional params, protected on
  `model`/`messages`/`stream`.** *(Power-user escape hatch with a guardrail on the
  essentials.)*
- **D3 — extraBody lives on Skill + Preset.override + Node, not Profile/Settings.**
  *(It's behaviour; Profile stays connection-only. Adding to Profile later is a
  one-line change if a connection-level body default ever appears — but not now.)*
- **D4 — reasoning port is opt-in via `outputReasoning` (default false), mirroring
  `outputUsage`.** *(Keeps the default port-list and byte-identical baseline intact;
  power-users flip it on.)*

## 5. E1 wiring (verified anchors)

- `runtime.ts` L17 — the local streaming-chunk `delta` type
  (`content?: string | null`): add `reasoning_content?: string | null`.
- `runtime.ts` L161–164 — beside `responseChoicesParts[index].push(delta.content)`,
  accumulate `delta.reasoning_content` into a parallel `reasoningChoicesParts[index]`
  buffer.
- Non-streaming (`runtime.ts` L46/51/59 read `message.content`): read
  `message.reasoning_content` similarly.
- The runtime returns the accumulated reasoning; `ChatNodeBase` adds a `reasoning`
  output port (only when `outputReasoning`) and maps the value to it. Empty string
  when the model emits none. (Agent: confirm the runtime's exact return shape and the
  ChatNodeBase output-mapping site in the pre-code report.)

## 6. Editor / UI

**Phase 1 — this feature (engine only, minimal editor):**
- `outputReasoning`: a boolean toggle (same treatment as `outputUsage`).
- `extraBody`: a JSON/code editor bound to `data.extraBody` (parse-on-edit; invalid
  JSON shows an inline error and is not sent). Marked **advanced**.
- That's all 004 ships in the editor. Headless usage (Skills/Presets seeded in
  `Settings`) needs no UI.

**Phase 2 — the override-aware UI model (its own later feature; recorded here because
it must anchor *all* of 001–004's fields, not just these two):**
- Every overridable field shows an **"override" indicator** when the node's value
  differs from the value composed from its Preset/Skill/Profile — so a user can see at
  a glance what's inherited vs. locally set.
- A global **"Show overrides"** toggle. With it off (default), advanced/override
  fields are **CSS-hidden**: everyday users see a clean node driven entirely by its
  selected Preset and ignore the machinery. With it on, power-users reveal and tweak
  every field across the board.
- This is purely additive on top of the engine: the composition is already
  introspectable (the `resolve*` helpers give the composed value; the node `data`
  gives the local value; a per-field compare yields "overridden"). A small
  `describeNodeComposition` helper returning per-field `{ value, source }` can be added
  *with the UI*, not now.

## 7. Edge cases

1. `extraBody` undefined at all three levels → merged empty → no body change →
   **byte-identical** (the sacred rail).
2. `extraBody` sets `response_format` → it wins over the node's `responseFormat`
   field. *(Note: `responseFormat: 'json_schema'` + the node's schema input port
   remains the first-class typed-output path; `extraBody.response_format` is the
   Skill-carryable escape hatch for when the schema must travel with the behaviour.)*
3. `extraBody` tries to set `model` / `messages` / `stream` → ignored; the node's
   transport values are re-asserted last (D2).
4. Skill and Node both set `chat_template_kwargs` with different sub-keys → deep-merge
   combines them; same sub-key → node wins.
5. `outputReasoning` true but the model returns no `reasoning_content` (non-reasoning
   model, or thinking disabled) → `reasoning` port emits `''`.
6. A Preset.override carries `extraBody` but its Skill also does → deep-merge,
   Preset wins per key (per §3).

## 8. Testing requirements

- **Unit (extraBody merge)** — assert deep-merge precedence Node > Preset > Skill,
  including a nested `chat_template_kwargs` combine and a same-key node-wins.
- **Unit (byte-identical baseline)** — hardcoded pre-004 request body; with no
  `extraBody` and `outputReasoning` false, the assembled body and the node port-list
  are unchanged (the established hardcoded-baseline regression, not a self-snapshot).
- **Unit (application scope)** — `extraBody` overrides `temperature` /
  `response_format`; `extraBody.model`/`messages`/`stream` are dropped and the node's
  values survive.
- **Unit (reasoning accumulation)** — streaming: two chunks with
  `delta.reasoning_content` accumulate in order and surface on the `reasoning` port;
  non-streaming: `message.reasoning_content` surfaces. `outputReasoning` false →
  no `reasoning` port (port-list regression).
- **Body-capturing harness (no network)** — a Skill with
  `extraBody:{chat_template_kwargs:{enable_thinking:false}}` produces a request body
  containing that nested object; a node-level `extraBody` deep-merges over it.
- **oMLX integration (reproduce the proof)** — the "terse-fast" Skill disables
  thinking through the real node (reasoning ~0, sub-second arbiter), and a node with
  `outputReasoning` on (thinking enabled) surfaces non-empty reasoning. Reuses the
  arena harness.

## 9. Acceptance criteria

- [ ] `outputReasoning` + `extraBody` (Skill, PresetOverrides, ChatNodeConfigData)
      exist and are typed; no Profile/Settings `extraBody`.
- [ ] `extraBody` deep-merge (Node > Preset > Skill, nested) implemented in
      `resolveNodeModelComposition` + tested.
- [ ] `extraBody` application wins over managed optional params, protected on
      `model`/`messages`/`stream` + tested.
- [ ] `reasoning` port opt-in via `outputReasoning`, accumulates `reasoning_content`
      (streaming + non-streaming) + tested; default off → no port.
- [ ] Byte-identical default-default proven (body + port-list) when nothing set.
- [ ] oMLX harness reproduces thinking-off-via-Skill (sub-second arbiter) and
      reasoning surfacing.
- [ ] `yarn build` / `yarn test` pass; lint clean.

## 10. Files expected to change

- `packages/core/src/model/Settings.ts` — `extraBody` on `LlmSkill` and
  `LlmPresetOverrides`.
- `packages/core/src/model/LlmSkillResolution.ts` — carry `extraBody` (deep-merge,
  **not** the scalar Option-C path).
- `packages/core/src/model/LlmPresetResolution.ts` — `extraBody` in the override fold;
  `resolveNodeModelComposition` performs the Node > Preset > Skill deep-merge and
  returns the effective `extraBody`.
- `packages/core/src/model/nodes/ChatNodeBase.ts` — `extraBody` + `outputReasoning`
  data fields and editors; apply merged `extraBody` to the body (final step, transport
  protected); conditional `reasoning` output port + value mapping.
- `packages/core/src/model/chat/openAIChatRuntime.ts` — `delta`/`message` type +
  `reasoning_content` accumulation + return (§5).
- `project-docs/VERIFIED-FINDINGS.md` — add a §G with the 004 anchors.
- tests + the oMLX/arena harness.

## 11. Gate

Same discipline as 001–003: agent reads this SPEC + VERIFIED-FINDINGS and returns a
**pre-code report** (understanding, the §4 decisions confirmed, the file list, the two
anchor-site confirmations from §5) → **wait**. Then implements as pure helpers (so
tests exercise real code), with the hardcoded-baseline regression and a
body-capturing harness, green build/test/lint, **one logical commit, stop at the
feature boundary**. Claude reviews the full diff for the load-bearing claims (byte-
identical baseline; deep-merge precedence; transport protection; reasoning
accumulation) before merge to `integration`.