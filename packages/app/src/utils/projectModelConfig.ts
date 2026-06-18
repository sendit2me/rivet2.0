import { type ModelConfig, type Project } from '@valerypopoff/rivet2-core';

/** The model-config entities, per axis, that the editor lists and the selectors offer. */
export type EditorModelConfig = {
  profiles: NonNullable<ModelConfig['profiles']>;
  skills: NonNullable<ModelConfig['skills']>;
  presets: NonNullable<ModelConfig['presets']>;
};

/**
 * The **single source** of the model-config entities the node/preset selectors offer (Feature 005
 * Phase B). Today it returns the **project's** embedded config (`Project.modelConfig`, the
 * portability home from 006) — the selectors read what travels and runs.
 *
 * Forward-compat (the deferred global library): when authoring `Settings.modelConfig` lands, this
 * becomes `merge(project, global)` **project-first**, mirroring the runtime `assembleModelConfig`.
 * That is a one-spot change here — the three selector renderers call this helper and never touch the
 * source directly, so they don't get re-edited.
 *
 * Pure. Absent axes normalize to empty arrays so callers don't repeat the `?? []` dance.
 */
export function getEditorModelConfig(project: Pick<Project, 'modelConfig'>): EditorModelConfig {
  return {
    profiles: project.modelConfig?.profiles ?? [],
    skills: project.modelConfig?.skills ?? [],
    presets: project.modelConfig?.presets ?? [],
  };
}
