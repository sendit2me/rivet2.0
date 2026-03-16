import {
  arrayizeDataValue,
  type ChatMessageMessagePart,
  type DataValue,
  getScalarTypeOf,
  isArrayDataValue,
  isScalarDataValue,
  type Inputs,
  type Outputs,
  type PortId,
  type ScalarOrArrayDataValue,
  coerceTypeOptional,
} from '@ironclad/rivet-core';
import { nanoid } from 'nanoid';
import { cloneDeep, mapValues } from 'lodash-es';
import { P, match } from 'ts-pattern';
import type { DataRefStore } from '../providers/ProvidersContext';
import type { DataValueWithRefs, InputsOrOutputsWithRefs, NodeRunData, NodeRunDataWithRefs } from '../state/dataFlow';

const DEFAULT_MAX_DATA_LENGTH = 300_000;

type DataRefReader = Pick<DataRefStore, 'get'>;

export function sanitizeDataValueForLength(
  value: DataValue | undefined,
  maxLength = DEFAULT_MAX_DATA_LENGTH,
): DataValue | undefined {
  return match(value)
    .with({ type: 'string' }, (stringValue): DataValue => {
      if (stringValue.value == null) {
        return stringValue;
      }

      if (stringValue.value.length > maxLength) {
        return { type: 'string', value: `String (length ${stringValue.value.length.toLocaleString()}` };
      }

      return stringValue;
    })
    .with({ type: 'object' }, (objectValue): DataValue => {
      const stringified = JSON.stringify(objectValue.value);

      if (stringified.length > maxLength) {
        return { type: 'string', value: `Object (length ${stringified.length.toLocaleString()}` };
      }

      return objectValue;
    })
    .with({ type: 'any' }, (anyValue): DataValue => {
      const inferred = coerceTypeOptional(anyValue, 'string');
      if ((inferred?.length ?? 0) > maxLength) {
        return { type: 'string', value: `Any (length ${inferred!.length.toLocaleString()}` };
      }

      return anyValue;
    })
    .with({ type: 'image' }, (imageValue): DataValue => {
      if (imageValue.value.data instanceof Uint8Array || Array.isArray(imageValue.value.data)) {
        return imageValue;
      }

      return {
        ...imageValue,
        value: {
          ...imageValue.value,
          data: Uint8Array.from(Object.values(imageValue.value.data)),
        },
      };
    })
    .with({ type: 'string[]' }, (stringArrayValue): DataValue => {
      const sumLength = stringArrayValue.value.reduce((acc, str) => acc + str.length, 0);
      if (sumLength > maxLength) {
        return {
          type: 'string',
          value: `string[] (${stringArrayValue.value.length.toLocaleString()} elements, total length ${sumLength.toLocaleString()}`,
        };
      }

      return stringArrayValue;
    })
    .otherwise((otherValue): DataValue | undefined => otherValue);
}

export function fixDataValueUint8Arrays(value: DataValue | undefined): DataValue | undefined {
  if (!value) {
    return undefined;
  }

  if (isArrayDataValue(value)) {
    const arrayized = arrayizeDataValue(value);

    return {
      ...value,
      value: arrayized.map((item) => fixDataValueUint8Arrays(item)!.value),
    } as DataValue;
  }

  const fix = (uint8ArrayOrObject: Uint8Array | object) =>
    uint8ArrayOrObject instanceof Uint8Array ? uint8ArrayOrObject : Uint8Array.from(Object.values(uint8ArrayOrObject));

  return match(value)
    .with({ type: 'binary' }, (binaryValue): DataValue => ({
      ...binaryValue,
      value: fix(binaryValue.value),
    }))
    .with({ type: 'audio' }, (audioValue): DataValue => ({
      ...audioValue,
      value: {
        ...audioValue.value,
        data: fix(audioValue.value.data),
      },
    }))
    .with({ type: 'document' }, (documentValue): DataValue => ({
      ...documentValue,
      value: {
        ...documentValue.value,
        data: fix(documentValue.value.data),
      },
    }))
    .with({ type: 'image' }, (imageValue): DataValue => ({
      ...imageValue,
      value: {
        ...imageValue.value,
        data: fix(imageValue.value.data),
      },
    }))
    .with({ type: 'chat-message' }, (chatMessageValue): DataValue => ({
      ...chatMessageValue,
      value: {
        ...chatMessageValue.value,
        message: Array.isArray(chatMessageValue.value.message)
          ? chatMessageValue.value.message.map((part) => fixChatMessagePartUint8Arrays(part))
          : fixChatMessagePartUint8Arrays(chatMessageValue.value.message),
      },
    }))
    .otherwise((otherValue): DataValue => otherValue);
}

