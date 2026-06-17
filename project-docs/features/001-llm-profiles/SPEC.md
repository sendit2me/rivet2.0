# SPEC 001 — LLM Profiles

> Target: fork of `valerypopoff/rivet2.0`. Verified file paths/line numbers in
> `../../VERIFIED-FINDINGS.md` (§C/§D/§F).

| | |
|---|---|
| **Status** | Ready for implementation |
| **Order** | Feature 1 of 3 (build first) |
| **Depends on** | Nothing |
| **Closes / relates to** | The #333-style per-node-credential gap (also unaddressed in rivet2.0) |
| **Blast radius** | `core` package, model-resolution path only |

## 1. Problem

Chat nodes resolve their **API key and organization from global settings only**, so
two nodes in one graph cannot use different credentials. Endpoint is already
per-node, but credentials are not — which blocks multi-model graphs (e.g. a local
oMLX node with no key alongside a cloud node with a key). We need a reusable,
named **connection bundle** selectable per node.

## 2. Current architecture (verified against the code — orient here first)

- **`packages/core/src/model/Settings.ts`** — the global config interface. Holds
  `openAiKey?`, `openAiOrganization?`, `openAiEndpoint?`, `chatNodeHeaders?`.
- **`packages/core/src/model/nodes/ChatNodeBase.ts`**
  - `ChatNodeConfigData` (near top of file) already has `model`, `endpoint?`,
    `headers?: { key; value }[]`.
  - In `.process()` (**rivet2.0 L948**) endpoint resolves as
    `endpoint || context.settings.openAiEndpoint || DEFAULT_CHAT_ENDPOINT`.
  - Headers merge (**L957**) as
    `{ ...context.settings.chatNodeHeaders, ...additionalHeaders, ...resolvedEndpointAndHeaders.headers }`.
  - **Two** auth blocks (**L1034 and L1067**) pass
    `apiKey: context.settings.openAiKey ?? ''`, `organization: context.settings.openAiOrganization`.
    Both must be updated.
- **`packages/core/src/model/ProcessContext.ts`** (L62–68) — `getChatNodeEndpoint(endpoint,
  model) → { endpoint, headers }` runtime hook (used to remap endpoint / inject
  headers). Leave it intact; profiles layer *above* it.
- **`packages/core/src/api/processSettings.ts`** — the real thread-through site
  (**confirmed**, see §7 and VERIFIED-FINDINGS §F). `createProcessor.ts` itself never names
  the model fields, but it builds settings via `resolveProcessSettings(options)`, which
  rebuilds a `Required<Settings>` from an explicit field allowlist (no `...settings` spread).
  So new fields do **not** propagate automatically; the `Required<Settings>` return type
  forces a one-line addition there (`llmProfiles: settings.llmProfiles ?? []`). The earlier
  "`Settings` may flow as a whole object" guess was disproven during 001.

> Line numbers verified against rivet2.0 @ `4820fcbc` (2026-06-17) — see
> `../../VERIFIED-FINDINGS.md`. Confirm by reading; re-note if the file moved.

## 3. Goals / Non-goals

**Goals**
- A per-node selectable LLM Profile bundling endpoint + key + org + headers +
  default model.
- Single-axis `extends` (a Profile may extend another Profile).
- Exact precedence; perfect backward compatibility.
- Headless-first: profiles are seedable via the `Settings` object with no UI.

**Non-goals (this feature)**
- Skills / behavior / pre-prompts (→ 002).
- Preset bundles / dropdown default (→ 003).
- A full settings-management UI (a minimal string field is enough for v1; rich UI
  is an optional later phase).
- Anthropic/Google plugin nodes (follow-up).

## 4. Data model

Add to `Settings.ts`:

```ts
export interface LlmProfile {
  /** Stable unique id, referenced by nodes. */
  id: string;
  /** Human label (for UI / presets). */
  name: string;
  /** Optional parent profile id to inherit from (single-axis inheritance). */
  extends?: string;

  endpoint?: string;
  apiKey?: string;
  organization?: string;
  headers?: Record<string, string>;
  /** Used when a node leaves its model field blank. */
  defaultModel?: string;
}

export interface Settings /* (existing) */ {
  // ...existing fields...
  llmProfiles?: LlmProfile[];
}
```

Add to `ChatNodeConfigData` in `ChatNodeBase.ts`:

```ts
/** Id of the LLM Profile to use. Empty/undefined = global-settings behavior. */
llmProfileId?: string;
```

## 5. Resolution design

Add a pure helper (suggested location:
`packages/core/src/model/LlmProfileResolution.ts`):

```ts
export interface ResolvedProfile {
  endpoint?: string;
  apiKey?: string;
  organization?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
}

/** Walk the extends-chain (child last), merging parent → child.
 *  - Cycle-guarded (track visited ids, throw/trace on cycle).
 *  - Depth-capped (e.g. MAX_DEPTH = 10).
 *  - Returns {} for an unknown id (caller falls back to global). */
export function resolveProfile(
  settings: Settings,
  profileId: string | undefined,
): ResolvedProfile;
```

Then change the resolution sites in `ChatNodeBase.process()` to apply the
**precedence `Node > Profile > Global`**:

```ts
const profile = resolveProfile(context.settings, data.llmProfileId);

const configuredEndpoint =
  endpoint || profile.endpoint || context.settings.openAiEndpoint || DEFAULT_CHAT_ENDPOINT;

const effectiveApiKey =
  profile.apiKey ?? context.settings.openAiKey ?? '';

const effectiveOrganization =
  profile.organization ?? context.settings.openAiOrganization;

// header merge order = lowest → highest priority:
const allAdditionalHeaders = cleanHeaders({
  ...context.settings.chatNodeHeaders,
  ...profile.headers,
  ...additionalHeaders,                 // node-level headers field
  ...resolvedEndpointAndHeaders.headers,// runtime hook (highest)
});

// model: if node model blank, fall back to profile.defaultModel
const finalModel = data.model || profile.defaultModel || /* existing default logic */;
```

