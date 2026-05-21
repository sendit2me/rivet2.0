import assert from 'node:assert/strict';
import test from 'node:test';
import { type ChartNode, type PortId } from '@valerypopoff/rivet2-core';
import {
  makeConnection,
  makeGraph,
  makeGraphInputNode,
  makeProject,
  makeSubGraphNode,
  makeTextNode,
} from '../domain/graphEditing/testGraphBuilders.js';
import { buildEditNodeAppliedData } from './editNodeCommand.js';
import { makeCommandState, parentGraphId, registry, subGraphId } from './editNodeCommandTestUtils.js';

test('editNode applied data snapshots external subgraph caller rewrites on graph input rename', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'old');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'new',
    },
  } as ChartNode;
  const sourceNode = makeTextNode('source', 'source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const parentConnection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const parentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [parentConnection]);
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), parentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: graphInputNode,
    previousConnections: currentState.connections,
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.previousGraph.connections, [parentConnection]);
  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    {
      ...parentConnection,
      inputId: 'new' as PortId,
    },
  ]);
});

test('editNode merged graph input renames keep the original undo snapshot and final external rewrite', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'new',
    },
  } as ChartNode;
  const sourceNode = makeTextNode('source', 'source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldParentConnection = makeConnection({
    outputNodeId: sourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempParentConnection = {
    ...oldParentConnection,
    inputId: 'temp' as PortId,
  };
  const previousParentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [oldParentConnection]);
  const currentParentGraph = makeGraph(parentGraphId, [sourceNode, subGraphNode], [tempParentConnection]);
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), currentParentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    previousProjectGraphSnapshots: {
      [parentGraphId]: {
        previousGraph: previousParentGraph,
        nextGraph: currentParentGraph,
      },
    },
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.previousGraph.connections, [
    oldParentConnection,
  ]);
  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    {
      ...oldParentConnection,
      inputId: 'new' as PortId,
    },
  ]);
});

test('editNode merged graph input renames preserve original external connections after a transient collision', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'final',
    },
  } as ChartNode;
  const oldSourceNode = makeTextNode('old-source', 'old source');
  const tempSourceNode = makeTextNode('temp-source', 'temp source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldParentConnection = makeConnection({
    outputNodeId: oldSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempParentConnection = makeConnection({
    outputNodeId: tempSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'temp' as PortId,
  });
  const previousParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [oldParentConnection, tempParentConnection],
  );
  const currentParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [tempParentConnection],
  );
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), currentParentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    isMergedEdit: true,
    previousProjectGraphSnapshots: {
      [parentGraphId]: {
        previousGraph: previousParentGraph,
        nextGraph: currentParentGraph,
      },
    },
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    {
      ...oldParentConnection,
      inputId: 'final' as PortId,
    },
    tempParentConnection,
  ]);
});

test('editNode merged graph input renames restore external callers when the final id returns to the original id', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'old',
    },
  } as ChartNode;
  const oldSourceNode = makeTextNode('old-source', 'old source');
  const tempSourceNode = makeTextNode('temp-source', 'temp source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldParentConnection = makeConnection({
    outputNodeId: oldSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempParentConnection = makeConnection({
    outputNodeId: tempSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'temp' as PortId,
  });
  const previousParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [oldParentConnection, tempParentConnection],
  );
  const currentParentGraph = makeGraph(
    parentGraphId,
    [oldSourceNode, tempSourceNode, subGraphNode],
    [tempParentConnection],
  );
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode],
    connections: [],
    project: makeProject([makeGraph(subGraphId, [graphInputNode]), currentParentGraph]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    isMergedEdit: true,
    previousProjectGraphSnapshots: {
      [parentGraphId]: {
        previousGraph: previousParentGraph,
        nextGraph: currentParentGraph,
      },
    },
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.projectGraphSnapshots?.[parentGraphId]?.nextGraph.connections, [
    oldParentConnection,
    tempParentConnection,
  ]);
});

test('editNode merged graph input renames preserve original current-graph connections after a transient collision', () => {
  const graphInputNode = makeGraphInputNode('input-node', 'temp');
  const nextGraphInputNode = {
    ...graphInputNode,
    data: {
      ...(graphInputNode.data as Record<string, unknown>),
      id: 'final',
    },
  } as ChartNode;
  const oldSourceNode = makeTextNode('old-source', 'old source');
  const tempSourceNode = makeTextNode('temp-source', 'temp source');
  const subGraphNode = makeSubGraphNode('subgraph', subGraphId);
  const oldConnection = makeConnection({
    outputNodeId: oldSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'old' as PortId,
  });
  const tempConnection = makeConnection({
    outputNodeId: tempSourceNode.id,
    inputNodeId: subGraphNode.id,
    inputId: 'temp' as PortId,
  });
  const currentState = makeCommandState({
    graphId: subGraphId,
    nodes: [graphInputNode, oldSourceNode, tempSourceNode, subGraphNode],
    connections: [tempConnection],
    project: makeProject([makeGraph(subGraphId, [graphInputNode, oldSourceNode, tempSourceNode, subGraphNode])]),
  });

  const appliedData = buildEditNodeAppliedData({
    params: {
      nodeId: graphInputNode.id,
      newNode: nextGraphInputNode,
    },
    currentState,
    previousNode: makeGraphInputNode('input-node', 'old'),
    previousConnections: [oldConnection, tempConnection],
    previousRecoverableConnections: [],
    currentRecoverableConnections: [],
    isMergedEdit: true,
    projectNodeRegistry: registry,
  });

  assert.deepEqual(appliedData.nextConnections, [
    {
      ...oldConnection,
      inputId: 'final' as PortId,
    },
    tempConnection,
  ]);
});