export function cloneNodeDataForHistory(
  data: Partial<NodeRunData>,
  refStore: DataRefStore,
): Partial<NodeRunDataWithRefs> {
  return {
    ...data,
    inputData: cloneNodeInputOrOutputDataForHistory(data.inputData, refStore),
    outputData: cloneNodeInputOrOutputDataForHistory(data.outputData, refStore),
    splitOutputData: data.splitOutputData
      ? (mapValues(data.splitOutputData, (value) => cloneNodeInputOrOutputDataForHistory(value, refStore)) as {
          [index: number]: InputsOrOutputsWithRefs;
        })
      : undefined,
  };
}

export function cloneNodeInputOrOutputDataForHistory(
  data: Inputs | Outputs | undefined,
  refStore: DataRefStore,
): InputsOrOutputsWithRefs | undefined {
  if (data == null) {
    return undefined;
  }

  return mapValues(data as Record<PortId, DataValue>, (value) => {
    if (!value) {
      return cloneDeep(value);
    }

    return convertToRef(value, refStore);
  }) as InputsOrOutputsWithRefs;
}

export function restoreDataValueFromHistory(value: DataValueWithRefs, refStore: DataRefReader): DataValue {
  const scalarType = getScalarTypeOf(value.type);

  if (isArrayDataValue(value as DataValue)) {
    const arrayized = arrayizeDataValue(value as unknown as ScalarOrArrayDataValue);

    return {
      type: value.type,
      value: arrayized.map((item) =>
        restoreDataValueFromHistory(
          {
            type: scalarType,
            value: item.value,
          } as DataValueWithRefs,
          refStore,
        ).value,
      ),
    } as DataValue;
  }

  if (
    scalarType !== 'audio' &&
    scalarType !== 'binary' &&
    scalarType !== 'image' &&
    scalarType !== 'document' &&
    scalarType !== 'chat-message'
  ) {
    return cloneDeep(value) as unknown as DataValue;
  }

  const ref = (value.value as { ref?: string } | undefined)?.ref;
  const resolved = ref ? refStore.get(ref) : undefined;

  if (!resolved) {
    throw new Error(`Could not restore ref-backed value for type ${value.type}`);
  }

  return fixDataValueUint8Arrays(cloneDeep(resolved))!;
}

export function convertToRef(value: DataValue, refStore: DataRefStore): DataValueWithRefs {
  const scalarType = getScalarTypeOf(value.type);
  if (
    scalarType !== 'audio' &&
    scalarType !== 'binary' &&
    scalarType !== 'image' &&
    scalarType !== 'document' &&
    scalarType !== 'chat-message'
  ) {
    return cloneDeep(value) as DataValueWithRefs;
  }

  if (isScalarDataValue(value)) {
    const refId = nanoid();
    refStore.set(refId, value);
    return { type: value.type, value: { ref: refId } } as DataValueWithRefs;
  }

  if (isArrayDataValue(value)) {
    return {
      type: value.type,
      value: value.value.map((item) => convertToRef({ type: getScalarTypeOf(value.type), value: item } as DataValue, refStore).value),
    } as DataValueWithRefs;
  }

  return cloneDeep(value) as DataValueWithRefs;
}

function fixChatMessagePartUint8Arrays(part: ChatMessageMessagePart): ChatMessageMessagePart {
  return match(part)
    .with(P.string, (stringPart) => stringPart)
    .with({ type: 'document' }, (documentPart) => ({
      ...documentPart,
      data: Uint8Array.from(Object.values(documentPart.data)),
    }))
    .otherwise((otherPart) => otherPart);
}
