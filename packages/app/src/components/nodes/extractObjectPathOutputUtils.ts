import {
  type DataValue,
  type ExtractObjectPathNode,
  type Inputs,
  type PortId,
  extractInterpolationVariables,
  findInterpolationTokenSpans,
  getInterpolationTokenName,
  interpolate,
  protectEscapedInterpolationTokens,
  restoreEscapedInterpolationTokens,
} from '@rivet2/rivet-core';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { hasDisplayableInterpolationInputs } from './parsedSourceDisplayUtils.js';

const RESERVED_INPUT_NAMES = new Set(['object']);

function buildExtractObjectPathInterpolationInputs(
  path: string,
  inputs: Inputs,
): Record<string, DataValue | string | undefined> {
  return Object.fromEntries(
    extractInterpolationVariables(path).map((inputName) => [
      inputName,
      RESERVED_INPUT_NAMES.has(inputName) ? '' : inputs[inputName as PortId],
    ]),
  ) as Record<string, DataValue | string | undefined>;
}

export function getExtractObjectPathPreviewSource(node: ExtractObjectPathNode, data: NodeRunDataWithRefs): string {
  return data.debugData?.extractObjectPathSource ?? node.data.path;
}

export function getExtractObjectPathUsePathInput(node: ExtractObjectPathNode, data: NodeRunDataWithRefs): boolean {
  return data.debugData?.extractObjectPathUsePathInput ?? node.data.usePathInput;
}

export function hasExtractObjectPathInterpolationInputs(pathSource: string): boolean {
  return hasDisplayableInterpolationInputs(pathSource, {
    reservedInputNames: RESERVED_INPUT_NAMES,
  });
}

export function getParsedExtractObjectPathPreviewSource(pathSource: string, inputs: Inputs): string {
  const protectedPath = protectEscapedInterpolationTokens(pathSource);
  const tokenSpans = findInterpolationTokenSpans(protectedPath);

  if (tokenSpans.length === 0) {
    return restoreEscapedInterpolationTokens(protectedPath).trim();
  }

  const interpolationInputs = buildExtractObjectPathInterpolationInputs(pathSource, inputs);
  let result = '';
  let cursor = 0;

  for (const tokenSpan of tokenSpans) {
    result += protectedPath.slice(cursor, tokenSpan.start);

    const tokenName = getInterpolationTokenName(tokenSpan.rawInner);

    if (tokenName?.startsWith('@graphInputs.') || tokenName?.startsWith('@context.')) {
      result += protectedPath.slice(tokenSpan.start, tokenSpan.end);
    } else {
      result += interpolate(`{{${tokenSpan.rawInner}}}`, interpolationInputs);
    }

    cursor = tokenSpan.end;
  }

  result += protectedPath.slice(cursor);

  return restoreEscapedInterpolationTokens(result).trim();
}
