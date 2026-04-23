import { type ChartNode, type SubGraphNode } from '@ironclad/rivet-core';
import { useAtomValue } from 'jotai';
import { type FC, type MouseEvent, type PointerEvent } from 'react';
import { useGoToSubgraphNode } from '../../hooks/useGoToSubgraphNode.js';
import { projectState } from '../../state/savedGraphs.js';
import { Tooltip } from '../Tooltip.js';

const SubgraphLinkIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M8.15 6.25L9.45 4.95C10.82 3.58 13.05 3.58 14.42 4.95C15.79 6.32 15.79 8.55 14.42 9.92L12.32 12.02C11.15 13.19 9.35 13.36 8 12.53"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
    <path
      d="M11.85 13.75L10.55 15.05C9.18 16.42 6.95 16.42 5.58 15.05C4.21 13.68 4.21 11.45 5.58 10.08L7.68 7.98C8.85 6.81 10.65 6.64 12 7.47"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    />
    <path d="M8 12L12 8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
  </svg>
);

export const SubGraphHeaderLink: FC<{ node: ChartNode }> = ({ node }) => {
  const goToSubgraphNode = useGoToSubgraphNode();
  const project = useAtomValue(projectState);

  if (node.type !== 'subGraph') {
    return null;
  }

  const subGraphNode = node as SubGraphNode;
  const graphId = subGraphNode.data.graphId;

  if (!graphId || !project.graphs[graphId]) {
    return null;
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    goToSubgraphNode(subGraphNode);
  };

  const stopHeaderDrag = (event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
  };

  return (
    <Tooltip className="subgraph-link-tooltip" content="Go to subgraph">
      <button
        type="button"
        className="subgraph-link-button"
        aria-label="Go to subgraph"
        onClick={handleClick}
        onMouseDown={stopHeaderDrag}
        onPointerDown={stopHeaderDrag}
      >
        <SubgraphLinkIcon />
      </button>
    </Tooltip>
  );
};
