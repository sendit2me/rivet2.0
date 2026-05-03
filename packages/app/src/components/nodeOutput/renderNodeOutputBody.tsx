import { type ComponentType, type ReactNode } from 'react';
import { RenderDataOutputs } from '../RenderDataValue.js';
import { type InputsOrOutputsWithRefs, type NodeRunDataWithRefs } from '../../state/dataFlow.js';
import { type ChartNode } from '@rivet2/rivet-core';
import { getSortedSplitOutputEntries } from './splitOutputEntries.js';
import type {
  FullscreenNodeOutputRendererProps,
  FullscreenNodeOutputSimpleRendererProps,
  NodeOutputRendererProps,
  NodeOutputRenderPolicyProps,
  NodeOutputSimpleRendererProps,
} from './nodeOutputRendererTypes.js';

type RenderNodeOutputBodyOptions = NodeOutputRenderPolicyProps & {
  Output?: ComponentType<NodeOutputRendererProps>;
  OutputSimple?: ComponentType<NodeOutputSimpleRendererProps>;
  FullscreenOutput?: ComponentType<FullscreenNodeOutputRendererProps>;
  FullscreenOutputSimple?: ComponentType<FullscreenNodeOutputSimpleRendererProps>;
  node: ChartNode;
  data: NodeRunDataWithRefs;
  definitions: any;
  isCompact: boolean;
  renderMarkdown?: boolean;
};

export function renderNodeOutputBody(options: RenderNodeOutputBodyOptions): ReactNode {
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
    allowLargeStoredValueActions,
  } = options;

  if (FullscreenOutput) {
    return (
      <FullscreenOutput
        node={node}
        data={data}
        renderMode={renderMode}
        allowLargeStoredValueActions={allowLargeStoredValueActions}
      />
    );
  }

  if (Output) {
    return (
      <Output
        node={node}
        data={data}
        isCompact={isCompact}
        renderMode={renderMode}
        allowLargeStoredValueActions={allowLargeStoredValueActions}
      />
    );
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
              allowLargeStoredValueActions={allowLargeStoredValueActions}
            />
          ) : OutputSimple ? (
            <OutputSimple
              key={`outputs-${key}`}
              outputs={value as InputsOrOutputsWithRefs}
              isCompact={isCompact}
              renderMode={renderMode}
              allowLargeStoredValueActions={allowLargeStoredValueActions}
            />
          ) : (
            <RenderDataOutputs
              key={`outputs-${key}`}
              definitions={definitions}
              outputs={value as InputsOrOutputsWithRefs}
              renderMarkdown={renderMarkdown}
              isCompact={isCompact}
              mode={renderMode}
              allowLargeStoredValueActions={allowLargeStoredValueActions}
            />
          ),
        )}
      </div>
    );
  }

  if (FullscreenOutputSimple) {
    return (
      <FullscreenOutputSimple
        outputs={data.outputData!}
        renderMarkdown={renderMarkdown ?? false}
        renderMode={renderMode}
        allowLargeStoredValueActions={allowLargeStoredValueActions}
      />
    );
  }

  if (OutputSimple) {
    return (
      <OutputSimple
        outputs={data.outputData!}
        isCompact={isCompact}
        renderMode={renderMode}
        allowLargeStoredValueActions={allowLargeStoredValueActions}
      />
    );
  }

  return (
    <RenderDataOutputs
      definitions={definitions}
      outputs={data.outputData!}
      renderMarkdown={renderMarkdown}
      isCompact={isCompact}
      mode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  );
}
