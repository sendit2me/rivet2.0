import type { LlmProfile, Settings } from './Settings.js';

/**
 * The flattened result of resolving an {@link LlmProfile} and its `extends` chain.
 * Every field is optional: a caller layers this on top of the global settings using the
 * precedence `Node > Profile > Global`, so an absent field simply means "no opinion from
 * the profile, fall back to global".
 */
export interface ResolvedProfile {
  endpoint?: string;
  apiKey?: string;
  organization?: string;
  headers?: Record<string, string>;
  defaultModel?: string;
}

/** The global-settings connection fields a profile layers on top of. */
export interface GlobalConnectionSettings {
  openAiEndpoint?: string;
  openAiKey?: string;
  openAiOrganization?: string;
  chatNodeHeaders?: Record<string, string>;
}

/** Node-level connection fields, already resolved from data/inputs by the caller. */
export interface NodeConnectionFields {
  /** Node `endpoint` field (after input resolution); '' / undefined means "not set". */
  endpoint?: string;
  /** Node model after input/override resolution; '' / undefined means "blank". */
  model: string;
  /** Node-level additional headers (the keyValuePair `headers` field), already flattened. */
  headers?: Record<string, string>;
}

/**
 * The connection values for a Chat node call, after applying the precedence
 * `Node > Profile > Global`, but **before** the runtime `getChatNodeEndpoint` hook runs.
 * The caller still layers the hook's endpoint/headers on top of these.
 */
export interface ResolvedConnection {
  /** Endpoint to feed the hook: node > profile > global > default. Never empty. */
  endpoint: string;
  /** Credential, with '' preserved as a valid (keyless) value. */
  apiKey: string;
  organization?: string;
  /** Final model: node model, falling back to the profile's default only when node is blank. */
  model: string;
  /** Merged headers, lowest -> highest: global, profile, node. Not yet cleaned or hook-merged. */
  headers: Record<string, string>;
}

/**
 * Apply the `Node > Profile > Global` precedence to produce the static connection values for a
 * Chat node, given an already-resolved {@link ResolvedProfile}. Pure; the runtime endpoint hook
 * and header cleaning are layered on by the caller afterwards.
 *
 * With an empty `profile` ({}) and no node-level fields, the result is byte-identical to base
 * Rivet's global-settings resolution — this is the backward-compatibility guarantee.
 */
export function resolveChatNodeConnection(args: {
  profile: ResolvedProfile;
  global: GlobalConnectionSettings;
  node: NodeConnectionFields;
  defaultEndpoint: string;
}): ResolvedConnection {
  const { profile, global, node, defaultEndpoint } = args;

  return {
    endpoint: node.endpoint || profile.endpoint || global.openAiEndpoint || defaultEndpoint,
    apiKey: profile.apiKey ?? global.openAiKey ?? '',
    organization: profile.organization ?? global.openAiOrganization,
    // Node wins; fall back to the profile default only when the node leaves the model blank.
    model: node.model || profile.defaultModel || node.model,
    headers: {
      ...global.chatNodeHeaders,
      ...profile.headers,
      ...node.headers,
    },
  };
}

/** Maximum `extends` chain depth before we stop walking and trace a warning. */
export const MAX_PROFILE_EXTENDS_DEPTH = 10;

/**
 * Resolve a profile id to a flat {@link ResolvedProfile}, walking its `extends` chain and
 * merging parent → child (child wins).
 *
 * Behavior (matches SPEC 001 §5/§9):
 * - **Unknown / empty id** → returns `{}`; the caller falls back to global settings. This is
 *   what keeps no-profile (and dangling-id) behavior byte-identical to base Rivet.
 * - **`extends` to an unknown parent** → the missing parent is ignored; resolution continues.
 * - **Cycle** → detected via a visited-set; walking stops and the partial merge collected so
 *   far is returned.
 * - **Depth cap** → no more than {@link MAX_PROFILE_EXTENDS_DEPTH} ancestors are walked.
 *
 * `onTrace` (optional) receives human-readable diagnostics for the non-fatal cases above; in
 * the Chat node it is wired to `context.trace`.
 *
 * Pure and side-effect free apart from the optional trace callback.
 */
export function resolveProfile(
  settings: Pick<Settings, 'llmProfiles'>,
  profileId: string | undefined,
  onTrace?: (message: string) => void,
): ResolvedProfile {
  if (!profileId) {
    return {};
  }

  const profiles = settings.llmProfiles ?? [];
  const byId = new Map<string, LlmProfile>(profiles.map((p) => [p.id, p]));

  const root = byId.get(profileId);
  if (!root) {
    onTrace?.(`LLM profile '${profileId}' not found; using global settings`);
    return {};
  }

  // Collect the chain from the requested profile up to its furthest ancestor (child first).
  const chain: LlmProfile[] = [];
  const visited = new Set<string>();
  let current: LlmProfile | undefined = root;

  while (current) {
    if (visited.has(current.id)) {
      onTrace?.(
        `LLM profile '${profileId}' has an extends cycle at '${current.id}'; stopping and using the partial chain`,
      );
      break;
    }
    visited.add(current.id);
    chain.push(current);

    if (chain.length > MAX_PROFILE_EXTENDS_DEPTH) {
      onTrace?.(
        `LLM profile '${profileId}' exceeds the max extends depth of ${MAX_PROFILE_EXTENDS_DEPTH}; stopping and using the partial chain`,
      );
      break;
    }

    if (current.extends == null) {
      break;
    }

    const parent = byId.get(current.extends);
    if (!parent) {
      onTrace?.(
        `LLM profile '${current.id}' extends unknown profile '${current.extends}'; ignoring the missing parent`,
      );
      break;
    }
    current = parent;
  }

  // Merge ancestor → ... → child so that the more-derived profile wins.
  const resolved: ResolvedProfile = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    mergeProfileInto(resolved, chain[i]!);
  }
  return resolved;
}

/**
 * Merge a single profile's fields into `target` (in place), with the incoming profile taking
 * precedence. Only defined values override; `undefined` fields leave the existing value
 * intact so an ancestor's value survives when a descendant doesn't set it. `headers` are
 * merged key-by-key (descendant keys win) rather than replaced wholesale.
 */
function mergeProfileInto(target: ResolvedProfile, profile: LlmProfile): void {
  if (profile.endpoint !== undefined) {
    target.endpoint = profile.endpoint;
  }
  if (profile.apiKey !== undefined) {
    target.apiKey = profile.apiKey;
  }
  if (profile.organization !== undefined) {
    target.organization = profile.organization;
  }
  if (profile.defaultModel !== undefined) {
    target.defaultModel = profile.defaultModel;
  }
  if (profile.headers !== undefined) {
    target.headers = { ...target.headers, ...profile.headers };
  }
}