Use `effectiveApiKey` / `effectiveOrganization` in **both** auth blocks
(rivet2.0 **L1034 and L1067**).

## 6. Default-resolution policy (decided)

When a node sets **no** `llmProfileId`, resolution **falls back to the global settings,
exactly as today** (backward compatible — the rails require this). `resolveProfile`
returns `{}` for an empty/unknown id, and the byte-identical regression test pins this.

**Profiles have no default flag.** Default-*selection* (which connection to use when a node
picks nothing) is **deferred to Feature 003 (Presets/Agents)**, where the default-radio UX
and a default Preset already cover the "default connection" case. We do **not** add an
`isDefault` field to `LlmProfile`, nor a `useDefaultLlmProfile` switch to `Settings`, in
this feature — shipping inert metadata now would pre-empt that layer's design.

## 7. Thread-through for headless runs

**Resolved (see VERIFIED-FINDINGS §F).** `createProcessor.ts` does not name the model
settings, but it builds them via `resolveProcessSettings(options)`
(`api/processSettings.ts`), which rebuilds a `Required<Settings>` from an explicit
allowlist — so `llmProfiles` does **not** propagate automatically, and the
`Required<Settings>` return type makes adding it there mandatory (compile error otherwise).
The thread-through is a one-liner: `llmProfiles: settings.llmProfiles ?? []` in
`resolveProcessSettings`. `createProcessor.ts` needs no edit; `RunGraphOptions` is
`& Settings`, so a `runGraph` caller seeds profiles via options with no UI.

## 8. Editor (UI)

- **Phase 1 (required):** add to `getEditors()` a simple `string` editor labelled
  **"LLM Profile ID"** bound to `llmProfileId`, with helper text explaining blank =
  global. Zero app-package changes; works in desktop and browser editor.
- **Phase 2 (optional, later):** a `dropdown` editor populated from
  `settings.llmProfiles` plus a settings panel to CRUD profiles in
  `packages/app`. Not required for the headless workflow.

## 9. Edge cases (must be handled)

1. **Unknown `llmProfileId`** → `resolveProfile` returns `{}`; node falls back to
   global; emit `context.trace('LLM profile <id> not found; using global settings')`.
2. **`extends` cycle** → detect via visited-set; `context.trace` a clear error and
   stop walking (use the partial merge or throw — pick one, document it).
3. **`extends` to unknown parent** → ignore the missing parent, keep resolving.
4. **Empty `apiKey`** (local oMLX) → `''` is valid; do not error.
5. **Header precedence** → exactly the merge order in §5 (hook wins, then node,
   then profile, then global).
6. **Blank node model + no `defaultModel`** → unchanged from today's default model
   behavior.
7. **`llmProfileId` set but `endpoint` field also set on the node** → node endpoint
   wins (Node > Profile), per precedence.

## 10. Testing requirements

- **Unit (`resolveProfile`)** — single profile; 2- and 3-level `extends` merge
  (child overrides parent); cycle guard; unknown id → `{}`; depth cap.
- **Unit (resolution precedence)** — assert Node > Profile > Global for endpoint,
  key, org, headers, and model fallback.
- **Headless harness (`examples/` or `scripts/`)** — a `.rivet-project` with one
  Chat node, run twice via `runGraph` seeding two different profiles; assert each
  call targets the correct endpoint/key. Use two local endpoints or a tiny mock
  HTTP server that echoes which credential/endpoint it received.
- **Regression** — a graph with no profile produces identical settings-resolution
  to `main` (snapshot the resolved `{endpoint, apiKey, org, headers}`).

## 11. Acceptance criteria (Definition of Done)

- [ ] `Settings.llmProfiles` and `LlmProfile` exist, fully typed, exported.
- [ ] `ChatNodeConfigData.llmProfileId` exists and has an editor field.
- [ ] `resolveProfile` implemented with cycle guard + depth cap + unit tests.
- [ ] Both auth blocks and endpoint/header/model resolution use the new precedence.
- [ ] `createProcessor` threads `llmProfiles` from options.
- [ ] No-profile behavior is byte-identical to `main` (regression test passes).
- [ ] Headless harness demonstrates two profiles routing to two endpoints.
- [ ] `yarn build` and `yarn test` pass; lint clean.
- [ ] Diff is confined to the files in §2 plus the new helper/test/harness files.

## 12. Files expected to change

- `packages/core/src/model/Settings.ts` — `LlmProfile` type + `llmProfiles?` field.
- `packages/core/src/model/LlmProfileResolution.ts` — **new** helper (`resolveProfile` +
  `resolveChatNodeConnection`, which centralizes the `Node > Profile > Global` precedence).
- `packages/core/src/model/nodes/ChatNodeBase.ts` — `llmProfileId` data field, editor,
  resolution at the four sites (endpoint, headers, both auth blocks, model fallback).
- `packages/core/src/api/processSettings.ts` — thread-through (the real site; see §7).
- `packages/core/src/exports.ts` — export the new helper (`Settings`/`LlmProfile` ride the
  existing `export type *`).
- `packages/core/test/model/LlmProfileResolution.test.ts` — **new** unit tests.
- `packages/core/test/api/processSettings.test.ts` — updated shape snapshots (+`llmProfiles`).
- `packages/node/scripts/feature-001-two-profiles-harness.ts` — **new** headless harness +
  mock echo server.