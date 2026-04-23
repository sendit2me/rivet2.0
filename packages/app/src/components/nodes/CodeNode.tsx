import { type FC } from 'react';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { getCodeNodeErrorViewModel } from './codeNodeOutputUtils.js';
import {
  StructuredNodeOutputError,
  StructuredNodeOutputSection,
  structuredNodeOutputCss,
} from './StructuredNodeOutput.js';

export const CodeNodeErrorOutput: FC<{
  data: NodeRunDataWithRefs;
}> = ({ data }) => {
  const parsedError = getCodeNodeErrorViewModel(data);

  return (
    <div css={structuredNodeOutputCss}>
      <StructuredNodeOutputError>{parsedError.message}</StructuredNodeOutputError>

      {parsedError.location && (
        <StructuredNodeOutputSection label="Error location">
          <div>
            line {parsedError.location.line}
            {parsedError.location.column != null ? `, column ${parsedError.location.column}` : ''}
          </div>
        </StructuredNodeOutputSection>
      )}
    </div>
  );
};
