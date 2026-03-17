import { useAtomValue } from 'jotai';
import { projectNodeRegistryState } from '../state/plugins.js';

export function useProjectNodeRegistry() {
  return useAtomValue(projectNodeRegistryState);
}
