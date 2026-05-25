import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCreateProcessorRuntimePolicy } from '../src/createProcessorRuntimePolicy.js';

void describe('createProcessor runtime policy', () => {
  void it('defaults an omitted runtime profile to the faster default policy', () => {
    const policy = resolveCreateProcessorRuntimePolicy({});

    assert.ok(policy.runtimeCache);
    assert.equal(policy.cacheLoadedProjects, false);
    assert.equal(policy.executionPlanCacheMode, 'all');
    assert.equal(policy.scheduler, 'fast-acyclic');
    assert.equal(policy.useCachedDefaultCodeRunner, true);
    assert.deepEqual(policy.fallbackReasons, []);
  });

  void it('keeps the compatible runtime profile fully compatible', () => {
    const policy = resolveCreateProcessorRuntimePolicy({ runtimeProfile: 'compatible' });

    assert.equal(policy.runtimeCache, undefined);
    assert.equal(policy.cacheLoadedProjects, false);
    assert.equal(policy.executionPlanCacheMode, undefined);
    assert.equal(policy.scheduler, 'compatible');
    assert.equal(policy.useCachedDefaultCodeRunner, false);
    assert.deepEqual(policy.fallbackReasons, []);
  });

  void it('treats unknown runtime profile values as compatible for untyped callers', () => {
    const policy = resolveCreateProcessorRuntimePolicy({ runtimeProfile: 'compatibile' as never });

    assert.equal(policy.runtimeCache, undefined);
    assert.equal(policy.cacheLoadedProjects, false);
    assert.equal(policy.executionPlanCacheMode, undefined);
    assert.equal(policy.scheduler, 'compatible');
    assert.equal(policy.useCachedDefaultCodeRunner, false);
    assert.deepEqual(policy.fallbackReasons, []);
  });

  void it('keeps custom CodeRunner ownership in the omitted default policy', () => {
    const policy = resolveCreateProcessorRuntimePolicy({
      codeRunner: {
        async runCode() {
          return {};
        },
      },
    });

    assert.ok(policy.runtimeCache);
    assert.equal(policy.cacheLoadedProjects, false);
    assert.equal(policy.executionPlanCacheMode, 'all');
    assert.equal(policy.scheduler, 'fast-acyclic');
    assert.equal(policy.useCachedDefaultCodeRunner, false);
  });

  void it('forces a compatible policy when Remote Debugger is attached', () => {
    for (const policy of [
      resolveCreateProcessorRuntimePolicy({ remoteDebugger: {} }),
      resolveCreateProcessorRuntimePolicy({
        remoteDebugger: {},
        runtimeProfile: 'removed-profile' as never,
      }),
    ]) {
      assert.equal(policy.runtimeCache, undefined);
      assert.equal(policy.cacheLoadedProjects, false);
      assert.equal(policy.executionPlanCacheMode, undefined);
      assert.equal(policy.scheduler, 'compatible');
      assert.equal(policy.useCachedDefaultCodeRunner, false);
      assert.deepEqual(policy.fallbackReasons, ['remote-debugger']);
    }
  });

  void it('keeps trace-sensitive omitted runs fully compatible', () => {
    const policy = resolveCreateProcessorRuntimePolicy({
      includeTrace: true,
    });

    assert.equal(policy.runtimeCache, undefined);
    assert.equal(policy.cacheLoadedProjects, false);
    assert.equal(policy.executionPlanCacheMode, undefined);
    assert.equal(policy.scheduler, 'compatible');
    assert.equal(policy.useCachedDefaultCodeRunner, false);
    assert.deepEqual(policy.fallbackReasons, ['trace']);
  });

  void it('treats unknown profile values with trace as compatible for untyped callers', () => {
    const policy = resolveCreateProcessorRuntimePolicy({
      includeTrace: true,
      runtimeProfile: 'removed-profile' as never,
    });

    assert.equal(policy.runtimeCache, undefined);
    assert.equal(policy.cacheLoadedProjects, false);
    assert.equal(policy.executionPlanCacheMode, undefined);
    assert.equal(policy.scheduler, 'compatible');
    assert.equal(policy.useCachedDefaultCodeRunner, false);
    assert.deepEqual(policy.fallbackReasons, ['trace']);
  });
});
