import { type ChartNode } from '@valerypopoff/rivet2-core';
import { useAtomValue, useSetAtom } from 'jotai';
import { type FC, memo } from 'react';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins.js';
import { useStableCallback } from '../hooks/useStableCallback.js';
import { expandedOutputNodeIdsState, fullscreenOutputNodeState, hoveringNodeState } from '../state/graphBuilder.js';
import { NodeInlineOutput } from './nodeOutput/NodeInlineOutput.js';

export { FullscreenNodeOutputModalRenderer } from './nodeOutput/NodeFullscreenOutput.js';

export const NodeOutput: FC<{ node: ChartNode; suspended?: boolean; isHovered?: boolean }> = memo(
  ({ node, suspended = false, isHovered = false }) => {
    const isOutputExpanded = useAtomValue(expandedOutputNodeIdsState).includes(node.id);

    if (suspended && !isOutputExpanded) {
      return null;
    }

    return <ActiveNodeOutput node={node} isOutputExpanded={isOutputExpanded} isHovered={isHovered} />;
  },
);

NodeOutput.displayName = 'NodeOutput';

const ActiveNodeOutput: FC<{ node: ChartNode; isOutputExpanded: boolean; isHovered: boolean }> = ({
  node,
  isOutputExpanded,
  isHovered,
}) => {
  useDependsOnPlugins();

  const setExpandedOutputNodeIds = useSetAtom(expandedOutputNodeIdsState);
  const setFullscreenOutputNodeId = useSetAtom(fullscreenOutputNodeState);
  const setHoveringNode = useSetAtom(hoveringNodeState);

  const clearNodeHover = useStableCallback(() => {
    setHoveringNode((hoveringNodeId) => (hoveringNodeId === node.id ? undefined : hoveringNodeId));
  });

  const handleToggleExpandedOutput = useStableCallback(() => {
    setExpandedOutputNodeIds((previous) =>
      previous.includes(node.id) ? previous.filter((nodeId) => nodeId !== node.id) : [...previous, node.id],
    );
  });
  const handleOpenFullscreenModal = useStableCallback(() => {
    clearNodeHover();
    setFullscreenOutputNodeId(node.id);
  });

  return (
    <div className="node-output-outer">
      <NodeInlineOutput
        node={node}
        isOutputExpanded={isOutputExpanded}
        isHovered={isHovered}
        onToggleExpandedOutput={handleToggleExpandedOutput}
        onOpenFullscreenModal={handleOpenFullscreenModal}
      />
    </div>
  );
};
