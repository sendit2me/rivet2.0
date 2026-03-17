import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { projectPluginsState } from '../state/savedGraphs';
import { assembleRegistry, resolveBuiltInPlugin } from '@ironclad/rivet-core';
import type { PluginLoadSpec } from '@ironclad/rivet-core';
import { pluginRefreshCounterState, pluginRetryCounterState, pluginsState, projectNodeRegistryState } from '../state/plugins';
import { produce } from 'immer';
import { match } from 'ts-pattern';
import * as Rivet from '@ironclad/rivet-core';
import { useLoadPackagePlugin } from './useLoadPackagePlugin';
import useAsyncEffect from 'use-async-effect';
import { toast } from 'react-toastify';
import { importPluginInitializer } from '../utils/pluginInitializer.js';
import { handleError } from '../utils/errorHandling.js';

export function useProjectPlugins() {
  const pluginSpecs = useAtomValue(projectPluginsState);
  const retryCounter = useAtomValue(pluginRetryCounterState);
  const setPlugins = useSetAtom(pluginsState);
  const setProjectNodeRegistry = useSetAtom(projectNodeRegistryState);
  const setPluginRefreshCounter = useSetAtom(pluginRefreshCounterState);
  const loadGenerationRef = useRef(0);
  const { loadPackagePlugin } = useLoadPackagePlugin({
    onLog: (message) => console.log(message),
  });

  const updatePluginState = (id: string, updates: { loaded?: boolean; error?: string }) => {
    setPlugins((oldPlugins) =>
      produce(oldPlugins, (draft) => {
        const entry = draft.find((p) => p.id === id);
        if (entry) {
          Object.assign(entry, updates);
        }
      }),
    );
  };

  useEffect(() => {
    return () => {
      loadGenerationRef.current += 1;
    };
  }, []);

  useAsyncEffect(async () => {
    const generation = ++loadGenerationRef.current;
    const isStale = () => loadGenerationRef.current !== generation;

    setPlugins(pluginSpecs.map((spec) => ({ id: spec.id, spec, loaded: false })));

    const { registry, results } = await assembleRegistry(pluginSpecs, async (spec: PluginLoadSpec) => {
      const plugin = await match(spec)
        .with({ type: 'built-in' }, async (s) => resolveBuiltInPlugin(s.id))
        .with({ type: 'uri' }, async (s) => {
          const mod = await importPluginInitializer(s.uri, s.id);
          const initialized = mod(Rivet);
          if (!initialized?.id) {
            throw new Error(`Plugin ${s.id} does not have an id`);
          }
          return initialized;
        })
        .with({ type: 'package' }, async (s) => {
          const loaded = await loadPackagePlugin(s);
          if (!loaded?.id) {
            throw new Error(`Plugin ${s.package} does not have an id`);
          }
          return loaded;
        })
        .exhaustive();

      if (isStale()) {
        return plugin;
      }

      updatePluginState(spec.id, { loaded: true });

      console.log(`Loaded plugin: ${plugin.id}`);
      return plugin;
    });

    if (isStale()) {
      return;
    }

    // Update UI state for failed plugins
    for (const fail of results.failed) {
      handleError(new Error(fail.error), `Failed to load plugin "${fail.id}"`, {
        metadata: {
          pluginId: fail.id,
          projectPluginCount: pluginSpecs.length,
        },
        toastError: false,
      });
      updatePluginState(fail.id, { loaded: false, error: fail.error });
    }

    // Show toast for failures
    if (results.failed.length === 1) {
      toast.error(`Plugin "${results.failed[0]!.id}" failed to load: ${results.failed[0]!.error}`);
    } else if (results.failed.length > 1) {
      toast.error(`${results.failed.length} plugins failed to load. Check Settings > Plugins for details.`);
    }

    setProjectNodeRegistry(registry);
    setPluginRefreshCounter((oldValue) => oldValue + 1);
  }, [pluginSpecs, retryCounter]);
}
