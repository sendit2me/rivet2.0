import {
  CODE_NEW_OUTPUT_PORT_ID,
  type CodeNewNode,
  type Inputs,
} from '@valerypopoff/rivet2-core';
import { type FC, useMemo } from 'react';
import { RenderDataValue, type OutputRenderMode } from '../RenderDataValue.js';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { restoreStoredPortMap } from '../../utils/executionDataReaders.js';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import {
  getCodeNewParsedSource,
  getCodeNewPreviewSource,
  hasCodeNewInterpolationInputs,
} from './codeNewOutputUtils.js';
import { getCodeNodeErrorViewModel } from './codeNodeOutputUtils.js';
import { StructuredNodeOutput, StructuredNodeOutputSection } from './StructuredNodeOutput.js';
import { getSortedSplitOutputEntries } from '../nodeOutput/splitOutputEntries.js';

const CodeNewNodeOutputBody: FC<{
  node: CodeNewNode;
  data: NodeRunDataWithRefs;
  renderMode: OutputRenderMode;
  allowLargeStoredValueActions?: boolean;
}> = ({ node, data, renderMode, allowLargeStoredValueActions }) => {
  const hasError = data.status?.type === 'error';
  const parsedError = hasError ? getCodeNodeErrorViewModel(data) : undefined;
  const dataRefs = useDataRefs();
  const codeSource = getCodeNewPreviewSource(node, data);
  const shouldShowParsedCode = hasCodeNewInterpolationInputs(codeSource);
  const parsedCode = useMemo(
    () =>
      shouldShowParsedCode
        ? getCodeNewParsedSource(
            node,
            data,
            (restoreStoredPortMap(data.inputData, dataRefs) as Inputs | undefined) ?? {},
          )
        : undefined,
    [data, dataRefs, node, shouldShowParsedCode],
  );
  const renderResult = (value: NodeRunDataWithRefs['outputData'], key?: string) => (
    <StructuredNodeOutputSection label="Returned value" key={key}>
      <RenderDataValue
        value={value?.[CODE_NEW_OUTPUT_PORT_ID]}
        mode={renderMode}
        allowLargeStoredValueActions={allowLargeStoredValueActions}
      />
    </StructuredNodeOutputSection>
  );

  return (
    <StructuredNodeOutput
      errorMessage={parsedError?.message}
      parsedSource={shouldShowParsedCode ? parsedCode ?? '' : undefined}
      parsedSourceLabel="Parsed code"
      parsedSourceLanguage="javascript"
    >
      {parsedError?.location && (
        <StructuredNodeOutputSection label="Error location">
          <div>
            line {parsedError.location.line}
            {parsedError.location.column != null ? `, column ${parsedError.location.column}` : ''}
          </div>
        </StructuredNodeOutputSection>
      )}
      {!hasError && data.splitOutputData && (
        <div className="split-output">
          {getSortedSplitOutputEntries(data.splitOutputData).map(([key, outputs]) => renderResult(outputs, key))}
        </div>
      )}
      {!hasError && !data.splitOutputData && renderResult(data.outputData)}
    </StructuredNodeOutput>
  );
};

export const codeNewNodeDescriptor: NodeComponentDescriptor<'codeNew'> = {
  Output: ({ node, data, renderMode = 'compact', allowLargeStoredValueActions }) => (
    <CodeNewNodeOutputBody
      node={node}
      data={data}
      renderMode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  ),
  FullscreenOutput: ({ node, data, renderMode = 'expanded-preview', allowLargeStoredValueActions }) => (
    <CodeNewNodeOutputBody
      node={node}
      data={data}
      renderMode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  ),
};
