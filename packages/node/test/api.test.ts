import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { loadTestGraphs } from './testUtils';
import { createProcessor } from '../src/index.js';

describe('api', () => {
  it('can stream processor events', async () => {
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });

    void processor.run();

    const eventNames: string[] = [];
    for await (const event of processor.getEvents({ done: true, nodeStart: true, nodeFinish: true })) {
      eventNames.push(event.type);
    }

    // 3 nodes start and finish + done
    assert.deepEqual(eventNames, [
      'nodeStart',
      'nodeFinish',
      'nodeStart',
      'nodeFinish',
      'nodeStart',
      'nodeFinish',
      'done',
    ]);
  });

  it('can easily filter for a node', async () => {
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });

    void processor.run();

    for await (const event of processor.getEvents({ nodeStart: ['Passthrough'] })) {
      assert.equal(event.type, 'nodeStart');
    }
  });

  it('Can get an event stream for a processor', async () => {
    const processor = createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
    });

    void processor.run();

    const reader = processor
      .getSSEStream({
        nodeFinish: true,
      })
      .getReader();

    const decoder = new TextDecoder();

    // Kind of a mess but whatev
    const eventNames: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const data = decoder.decode(value);

      const event = /event: (?<event>.*)/.exec(data)!.groups!.event!;
      eventNames.push(event);
    }

    assert.deepEqual(eventNames, ['nodeFinish', 'nodeFinish', 'nodeFinish']);
  });

  it('passes remote debugger request ids through attach', async () => {
    let attachedRequestId: string | undefined;

    const remoteDebugger = {
      on: () => undefined,
      off: () => undefined,
      webSocketServer: {} as never,
      broadcast: () => undefined,
      attach: (_processor: unknown, requestId?: string) => {
        attachedRequestId = requestId;
      },
      detach: () => undefined,
    };

    createProcessor(await loadTestGraphs(), {
      graph: 'Passthrough',
      inputs: {
        input: 'input value',
      },
      remoteDebugger,
      remoteDebuggerRequestId: 'request-123',
    });

    assert.equal(attachedRequestId, 'request-123');
  });
});
