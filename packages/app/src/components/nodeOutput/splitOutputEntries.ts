import { type InputsOrOutputsWithRefs } from '../../state/dataFlow.js';
import { hasVisibleStoredPortMapValues } from '../../utils/outputPortVisibility.js';

export function getSortedSplitOutputEntries<T>(splitOutputData: Record<string, T> | undefined): Array<[string, T]> {
  return Object.entries(splitOutputData ?? {}).sort(([left], [right]) => Number(left) - Number(right));
}

export function getSortedRenderableSplitOutputEntries(
  splitOutputData: Record<string, InputsOrOutputsWithRefs> | undefined,
): Array<[string, InputsOrOutputsWithRefs]> {
  return getSortedSplitOutputEntries(splitOutputData).filter(([, outputs]) => hasVisibleStoredPortMapValues(outputs));
}
