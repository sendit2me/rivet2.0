import { type ChartNode } from '@valerypopoff/rivet2-core';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

import { preservePortTextCaseState } from '../state/settings.js';
import { uiFontSizeState } from '../state/ui.js';
import { MIN_NODE_WIDTH } from '../utils/nodeResize.js';
import { getMinimumNodeWidthForPortLabels } from '../utils/nodePortLabelWidth.js';
import { getUiFontScale } from '../utils/uiFontSize.js';
import { useCanvasNodeIO } from './useGetNodeIO.js';

export function useNodePortLabelMinWidth(node: ChartNode) {
  const nodeIO = useCanvasNodeIO(node.id);
  const preservePortCase = useAtomValue(preservePortTextCaseState);
  const uiFontSize = useAtomValue(uiFontSizeState);

  return useMemo(() => {
    if (node.type === 'comment') {
      return MIN_NODE_WIDTH;
    }

    return getMinimumNodeWidthForPortLabels({
      inputDefinitions: nodeIO?.inputDefinitions ?? [],
      outputDefinitions: nodeIO?.outputDefinitions ?? [],
      preservePortCase,
      uiFontScale: getUiFontScale(uiFontSize),
    });
  }, [
    node.type,
    nodeIO?.inputDefinitions,
    nodeIO?.outputDefinitions,
    preservePortCase,
    uiFontSize,
  ]);
}
