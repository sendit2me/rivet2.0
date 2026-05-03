import { css } from '@emotion/react';
import { getHttpCallBodyPreviewSections, type HttpCallNode } from '@valerypopoff/rivet2-core';
import { type FC } from 'react';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';

const httpCallNodeBodyStyles = css`
  display: flex;
  flex-direction: column;
  gap: var(--http-call-node-body-section-gap, 6px);
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  white-space: pre-wrap;

  .http-call-node-body-section {
    max-width: 100%;
    min-width: 0;
    overflow: hidden;
    text-overflow: clip;
  }
`;

const HttpCallNodeBody: FC<{ node: HttpCallNode }> = ({ node }) => (
  <div className="http-call-node-body" css={httpCallNodeBodyStyles}>
    {getHttpCallBodyPreviewSections(node.data).map((section, index) => (
      <div key={index} className="http-call-node-body-section">
        {section}
      </div>
    ))}
  </div>
);

export const httpCallNodeDescriptor: NodeComponentDescriptor<'httpCall'> = {
  Body: HttpCallNodeBody,
};
