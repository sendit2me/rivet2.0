import { css } from '@emotion/react';
import { type ChartNode, type NodeId } from '@valerypopoff/rivet2-core';
import { useAtomValue } from 'jotai';
import { type FC, type ReactNode, type RefObject } from 'react';
import { useMoveNodeCommand } from '../../commands/moveNodeCommand.js';
import {
  calculateMultiNodeAlignmentMoves,
  type MultiNodeAlignmentAction,
  type NodeLayoutBounds,
} from '../../domain/graphEditing/multiNodeAlignment.js';
import { useStableCallback } from '../../hooks/useStableCallback.js';
import { isReadOnlyGraphState } from '../../state/graph.js';
import { Tooltip } from '../Tooltip.js';
import { DEFAULT_NODE_WIDTH } from '../../utils/nodeResize.js';

const DEFAULT_NODE_HEIGHT = 200;

const styles = css`
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 215;
  display: flex;
  align-items: stretch;
  padding: 4px;
  background: var(--grey-darker);
  border: 1px solid var(--grey);
  border-radius: 16px;
  corner-shape: squircle;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.28);
  pointer-events: auto;

  .alignment-grid {
    display: grid;
    grid-template-columns: repeat(3, 36px);
    grid-template-rows: repeat(2, 36px);
  }

  .distribution-column {
    display: grid;
    grid-template-columns: 36px;
    grid-template-rows: repeat(2, 36px);
    margin-left: 4px;
    padding-left: 8px;
    border-left: 1px solid var(--grey);
  }

  .toolbar-button {
    display: flex;
  }

  button {
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    background: transparent;
    border-radius: 12px;
    corner-shape: squircle;
    color: var(--grey-light);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  button:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  button:active {
    background: rgba(255, 255, 255, 0.14);
  }

  svg {
    width: 18px;
    height: 18px;
    display: block;
  }
`;

function measureNodeBounds(
  selectedNodes: readonly ChartNode[],
  canvasRoot: HTMLDivElement | null,
): NodeLayoutBounds[] {
  const nodeElements = new Map<NodeId, HTMLElement>();

  canvasRoot?.querySelectorAll<HTMLElement>('.node[data-nodeid]:not(.overlayNode)').forEach((element) => {
    const nodeId = element.dataset.nodeid as NodeId | undefined;
    if (nodeId) {
      nodeElements.set(nodeId, element);
    }
  });

  return selectedNodes.map((node) => {
    const element = nodeElements.get(node.id);

    return {
      nodeId: node.id,
      x: node.visualData.x,
      y: node.visualData.y,
      width: element?.offsetWidth ?? node.visualData.width ?? DEFAULT_NODE_WIDTH,
      height: element?.offsetHeight ?? DEFAULT_NODE_HEIGHT,
    };
  });
}

const IconFrame: FC<{ children: ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    {children}
  </svg>
);

const AlignLeftIcon = () => (
  <IconFrame>
    <path d="M3 2v12" />
    <path d="M3 5h8" />
    <path d="M3 11h5" />
  </IconFrame>
);

const AlignCenterIcon = () => (
  <IconFrame>
    <path d="M8 2v12" />
    <path d="M4 5h8" />
    <path d="M5 11h6" />
  </IconFrame>
);

const AlignRightIcon = () => (
  <IconFrame>
    <path d="M13 2v12" />
    <path d="M5 5h8" />
    <path d="M8 11h5" />
  </IconFrame>
);

const AlignTopIcon = () => (
  <IconFrame>
    <path d="M2 3h12" />
    <path d="M5 3v8" />
    <path d="M11 3v5" />
  </IconFrame>
);

const AlignMiddleIcon = () => (
  <IconFrame>
    <path d="M2 8h12" />
    <path d="M5 4v8" />
    <path d="M11 5v6" />
  </IconFrame>
);

const AlignBottomIcon = () => (
  <IconFrame>
    <path d="M2 13h12" />
    <path d="M5 5v8" />
    <path d="M11 8v5" />
  </IconFrame>
);

const DistributeHorizontallyIcon = () => (
  <IconFrame>
    <path d="M3.5 2.5v11" />
    <path d="M8 5v6" />
    <path d="M12.5 2.5v11" />
  </IconFrame>
);

const DistributeVerticallyIcon = () => (
  <IconFrame>
    <path d="M2.5 3.5h11" />
    <path d="M5 8h6" />
    <path d="M2.5 12.5h11" />
  </IconFrame>
);

const ToolbarButton: FC<{
  action: MultiNodeAlignmentAction;
  label: string;
  onClick: (action: MultiNodeAlignmentAction) => void;
  children: ReactNode;
}> = ({ action, label, onClick, children }) => (
  <Tooltip content={label} tag="span" className="toolbar-button">
    <button type="button" aria-label={label} onClick={() => onClick(action)}>
      {children}
    </button>
  </Tooltip>
);

export interface MultiNodeAlignmentToolbarProps {
  canvasRootRef: RefObject<HTMLDivElement | null>;
  selectedNodes: ChartNode[];
}

export function shouldShowMultiNodeAlignmentToolbar(options: {
  selectedNodeCount: number;
  isReadOnlyGraph: boolean;
}): boolean {
  return options.selectedNodeCount >= 2 && !options.isReadOnlyGraph;
}

export const MultiNodeAlignmentToolbar: FC<MultiNodeAlignmentToolbarProps> = ({
  canvasRootRef,
  selectedNodes,
}) => {
  const moveNode = useMoveNodeCommand();
  const isReadOnlyGraph = useAtomValue(isReadOnlyGraphState);

  const applyAction = useStableCallback((action: MultiNodeAlignmentAction) => {
    const bounds = measureNodeBounds(selectedNodes, canvasRootRef.current);
    const moves = calculateMultiNodeAlignmentMoves(bounds, action).filter((move) => {
      const node = selectedNodes.find((selectedNode) => selectedNode.id === move.nodeId);
      return !node || node.visualData.x !== move.position.x || node.visualData.y !== move.position.y;
    });

    if (moves.length === 0) {
      return;
    }

    moveNode({ moves });
  });

  if (
    !shouldShowMultiNodeAlignmentToolbar({
      selectedNodeCount: selectedNodes.length,
      isReadOnlyGraph,
    })
  ) {
    return null;
  }

  return (
    <div css={styles}>
      <div className="alignment-grid">
        <ToolbarButton action="align-left" label="Align left" onClick={applyAction}>
          <AlignLeftIcon />
        </ToolbarButton>
        <ToolbarButton action="align-center" label="Align center" onClick={applyAction}>
          <AlignCenterIcon />
        </ToolbarButton>
        <ToolbarButton action="align-right" label="Align right" onClick={applyAction}>
          <AlignRightIcon />
        </ToolbarButton>
        <ToolbarButton action="align-top" label="Align top" onClick={applyAction}>
          <AlignTopIcon />
        </ToolbarButton>
        <ToolbarButton action="align-middle" label="Align middle" onClick={applyAction}>
          <AlignMiddleIcon />
        </ToolbarButton>
        <ToolbarButton action="align-bottom" label="Align bottom" onClick={applyAction}>
          <AlignBottomIcon />
        </ToolbarButton>
      </div>
      <div className="distribution-column">
        <ToolbarButton action="distribute-horizontally" label="Distribute horizontally" onClick={applyAction}>
          <DistributeHorizontallyIcon />
        </ToolbarButton>
        <ToolbarButton action="distribute-vertically" label="Distribute vertically" onClick={applyAction}>
          <DistributeVerticallyIcon />
        </ToolbarButton>
      </div>
    </div>
  );
};
