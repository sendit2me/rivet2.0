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
  ParsedSourceOutputSection,
  StructuredNodeOutputError,
  StructuredNodeOutputSection,
  structuredNodeOutputCss,
} from './StructuredNodeOutput.js';

const outputDefinitions: Array<{ id: PortId; label: string }> = [
  {
    id: 'match' as PortId,
    label: 'Match',
  },
  {
    id: 'all_matches' as PortId,
    label: 'All Matches',
  },
];

function getSortedSplitOutputEntries(
  data: NodeRunDataWithRefs,
): Array<[string, NonNullable<NodeRunDataWithRefs['splitOutputData']>[number]]> {
  return Object.entries(data.splitOutputData ?? {}).sort(([left], [right]) => Number(left) - Number(right));
}

const ExtractObjectPathNodeOutputBody: FC<{
  node: ExtractObjectPathNode;
  data: NodeRunDataWithRefs;
  renderMode: OutputRenderMode;
}> = ({ node, data, renderMode }) => {
  const errorMessage = data.status?.type === 'error' ? data.status.error : undefined;
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

  const renderOutputs = (outputs: NodeRunDataWithRefs['outputData']) =>
    outputDefinitions.map(({ id, label }) => (
      <StructuredNodeOutputSection label={label} key={id}>
        <RenderDataValue value={outputs?.[id]} mode={renderMode} />
      </StructuredNodeOutputSection>
    ));

  return (
    <div css={structuredNodeOutputCss}>
      {errorMessage && <StructuredNodeOutputError>{errorMessage}</StructuredNodeOutputError>}

      {!errorMessage && data.splitOutputData && (
        <div className="split-output">
          {getSortedSplitOutputEntries(data).map(([key, outputs]) => (
            <div className="structured-node-output-section" key={key}>
              {renderOutputs(outputs)}
            </div>
          ))}
        </div>
      )}

      {!errorMessage && !data.splitOutputData && renderOutputs(data.outputData)}

      {shouldShowParsedExpression && (
        <ParsedSourceOutputSection source={parsedExpression ?? ''} language="jsonpath" />
      )}
    </div>
  );
};

const ExtractObjectPathNodeOutput: FC<{
  node: ExtractObjectPathNode;
  data: NodeRunDataWithRefs;
  isCompact: boolean;
}> = ({ node, data, isCompact }) => {
  return <ExtractObjectPathNodeOutputBody node={node} data={data} renderMode={isCompact ? 'compact' : 'full'} />;
};

const ExtractObjectPathNodeFullscreenOutput: FC<{
  node: ExtractObjectPathNode;
  data: NodeRunDataWithRefs;
}> = ({ node, data }) => {
  return <ExtractObjectPathNodeOutputBody node={node} data={data} renderMode="expanded-preview" />;
};

export const extractObjectPathNodeDescriptor: NodeComponentDescriptor<'extractObjectPath'> = {
  Output: ExtractObjectPathNodeOutput,
  FullscreenOutput: ExtractObjectPathNodeFullscreenOutput,
};
