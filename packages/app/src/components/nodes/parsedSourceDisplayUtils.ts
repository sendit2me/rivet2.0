import { extractInterpolationVariables } from '../../../../core/src/utils/interpolation.js';

export function hasDisplayableInterpolationInputs(
  source: string,
  options: {
    reservedInputNames?: ReadonlySet<string>;
  } = {},
): boolean {
  return extractInterpolationVariables(source).some((inputName) => !options.reservedInputNames?.has(inputName));
}
