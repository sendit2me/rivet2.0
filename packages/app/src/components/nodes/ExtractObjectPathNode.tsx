import { type ExtractObjectPathNode, type Inputs, type PortId } from '@ironclad/rivet-core';
import { type FC, useMemo } from 'react';
import { RenderDataValue, type OutputRenderMode } from '../RenderDataValue.js';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { restoreStoredPortMap } from '../../utils/executionDataReaders.js';
import {
  getExtractObjectPathPreviewSource,
  getExtractObjectPathUsePathInput,
  getParsedExtractObjectPathPreviewSource,
  hasExtractObjectPathInterpolationInputs,
} from './extractObjectPathOutputUtils.js';
import {
  getSortedSplitOutputEntries,
  StructuredNodeOutput,
  StructuredNodeOutputSection,
} from './StructuredNodeOutput.js';

const outputDefinitions = [
  { id: 'match' as PortId, label: 'Match' },
  { id: 'all_matches' as PortId, label: 'All Matches' },
];

const ExtractObjectPathNodeOutputBody: FC<{
  node: ExtractObjectPathNode;
  data: NodeRunDataWithRefs;
  renderMode: OutputRenderMode;
}> = ({ node, data, renderMode }) => {
  const errorMessage = data.status?.type === 'error' ? data.status.error : undefined;
  const hasError = data.status?.type === 'error';
  const dataRefs = useDataRefs();
  const pathSource = getExtractObjectPathPreviewSource(node, data);
  const shouldShowParsedExpression =
    !getExtractObjectPathUsePathInput(node, data) && hasExtractObjectPathInterpolationInputs(pathSource);
  const parsedExpression = useMemo(
    () =>
      shouldShowParsedExpression
        ? getParsedExtractObjectPathPreviewSource(
            pathSource,
            (restoreStoredPortMap(data.inputData, dataRefs) as Inputs | undefined) ?? {},
          )
        : undefined,
    [data.inputData, dataRefs, pathSource, shouldShowParsedExpression],
  );

  const renderOutputs = (outputs: NodeRunDataWithRefs['outputData'], keyPrefix = '') =>
    outputDefinitions.map(({ id, label }) => (
      <StructuredNodeOutputSection label={label} key={`${keyPrefix}${id}`}>
        <RenderDataValue value={outputs?.[id]} mode={renderMode} />
      </StructuredNodeOutputSection>
    ));

  return (
    <StructuredNodeOutput
      errorMessage={errorMessage}
      parsedSource={shouldShowParsedExpression ? (parsedExpression ?? '') : undefined}
      parsedSourceLanguage="jsonpath"
    >
      {!hasError && data.splitOutputData && (
        <div className="split-output">
          {getSortedSplitOutputEntries(data.splitOutputData).map(([key, outputs]) => renderOutputs(outputs, `${key}:`))}
        </div>
      )}

      {!hasError && !data.splitOutputData && renderOutputs(data.outputData)}
    </StructuredNodeOutput>
  );
};

export const extractObjectPathNodeDescriptor: NodeComponentDescriptor<'extractObjectPath'> = {
  Output: ({ node, data, isCompact }) => (
    <ExtractObjectPathNodeOutputBody node={node} data={data} renderMode={isCompact ? 'compact' : 'full'} />
  ),
  FullscreenOutput: ({ node, data }) => (
    <ExtractObjectPathNodeOutputBody node={node} data={data} renderMode="expanded-preview" />
  ),
};
