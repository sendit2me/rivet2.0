import type { RivetPluginInitializer } from '@valerypopoff/rivet2-core';

export function resolvePluginInitializer(moduleExport: unknown, pluginId: string): RivetPluginInitializer {
  let resolved = moduleExport;

  for (let depth = 0; depth < 2; depth += 1) {
    if (typeof resolved === 'function') {
      return resolved as RivetPluginInitializer;
    }

    if (typeof resolved !== 'object' || resolved == null || !('default' in resolved)) {
      break;
    }

    resolved = (resolved as { default: unknown }).default;
  }

  if (typeof resolved !== 'function') {
    throw new Error(`Plugin ${pluginId} does not export a valid initializer function`);
  }

  return resolved as RivetPluginInitializer;
}

export async function importPluginInitializer(specifier: string, pluginId: string): Promise<RivetPluginInitializer> {
  const imported = await import(/* @vite-ignore */ specifier);
  return resolvePluginInitializer(imported, pluginId);
}
