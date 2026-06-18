import type { LlmPreset, LlmPresetOverrides, Settings } from './Settings.js';
import { resolveProfile, type ResolvedProfile } from './LlmProfileResolution.js';
import { resolveSkill, type ResolvedSkill } from './LlmSkillResolution.js';
import { deepMerge } from '../utils/deepMerge.js';

/**
 * The expansion of an {@link LlmPreset}: its resolved Profile (connection) and Skill (behavior),
 * plus the whitelisted `overrides` carried verbatim. A Preset is a *composition*, so this is built
 * entirely from the existing `resolveProfile` / `resolveSkill` — no new precedence engine, and the
 * cycle/depth safety of those resolvers is inherited.
 */
export interface ResolvedPreset {
  profile: ResolvedProfile;
  skill: ResolvedSkill;
  overrides: LlmPresetOverrides;
}

const EMPTY_PRESET: ResolvedPreset = { profile: {}, skill: {}, overrides: {} };

/**
 * Resolve a preset id to its `{ profile, skill, overrides }` expansion (SPEC 003 §3):
 * - **Empty / unknown id** → `{ profile: {}, skill: {}, overrides: {} }` (caller falls back to
 *   global / No-Skill — keeps the no-preset path byte-identical).
 * - Otherwise look it up, then `resolveProfile(preset.profileId)` + `resolveSkill(preset.skillId)`
 *   (each traces and falls back independently if its referenced piece is missing — SPEC §6.1),
 *   carrying `preset.overrides`.
 *
 * Pure apart from the optional `onTrace` callback (wired to `context.trace`).
 */
export function resolvePreset(
  settings: Pick<Settings, 'llmPresets' | 'llmProfiles' | 'llmSkills'>,
  presetId: string | undefined,
  onTrace?: (message: string) => void,
): ResolvedPreset {
  if (!presetId) {
    return EMPTY_PRESET;
  }

  const preset = (settings.llmPresets ?? []).find((p) => p.id === presetId);
  if (!preset) {
    onTrace?.(`LLM preset '${presetId}' not found; using global settings`);
    return EMPTY_PRESET;
  }

  return {
    profile: resolveProfile(settings, preset.profileId, onTrace),
    skill: resolveSkill(settings, preset.skillId, onTrace),
    overrides: preset.overrides ?? {},
  };
}

/**
 * Find the preset to apply to a node that selects nothing. Returns the first `isDefault` preset, or
 * `undefined` when none is flagged — which is what keeps the no-default path byte-identical to
 * post-002 (the sacred rail). If several are flagged, the first wins and a warning is traced.
 */
export function findDefaultPreset(
  settings: Pick<Settings, 'llmPresets'>,
  onTrace?: (message: string) => void,
): LlmPreset | undefined {
  const defaults = (settings.llmPresets ?? []).filter((p) => p.isDefault);
  if (defaults.length === 0) {
    return undefined;
  }
  if (defaults.length > 1) {
    onTrace?.(
      `Multiple default LLM presets flagged (${defaults.map((p) => `'${p.id}'`).join(', ')}); using the first ('${defaults[0]!.id}')`,
    );
  }
  return defaults[0];
}

/**
 * Layer a Preset's connection overrides on top of a resolved Profile (overrides win; `headers`
 * deep-merged). Feeding the result to `resolveChatNodeConnection` as the `profile` yields
 * `Node > Preset.overrides > Profile > Global` for connection fields — no new precedence logic.
 * Pure; returns a copy.
 */
export function applyPresetOverridesToProfile(profile: ResolvedProfile, overrides: LlmPresetOverrides): ResolvedProfile {
  const result: ResolvedProfile = { ...profile };
  if (overrides.endpoint !== undefined) result.endpoint = overrides.endpoint;
  if (overrides.apiKey !== undefined) result.apiKey = overrides.apiKey;
  if (overrides.organization !== undefined) result.organization = overrides.organization;
  if (overrides.defaultModel !== undefined) result.defaultModel = overrides.defaultModel;
  if (overrides.headers !== undefined) result.headers = { ...result.headers, ...overrides.headers };
  return result;
}

/**
 * Layer a Preset's behavior overrides on top of a resolved Skill (overrides win). Feeding the
 * result to `applySkillParams` / the systemPrompt injection yields `Node > Preset.overrides > Skill`
 * for behavior fields. Pure; returns a copy.
 */
