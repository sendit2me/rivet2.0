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
import {
  ParsedSourceOutputSection,
  StructuredNodeOutputError,
  StructuredNodeOutputSection,
  structuredNodeOutputCss,
} from './StructuredNodeOutput.js';

type JSListNode = JSFilterNode | JSMapNode;

function getSortedSplitOutputEntries(
  data: NodeRunDataWithRefs,
): Array<[string, NonNullable<NodeRunDataWithRefs['splitOutputData']>[number]]> {
  return Object.entries(data.splitOutputData ?? {}).sort(([left], [right]) => Number(left) - Number(right));
}

function getJSListOutputConfig(node: JSListNode): {
  outputId: PortId;
  resultLabel: string;
} {
  return node.type === 'jsFilter'
    ? {
        outputId: 'filtered' as PortId,
        resultLabel: 'Filtered',
      }
    : {
        outputId: 'mapped' as PortId,
        resultLabel: 'Mapped',
      };
}

const JSListNodeOutputBody: FC<{
  node: JSListNode;
  data: NodeRunDataWithRefs;
  renderMode: OutputRenderMode;
}> = ({ node, data, renderMode }) => {
  const { outputId, resultLabel } = getJSListOutputConfig(node);
  const errorMessage = data.status?.type === 'error' ? data.status.error : undefined;
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
    <div css={structuredNodeOutputCss}>
      {errorMessage && <StructuredNodeOutputError>{errorMessage}</StructuredNodeOutputError>}

      {!errorMessage && data.splitOutputData && (
        <div className="split-output">
          {getSortedSplitOutputEntries(data).map(([key, outputs]) => (
            <StructuredNodeOutputSection label={resultLabel} key={key}>
              <RenderDataValue value={outputs[outputId]} mode={renderMode} />
            </StructuredNodeOutputSection>
          ))}
        </div>
      )}

      {!errorMessage && !data.splitOutputData && (
        <StructuredNodeOutputSection label={resultLabel}>
          <RenderDataValue value={data.outputData?.[outputId]} mode={renderMode} />
        </StructuredNodeOutputSection>
      )}

      {shouldShowParsedExpression && (
        <ParsedSourceOutputSection source={parsedExpression ?? ''} language="javascript" />
      )}
    </div>
  );
};

const JSListNodeOutputBodyWrapper: FC<{
  node: JSListNode;
  data: NodeRunDataWithRefs;
  isCompact: boolean;
}> = ({ node, data, isCompact }) => {
  return <JSListNodeOutputBody node={node} data={data} renderMode={isCompact ? 'compact' : 'full'} />;
};

const JSListNodeFullscreenOutputBodyWrapper: FC<{
  node: JSListNode;
  data: NodeRunDataWithRefs;
}> = ({ node, data }) => {
  return <JSListNodeOutputBody node={node} data={data} renderMode="expanded-preview" />;
};

const JSFilterNodeOutput: FC<{
  node: JSFilterNode;
  data: NodeRunDataWithRefs;
  isCompact: boolean;
}> = (props) => <JSListNodeOutputBodyWrapper {...props} />;

const JSFilterNodeFullscreenOutput: FC<{
  node: JSFilterNode;
  data: NodeRunDataWithRefs;
}> = (props) => <JSListNodeFullscreenOutputBodyWrapper {...props} />;

const JSMapNodeOutput: FC<{
  node: JSMapNode;
  data: NodeRunDataWithRefs;
  isCompact: boolean;
}> = (props) => <JSListNodeOutputBodyWrapper {...props} />;

const JSMapNodeFullscreenOutput: FC<{
  node: JSMapNode;
  data: NodeRunDataWithRefs;
}> = (props) => <JSListNodeFullscreenOutputBodyWrapper {...props} />;

export const jsFilterNodeDescriptor: NodeComponentDescriptor<'jsFilter'> = {
  Output: JSFilterNodeOutput,
  FullscreenOutput: JSFilterNodeFullscreenOutput,
};

export const jsMapNodeDescriptor: NodeComponentDescriptor<'jsMap'> = {
  Output: JSMapNodeOutput,
  FullscreenOutput: JSMapNodeFullscreenOutput,
};
