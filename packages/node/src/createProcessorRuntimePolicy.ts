import type {
  GraphProcessorExecutionPlanCacheMode,
  GraphProcessorRuntimeCache,
  GraphProcessorScheduler,
  ProcessContext,
} from '@valerypopoff/rivet2-core';

export type NodeRuntimeProfile = 'compatible';

export type CreateProcessorRuntimeFallbackReason = 'remote-debugger' | 'trace';

export type CreateProcessorRuntimePolicy = {
  cacheLoadedProjects: boolean;
  executionPlanCacheMode: GraphProcessorExecutionPlanCacheMode | undefined;
  fallbackReasons: CreateProcessorRuntimeFallbackReason[];
  runtimeCache: GraphProcessorRuntimeCache | undefined;
  scheduler: GraphProcessorScheduler;
  useCachedDefaultCodeRunner: boolean;
};

type CreateProcessorRuntimePolicyOptions = {
  codeRunner?: ProcessContext['codeRunner'];
  includeTrace?: boolean;
  remoteDebugger?: unknown;
  runtimeProfile?: NodeRuntimeProfile;
};

export function resolveCreateProcessorRuntimePolicy({
  codeRunner,
  includeTrace,
  remoteDebugger,
  runtimeProfile,
}: CreateProcessorRuntimePolicyOptions): CreateProcessorRuntimePolicy {
  if (runtimeProfile === 'compatible') {
    return createCompatibleRuntimePolicy();
  }

  if (remoteDebugger !== undefined) {
    return createCompatibleRuntimePolicy(['remote-debugger']);
  }

  if (includeTrace) {
    return createCompatibleRuntimePolicy(['trace']);
  }

  if (runtimeProfile !== undefined) {
    return createCompatibleRuntimePolicy();
  }

  return {
    cacheLoadedProjects: false,
    executionPlanCacheMode: 'subprocessors',
    fallbackReasons: [],
    runtimeCache: {},
    scheduler: 'compatible',
    useCachedDefaultCodeRunner: codeRunner == null,
  };
}

function createCompatibleRuntimePolicy(
  fallbackReasons: CreateProcessorRuntimeFallbackReason[] = [],
): CreateProcessorRuntimePolicy {
  return {
    cacheLoadedProjects: false,
    executionPlanCacheMode: undefined,
    fallbackReasons,
    runtimeCache: undefined,
    scheduler: 'compatible',
    useCachedDefaultCodeRunner: false,
  };
}
