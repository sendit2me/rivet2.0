const LLM_CHAT_RETRY_ATTEMPT_OUTPUT_IDS = new Set(['requestStatuses', 'requestErrors']);
const LLM_CHAT_RESPONSE_TRANSPORT_OUTPUT_IDS = new Set(['requestStatus', 'requestError']);

export function getOutputPortsToRender<T extends string>(outputPorts: T[], isCompact: boolean): T[] {
  if (!isCompact) {
    return outputPorts;
  }

  const hasRetryAttemptOutputs = outputPorts.some((portId) => LLM_CHAT_RETRY_ATTEMPT_OUTPUT_IDS.has(portId));
  if (!hasRetryAttemptOutputs) {
    return outputPorts.slice(0, 1);
  }

  return outputPorts.filter(
    (portId) => LLM_CHAT_RETRY_ATTEMPT_OUTPUT_IDS.has(portId) || LLM_CHAT_RESPONSE_TRANSPORT_OUTPUT_IDS.has(portId),
  );
}

export function shouldRenderOutputValueExpanded(portId: string): boolean {
  return LLM_CHAT_RETRY_ATTEMPT_OUTPUT_IDS.has(portId);
}
