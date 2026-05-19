import type {
  GraphProcessorRuntimeCache,
  GraphProcessorScheduler,
  ProcessContext,
} from '@valerypopoff/rivet2-core';

export type NodeRuntimeProfile = 'compatible' | 'headless-fast';

export type CreateProcessorRuntimeFallbackReason = 'remote-debugger' | 'trace';

export type CreateProcessorRuntimePolicy = {
  cacheLoadedProjects: boolean;
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
  runtimeProfile = 'compatible',
}: CreateProcessorRuntimePolicyOptions): CreateProcessorRuntimePolicy {
  if (runtimeProfile !== 'headless-fast') {
    return createCompatibleRuntimePolicy();
  }

  if (remoteDebugger !== undefined) {
    return createCompatibleRuntimePolicy(['remote-debugger']);
  }

  const fallbackReasons: CreateProcessorRuntimeFallbackReason[] = [];
  const scheduler = includeTrace ? 'compatible' : 'fast-acyclic';

  if (includeTrace) {
    fallbackReasons.push('trace');
  }

  return {
    cacheLoadedProjects: true,
    fallbackReasons,
    runtimeCache: {},
    scheduler,
    useCachedDefaultCodeRunner: codeRunner == null,
  };
}

function createCompatibleRuntimePolicy(
  fallbackReasons: CreateProcessorRuntimeFallbackReason[] = [],
): CreateProcessorRuntimePolicy {
  return {
    cacheLoadedProjects: false,
    fallbackReasons,
    runtimeCache: undefined,
    scheduler: 'compatible',
    useCachedDefaultCodeRunner: false,
  };
}
