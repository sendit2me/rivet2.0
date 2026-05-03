import {
  IF_PORT,
  isBuiltInInputDefinition,
  type NodeInputDefinition,
  type NodeOutputDefinition,
} from '@valerypopoff/rivet2-core';

import { MIN_NODE_WIDTH } from './nodeResize.js';

// The canvas needs a deterministic resize clamp before layout has measured the
// port DOM. These constants match the current compact monospace label styling
// closely enough to avoid over-wide nodes while still giving long labels room.
const PORT_LABEL_CHARACTER_WIDTH_PX = 7.2;
const PORT_LABEL_HORIZONTAL_MARGIN_PX = 8;
const PORT_CIRCLE_VISIBLE_WIDTH_PX = 8;
const PORT_COLUMN_GAP_PX = 12;

export type NodePortLabelWidthOptions = {
  inputDefinitions: readonly NodeInputDefinition[];
  outputDefinitions: readonly NodeOutputDefinition[];
  preservePortCase: boolean;
  includeConditionalPort?: boolean;
  uiFontScale?: number;
};

export function getRenderedPortLabel(title: string, preservePortCase: boolean) {
  return preservePortCase ? title : title.toUpperCase();
}

export function estimatePortLabelWidth(title: string, preservePortCase: boolean, uiFontScale = 1) {
  const renderedLabel = getRenderedPortLabel(title, preservePortCase).trim();

  if (!renderedLabel) {
    return 0;
  }

  return Math.ceil(renderedLabel.length * PORT_LABEL_CHARACTER_WIDTH_PX * uiFontScale + PORT_LABEL_HORIZONTAL_MARGIN_PX);
}

function estimatePortRowWidth(title: string, preservePortCase: boolean, uiFontScale: number) {
  const labelWidth = estimatePortLabelWidth(title, preservePortCase, uiFontScale);

  if (labelWidth === 0) {
    return PORT_CIRCLE_VISIBLE_WIDTH_PX;
  }

  return labelWidth + PORT_CIRCLE_VISIBLE_WIDTH_PX;
}

function getMaxPortRowWidth(portTitles: readonly string[], preservePortCase: boolean, uiFontScale: number) {
  return portTitles.reduce((maxWidth, title) => {
    return Math.max(maxWidth, estimatePortRowWidth(title, preservePortCase, uiFontScale));
  }, 0);
}

export function getMinimumNodeWidthForPortLabels({
  inputDefinitions,
  outputDefinitions,
  preservePortCase,
  includeConditionalPort = false,
  uiFontScale = 1,
}: NodePortLabelWidthOptions) {
  const inputTitles = inputDefinitions
    .filter((inputDefinition) => !isBuiltInInputDefinition(inputDefinition))
    .map((inputDefinition) => inputDefinition.title);

  if (includeConditionalPort) {
    inputTitles.push(IF_PORT.title);
  }

  const outputTitles = outputDefinitions.map((outputDefinition) => outputDefinition.title);

  const inputWidth = getMaxPortRowWidth(inputTitles, preservePortCase, uiFontScale);
  const outputWidth = getMaxPortRowWidth(outputTitles, preservePortCase, uiFontScale);
  const columnGap = inputWidth > 0 && outputWidth > 0 ? PORT_COLUMN_GAP_PX : 0;

  return Math.max(MIN_NODE_WIDTH, Math.ceil(inputWidth + outputWidth + columnGap));
}
