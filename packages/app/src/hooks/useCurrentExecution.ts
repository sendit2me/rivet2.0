import { useExecutionDataFlow } from './useExecutionDataFlow';
import { type GraphExecutionEventsOptions, useGraphExecutionEvents } from './useGraphExecutionEvents';
import { useNodeExecutionEvents } from './useNodeExecutionEvents';

export function useCurrentExecution(options: GraphExecutionEventsOptions = {}) {
  const dataFlow = useExecutionDataFlow();
  const nodeEvents = useNodeExecutionEvents(dataFlow);
  const graphEvents = useGraphExecutionEvents(dataFlow, options);

  return {
    ...dataFlow,
    ...nodeEvents,
    ...graphEvents,
  };
}
