import { type FC } from 'react';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { getCodeNodeErrorViewModel } from './codeNodeOutputUtils.js';
import { StructuredNodeOutput, StructuredNodeOutputSection } from './StructuredNodeOutput.js';

export const CodeNodeErrorOutput: FC<{
  data: NodeRunDataWithRefs;
}> = ({ data }) => {
  const parsedError = getCodeNodeErrorViewModel(data);

  return (
    <StructuredNodeOutput errorMessage={parsedError.message}>
      {parsedError.location && (
        <StructuredNodeOutputSection label="Error location">
          <div>
            line {parsedError.location.line}
            {parsedError.location.column != null ? `, column ${parsedError.location.column}` : ''}
          </div>
        </StructuredNodeOutputSection>
      )}
    </StructuredNodeOutput>
  );
};
