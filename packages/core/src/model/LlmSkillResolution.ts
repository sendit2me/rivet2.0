import type { LlmSkill, Settings } from './Settings.js';

/**
 * The flattened result of resolving an {@link LlmSkill} and its `extends` chain. Every field
 * is optional: a caller layers this on top of the node's own values, and an absent field
 * means "the Skill has no opinion — keep the node's value".
 */
export interface ResolvedSkill {
  systemPrompt?: string;
  temperature?: number;
  top_p?: number;
  useTopP?: boolean;
  maxTokens?: number;
  reasoningEffort?: '' | 'low' | 'medium' | 'high';
  toolChoice?: 'none' | 'auto' | 'function';
  responseFormat?: '' | 'text' | 'json' | 'json_schema';
  stop?: string;
}

/** Maximum `extends` chain depth before we stop walking and trace a warning. */
export const MAX_SKILL_EXTENDS_DEPTH = 10;

/**
 * The behavior-param fields a Skill can fill on a Chat node (everything in
 * {@link ResolvedSkill} except `systemPrompt`, which is injected into the message array, not
 * the param set). Used by {@link applySkillParams}.
 */
export const SKILL_PARAM_FIELDS = [
  'temperature',
  'top_p',
  'useTopP',
  'maxTokens',
  'reasoningEffort',
  'toolChoice',
  'responseFormat',
  'stop',
] as const;

type SkillParamField = (typeof SKILL_PARAM_FIELDS)[number];

/**
 * Resolve a skill id to a flat {@link ResolvedSkill}, walking its `extends` chain and merging
 * parent → child (child wins). Behavior mirrors `resolveProfile` exactly:
 * - **Unknown / empty id** → `{}` (caller falls back to No-Skill passthrough).
 * - **`extends` to an unknown parent** → missing parent ignored; resolution continues.
 * - **Cycle** → detected via a visited-set; walking stops, partial merge returned.
 * - **Depth cap** → at most {@link MAX_SKILL_EXTENDS_DEPTH} ancestors walked.
 *
 * Pure apart from the optional `onTrace` diagnostics callback (wired to `context.trace`).
 */
export function resolveSkill(
  settings: Pick<Settings, 'llmSkills'>,
  skillId: string | undefined,
  onTrace?: (message: string) => void,
): ResolvedSkill {
  if (!skillId) {
    return {};
  }

  const skills = settings.llmSkills ?? [];
  const byId = new Map<string, LlmSkill>(skills.map((s) => [s.id, s]));

  const root = byId.get(skillId);
  if (!root) {
    onTrace?.(`LLM skill '${skillId}' not found; using No-Skill (passthrough)`);
    return {};
  }

  const chain: LlmSkill[] = [];
  const visited = new Set<string>();
  let current: LlmSkill | undefined = root;

  while (current) {
    if (visited.has(current.id)) {
      onTrace?.(
        `LLM skill '${skillId}' has an extends cycle at '${current.id}'; stopping and using the partial chain`,
      );
      break;
    }
    visited.add(current.id);
    chain.push(current);

    if (chain.length > MAX_SKILL_EXTENDS_DEPTH) {
      onTrace?.(
        `LLM skill '${skillId}' exceeds the max extends depth of ${MAX_SKILL_EXTENDS_DEPTH}; stopping and using the partial chain`,
      );
      break;
    }

    if (current.extends == null) {
      break;
    }

    const parent = byId.get(current.extends);
    if (!parent) {
      onTrace?.(`LLM skill '${current.id}' extends unknown skill '${current.extends}'; ignoring the missing parent`);
      break;
    }
    current = parent;
  }

  // Merge ancestor → ... → child so the more-derived skill wins.
  const resolved: ResolvedSkill = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    mergeSkillInto(resolved, chain[i]!);
  }
  return resolved;
}

/** Merge one skill's defined fields into `target` (in place); the incoming skill wins. */
function mergeSkillInto(target: ResolvedSkill, skill: LlmSkill): void {
  if (skill.systemPrompt !== undefined) target.systemPrompt = skill.systemPrompt;
  if (skill.temperature !== undefined) target.temperature = skill.temperature;
  if (skill.top_p !== undefined) target.top_p = skill.top_p;
  if (skill.useTopP !== undefined) target.useTopP = skill.useTopP;
  if (skill.maxTokens !== undefined) target.maxTokens = skill.maxTokens;
  if (skill.reasoningEffort !== undefined) target.reasoningEffort = skill.reasoningEffort;
  if (skill.toolChoice !== undefined) target.toolChoice = skill.toolChoice;
  if (skill.responseFormat !== undefined) target.responseFormat = skill.responseFormat;
  if (skill.stop !== undefined) target.stop = skill.stop;
}

/**
 * Fold a {@link ResolvedSkill}'s behavior params into a copy of the node's `data`, implementing
 * the SPEC 002 §4 **Option C** precedence `Node > Skill > (node default)`.
 *
 * A field is considered **node-set** — and the node's value is kept — when its current value
 * differs from the node's own default (`defaults[field]`). Only fields the node left at their
 * default are filled from the Skill. The returned object is then fed to the *existing* per-field
 * resolution (`getInputOrData`, `resolveChatToolChoice`, …), so an input-port-wired value still
 * wins automatically: `getInputOrData` short-circuits to the input before ever reading the
 * patched field.
 *
 * Pure: returns a shallow copy; never mutates `data`. `systemPrompt` is intentionally excluded
 * (handled by message injection, not param resolution).
 *
 * Caveat: `maxTokens` is read directly from `data` in `process()` (its input port is ignored —
 * a pre-existing quirk), so its node-set detection rests only on differs-from-default.
 */
export function applySkillParams<T extends Record<string, unknown>>(data: T, defaults: T, skill: ResolvedSkill): T {
  const patched: T = { ...data };
  for (const field of SKILL_PARAM_FIELDS) {
    const skillValue = skill[field as SkillParamField];
    if (skillValue === undefined) {
      continue; // Skill has no opinion on this field.
    }
    if (data[field as keyof T] !== (defaults[field as keyof T] as unknown)) {
      continue; // Node-set (value differs from its default) — the node wins.
    }
    (patched as Record<string, unknown>)[field] = skillValue;
  }
  return patched;
}
