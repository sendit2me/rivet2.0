import { useAtom } from 'jotai';
import { nanoid } from 'nanoid/non-secure';
import {
  cloneModelConfigEntity,
  type LlmPreset,
  type LlmProfile,
  type LlmSkill,
  type ModelConfig,
} from '@valerypopoff/rivet2-core';
import { projectState } from '../state/savedGraphs.js';
import { flushHybridStorageGroup } from '../state/storage.js';
import { handleError } from '../utils/errorHandling.js';

type AxisKey = keyof Pick<ModelConfig, 'profiles' | 'skills' | 'presets'>;

/**
 * The single write path for the model-config layer (R3). Owns the `projectState` read/write + the
 * debounced-group flush, so BOTH the project-settings panel and the inline node-editor authoring modal
 * author through identical logic (no duplicated store code, identical persist timing). Writes land
 * under `Project.modelConfig` per axis (project-scoped → travels with the project, runs headless, 006).
 */
export function useModelConfigAuthoring() {
  const [project, setProject] = useAtom(projectState);

  const profiles = project.modelConfig?.profiles ?? [];
  const skills = project.modelConfig?.skills ?? [];
  const presets = project.modelConfig?.presets ?? [];

  const writeAxis = <K extends AxisKey>(axis: K, next: NonNullable<ModelConfig[K]>) => {
    setProject((prev) => ({ ...prev, modelConfig: { ...prev.modelConfig, [axis]: next } }));
    // The 'project' hybrid group is debounced — flush so edits persist + survive reload.
    void flushHybridStorageGroup('project').catch((error) => {
      handleError(error, 'Failed to persist project model config', { toastError: false });
    });
  };

  // Upsert by id (replace if present, else append) — the shared add/update/clone primitive.
  const upsert = <T extends { id: string }>(axis: AxisKey, list: readonly T[], entity: T) =>
    writeAxis(
      axis,
      (list.some((x) => x.id === entity.id) ? list.map((x) => (x.id === entity.id ? entity : x)) : [...list, entity]) as never,
    );
  const remove = (axis: AxisKey, list: readonly { id: string }[], id: string) =>
    writeAxis(axis, list.filter((x) => x.id !== id) as never);
  // Clone (copy-new): a diverging deep copy with a fresh id; appended via upsert; returns it (for selection).
  const cloneInto = <T extends { id: string; name: string }>(axis: AxisKey, list: readonly T[], entity: T): T => {
    const clone = cloneModelConfigEntity(entity, nanoid());
    upsert(axis, list, clone);
    return clone;
  };

  return {
    profiles,
    skills,
    presets,
    newId: () => nanoid(),
    upsertProfile: (p: LlmProfile) => upsert('profiles', profiles, p),
    upsertSkill: (s: LlmSkill) => upsert('skills', skills, s),
    upsertPreset: (p: LlmPreset) => upsert('presets', presets, p),
    removeProfile: (id: string) => remove('profiles', profiles, id),
    removeSkill: (id: string) => remove('skills', skills, id),
    removePreset: (id: string) => remove('presets', presets, id),
    cloneProfile: (p: LlmProfile) => cloneInto('profiles', profiles, p),
    cloneSkill: (s: LlmSkill) => cloneInto('skills', skills, s),
    clonePreset: (p: LlmPreset) => cloneInto('presets', presets, p),
  };
}
