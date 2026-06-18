# SPEC 003 — Presets / Agents

> Target: fork of `valerypopoff/rivet2.0`. Verified file paths/line numbers in
> `../../VERIFIED-FINDINGS.md` (§C/§F).

| | |
|---|---|
| **Status** | Blocked on 001 + 002 |
| **Order** | Feature 3 of 3 |
| **Depends on** | 001 (Profiles) and 002 (Skills) merged and passing |
| **Blast radius** | `core` resolution + (optional) `app` dropdown UI |

## 1. Problem

Composition (Profile × Skill) is powerful but asks the user to pick two things. We
want a **single named pick** — e.g. `local-Qwen-developer` — that bundles a Profile
+ a Skill + optional overrides, plus a **default selection**. This is purely an
ergonomic layer; the engine underneath stays orthogonal (a Preset *expands* to a
Profile + Skill).

## 2. Data model

Add to `Settings.ts`:

```ts
export interface LlmPreset {
  id: string;
  name: string;                     // e.g. "local-Qwen-developer"
  profileId: string;                // required
  skillId?: string;                 // optional (omitted = No-Skill)
  /** Field overrides applied on top of the resolved profile+skill. */
  overrides?: Partial<LlmPresetOverrides>;
  isDefault?: boolean;              // the default radio selection
}

/** Whitelisted overridable fields (endpoint/model/sampling/etc.). Keep explicit;
 *  do not allow overriding arbitrary node internals. */
export interface LlmPresetOverrides {
  endpoint?: string;
  defaultModel?: string;
  apiKey?: string;
  organization?: string;
  headers?: Record<string, string>;
  temperature?: number;
  reasoningEffort?: '' | 'low' | 'medium' | 'high';
  responseFormat?: '' | 'text' | 'json' | 'json_schema';
  systemPrompt?: string;
}

export interface Settings {
  // ...existing + llmProfiles + llmSkills...
  llmPresets?: LlmPreset[];
}
```

> **`useDefaultLlmPreset` dropped (decided).** In a headless engine a "default preset"
> that doesn't apply by default is just confusing — `isDefault: true` is itself the
> deliberate opt-in. With no `isDefault` preset defined, `findDefaultPreset` returns none
> and resolution reduces exactly to post-002, so the byte-identical rail holds. (A future
> UI that wants "pre-select in the dropdown without auto-applying" can layer that on; it's
> a UI concern, not an engine toggle.)

> **`LlmPresetOverrides` is the full union** of `LlmProfile`'s value fields
> (endpoint, apiKey, organization, headers, defaultModel) and `LlmSkill`'s value fields
> (systemPrompt, temperature, top_p, useTopP, maxTokens, reasoningEffort, toolChoice,
> responseFormat, stop) — a Preset can tweak anything its profile or skill carries — but it
> is *closed*: it excludes node machinery (`useModelInput`, `cache`, the `use<Field>Input`
> toggles, …).

Add to `ChatNodeConfigData`:

```ts
/** Id of a Preset. If set, expands to its Profile + Skill + overrides.
 *  Mutually informative with llmProfileId/llmSkillId — see §4. */
llmPresetId?: string;
```

## 3. Resolution

`resolvePreset(settings, presetId)` →
`{ profile: ResolvedProfile, skill: ResolvedSkill, overrides }` by:
1. look up the preset,
2. `resolveProfile(settings, preset.profileId)`,
3. `resolveSkill(settings, preset.skillId)`,
4. carry `preset.overrides`.

Final precedence across the whole stack (this is the canonical order — implement
exactly):

```
Node-level field
  > Preset.overrides
    > Skill
      > Profile
        > Global settings
```

## 4. Preset vs explicit Profile/Skill on the same node (decide & document)

If a node sets **both** `llmPresetId` and an explicit `llmProfileId`/`llmSkillId`:

