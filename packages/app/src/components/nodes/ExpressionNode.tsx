import {
  EXPRESSION_OUTPUT_PORT_ID,
  type ExpressionNode,
  type Inputs,
  interpolateExpressionSource,
} from '@valerypopoff/rivet2-core';
import { type FC, useMemo } from 'react';
import { RenderDataValue, type OutputRenderMode } from '../RenderDataValue.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { restoreStoredPortMap } from '../../utils/executionDataReaders.js';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { getExpressionPreviewSource, hasExpressionInterpolationInputs } from './expressionOutputUtils.js';
import { shouldShowStructuredOutputDetails } from './parsedSourceDisplayUtils.js';
import { StructuredNodeOutput, StructuredNodeOutputSection } from './StructuredNodeOutput.js';
import { getSortedSplitOutputEntries } from '../nodeOutput/splitOutputEntries.js';

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
  const isCompactPreview = renderMode === 'compact';
  const showStructuredDetails = shouldShowStructuredOutputDetails(renderMode);
  const shouldShowParsedExpression = showStructuredDetails && hasExpressionInterpolationInputs(expressionSource);
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
  const renderValue = (value: NodeRunDataWithRefs['outputData']) => (
    <RenderDataValue
      value={value?.[EXPRESSION_OUTPUT_PORT_ID]}
      isCompact={isCompactPreview}
      mode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  );
  const renderResult = (value: NodeRunDataWithRefs['outputData'], key?: string) => (
    <StructuredNodeOutputSection label="Resulting value" key={key}>
      {renderValue(value)}
    </StructuredNodeOutputSection>
  );

  if (!showStructuredDetails && !hasError) {
    return data.splitOutputData ? (
      <div className="split-output">
        {getSortedSplitOutputEntries(data.splitOutputData).map(([key, outputs]) => (
          <div key={key}>{renderValue(outputs)}</div>
        ))}
      </div>
    ) : (
      renderValue(data.outputData)
    );
  }

  return (
    <StructuredNodeOutput
      errorMessage={errorMessage}
      parsedSource={shouldShowParsedExpression ? parsedExpression ?? '' : undefined}
      parsedSourceLanguage="javascript"
    >
      {!hasError && data.splitOutputData && (
        <div className="split-output">
          {getSortedSplitOutputEntries(data.splitOutputData).map(([key, outputs]) => renderResult(outputs, key))}
        </div>
      )}
      {!hasError && !data.splitOutputData && renderResult(data.outputData)}
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
