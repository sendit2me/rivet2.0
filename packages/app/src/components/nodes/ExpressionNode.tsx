import {
  EXPRESSION_OUTPUT_PORT_ID,
  type ExpressionNode,
  type Inputs,
  interpolateExpressionSource,
} from '@rivet2/rivet-core';
import { type FC, useMemo } from 'react';
import { RenderDataValue, type OutputRenderMode } from '../RenderDataValue.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { restoreStoredPortMap } from '../../utils/executionDataReaders.js';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { getExpressionPreviewSource, hasExpressionInterpolationInputs } from './expressionOutputUtils.js';
import { StructuredNodeOutput, StructuredNodeOutputSection } from './StructuredNodeOutput.js';

const ExpressionNodeOutputBody: FC<{
  node: ExpressionNode;
  data: NodeRunDataWithRefs;
  renderMode: OutputRenderMode;
  allowLargeStoredValueActions?: boolean;
}> = ({ node, data, renderMode, allowLargeStoredValueActions }) => {
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
      parsedSource={shouldShowParsedExpression ? parsedExpression ?? '' : undefined}
      parsedSourceLanguage="javascript"
    >
      {!hasError && (
        <StructuredNodeOutputSection label="Resulting value">
          <RenderDataValue
            value={data.outputData?.[EXPRESSION_OUTPUT_PORT_ID]}
            mode={renderMode}
            allowLargeStoredValueActions={allowLargeStoredValueActions}
          />
        </StructuredNodeOutputSection>
      )}
    </StructuredNodeOutput>
  );
};

export const expressionNodeDescriptor: NodeComponentDescriptor<'expression'> = {
  Output: ({ node, data, renderMode = 'compact', allowLargeStoredValueActions }) => (
    <ExpressionNodeOutputBody
      node={node}
      data={data}
      renderMode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  ),
  FullscreenOutput: ({ node, data, renderMode = 'expanded-preview', allowLargeStoredValueActions }) => (
    <ExpressionNodeOutputBody
      node={node}
      data={data}
      renderMode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  ),
};
