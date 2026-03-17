import { useProjectNodeRegistry } from './useProjectNodeRegistry';

export function useDependsOnPlugins() {
  return useProjectNodeRegistry().getPlugins();
}
