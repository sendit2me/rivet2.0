import { extractInterpolationVariables } from '@valerypopoff/rivet2-core';
import type { OutputRenderMode } from '../RenderDataValue.js';

export function hasDisplayableInterpolationInputs(
  source: string,
  options: {
    reservedInputNames?: ReadonlySet<string>;
  } = {},
): boolean {
  return extractInterpolationVariables(source).some((inputName) => !options.reservedInputNames?.has(inputName));
}

export function shouldShowStructuredOutputDetails(renderMode: OutputRenderMode): boolean {
  return renderMode !== 'compact';
}