- The **Preset is the base**; an explicit node-level `llmProfileId` or `llmSkillId`
  **overrides the corresponding piece** of the preset (Node > Preset).
- Document this in a code comment and the editor helper text so it is not surprising.

If only `llmPresetId` is set → expand it. If only `llmProfileId`/`llmSkillId` are set
→ behave as 001/002. If none set → the default preset if one is flagged `isDefault`,
else global.

**Default-selection is all-or-nothing (decided).** The default preset applies only when
the node selects nothing on **any** axis (`!llmPresetId && !llmProfileId && !llmSkillId`).
Touch any selector and you've opted out — you get global for whatever you didn't set. This
is predictable; the rejected alternative (per-axis gap-filling) would surprise users with
"why did my skill-only node inherit a connection?". The editor helper text says this.

**Decision-3 edge (correct-per-precedence, non-obvious — tested).** When a node sets its
own `llmProfileId` *and* the preset carries a connection override, the override still beats
the node's chosen profile (`Preset.overrides > Profile`) while still losing to a value typed
directly on the node (`Node > Preset`). So `node.llmProfileId = PB` + preset override
`defaultModel = M` → the node gets **PB's endpoint/key but M's model**. Rare, but deliberate.

## 5. Editor (UI) — the friendly part

- **Phase 1 (required, minimal):** string editor **"Preset ID"** bound to
  `llmPresetId`.
- **Phase 2 (the actual goal):** in `packages/app`, a **dropdown** listing presets
  by `name`, with the `isDefault` preset pre-selected (the "default radio" UX), plus
  a Presets management panel. New nodes inherit the default preset when
  `useDefaultLlmPreset` is on.
- For the headless workflow, default selection is expressed via `isDefault` +
  `useDefaultLlmPreset` in the seeded `Settings`; no UI required.

## 6. Edge cases

1. Preset references an unknown `profileId`/`skillId` → resolve what exists, `trace`
   the missing piece, fall back to global for the missing parts.
2. `overrides` sets a field the Skill also set → **Preset override wins** (per §3).
3. Node field set + Preset override set → **node wins** (per §3).
4. Multiple presets flagged `isDefault` → first one wins; `trace` a warning.
5. `useDefaultLlmPreset` false + no selection → global (backward compatible).

## 7. Testing requirements

- **Unit (`resolvePreset`)** — expansion to profile+skill+overrides; missing
  profile/skill handling.
- **Unit (full precedence)** — assert the complete order in §3 across endpoint, key,
  temperature, systemPrompt.
- **Unit (preset vs explicit)** — node-level profile/skill override the preset's.
- **Headless harness** — two presets (e.g. `local-Qwen-developer`,
  `opus-reviewer`) used on two nodes in one graph → correct model + behavior each.

## 8. Acceptance criteria

- [ ] `LlmPreset` + `LlmPresetOverrides` + `Settings.llmPresets` +
      `ChatNodeConfigData.llmPresetId` exist and are typed.
- [ ] `resolvePreset` implemented + tested.
- [ ] Canonical precedence (Node > Preset > Skill > Profile > Global) implemented +
      tested end to end.
- [ ] Preset-vs-explicit rule implemented + documented + tested.
- [ ] Default-preset behavior is opt-in and backward compatible.
- [ ] Headless harness shows two presets producing two agent behaviors in one graph.
- [ ] `yarn build` / `yarn test` pass; lint clean.

## 9. Files expected to change

- `packages/core/src/model/Settings.ts`
- `packages/core/src/model/LlmPresetResolution.ts` — **new**
- `packages/core/src/model/nodes/ChatNodeBase.ts` — data field, editor, merge
- `packages/core/src/api/createProcessor.ts` — thread-through **only if needed**
  (see VERIFIED-FINDINGS §F / `[MV]`: rivet2.0 may pass `Settings` wholesale)
- (Phase 2) `packages/app/...` — dropdown + presets panel
- tests + headless harness