import { useAtomValue } from 'jotai';
import { useExecutorSessionRuntime } from '../providers/ExecutorSessionContext.js';
import { executorSessionRevisionState } from '../state/execution.js';

export {
  shouldRestoreInternalNodeExecutorAfterExternalDebuggerDisconnect,
  useExecutorSessionCoordinator,
} from './useExecutorSessionCoordinator.js';

export function useExecutorSessionState() {
  const runtime = useExecutorSessionRuntime();
  useAtomValue(executorSessionRevisionState);
  return runtime.buildSessionState();
}
