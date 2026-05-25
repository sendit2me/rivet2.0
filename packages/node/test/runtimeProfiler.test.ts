import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProcessor, type GraphProcessorRuntimeProfileBucket } from '../src/index.js';
import { makeTextChainProject } from './runtimeSpeedFixtures.js';

void describe('runtime profiler', () => {
  void it('records diagnostic runtime buckets without changing outputs', async () => {
    const fixture = makeTextChainProject(2);
    const buckets = new Map<GraphProcessorRuntimeProfileBucket, number>();
    const processor = createProcessor(fixture.project, {
      graph: fixture.graphId,
      inputs: {
        input: {
          type: 'string',
          value: 'x',
        },
      },
      runtimeProfiler: {
        addDuration(bucket, durationMs) {
          buckets.set(bucket, (buckets.get(bucket) ?? 0) + durationMs);
        },
      },
    });

    const outputs = await processor.run();

    assert.equal(outputs.result?.type, 'string');
    assert.ok(buckets.has('initializeGraphRun'));
    assert.ok(buckets.has('preprocessGraph'));
    assert.ok(buckets.has('processFastAcyclicGraph'));
    assert.ok(buckets.has('nodeImplementation'));
    assert.ok([...buckets.values()].every((durationMs) => durationMs >= 0));
  });

  void it('does not let profiler failures fail graph execution', async () => {
    const fixture = makeTextChainProject(1);
    const processor = createProcessor(fixture.project, {
      graph: fixture.graphId,
      inputs: {
        input: {
          type: 'string',
          value: 'x',
        },
      },
      runtimeProfiler: {
        addDuration() {
          throw new Error('profiler failed');
        },
      },
    });

    const outputs = await processor.run();

    assert.equal(outputs.result?.type, 'string');
  });
});
