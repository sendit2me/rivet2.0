import type { Inputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import { coerceTypeOptional } from '../../utils/coerceType.js';
import { replaceInterpolationTokens } from '../../utils/interpolation.js';

type RawJsSourceInterpolationOptions = {
  ignoredInputNames?: ReadonlySet<string>;
};

function readRawJsSourceInput(inputs: Inputs, inputName: string): string | undefined {
  const wrappedInput = inputs[inputName as PortId];

  if (wrappedInput === undefined) {
    return undefined;
  }

  return coerceTypeOptional(wrappedInput, 'string');
}

export function interpolateRawJsSource(
  template: string,
  inputs: Inputs,
  options: RawJsSourceInterpolationOptions = {},
): string {
  return replaceInterpolationTokens(
    template,
    ({ tokenName }) => {
      // Raw JS interpolation deliberately inserts source text, not quoted values.
      // Missing values become the identifier `undefined`.
      const replacement =
        tokenName && !options.ignoredInputNames?.has(tokenName) ? readRawJsSourceInput(inputs, tokenName) : undefined;
      return replacement ?? 'undefined';
    },
    { trim: true },
  );
}
