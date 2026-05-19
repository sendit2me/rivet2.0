import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCreateProcessorRuntimePolicy } from '../src/createProcessorRuntimePolicy.js';

void describe('createProcessor runtime policy', () => {
  void it('keeps omitted and compatible runtime profiles fully compatible', () => {
    for (const policy of [
      resolveCreateProcessorRuntimePolicy({}),
      resolveCreateProcessorRuntimePolicy({ runtimeProfile: 'compatible' }),
    ]) {
      assert.equal(policy.runtimeCache, undefined);
      assert.equal(policy.cacheLoadedProjects, false);
      assert.equal(policy.scheduler, 'compatible');
      assert.equal(policy.useCachedDefaultCodeRunner, false);
      assert.deepEqual(policy.fallbackReasons, []);
    }
  });

  void it('splits explicit headless-fast into independent fast capabilities', () => {
    const policy = resolveCreateProcessorRuntimePolicy({ runtimeProfile: 'headless-fast' });

    assert.ok(policy.runtimeCache);
    assert.equal(policy.cacheLoadedProjects, true);
    assert.equal(policy.scheduler, 'fast-acyclic');
    assert.equal(policy.useCachedDefaultCodeRunner, true);
    assert.deepEqual(policy.fallbackReasons, []);
  });

  void it('keeps custom CodeRunner ownership while allowing other fast capabilities', () => {
    const policy = resolveCreateProcessorRuntimePolicy({
      codeRunner: {
        async runCode() {
          return {};
        },
      },
      runtimeProfile: 'headless-fast',
    });

    assert.ok(policy.runtimeCache);
    assert.equal(policy.cacheLoadedProjects, true);
    assert.equal(policy.scheduler, 'fast-acyclic');
    assert.equal(policy.useCachedDefaultCodeRunner, false);
  });

  void it('forces a compatible policy when Remote Debugger is attached', () => {
    const policy = resolveCreateProcessorRuntimePolicy({
      remoteDebugger: {},
      runtimeProfile: 'headless-fast',
    });

    assert.equal(policy.runtimeCache, undefined);
    assert.equal(policy.cacheLoadedProjects, false);
    assert.equal(policy.scheduler, 'compatible');
    assert.equal(policy.useCachedDefaultCodeRunner, false);
    assert.deepEqual(policy.fallbackReasons, ['remote-debugger']);
  });

  void it('keeps trace-sensitive runs on compatible scheduling without disabling other explicit fast pieces', () => {
    const policy = resolveCreateProcessorRuntimePolicy({
      includeTrace: true,
      runtimeProfile: 'headless-fast',
    });

    assert.ok(policy.runtimeCache);
    assert.equal(policy.cacheLoadedProjects, true);
    assert.equal(policy.scheduler, 'compatible');
    assert.equal(policy.useCachedDefaultCodeRunner, true);
    assert.deepEqual(policy.fallbackReasons, ['trace']);
  });
});
