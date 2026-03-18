import { useExecutionDataFlow } from './useExecutionDataFlow';
import { useGraphExecutionEvents } from './useGraphExecutionEvents';
import { useNodeExecutionEvents } from './useNodeExecutionEvents';

export function useCurrentExecution() {
  const dataFlow = useExecutionDataFlow();
  const nodeEvents = useNodeExecutionEvents(dataFlow);
  const graphEvents = useGraphExecutionEvents(dataFlow);

  return {
    ...dataFlow,
    ...nodeEvents,
    ...graphEvents,
  };
}
