import { canBeCoercedAny, isDataTypeAccepted, type DataType } from '@ironclad/rivet-core';

export type PortCompatibilityStatus = 'none' | 'compatible' | 'coerced' | 'incompatible';

export function getPortCompatibilityStatus(options: {
  draggingDataType?: DataType | Readonly<DataType[]>;
  portDataType?: DataType | Readonly<DataType[]>;
  canCoerce: boolean;
  isInput: boolean;
}): PortCompatibilityStatus {
  const { draggingDataType, portDataType, canCoerce, isInput } = options;

  if (!isInput || !draggingDataType || !portDataType) {
    return 'none';
  }

  if (isDataTypeAccepted(draggingDataType, portDataType)) {
    return 'compatible';
  }

  if (canCoerce && canBeCoercedAny(draggingDataType, portDataType)) {
    return 'coerced';
  }

  return 'incompatible';
}
