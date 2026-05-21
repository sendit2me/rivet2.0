import assert from 'node:assert/strict';
import test from 'node:test';
import { WarningsPort, type DataValue, type PortId, type ProcessId } from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs, ProcessDataForNode } from '../../state/dataFlow.js';
import {
  createFullscreenNodeOutputViewModel,
  createNodeOutputBodyViewModel,
  createNodeOutputContentViewModel,
  getNodeOutputCopySource,
  serializeNodeOutputDisplayCopy,
  serializeNodeOutputJsonCopy,
} from './nodeOutputViewModel.js';

function createDataRefStore(initialValues?: Record<string, DataValue>): DataRefReader {
  const values = new Map<string, DataValue>(Object.entries(initialValues ?? {}));
  return {
    get: (key) => values.get(key),
  };
}

function inlineStored<T extends DataValue['type']>(type: T, value: Extract<DataValue, { type: T }>['value']) {
  return {
    type,
    storage: 'inline' as const,
    value,
  };
}

function process(processId: string, data: NodeRunDataWithRefs): ProcessDataForNode {
  return {
    processId: processId as ProcessId,
    data,
  };
}

test('createNodeOutputContentViewModel keeps legacy Code errors on the code-error path', () => {
  const data = { status: { type: 'error', error: 'SyntaxError' } } as const;
  const content = createNodeOutputContentViewModel({
    nodeType: 'code',
    data,
    dataRefs: createDataRefStore(),
  });

  assert.equal(content.kind, 'code-error');
  assert.equal(content.contentKeyKind, 'code-error');
});

test('createNodeOutputContentViewModel keeps Code/Expression-family errors on their custom output path', () => {
  const data = { status: { type: 'error', error: 'SyntaxError' } } as const;
  const content = createNodeOutputContentViewModel({
    nodeType: 'codeNew',
    data,
    dataRefs: createDataRefStore(),
  });

  assert.equal(content.kind, 'custom-error');
  assert.equal(content.contentKeyKind, 'custom-error');
});

test('createNodeOutputContentViewModel keeps generic node errors on the generic error path', () => {
  const content = createNodeOutputContentViewModel({
    nodeType: 'text',
    data: { status: { type: 'error', error: 'Failed' } },
    dataRefs: createDataRefStore(),
  });

  assert.equal(content.kind, 'generic-error');
  assert.equal(content.error, 'Failed');
});

test('createNodeOutputContentViewModel exposes warnings separately from body output ports', () => {
  const content = createNodeOutputContentViewModel({
    nodeType: 'text',
    data: {
      outputData: {
        ['output' as PortId]: inlineStored('string', 'hello'),
        [WarningsPort as PortId]: inlineStored('string[]', ['Careful']),
      },
      status: { type: 'ok' },
    },
    dataRefs: createDataRefStore(),
  });

  assert.equal(content.kind, 'output');
  assert.deepEqual(content.kind === 'output' ? content.warnings : undefined, ['Careful']);
  assert.equal(getNodeOutputCopySource(content), content.kind === 'output' ? content.copySource : undefined);
});

test('createNodeOutputContentViewModel treats hidden-only and absent output maps as empty', () => {
  assert.equal(
    createNodeOutputContentViewModel({
      nodeType: 'text',
      data: {
        outputData: {
          ['output' as PortId]: undefined,
        },
        status: { type: 'ok' },
      } as never,
      dataRefs: createDataRefStore(),
    }).kind,
    'empty',
  );

  assert.equal(
    createNodeOutputContentViewModel({
      nodeType: 'text',
      data: {
        outputData: {
          ['__internalPort_private' as PortId]: inlineStored('string', 'hidden'),
        },
        status: { type: 'ok' },
      } as never,
      dataRefs: createDataRefStore(),
    }).kind,
    'empty',
  );
});

test('createNodeOutputContentViewModel exposes duration-only output only when enabled', () => {
  const data = {
    durationMs: 15,
    status: { type: 'ok' },
  } as NodeRunDataWithRefs;

  assert.equal(
    createNodeOutputContentViewModel({
      nodeType: 'text',
      data,
      dataRefs: createDataRefStore(),
    }).kind,
    'empty',
  );

  const content = createNodeOutputContentViewModel({
    nodeType: 'text',
    data,
    dataRefs: createDataRefStore(),
    showNodeRunDuration: true,
  });

  assert.equal(content.kind, 'output');
  assert.equal(serializeNodeOutputDisplayCopy(getNodeOutputCopySource(content), createDataRefStore()), undefined);
});

