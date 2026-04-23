import {
  type ExpressionNode,
  type Inputs,
} from '@ironclad/rivet-core';
import { type FC, useMemo } from 'react';
import {
  EXPRESSION_OUTPUT_PORT_ID,
  interpolateExpressionSource,
} from '../../../../core/src/model/nodes/ExpressionNode.js';
import { RenderDataValue, type OutputRenderMode } from '../RenderDataValue.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { restoreStoredPortMap } from '../../utils/executionDataReaders.js';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { getExpressionPreviewSource, hasExpressionInterpolationInputs } from './expressionOutputUtils.js';
import {
  StructuredNodeOutput,
  StructuredNodeOutputSection,
} from './StructuredNodeOutput.js';

const ExpressionNodeOutputBody: FC<{
  node: ExpressionNode;
  data: NodeRunDataWithRefs;
  renderMode: OutputRenderMode;
}> = ({ node, data, renderMode }) => {
  const errorMessage = data.status?.type === 'error' ? data.status.error : undefined;
  const hasError = data.status?.type === 'error';
  const dataRefs = useDataRefs();
  const expressionSource = getExpressionPreviewSource(node, data);
  const shouldShowParsedExpression = hasExpressionInterpolationInputs(expressionSource);
  const parsedExpression = useMemo(
    () =>
      shouldShowParsedExpression
        ? interpolateExpressionSource(
            expressionSource,
            (restoreStoredPortMap(data.inputData, dataRefs) as Inputs | undefined) ?? {},
          )
        : undefined,
    [data.inputData, dataRefs, expressionSource, shouldShowParsedExpression],
  );

  return (
    <StructuredNodeOutput
      errorMessage={errorMessage}
      parsedSource={shouldShowParsedExpression ? (parsedExpression ?? '') : undefined}
      parsedSourceLanguage="javascript"
    >
      {!hasError && (
        <StructuredNodeOutputSection label="Resulting value">
          <RenderDataValue value={data.outputData?.[EXPRESSION_OUTPUT_PORT_ID]} mode={renderMode} />
        </StructuredNodeOutputSection>
      )}
    </StructuredNodeOutput>
  );
};

export const expressionNodeDescriptor: NodeComponentDescriptor<'expression'> = {
  Output: ({ node, data, isCompact }) => (
    <ExpressionNodeOutputBody node={node} data={data} renderMode={isCompact ? 'compact' : 'full'} />
  ),
  FullscreenOutput: ({ node, data }) => (
    <ExpressionNodeOutputBody node={node} data={data} renderMode="expanded-preview" />
  ),
};
