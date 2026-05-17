import { type PortId, WarningsPort } from '@valerypopoff/rivet2-core';
import type { InputsOrOutputsWithRefs, NodeRunDataWithRefs } from '../state/dataFlow.js';

export function isVisibleOutputPort(portId: PortId | string): boolean {
  return portId !== (WarningsPort as PortId) && !String(portId).startsWith('__internalPort_');
}

export function hasVisibleStoredPortMapValues(
  data: InputsOrOutputsWithRefs | undefined,
): data is InputsOrOutputsWithRefs {
  return data != null && Object.entries(data).some(([portId, value]) => isVisibleOutputPort(portId) && value != null);
}

export function hasVisibleStoredSplitOutputValues(
  splitOutputData: NodeRunDataWithRefs['splitOutputData'],
): splitOutputData is NonNullable<NodeRunDataWithRefs['splitOutputData']> {
  return splitOutputData != null && Object.values(splitOutputData).some(hasVisibleStoredPortMapValues);
}
