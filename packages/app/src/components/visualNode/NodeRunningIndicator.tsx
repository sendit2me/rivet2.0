import { memo, useEffect, useState } from 'react';

const NODE_RUNNING_INDICATOR_DELAY_MS = 500;

export const NodeRunningIndicator = memo(({ isRunning }: { isRunning: boolean }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isRunning) {
      setVisible(false);
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setVisible(true);
    }, NODE_RUNNING_INDICATOR_DELAY_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [isRunning]);

  if (!visible) {
    return null;
  }

  return <span className="node-running-indicator" aria-label="Node running" role="status" />;
});

NodeRunningIndicator.displayName = 'NodeRunningIndicator';
