import { css } from '@emotion/react';
import { type FC } from 'react';
import { type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { parseCodeNodeError } from './codeNodeOutputUtils.js';

const codeNodeErrorOutputCss = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  .code-node-error-message {
    color: var(--error-light);
  }
`;

export const CodeNodeErrorOutput: FC<{
  data: NodeRunDataWithRefs;
}> = ({ data }) => {
  const errorMessage = data.status?.type === 'error' ? data.status.error : '';
  const parsedError = parseCodeNodeError(errorMessage);

  return (
    <div css={codeNodeErrorOutputCss}>
      <div className="code-node-error-message">{parsedError.message}</div>

      {parsedError.location && (
        <div>
          <div>
            <em className="port-id-label">Error location</em>
          </div>
          <div>
            line {parsedError.location.line}
            {parsedError.location.column != null ? `, column ${parsedError.location.column}` : ''}
          </div>
        </div>
      )}
    </div>
  );
};
