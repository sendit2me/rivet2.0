import type { DataRefReader } from '../../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { copyToClipboard } from '../../utils/copyToClipboard.js';
import {
  type NodeOutputCopyValueProjector,
  serializeDisplayedNodeOutputsForCopyValue,
} from '../../utils/executionDataCopyValue.js';
import { restoreDisplayedNodeOutputs } from '../../utils/executionDataReaders.js';
import { handleError } from '../../utils/errorHandling.js';

export function copyNodeOutputValueToClipboard(
  data: NodeRunDataWithRefs | undefined,
  dataRefs: DataRefReader,
  getCopyValueData?: NodeOutputCopyValueProjector,
): void {
  if (!data) {
    return;
  }

  try {
    const serialized = serializeDisplayedNodeOutputsForCopyValue(data, dataRefs, {
      getCopyValueData,
    });
    if (serialized == null) {
      return;
    }

    void copyToClipboard(serialized);
  } catch (error) {
    handleError(error, 'Failed to copy node output');
  }
}

export function copyNodeOutputJsonToClipboard(data: NodeRunDataWithRefs | undefined, dataRefs: DataRefReader): void {
  if (!data) {
    return;
  }

  try {
    const restoredOutputData = restoreDisplayedNodeOutputs(data, dataRefs);
    if (!restoredOutputData) {
      return;
    }

    void copyToClipboard(JSON.stringify(restoredOutputData, null, 2));
  } catch (error) {
    handleError(error, 'Failed to copy node output');
  }
}
