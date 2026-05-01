import type { DataType } from './DataValue.js';
import type { NodeInputDefinition, PortId } from './NodeBase.js';

export const INTERPOLATION_INPUT_DEFINITION_KIND = 'interpolation-input';

export type InterpolationInputDefinitionData = {
  kind: typeof INTERPOLATION_INPUT_DEFINITION_KIND;
  interpolationName: string;
};

export function createInterpolationInputDefinition({
  id,
  interpolationName,
  dataType,
  required,
  description,
}: {
  id?: PortId;
  interpolationName: string;
  dataType: DataType | Readonly<DataType[]>;
  required?: boolean;
  description?: string;
}): NodeInputDefinition {
  const definition: NodeInputDefinition = {
    id: id ?? (interpolationName as PortId),
    title: interpolationName,
    dataType,
    data: {
      kind: INTERPOLATION_INPUT_DEFINITION_KIND,
      interpolationName,
    } satisfies InterpolationInputDefinitionData,
  };

  if (required != null) {
    definition.required = required;
  }

  if (description != null) {
    definition.description = description;
  }

  return definition;
}

export function getInterpolationInputDefinitionData(
  inputDefinition: NodeInputDefinition,
): InterpolationInputDefinitionData | undefined {
  if (typeof inputDefinition.data !== 'object' || inputDefinition.data == null) {
    return undefined;
  }

  const data = inputDefinition.data as Partial<InterpolationInputDefinitionData>;

  if (
    data?.kind !== INTERPOLATION_INPUT_DEFINITION_KIND ||
    typeof data.interpolationName !== 'string'
  ) {
    return undefined;
  }

  return {
    kind: INTERPOLATION_INPUT_DEFINITION_KIND,
    interpolationName: data.interpolationName,
  };
}

export function isInterpolationInputDefinition(inputDefinition: NodeInputDefinition): boolean {
  return getInterpolationInputDefinitionData(inputDefinition) != null;
}
