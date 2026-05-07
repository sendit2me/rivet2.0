import { type FC, useMemo } from 'react';
import styled from '@emotion/styled';
import { type ObjectNode } from '@valerypopoff/rivet2-core';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes';
import ColorizedPreformattedText from '../ColorizedPreformattedText';

export type ObjectNodeBodyProps = {
  node: ObjectNode;
};

const Body = styled.div`
  font-size: var(--ui-font-size-sm);

  pre {
    max-width: 100%;
    overflow: hidden;
    text-overflow: clip;
    white-space: pre;
  }
`;

export const ObjectNodeBody: FC<ObjectNodeBodyProps> = ({ node }) => {
  const truncated = useMemo(
    () =>
      node.data.jsonTemplate
        .split('\n')
        .slice(0, 15)
        .map((line) => (line.length > 1000 ? line.slice(0, 1000) + '...' : line))
        .join('\n')
        .trim(),
    [node.data.jsonTemplate],
  );

  return (
    <Body>
      <ColorizedPreformattedText text={truncated} language="json" />
    </Body>
  );
};

export const ObjectNodeDescriptor: NodeComponentDescriptor<'object'> = {
  Body: ObjectNodeBody,
};
