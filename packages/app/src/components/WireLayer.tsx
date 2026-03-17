import { type FC, useCallback, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { type NodeConnection, type NodeId, type PortId } from '@ironclad/rivet-core';
import { css } from '@emotion/react';
import { ConditionallyRenderWire, PartialWire, getConnectionCacheKeys, getNodePortPosition } from './Wire.js';
import { canvasToClientPosition, useCanvasPositioning } from '../hooks/useCanvasPositioning.js';
import { ErrorBoundary } from 'react-error-boundary';
import { draggingWireClosestPortState } from '../state/graphBuilder.js';
import { orderBy } from 'lodash-es';
import { ioDefinitionsForNodeState, nodesByIdState } from '../state/graph';
import { type PortPositions } from './NodeCanvas';
import {
  currentGraphViewState,
  graphRunHistoryByViewState,
  lastRunDataByNodeState,
  selectedGraphRunByViewState,
  selectedProcessPageNodesState,
  type RunDataByNodeId,
} from '../state/dataFlow';
import select from '@atlaskit/select/dist/types/entry-points/select';
import { useStableCallback } from '../hooks/useStableCallback';
import { lineCrossesViewport } from '../utils/lineClipping';
import { useAtom, useAtomValue, useStore } from 'jotai';
import { getGraphSelectionOptions, getSelectedProcessData } from '../state/selectors/executionSelectors.js';

const wiresStyles = css`
  width: 100%;
  height: 100%;
  pointer-events: none;

  path {
    stroke-linecap: butt;
    fill: none;
    stroke: gray;
  }

  .wire.isNotRan {
    stroke: var(--grey-lightish);
    stroke-dasharray: 5;
  }

  .wire.highlighted {
    stroke: var(--primary);
    transition: stroke 0.2s ease-out;
  }
`;

export type WireDef = {
  startNodeId: NodeId;
  startPortId: PortId;
  endNodeId?: NodeId;
  endPortId?: PortId;
  startPortIsInput: boolean;
};

type WireLayerProps = {
  connections: NodeConnection[];
  draggingWire?: WireDef;
  draggingNode: boolean;
  highlightedNodes?: NodeId[];
  portPositions: PortPositions;
  highlightedPort?: {
    nodeId: NodeId;
    isInput: boolean;
    portId: PortId;
  };
};

export const WireLayer: FC<WireLayerProps> = ({
  connections,
  draggingWire,
  draggingNode,
  highlightedNodes,
  portPositions,
  highlightedPort,
}) => {
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [closestPort, setClosestPort] = useAtom(draggingWireClosestPortState);
  const store = useStore();

  const currentGraphView = useAtomValue(currentGraphViewState);
  const graphRunHistoryByView = useAtomValue(graphRunHistoryByViewState);
  const lastRunDataByNode = useAtomValue(lastRunDataByNodeState);
  const selectedGraphRunByView = useAtomValue(selectedGraphRunByViewState);
  const selectedProcessPageNodes = useAtomValue(selectedProcessPageNodesState);

  const graphSelectionOptions = useMemo(
    () => getGraphSelectionOptions({ currentGraphView, graphRunHistoryByView, selectedGraphRunByView }),
    [currentGraphView, graphRunHistoryByView, selectedGraphRunByView],
  );

  const handleMouseDown = useStableCallback((event: MouseEvent) => {
    const { clientX, clientY } = event;
    setMousePosition({ x: clientX, y: clientY });
  });

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!draggingWire && !draggingNode) {
        return;
      }

      const { clientX, clientY } = event;
      setMousePosition({ x: clientX, y: clientY });

      if (draggingWire) {
        const hoverElems = document
          .elementsFromPoint(clientX, clientY)
          .filter((elem) => elem.classList.contains('port-hover-area'));

        if (hoverElems.length === 0) {
          setClosestPort(undefined);
        } else {
          const closestHoverElem = orderBy(hoverElems, (elem) => {
            const elemPosition = elem.getBoundingClientRect();
            const elemCenter = {
              x: elemPosition.x + elemPosition.width / 2,
              y: elemPosition.y + elemPosition.height / 2,
            };
            const distance = Math.sqrt(Math.pow(clientX - elemCenter.x, 2) + Math.pow(clientY - elemCenter.y, 2));
            return distance;
          })[0] as HTMLElement;

          const portId = closestHoverElem!.parentElement!.dataset.portid as PortId | undefined;
          const nodeId = closestHoverElem!.parentElement!.dataset.nodeid as NodeId | undefined;

          if (portId && nodeId) {
            const io = store.get(ioDefinitionsForNodeState(nodeId));
            const definition = io!.inputDefinitions.find((def) => def.id === portId)!;

            setClosestPort({ nodeId, portId, element: closestHoverElem.parentElement!, definition });
          } else {
            setClosestPort(undefined);
          }
        }
      } else if (closestPort !== undefined) {
        setClosestPort(undefined);
      }
    },
    [draggingWire, setClosestPort, draggingNode, store, closestPort],
  );

  useEffect(() => {
    window.addEventListener('mousedown', handleMouseDown, { capture: true });
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown, { capture: true });
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove, handleMouseDown]);

  useLayoutEffect(() => {}, [draggingWire, mousePosition.x, mousePosition.y, setClosestPort]);

  const { canvasPosition, clientToCanvasPosition, canvasToClientPosition } = useCanvasPositioning();
  const mousePositionCanvas = clientToCanvasPosition(mousePosition.x, mousePosition.y);

  const nodesById = useAtomValue(nodesByIdState);

  const renderableWires = useMemo(() => {
    return connections.filter((connection) => {
      const inputNode = nodesById[connection.inputNodeId];
      const outputNode = nodesById[connection.outputNodeId];

      if (!inputNode || !outputNode) {
        return false;
      }

      const [outputCacheKey, inputCacheKey] = getConnectionCacheKeys(connection);

      const start = getNodePortPosition(outputNode, connection.outputId, outputCacheKey, portPositions);
      const end = getNodePortPosition(inputNode, connection.inputId, inputCacheKey, portPositions);

      const startClient = canvasToClientPosition(start.x, start.y);
      const endClient = canvasToClientPosition(end.x, end.y);

      return lineCrossesViewport(startClient, endClient);
    });
  }, [nodesById, canvasToClientPosition, connections, portPositions]);

  return (
    <svg css={wiresStyles}>
      <g transform={`scale(${canvasPosition.zoom}) translate(${canvasPosition.x}, ${canvasPosition.y})`}>
        {draggingWire && (
          <ErrorBoundary fallback={<></>} key="wire-inprogress">
            {draggingWire.endNodeId && draggingWire.endPortId ? (
              <ConditionallyRenderWire
                connection={{
                  outputNodeId: draggingWire.startNodeId,
                  outputId: draggingWire.startPortId,
                  inputNodeId: draggingWire.endNodeId,
                  inputId: draggingWire.endPortId,
                }}
                selected={false}
                highlighted={!!(draggingWire.endNodeId && draggingWire.endPortId)}
                nodesById={nodesById}
                portPositions={portPositions}
                isNotRan={false}
              />
            ) : (
              <PartialWire
                connection={{
                  nodeId: draggingWire.startNodeId,
                  portId: draggingWire.startPortId,
                  toX: mousePositionCanvas.x,
                  toY: mousePositionCanvas.y,
                }}
                portPositions={portPositions}
              />
            )}
          </ErrorBoundary>
        )}
        {renderableWires.map((connection) => {
          const isHighlightedNode =
            highlightedNodes?.includes(connection.inputNodeId) || highlightedNodes?.includes(connection.outputNodeId);

          const isCurrentlyRunning =
            getSelectedProcessData(
              lastRunDataByNode[connection.inputNodeId],
              selectedProcessPageNodes[connection.inputNodeId] ?? 0,
              graphSelectionOptions,
            )?.data.status?.type === 'running';

          const isHighlightedPort =
            highlightedPort &&
            (highlightedPort.isInput ? connection.inputId : connection.outputId) === highlightedPort.portId &&
            (highlightedPort.isInput ? connection.inputNodeId : connection.outputNodeId) === highlightedPort.nodeId;

          const isNotRan = getIsNotRan(connection, selectedProcessPageNodes, lastRunDataByNode, graphSelectionOptions);

          const highlighted = isHighlightedNode || isCurrentlyRunning || isHighlightedPort;
          return (
            <ErrorBoundary fallback={<></>} key={`wire-${connection.inputId}-${connection.inputNodeId}`}>
              <ConditionallyRenderWire
                connection={connection}
                selected={false}
                highlighted={!!highlighted}
                nodesById={nodesById}
                portPositions={portPositions}
                isNotRan={isNotRan}
              />
            </ErrorBoundary>
          );
        })}
      </g>
    </svg>
  );
};

function getIsNotRan(
  connection: NodeConnection,
  selectedProcessPageNodes: Record<NodeId, number | 'latest'>,
  lastRunDataByNode: RunDataByNodeId,
  graphSelectionOptions: Parameters<typeof getSelectedProcessData>[2],
) {
  const inputNodeSelectedExecution = getSelectedProcessData(
    lastRunDataByNode[connection.inputNodeId],
    selectedProcessPageNodes[connection.inputNodeId] ?? 0,
    graphSelectionOptions,
  );
  const outputNodeSelectedExecution = getSelectedProcessData(
    lastRunDataByNode[connection.outputNodeId],
    selectedProcessPageNodes[connection.outputNodeId] ?? 0,
    graphSelectionOptions,
  );

  if (inputNodeSelectedExecution?.data.inputData && outputNodeSelectedExecution?.data.outputData) {
    return (
      inputNodeSelectedExecution.data.inputData[connection.inputId]?.type === 'control-flow-excluded' ||
      outputNodeSelectedExecution.data.outputData[connection.outputId]?.type === 'control-flow-excluded'
    );
  }

  return false;
}
