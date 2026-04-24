import { atom } from 'jotai';
import { createBuiltInRegistry, type PluginLoadSpec } from '@ironclad/rivet-core';

export type PluginState = {
  id: string;
  loaded: boolean;
  spec: PluginLoadSpec;
  error?: string;
};

export const pluginRefreshCounterState = atom<number>(0);
export const pluginRetryCounterState = atom<number>(0);
export const projectNodeRegistryState = atom(createBuiltInRegistry());

export const pluginsState = atom<PluginState[]>([]);
