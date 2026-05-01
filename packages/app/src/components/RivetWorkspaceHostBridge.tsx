import { useEffect } from 'react';
import { useRivetWorkspaceHost, type RivetWorkspaceHost } from '../hooks/useRivetWorkspaceHost.js';
import { useStableCallback } from '../hooks/useStableCallback.js';

export type RivetWorkspaceHostBridgeProps = {
  onReady(workspaceHost: RivetWorkspaceHost): void;
  onDispose?(workspaceHost: RivetWorkspaceHost): void;
};

/**
 * Imperative bridge for wrappers that cannot conveniently call hooks from their
 * own integration layer. The workspace host object is a stable handle whose
 * methods always use the latest Rivet state after mount.
 */
export function RivetWorkspaceHostBridge({ onReady, onDispose }: RivetWorkspaceHostBridgeProps) {
  const workspaceHost = useRivetWorkspaceHost();
  const notifyReady = useStableCallback(onReady);
  const notifyDispose = useStableCallback((host: RivetWorkspaceHost) => onDispose?.(host));

  useEffect(() => {
    notifyReady(workspaceHost);
    return () => notifyDispose(workspaceHost);
  }, [notifyDispose, notifyReady, workspaceHost]);

  return null;
}