test('createNodeOutputBodyViewModel chooses custom renderers before generic output maps', () => {
  const data = {
    outputData: {
      ['output' as PortId]: inlineStored('string', 'hello'),
    },
  } as NodeRunDataWithRefs;

  assert.equal(
    createNodeOutputBodyViewModel({ data, hasFullscreenOutputRenderer: true }).kind,
    'custom-fullscreen-renderer',
  );
  assert.equal(createNodeOutputBodyViewModel({ data, hasOutputRenderer: true }).kind, 'custom-renderer');
});

test('createNodeOutputBodyViewModel ignores final output maps with no visible body ports', () => {
  const body = createNodeOutputBodyViewModel({
    data: {
      outputData: {
        [WarningsPort as PortId]: inlineStored('string[]', ['warning']),
        ['__internalPort_private' as PortId]: inlineStored('string', 'hidden'),
      },
    } as never,
  });

  assert.equal(body.kind, 'empty');
});

test('createNodeOutputBodyViewModel sorts visible split outputs and skips hidden-only entries', () => {
  const body = createNodeOutputBodyViewModel({
    data: {
      splitOutputData: {
        10: {
          ['output' as PortId]: inlineStored('string', 'ten'),
        },
        1: {
          ['output' as PortId]: undefined,
        },
        2: {
          [WarningsPort as PortId]: inlineStored('string[]', ['warning']),
        },
        0: {
          ['output' as PortId]: inlineStored('string', 'zero'),
        },
      },
    } as never,
  });

  assert.equal(body.kind, 'split-outputs');
  assert.deepEqual(
    body.kind === 'split-outputs' ? body.splitOutputs.map(([key]) => key) : [],
    ['0', '10'],
  );
});

test('createNodeOutputBodyViewModel falls back to final outputData when split outputs are not body-renderable', () => {
  const body = createNodeOutputBodyViewModel({
    data: {
      outputData: {
        ['output' as PortId]: inlineStored('string', 'final'),
      },
      splitOutputData: {
        0: {
          [WarningsPort as PortId]: inlineStored('string[]', ['warning']),
        },
      },
    } as never,
  });

  assert.equal(body.kind, 'outputs');
});

test('createFullscreenNodeOutputViewModel reports the selected visible process and total pages', () => {
  const oldProcess = process('old', {
    outputData: {
      ['output' as PortId]: inlineStored('string', 'old'),
    },
  });
  const runningProcess = process('running', {
    status: { type: 'running' },
  });

  const selectedOld = createFullscreenNodeOutputViewModel({
    nodeType: 'text',
    processData: [oldProcess, runningProcess],
    selectedPage: 0,
    dataRefs: createDataRefStore(),
  });
  const selectedLatest = createFullscreenNodeOutputViewModel({
    nodeType: 'text',
    processData: [oldProcess, runningProcess],
    selectedPage: 'latest',
    dataRefs: createDataRefStore(),
  });

  assert.equal(selectedOld.kind, 'content');
  assert.equal(selectedOld.totalPages, 2);
  assert.equal(selectedOld.processId, oldProcess.processId);
  assert.equal(selectedLatest.kind, 'empty');
  assert.equal(selectedLatest.totalPages, 2);
});

test('createFullscreenNodeOutputViewModel can select duration-only output when enabled', () => {
  const durationProcess = process('duration', {
    durationMs: 20,
    status: { type: 'ok' },
  });

  assert.equal(
    createFullscreenNodeOutputViewModel({
      nodeType: 'text',
      processData: [durationProcess],
      selectedPage: 'latest',
      dataRefs: createDataRefStore(),
    }).kind,
    'empty',
  );

  const outputViewModel = createFullscreenNodeOutputViewModel({
    nodeType: 'text',
    processData: [durationProcess],
    selectedPage: 'latest',
    dataRefs: createDataRefStore(),
    showNodeRunDuration: true,
  });

  assert.equal(outputViewModel.kind, 'content');
  assert.equal(outputViewModel.kind === 'content' ? outputViewModel.data.durationMs : undefined, 20);
});

test('node output copy view-model helpers keep display copy and JSON copy separate', () => {
  const data = {
    outputData: {
      ['output' as PortId]: inlineStored('string', 'hello'),
    },
  } as NodeRunDataWithRefs;
  const dataRefs = createDataRefStore();

  assert.equal(serializeNodeOutputDisplayCopy(data, dataRefs), 'hello');
  assert.equal(
    serializeNodeOutputJsonCopy(data, dataRefs),
    JSON.stringify(
      {
        output: {
          type: 'string',
          value: 'hello',
        },
      },
      null,
      2,
    ),
  );
});
