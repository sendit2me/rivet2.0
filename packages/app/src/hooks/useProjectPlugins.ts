import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { assembleRegistry, logRuntimeDebug, logRuntimeInfo, resolveBuiltInPlugin } from '@valerypopoff/rivet2-core';
import type { PluginLoadSpec, RivetPlugin } from '@valerypopoff/rivet2-core';
import {
  appPluginSpecsState,
  pluginRefreshCounterState,
  pluginRetryCounterState,
  pluginsState,
  projectNodeRegistryState,
} from '../state/plugins';
import { produce } from 'immer';
import { match } from 'ts-pattern';
import * as Rivet from '@valerypopoff/rivet2-core';
import { useLoadPackagePlugin } from './useLoadPackagePlugin';
import useAsyncEffect from 'use-async-effect';
import { toast } from 'react-toastify';
import { importPluginInitializer } from '../utils/pluginInitializer.js';
import { handleError } from '../utils/errorHandling.js';

export function useProjectPlugins() {
  const pluginSpecs = useAtomValue(appPluginSpecsState);
  const retryCounter = useAtomValue(pluginRetryCounterState);
  const setPlugins = useSetAtom(pluginsState);
  const setProjectNodeRegistry = useSetAtom(projectNodeRegistryState);
  const setPluginRefreshCounter = useSetAtom(pluginRefreshCounterState);
  const loadGenerationRef = useRef(0);
  const { loadPackagePlugin } = useLoadPackagePlugin({
    onLog: (message) => logRuntimeDebug('Package plugin loader log', { message }),
  });

  const updatePluginState = (id: string, updates: { loaded?: boolean; error?: string; plugin?: RivetPlugin }) => {
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

      updatePluginState(spec.id, { loaded: true, plugin });

      logRuntimeInfo(`Loaded plugin: ${plugin.id}`);
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
          appPluginCount: pluginSpecs.length,
        },
        toastError: false,
      });
      updatePluginState(fail.id, { loaded: false, error: fail.error });
    }

    // Show toast for failures
    if (results.failed.length === 1) {
      toast.error(`Plugin "${results.failed[0]!.id}" failed to load: ${results.failed[0]!.error}`);
    } else if (results.failed.length > 1) {
      toast.error(`${results.failed.length} plugins failed to load. Check Settings > Plugins settings for details.`);
    }

    setProjectNodeRegistry(registry);
    setPluginRefreshCounter((oldValue) => oldValue + 1);
  }, [pluginSpecs, retryCounter]);
}
