import { type DataValue } from '@valerypopoff/rivet2-core';
import { stringifyAnyJsonLikeForDisplay } from '../../utils/dataValuePayloads.js';

export function deriveLargeStoredValuePreviewFullText(restoredValue: DataValue | undefined): string | undefined {
  if (!restoredValue) {
    return undefined;
  }

  switch (restoredValue.type) {
    case 'string':
      return restoredValue.value;
    case 'string[]':
      return restoredValue.value.join('\n');
    case 'object':
    case 'object[]':
      return JSON.stringify(restoredValue.value, null, 2);
    case 'any':
    case 'any[]':
      return typeof restoredValue.value === 'string'
        ? restoredValue.value
        : stringifyAnyJsonLikeForDisplay(restoredValue.value);
    default:
      return undefined;
  }
}
