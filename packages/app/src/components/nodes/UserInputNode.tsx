import { type FC } from 'react';
import { css } from '@emotion/react';
import { type PortId, getScalarTypeOf } from '@ironclad/rivet-core';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { type InputsOrOutputsWithRefs } from '../../state/dataFlow';
import { RenderDataValue, type OutputRenderMode } from '../RenderDataValue.js';

const questionsAndAnswersStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  pre {
    white-space: pre-wrap;
  }
`;

export const UserInputNodeOutput: FC<{ outputs: InputsOrOutputsWithRefs; isCompact: boolean; renderMode?: OutputRenderMode }> = ({
  outputs,
  isCompact,
  renderMode,
}) => {
  const questionsAndAnswers = outputs['questionsAndAnswers' as PortId];

  if (!questionsAndAnswers || getScalarTypeOf(questionsAndAnswers.type) === 'control-flow-excluded') {
    return null;
  }

  return (
    <div css={questionsAndAnswersStyles}>
      <RenderDataValue value={questionsAndAnswers} isCompact={isCompact} mode={renderMode} />
    </div>
  );
};

export const userInputNodeDescriptor: NodeComponentDescriptor<'userInput'> = {
  OutputSimple: UserInputNodeOutput,
};
