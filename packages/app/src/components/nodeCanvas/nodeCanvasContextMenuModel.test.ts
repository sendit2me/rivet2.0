import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBuiltInRegistry,
  type GraphId,
  type NodeId,
  type Project,
  type ProjectId,
} from '@valerypopoff/rivet2-core';
import type { ContextMenuData } from '../../hooks/useContextMenu.js';
import {
  canRunNodeCanvasContextMenuFromHere,
  getNodeCanvasContextMenuContext,
  getNodeCanvasContextMenuTarget,
} from './nodeCanvasContextMenuModel.js';

const registry = createBuiltInRegistry();
const graphId = 'graph-1' as GraphId;
const nodeId = 'node-1' as NodeId;
const project = makeProject();
const contextModelOptions = {
  canStartEditorGraphRun: true,
  canUseFrozenNodes: true,
  frozenNodeOutputs: {},
  graphSelection: {},
  lastRunPerNode: {},
  project,
  projectNodeRegistry: registry,
  selectedGraphId: graphId,
};

function makeProject(): Project {
  const node = registry.createDynamic('text');
  node.id = nodeId;
  node.title = 'Text';

  return {
    metadata: {
      description: '',
      id: 'project-1' as ProjectId,
      mainGraphId: graphId,
      title: 'Project',
    },
    graphs: {
      [graphId]: {
        metadata: { id: graphId, name: 'Graph' },
        nodes: [node],
        connections: [],
      },
    },
  };
}

function makeContextMenuData(type: string, nodeIdValue = nodeId): ContextMenuData {
  return {
    x: 0,
    y: 0,
    data: {
      type,
      element: {
        dataset: { nodeid: nodeIdValue },
      } as unknown as HTMLElement,
    },
  };
}

test('getNodeCanvasContextMenuContext creates blank-area context for non-node targets', () => {
  assert.deepEqual(
    getNodeCanvasContextMenuContext({
      ...contextModelOptions,
      contextMenuData: { x: 0, y: 0, data: null },
    }),
    {
      type: 'blankArea',
      data: {},
    },
  );
});

test('getNodeCanvasContextMenuTarget rejects malformed node targets without a node id', () => {
  assert.equal(
    getNodeCanvasContextMenuTarget({
      type: 'node-text',
      element: {
        dataset: {},
      } as unknown as HTMLElement,
    }),
    undefined,
  );
});

test('getNodeCanvasContextMenuTarget rejects malformed node targets without a node type', () => {
  assert.equal(getNodeCanvasContextMenuTarget(makeContextMenuData('node-').data), undefined);
});

test('getNodeCanvasContextMenuContext hydrates node context data from the DOM target', () => {
  assert.deepEqual(
    getNodeCanvasContextMenuContext({
      ...contextModelOptions,
      contextMenuData: makeContextMenuData('node-text'),
    }),
    {
      type: 'node',
      data: {
        nodeType: 'text',
        nodeId,
        canRunFromEditor: true,
        canRunFromHere: true,
        canFreeze: false,
        canUnfreeze: false,
        isFrozen: false,
      },
    },
  );
});

test('getNodeCanvasContextMenuContext enables Freeze for nodes with retained successful outputs', () => {
  const context = getNodeCanvasContextMenuContext({
    ...contextModelOptions,
    contextMenuData: makeContextMenuData('node-text'),
    lastRunPerNode: {
      [nodeId]: [
        {
          graphId,
          processId: 'process-1' as any,
          data: {
            status: { type: 'ok' },
            outputData: {
              output: { type: 'string', storage: 'inline', value: 'saved output' },
            },
          },
        },
      ],
    } as any,
  });

  assert.equal(context.type, 'node');
  assert.equal(context.data.canFreeze, true);
  assert.equal(context.data.canUnfreeze, false);
  assert.equal(context.data.isFrozen, false);
});

test('getNodeCanvasContextMenuContext enables Unfreeze for frozen nodes', () => {
  const context = getNodeCanvasContextMenuContext({
    ...contextModelOptions,
    contextMenuData: makeContextMenuData('node-text'),
    frozenNodeOutputs: {
      [graphId]: {
        [nodeId]: [
          {
            output: { type: 'string', value: 'frozen output' },
          },
        ],
      },
    } as any,
  });

  assert.equal(context.type, 'node');
  assert.equal(context.data.canFreeze, false);
  assert.equal(context.data.canUnfreeze, true);
  assert.equal(context.data.isFrozen, true);
});

test('getNodeCanvasContextMenuContext disables Freeze and Unfreeze outside normal editor runs', () => {
  const context = getNodeCanvasContextMenuContext({
    ...contextModelOptions,
    canUseFrozenNodes: false,
    contextMenuData: makeContextMenuData('node-text'),
    frozenNodeOutputs: {
      [graphId]: {
        [nodeId]: [
          {
            output: { type: 'string', value: 'frozen output' },
          },
        ],
      },
    } as any,
    lastRunPerNode: {
      [nodeId]: [
        {
          graphId,
          processId: 'process-1' as any,
          data: {
            status: { type: 'ok' },
            outputData: {
              output: { type: 'string', storage: 'inline', value: 'saved output' },
            },
          },
        },
      ],
    } as any,
  });

  assert.equal(context.type, 'node');
  assert.equal(context.data.canFreeze, false);
  assert.equal(context.data.canUnfreeze, false);
  assert.equal(context.data.isFrozen, true);
});

test('canRunNodeCanvasContextMenuFromHere is false when editor runs are unavailable or planning fails', () => {
  assert.equal(
    canRunNodeCanvasContextMenuFromHere({
      ...contextModelOptions,
      canStartEditorGraphRun: false,
      nodeId,
    }),
    false,
  );

  assert.equal(
    canRunNodeCanvasContextMenuFromHere({
      ...contextModelOptions,
      nodeId: 'missing-node' as NodeId,
    }),
    false,
  );
});
