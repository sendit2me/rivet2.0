import { css } from '@emotion/react';
import { type Inputs, type JSFilterNode, type JSMapNode, type PortId } from '@ironclad/rivet-core';
import { type FC, useMemo } from 'react';
import ColorizedPreformattedText from '../ColorizedPreformattedText.js';
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

type JSListNode = JSFilterNode | JSMapNode;

const jsListOutputCss = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  .js-list-output-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .js-list-output-source pre {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
`;

const jsListOutputErrorCss = css`
  color: var(--error-light);
`;

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
    <div css={jsListOutputCss}>
      {errorMessage && <div css={jsListOutputErrorCss}>{errorMessage}</div>}

      {!errorMessage && data.splitOutputData && (
        <div className="split-output">
          {getSortedSplitOutputEntries(data).map(([key, outputs]) => (
            <div className="js-list-output-section" key={key}>
              <div>
                <em className="port-id-label">{resultLabel}</em>
              </div>
              <RenderDataValue value={outputs[outputId]} mode={renderMode} />
            </div>
          ))}
        </div>
      )}

      {!errorMessage && !data.splitOutputData && (
        <div className="js-list-output-section">
          <div>
            <em className="port-id-label">{resultLabel}</em>
          </div>
          <RenderDataValue value={data.outputData?.[outputId]} mode={renderMode} />
        </div>
      )}

      {shouldShowParsedExpression && (
        <div className="js-list-output-section js-list-output-source">
          <div>
            <em className="port-id-label">Parsed expression</em>
          </div>
          <ColorizedPreformattedText text={parsedExpression ?? ''} language="javascript" />
        </div>
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
