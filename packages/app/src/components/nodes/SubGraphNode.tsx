import { type FC } from 'react';
import { useAtomValue } from 'jotai';
import { projectState } from '../../state/savedGraphs.js';
import { type PortId, type SubGraphNode, coerceTypeOptional } from '@rivet2/rivet-core';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { RenderDataOutputs, type OutputRenderMode } from '../RenderDataValue.js';
import { omit } from 'lodash-es';
import { type InputsOrOutputsWithRefs } from '../../state/dataFlow';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import { tryRestoreStoredDataValue } from '../../utils/executionDataTransforms.js';
import { getSubGraphNodeCopyValueData } from '../../utils/nodeOutputCopyValueProjectors.js';

export const SubGraphNodeBody: FC<{
  node: SubGraphNode;
}> = ({ node }) => {
  const project = useAtomValue(projectState);
  const selectedGraph = project.graphs[node.data.graphId];
  const selectedGraphName = selectedGraph?.metadata?.name ?? node.data.graphId;

  return (
    <div>
      <div>{selectedGraphName}</div>
    </div>
  );
};

export const SubGraphNodeOutputSimple: FC<{
  outputs: InputsOrOutputsWithRefs;
  renderMarkdown?: boolean;
  isCompact: boolean;
  renderMode?: OutputRenderMode;
  allowLargeStoredValueActions?: boolean;
}> = ({ outputs, renderMarkdown, isCompact, renderMode, allowLargeStoredValueActions }) => {
  const dataRefs = useDataRefs();
  const cost = coerceTypeOptional(tryRestoreStoredDataValue(outputs['cost' as PortId], dataRefs), 'number');
  const duration = coerceTypeOptional(tryRestoreStoredDataValue(outputs['duration' as PortId], dataRefs), 'number');

  return (
    <div>
      <div className="metaInfo">
        {(cost ?? 0) > 0 && (
          <div>
            <em>${cost!.toFixed(3)}</em>
          </div>
        )}
        {(duration ?? 0) > 0 && (
          <div>
            <em>Duration: {duration}ms</em>
          </div>
        )}
      </div>
      <div>
        <RenderDataOutputs
          outputs={omit(outputs, ['cost', 'duration'])! as InputsOrOutputsWithRefs}
          renderMarkdown={renderMarkdown}
          isCompact={isCompact}
          mode={renderMode}
          allowLargeStoredValueActions={allowLargeStoredValueActions}
        />
      </div>
    </div>
  );
};

export const FullscreenSubGraphNodeOutputSimple: FC<{
  outputs: InputsOrOutputsWithRefs;
  renderMarkdown: boolean;
  renderMode?: OutputRenderMode;
  allowLargeStoredValueActions?: boolean;
}> = ({ outputs, renderMarkdown, renderMode, allowLargeStoredValueActions }) => {
  return (
    <SubGraphNodeOutputSimple
      outputs={outputs}
      renderMarkdown={renderMarkdown}
      isCompact={false}
      renderMode={renderMode}
      allowLargeStoredValueActions={allowLargeStoredValueActions}
    />
  );
};

export const subgraphNodeDescriptor: NodeComponentDescriptor<'subGraph'> = {
  Body: SubGraphNodeBody,
  OutputSimple: SubGraphNodeOutputSimple,
  FullscreenOutputSimple: FullscreenSubGraphNodeOutputSimple,
  getCopyValueData: getSubGraphNodeCopyValueData,
};
