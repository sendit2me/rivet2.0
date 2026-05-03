import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { createBuiltInRegistry, type PluginLoadSpec, type RivetPlugin } from '@rivet2/rivet-core';
import { createHybridStorage } from './storage.js';

const { storage } = createHybridStorage('plugins');

export type PluginState = {
  id: string;
  loaded: boolean;
  spec: PluginLoadSpec;
  plugin?: RivetPlugin;
  error?: string;
};

export const pluginRefreshCounterState = atom<number>(0);
export const pluginRetryCounterState = atom<number>(0);
export const projectNodeRegistryState = atom(createBuiltInRegistry());

export const appPluginSpecsState = atomWithStorage<PluginLoadSpec[]>('appPluginSpecsState', [], storage);
export const pluginsState = atom<PluginState[]>([]);
