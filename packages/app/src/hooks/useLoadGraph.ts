import { type NodeGraph } from '@ironclad/rivet-core';
import { useStableCallback } from './useStableCallback.js';
import { useWorkspaceTransitions } from './useWorkspaceTransitions.js';

export function useLoadGraph() {
  const workspaceTransitions = useWorkspaceTransitions();

  return useStableCallback((savedGraph: NodeGraph, { pushHistory = true }: { pushHistory?: boolean } = {}) => {
    workspaceTransitions.switchGraph(savedGraph, { pushHistory });
  });
}
