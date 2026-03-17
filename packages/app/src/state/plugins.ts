import { atom } from 'jotai';
import { createBuiltInRegistry } from '@ironclad/rivet-core';
import { type PluginLoadSpec } from '../../../core/src/model/PluginLoadSpec';

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
