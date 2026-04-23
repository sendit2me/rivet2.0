import type { Inputs } from '../GraphProcessor.js';
import type { PortId } from '../NodeBase.js';
import { coerceTypeOptional } from '../../utils/coerceType.js';
import {
  findInterpolationTokenSpans,
  getInterpolationTokenName,
  protectEscapedInterpolationTokens,
  restoreEscapedInterpolationTokens,
} from '../../utils/interpolation.js';

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
  const protectedTemplate = protectEscapedInterpolationTokens(template);
  const tokenSpans = findInterpolationTokenSpans(protectedTemplate);

  if (tokenSpans.length === 0) {
    return restoreEscapedInterpolationTokens(protectedTemplate).trim();
  }

  let result = '';
  let cursor = 0;

  for (const tokenSpan of tokenSpans) {
    result += protectedTemplate.slice(cursor, tokenSpan.start);

    const tokenName = getInterpolationTokenName(tokenSpan.rawInner);
    // Raw JS interpolation deliberately inserts source text, not quoted values.
    // Missing values become the identifier `undefined`.
    const replacement =
      tokenName && !options.ignoredInputNames?.has(tokenName) ? readRawJsSourceInput(inputs, tokenName) : undefined;
    result += replacement ?? 'undefined';

    cursor = tokenSpan.end;
  }

  result += protectedTemplate.slice(cursor);

  return restoreEscapedInterpolationTokens(result).trim();
}
