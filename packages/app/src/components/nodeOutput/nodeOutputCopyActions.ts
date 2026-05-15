import type { NodeOutputDefinition } from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../../providers/ProvidersContext.js';
import type { NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { copyToClipboard } from '../../utils/copyToClipboard.js';
import {
  type NodeOutputCopyValueProjector,
  serializeDisplayedOutputs,
} from '../../utils/executionDataCopyValue.js';
import { restoreDisplayedNodeOutputs } from '../../utils/executionDataReaders.js';
import { handleError } from '../../utils/errorHandling.js';

export function copyOutputValue(
  data: NodeRunDataWithRefs | undefined,
  dataRefs: DataRefReader,
  getCopyValueData?: NodeOutputCopyValueProjector,
  outputDefinitions?: readonly Pick<NodeOutputDefinition, 'id' | 'title'>[],
): void {
  if (!data) {
    return;
  }

  try {
    const serialized = serializeDisplayedOutputs(data, dataRefs, {
      getCopyValueData,
      outputDefinitions,
    });
    if (serialized == null) {
      return;
    }

    void copyToClipboard(serialized);
  } catch (error) {
    handleError(error, 'Failed to copy node output');
  }
}

export function copyOutputJson(data: NodeRunDataWithRefs | undefined, dataRefs: DataRefReader): void {
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
