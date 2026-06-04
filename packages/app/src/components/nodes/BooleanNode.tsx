import { css } from '@emotion/react';
import type { BooleanNode } from '@valerypopoff/rivet2-core';
import type { ChangeEvent, FC, MouseEvent } from 'react';
import { useEditNodeCommand } from '../../commands/editNodeCommand.js';
import type { NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { ScalableToggle } from '../ScalableToggle.js';

const styles = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(7px * var(--ui-font-scale, 1));
  max-width: 100%;
  min-width: 0;
  color: var(--foreground-dim);
  font-family: var(--font-family);
  font-size: var(--ui-font-size-sm);
  line-height: 1.2;
  user-select: none;

  .boolean-node-body-value {
    color: var(--foreground-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }
`;

const BooleanNodeBody: FC<{ node: BooleanNode }> = ({ node }) => {
  const editNode = useEditNodeCommand();

  if (node.data.useValueInput) {
    return null;
  }

  const value = node.data.value ?? false;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    editNode({
      nodeId: node.id,
      newNode: {
        data: {
          ...node.data,
          value: event.target.checked,
        },
      },
    });
  };
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div css={styles} onDoubleClick={handleDoubleClick}>
      <ScalableToggle
        ariaLabel="Bool value"
        className="boolean-node-body-toggle"
        isChecked={value}
        onChange={handleChange}
      />
      <div className="boolean-node-body-value">{value ? 'True' : 'False'}</div>
    </div>
  );
};

export const booleanNodeDescriptor: NodeComponentDescriptor<'boolean'> = {
  Body: BooleanNodeBody,
};