export function applyPresetOverridesToSkill(skill: ResolvedSkill, overrides: LlmPresetOverrides): ResolvedSkill {
  const result: ResolvedSkill = { ...skill };
  if (overrides.systemPrompt !== undefined) result.systemPrompt = overrides.systemPrompt;
  if (overrides.temperature !== undefined) result.temperature = overrides.temperature;
  if (overrides.top_p !== undefined) result.top_p = overrides.top_p;
  if (overrides.useTopP !== undefined) result.useTopP = overrides.useTopP;
  if (overrides.maxTokens !== undefined) result.maxTokens = overrides.maxTokens;
  if (overrides.reasoningEffort !== undefined) result.reasoningEffort = overrides.reasoningEffort;
  if (overrides.toolChoice !== undefined) result.toolChoice = overrides.toolChoice;
  if (overrides.responseFormat !== undefined) result.responseFormat = overrides.responseFormat;
  if (overrides.stop !== undefined) result.stop = overrides.stop;
  return result;
}

/** The Preset/Profile/Skill selectors a node carries (subset of `ChatNodeConfigData`). */
export interface NodeModelSelectors {
  llmPresetId?: string;
  llmProfileId?: string;
  llmSkillId?: string;
  /** The node's own `extraBody` (Feature 004), highest in the deep-merge. */
  extraBody?: Record<string, unknown>;
}

/** The effective connection (Profile) and behavior (Skill) for a node, after Preset composition. */
export interface NodeModelComposition {
  /** Resolved profile with the preset's connection overrides folded in (overrides win). */
  profile: ResolvedProfile;
  /** Resolved skill with the preset's behavior overrides folded in (overrides win). */
  skill: ResolvedSkill;
  /** Deep-merged behavior-axis body params: Skill < Preset.override < Node (Node wins per key). */
  extraBody: Record<string, unknown>;
}

/**
 * Resolve a node's selectors into the effective Profile + Skill, implementing the SPEC 003
 * selection + default rules. This is the single source of truth the Chat node calls; downstream,
 * the result feeds the existing `resolveChatNodeConnection` (connection) and `applySkillParams` /
 * systemPrompt injection (behavior), which complete the `Node > Preset.overrides > Skill > Profile
 * > Global` chain.
 *
 * Rules:
 * - **Default-selection (all-or-nothing):** a preset flagged `isDefault` applies only when the node
 *   selects nothing on any axis (`!llmPresetId && !llmProfileId && !llmSkillId`). Touch any selector
 *   and you opt out (global for whatever you didn't set). With no `isDefault` preset, the effective
 *   preset is empty → byte-identical to the no-preset path.
 * - **Node > Preset for selection:** an explicit node `llmProfileId` / `llmSkillId` *replaces* the
 *   preset's corresponding piece; a blank selector inherits the preset's piece.
 * - **Overrides fold on top** of whichever profile/skill was selected (so a preset override beats a
 *   node-selected profile — `Preset.overrides > Profile` — while a value typed directly on the node
 *   still wins later via `resolveChatNodeConnection` / `applySkillParams`).
 *
 * Pure apart from the optional `onTrace` callback.
 */
export function resolveNodeModelComposition(
  settings: Pick<Settings, 'llmPresets' | 'llmProfiles' | 'llmSkills'>,
  selectors: NodeModelSelectors,
  onTrace?: (message: string) => void,
): NodeModelComposition {
  const selectsNothing = !selectors.llmPresetId && !selectors.llmProfileId && !selectors.llmSkillId;
  const effectivePresetId =
    selectors.llmPresetId || (selectsNothing ? findDefaultPreset(settings, onTrace)?.id : undefined);
  const preset = resolvePreset(settings, effectivePresetId, onTrace);

  const profile = selectors.llmProfileId ? resolveProfile(settings, selectors.llmProfileId, onTrace) : preset.profile;
  const skill = selectors.llmSkillId ? resolveSkill(settings, selectors.llmSkillId, onTrace) : preset.skill;

  // extraBody (Feature 004) deep-merges across the behavior axis: Skill < Preset.override < Node,
  // Node winning per key. This is NOT the scalar Option-C path — it is a per-key deep merge.
  const extraBody = deepMerge(
    deepMerge(skill.extraBody ?? {}, preset.overrides.extraBody ?? {}),
    selectors.extraBody ?? {},
  );

  return {
    profile: applyPresetOverridesToProfile(profile, preset.overrides),
    skill: applyPresetOverridesToSkill(skill, preset.overrides),
    extraBody,
  };
}
