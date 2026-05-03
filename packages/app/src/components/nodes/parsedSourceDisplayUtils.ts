import { extractInterpolationVariables } from '@rivet2/rivet-core';

export function hasDisplayableInterpolationInputs(
  source: string,
  options: {
    reservedInputNames?: ReadonlySet<string>;
  } = {},
): boolean {
  return extractInterpolationVariables(source).some((inputName) => !options.reservedInputNames?.has(inputName));
}
