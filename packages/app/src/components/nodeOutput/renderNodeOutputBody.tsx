import { type ComponentType, type ReactNode } from 'react';
import { orderBy } from 'lodash-es';
import { entries } from '../../../../core/src/utils/typeSafety.js';
import { RenderDataOutputs } from '../RenderDataValue.js';
import { type InputsOrOutputsWithRefs, type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { type ChartNode } from '@ironclad/rivet-core';

export function renderNodeOutputBody(options: {
  Output?: ComponentType<{ node: ChartNode; isCompact: boolean }>;
  OutputSimple?: ComponentType<{ outputs: InputsOrOutputsWithRefs; isCompact: boolean }>;
  FullscreenOutput?: ComponentType<{ node: ChartNode }>;
  FullscreenOutputSimple?: ComponentType<{ outputs: InputsOrOutputsWithRefs; renderMarkdown: boolean }>;
  node: ChartNode;
  data: NodeRunDataWithRefs;
  definitions: any;
  isCompact: boolean;
  renderMarkdown?: boolean;
}): ReactNode {
  const {
    Output,
    OutputSimple,
    FullscreenOutput,
    FullscreenOutputSimple,
    node,
    data,
    definitions,
    isCompact,
    renderMarkdown,
  } = options;

  if (FullscreenOutput) {
    return <FullscreenOutput node={node} />;
  }

  if (Output) {
    return <Output node={node} isCompact={isCompact} />;
  }

  if (data.splitOutputData) {
    const outputs = orderBy(
      entries(data.splitOutputData).map(([key, value]) => ({ key, value })),
      (entry) => entry.key,
    );

    return (
      <div className="split-output">
        {outputs.map(({ key, value }) =>
          FullscreenOutputSimple ? (
            <FullscreenOutputSimple
              key={`outputs-${key}`}
              outputs={value as InputsOrOutputsWithRefs}
              renderMarkdown={renderMarkdown ?? false}
            />
          ) : OutputSimple ? (
            <OutputSimple key={`outputs-${key}`} outputs={value as InputsOrOutputsWithRefs} isCompact={isCompact} />
          ) : (
            <RenderDataOutputs
              key={`outputs-${key}`}
              definitions={definitions}
              outputs={value as InputsOrOutputsWithRefs}
              renderMarkdown={renderMarkdown}
              isCompact={isCompact}
            />
          ),
        )}
      </div>
    );
  }

  if (FullscreenOutputSimple) {
    return <FullscreenOutputSimple outputs={data.outputData!} renderMarkdown={renderMarkdown ?? false} />;
  }

  if (OutputSimple) {
    return <OutputSimple outputs={data.outputData!} isCompact={isCompact} />;
  }

  return <RenderDataOutputs definitions={definitions} outputs={data.outputData!} renderMarkdown={renderMarkdown} isCompact={isCompact} />;
}
