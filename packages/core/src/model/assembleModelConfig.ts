import type { Project } from './Project.js';
import type { ModelConfig, Settings } from './Settings.js';

/**
 * Merge two arrays of id-bearing entities, with `winners` taking precedence over `fallbacks` for
 * any shared id. Winners keep their order and come first; fallbacks contribute only the ids the
 * winners don't already define. Pure — returns a fresh array, mutates neither input. Returns
 * `undefined` only when both inputs are absent (so an absent axis stays absent rather than becoming
 * an empty array — keeps the serialized/round-tripped shape minimal and the byte-identical rail clean).
 */
function mergeById<T extends { id: string }>(winners?: T[], fallbacks?: T[]): T[] | undefined {
  if (winners == null && fallbacks == null) {
    return undefined;
  }

  const seen = new Set<string>();
  const merged: T[] = [];

  for (const entity of winners ?? []) {
    if (!seen.has(entity.id)) {
      seen.add(entity.id);
      merged.push(entity);
    }
  }
  for (const entity of fallbacks ?? []) {
    if (!seen.has(entity.id)) {
      seen.add(entity.id);
      merged.push(entity);
    }
  }

  return merged;
}

/**
 * Merge two {@link ModelConfig}s, with `project` winning over `global` per id on each axis
 * (profiles / skills / presets). Pure and no-mutate.
 */
export function mergeModelConfig(project?: ModelConfig, global?: ModelConfig): ModelConfig {
  return {
    profiles: mergeById(project?.profiles, global?.profiles),
    skills: mergeById(project?.skills, global?.skills),
    presets: mergeById(project?.presets, global?.presets),
  };
}

/**
 * Build the effective {@link Settings} a processor resolves against, by folding the project's
 * embedded {@link ModelConfig} over the global library — **project wins by id**. Every other
 * settings field is carried through untouched. Pure and no-mutate: returns a fresh `Settings`
 * (and a fresh `modelConfig`), leaving both inputs unchanged.
 *
 * This is the one runtime seam that makes a saved project portable: a headless/published/triggered
 * run has no global `Settings`, so the merged `modelConfig` is what every node resolves from. Run
 * once per processor against *that* processor's project (see `GraphProcessor.#initializeGraphRun`),
 * so subgraphs — including cross-project references — resolve against the right project.
 */
export function assembleModelConfig(global: Settings, project: Project): Settings {
  return {
    ...global,
    modelConfig: mergeModelConfig(project.modelConfig, global.modelConfig),
  };
}
