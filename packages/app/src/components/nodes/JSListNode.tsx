import { type Inputs, type JSFilterNode, type JSMapNode, type PortId } from '@ironclad/rivet-core';
import { type FC, useMemo } from 'react';
import { RenderDataValue, type OutputRenderMode } from '../RenderDataValue.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { restoreStoredPortMap } from '../../utils/executionDataReaders.js';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import {
  getJSListCallbackPreviewSource,
  getParsedJSListCallbackPreviewSource,
  hasJSListCallbackInterpolationInputs,
} from './jsListOutputUtils.js';
import { StructuredNodeOutput, StructuredNodeOutputSection } from './StructuredNodeOutput.js';
import { getSortedSplitOutputEntries } from '../nodeOutput/splitOutputEntries.js';

type JSListNode = JSFilterNode | JSMapNode;

const JS_LIST_OUTPUT_CONFIG = {
  jsFilter: { outputId: 'filtered' as PortId, resultLabel: 'Filtered' },
  jsMap: { outputId: 'mapped' as PortId, resultLabel: 'Mapped' },
};

const JSListNodeOutputBody: FC<{
  node: JSListNode;
  data: NodeRunDataWithRefs;
  renderMode: OutputRenderMode;
}> = ({ node, data, renderMode }) => {
  const { outputId, resultLabel } = JS_LIST_OUTPUT_CONFIG[node.type];
  const errorMessage = data.status?.type === 'error' ? data.status.error : undefined;
  const hasError = data.status?.type === 'error';
  const dataRefs = useDataRefs();
  const callbackBodySource = getJSListCallbackPreviewSource(node, data);
  const shouldShowParsedExpression = hasJSListCallbackInterpolationInputs(callbackBodySource);
  const parsedExpression = useMemo(
    () =>
      shouldShowParsedExpression
        ? getParsedJSListCallbackPreviewSource(
            callbackBodySource,
            (restoreStoredPortMap(data.inputData, dataRefs) as Inputs | undefined) ?? {},
          )
        : undefined,
    [callbackBodySource, data.inputData, dataRefs, shouldShowParsedExpression],
  );

  return (
    <StructuredNodeOutput
      errorMessage={errorMessage}
      parsedSource={shouldShowParsedExpression ? (parsedExpression ?? '') : undefined}
      parsedSourceLanguage="javascript"
    >
      {!hasError && data.splitOutputData && (
        <div className="split-output">
          {getSortedSplitOutputEntries(data.splitOutputData).map(([key, outputs]) => (
            <StructuredNodeOutputSection label={resultLabel} key={key}>
              <RenderDataValue value={outputs[outputId]} mode={renderMode} />
            </StructuredNodeOutputSection>
          ))}
        </div>
      )}

      {!hasError && !data.splitOutputData && (
        <StructuredNodeOutputSection label={resultLabel}>
          <RenderDataValue value={data.outputData?.[outputId]} mode={renderMode} />
        </StructuredNodeOutputSection>
      )}
    </StructuredNodeOutput>
  );
};

export const jsFilterNodeDescriptor: NodeComponentDescriptor<'jsFilter'> = {
  Output: ({ node, data, isCompact }) => (
    <JSListNodeOutputBody node={node} data={data} renderMode={isCompact ? 'compact' : 'full'} />
  ),
  FullscreenOutput: ({ node, data }) => (
    <JSListNodeOutputBody node={node} data={data} renderMode="expanded-preview" />
  ),
};

export const jsMapNodeDescriptor: NodeComponentDescriptor<'jsMap'> = {
  Output: ({ node, data, isCompact }) => (
    <JSListNodeOutputBody node={node} data={data} renderMode={isCompact ? 'compact' : 'full'} />
  ),
  FullscreenOutput: ({ node, data }) => (
    <JSListNodeOutputBody node={node} data={data} renderMode="expanded-preview" />
  ),
};
