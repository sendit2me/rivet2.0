import assert from 'node:assert/strict';
import test from 'node:test';
import { type NodeId } from '@ironclad/rivet-core';
import { getContextValues, getDependentDataForNodeForPreload, selectTestSuitesToRun } from './remoteExecutorHelpers';
import { deleteGlobalDataRef, setGlobalDataRef } from '../utils/globals/globalDataRefs';

test('getContextValues unwraps project context values', () => {
  const contextValues = getContextValues({
    secret: { value: { type: 'string', value: 'token' }, secret: true },
    visible: { value: { type: 'number', value: 3 }, secret: false },
  });

  assert.deepEqual(contextValues, {
    secret: { type: 'string', value: 'token' },
    visible: { type: 'number', value: 3 },
  });
});

test('selectTestSuitesToRun filters suites and cases narrowly', () => {
  const selected = selectTestSuitesToRun(
    [
      { id: 'suite-1', testCases: [{ id: 'case-1' }, { id: 'case-2' }] },
      { id: 'suite-2', testCases: [{ id: 'case-3' }] },
    ],
    { testSuiteIds: ['suite-1'], testCaseIds: ['case-2'] },
  );

  assert.deepEqual(selected, [{ id: 'suite-1', testCases: [{ id: 'case-2' }] }]);
});

test('getDependentDataForNodeForPreload returns prior outputs for requested dependency nodes', () => {
  const preloadData = getDependentDataForNodeForPreload(['node-1' as any], {
    'node-1': [
      {
        processId: 'process-1' as any,
        data: {
          outputData: {
            output: { type: 'string', storage: 'inline', value: 'hello' },
          },
        },
      },
    ],
  } as any);

  assert.deepEqual(preloadData, {
    'node-1': {
      output: { type: 'string', value: 'hello' },
    },
  });
});

test('getDependentDataForNodeForPreload restores ref-backed media outputs', () => {
  const nodeId = 'node-2' as NodeId;
  setGlobalDataRef('image-ref', {
    type: 'image',
    value: {
      mediaType: 'image/png',
      data: Uint8Array.from([1, 2, 3]),
    },
  });

  const preloadData = getDependentDataForNodeForPreload([nodeId], {
    [nodeId]: [
      {
        processId: 'process-2' as any,
        data: {
          outputData: {
            output: {
              type: 'image',
              storage: 'ref',
              refId: 'image-ref',
              preview: {
                kind: 'summary',
                label: 'Image (image/png)',
                totalBytes: 3,
              },
            },
          },
        },
      },
    ],
  } as any);

  assert.deepEqual(preloadData[nodeId], {
    output: {
      type: 'image',
      value: {
        mediaType: 'image/png',
        data: Uint8Array.from([1, 2, 3]),
      },
    },
  });

  deleteGlobalDataRef('image-ref');
});

test('getDependentDataForNodeForPreload restores ref-backed string outputs', () => {
  const nodeId = 'node-3' as NodeId;
  setGlobalDataRef('string-ref', {
    type: 'string',
    value: 'large output',
  });

  const preloadData = getDependentDataForNodeForPreload([nodeId], {
    [nodeId]: [
      {
        processId: 'process-3' as any,
        data: {
          outputData: {
            output: {
              type: 'string',
              storage: 'ref',
              refId: 'string-ref',
              preview: {
                kind: 'text',
                excerpt: 'large output',
                totalChars: 12,
                lineCount: 1,
              },
            },
          },
        },
      },
    ],
  } as any);

  assert.deepEqual(preloadData[nodeId], {
    output: {
      type: 'string',
      value: 'large output',
    },
  });

  deleteGlobalDataRef('string-ref');
});

test('getDependentDataForNodeForPreload throws clearly for missing ref-backed values', () => {
  assert.throws(
    () =>
      getDependentDataForNodeForPreload(['node-4' as NodeId], {
        'node-4': [
          {
            processId: 'process-4' as any,
            data: {
              outputData: {
                output: {
                  type: 'string',
                  storage: 'ref',
                  refId: 'missing-ref',
                  preview: {
                    kind: 'text',
                    excerpt: 'preview',
                    totalChars: 7,
                    lineCount: 1,
                  },
                },
              },
            },
          },
        ],
      } as any),
    /cleared from execution memory/i,
  );
});
