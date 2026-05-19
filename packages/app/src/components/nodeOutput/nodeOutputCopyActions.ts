import type { NodeOutputDefinition } from '@valerypopoff/rivet2-core';
import type { DataRefReader } from '../../providers/ProvidersContext.js';
import { copyToClipboard } from '../../utils/copyToClipboard.js';
import { type NodeOutputCopyValueProjector } from '../../utils/executionDataCopyValue.js';
import { handleError } from '../../utils/errorHandling.js';
import {
  serializeNodeOutputDisplayCopy,
  serializeNodeOutputJsonCopy,
  type NodeOutputCopySource,
} from './nodeOutputViewModel.js';

export function copyOutputValue(
  data: NodeOutputCopySource | undefined,
  dataRefs: DataRefReader,
  getCopyValueData?: NodeOutputCopyValueProjector,
  outputDefinitions?: readonly Pick<NodeOutputDefinition, 'id' | 'title'>[],
): void {
  if (!data) {
    return;
  }

  try {
    const serialized = serializeNodeOutputDisplayCopy(data, dataRefs, {
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

export function copyOutputJson(data: NodeOutputCopySource | undefined, dataRefs: DataRefReader): void {
  if (!data) {
    return;
  }

  try {
    const serialized = serializeNodeOutputJsonCopy(data, dataRefs);
    if (serialized == null) {
      return;
    }

    void copyToClipboard(serialized);
  } catch (error) {
    handleError(error, 'Failed to copy node output');
  }
}
