import { type ComponentType, type ReactNode } from 'react';
import { RenderDataOutputs, type OutputRenderMode } from '../RenderDataValue.js';
import { type InputsOrOutputsWithRefs, type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { type ChartNode } from '@ironclad/rivet-core';
import { getSortedSplitOutputEntries } from './splitOutputEntries.js';

export function renderNodeOutputBody(options: {
  Output?: ComponentType<{ node: ChartNode; data: NodeRunDataWithRefs; isCompact: boolean }>;
  OutputSimple?: ComponentType<{ outputs: InputsOrOutputsWithRefs; isCompact: boolean; renderMode?: OutputRenderMode }>;
  FullscreenOutput?: ComponentType<{ node: ChartNode; data: NodeRunDataWithRefs }>;
  FullscreenOutputSimple?: ComponentType<{ outputs: InputsOrOutputsWithRefs; renderMarkdown: boolean; renderMode?: OutputRenderMode }>;
  node: ChartNode;
  data: NodeRunDataWithRefs;
  definitions: any;
  isCompact: boolean;
  renderMarkdown?: boolean;
  renderMode?: OutputRenderMode;
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
    renderMode,
  } = options;

  if (FullscreenOutput) {
    return <FullscreenOutput node={node} data={data} />;
  }

  if (Output) {
    return <Output node={node} data={data} isCompact={isCompact} />;
  }

  if (data.splitOutputData) {
    const outputs = getSortedSplitOutputEntries(data.splitOutputData);

    return (
      <div className="split-output">
        {outputs.map(([key, value]) =>
          FullscreenOutputSimple ? (
            <FullscreenOutputSimple
              key={`outputs-${key}`}
              outputs={value as InputsOrOutputsWithRefs}
              renderMarkdown={renderMarkdown ?? false}
              renderMode={renderMode}
            />
          ) : OutputSimple ? (
            <OutputSimple key={`outputs-${key}`} outputs={value as InputsOrOutputsWithRefs} isCompact={isCompact} renderMode={renderMode} />
          ) : (
            <RenderDataOutputs
              key={`outputs-${key}`}
              definitions={definitions}
              outputs={value as InputsOrOutputsWithRefs}
              renderMarkdown={renderMarkdown}
              isCompact={isCompact}
              mode={renderMode}
            />
          ),
        )}
      </div>
    );
  }

  if (FullscreenOutputSimple) {
    return <FullscreenOutputSimple outputs={data.outputData!} renderMarkdown={renderMarkdown ?? false} renderMode={renderMode} />;
  }

  if (OutputSimple) {
    return <OutputSimple outputs={data.outputData!} isCompact={isCompact} renderMode={renderMode} />;
  }

  return <RenderDataOutputs definitions={definitions} outputs={data.outputData!} renderMarkdown={renderMarkdown} isCompact={isCompact} mode={renderMode} />;
}
