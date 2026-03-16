/**
 * Registry assembly helpers.
 *
 * Encapsulates the three explicit operations on a node registry:
 *   1. createBuiltInRegistry – fresh registry with only built-in nodes
 *   2. registerProjectPlugins – extend a registry with loaded plugins
 *   3. assembleRegistry – 1 + 2 in one step
 *
 * Both the app (useProjectPlugins) and the sidecar (executor.mts) share
 * this flow.  Plugin *loading* is environment-specific, so callers supply
 * a `loadPlugin` callback that resolves a PluginLoadSpec into a RivetPlugin.
 */

import { NodeRegistration } from './NodeRegistration.js';
import { registerBuiltInNodes } from './Nodes.js';
import type { RivetPlugin } from './RivetPlugin.js';
import type { PluginLoadSpec } from './PluginLoadSpec.js';
import { plugins as builtInPlugins } from '../plugins.js';

/** Create a fresh registry containing only built-in nodes (no plugins). */
export function createBuiltInRegistry(): NodeRegistration<any, any> {
  return registerBuiltInNodes(new NodeRegistration());
}

/** Resolve a built-in plugin spec by id. Throws for unknown ids. */
export function resolveBuiltInPlugin(id: string): RivetPlugin {
  const plugin = builtInPlugins[id as keyof typeof builtInPlugins];
  if (!plugin) {
    throw new Error(`Unknown built-in plugin: ${id}`);
  }
  return plugin;
}

export type PluginLoadResult = {
  loaded: RivetPlugin[];
  failed: { id: string; error: string }[];
};

/**
 * Register an array of already-loaded plugins into a registry.
 * Returns the count of successfully registered plugins.
 */
export function registerPluginsIntoRegistry(
  registry: NodeRegistration<any, any>,
  plugins: RivetPlugin[],
): void {
  for (const plugin of plugins) {
    registry.registerPlugin(plugin);
  }
}

/**
 * Assemble a complete registry: built-in nodes + project plugins.
 *
 * `loadPlugin` is called for each spec and must return a `RivetPlugin`.
 * If loading or registration throws, the spec is recorded as failed and
 * assembly continues.
 *
 * Returns the assembled registry plus load results.
 */
export async function assembleRegistry(
  specs: PluginLoadSpec[],
  loadPlugin: (spec: PluginLoadSpec) => Promise<RivetPlugin>,
): Promise<{ registry: NodeRegistration<any, any>; results: PluginLoadResult }> {
  const registry = createBuiltInRegistry();

  const loaded: RivetPlugin[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const spec of specs) {
    try {
      const plugin = await loadPlugin(spec);
      registerPluginsIntoRegistry(registry, [plugin]);
      loaded.push(plugin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ id: spec.id, error: message });
    }
  }

  return { registry, results: { loaded, failed } };
}
