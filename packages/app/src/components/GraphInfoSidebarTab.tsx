import { type FC } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { graphState } from '../state/graph.js';
import { savedGraphsState } from '../state/savedGraphs.js';
import { InlineEditableTextfield } from '@atlaskit/inline-edit';
import { type NodeGraph } from '@valerypopoff/rivet2-core';
import { Label } from '@atlaskit/form';
import { GraphRevisions } from './GraphRevisionList';
import { css } from '@emotion/react';

const styles = css`
  .graph-info-layout {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .graph-info-item {
    min-width: 0;
    margin: 0 0 16px;

    > * {
      margin-top: 0 !important;
    }

    > form {
      margin: 0;
    }

    > form > div {
      margin-top: 0 !important;
    }
  }
`;

export const GraphInfoSidebarTab: FC = () => {
  const [graph, setGraph] = useAtom(graphState);
  const setSavedGraphs = useSetAtom(savedGraphsState);

  function setGraphAndSavedGraph(graph: NodeGraph) {
    setGraph(graph);
    setSavedGraphs((prev) => prev.map((g) => (g.metadata!.id === graph.metadata!.id ? graph : g)));
  }

  return (
    <div css={styles} className="graph-info-section">
      <div className="graph-info-layout">
        <div className="graph-info-item">
          <InlineEditableTextfield
            key={`graph-name-${graph.metadata?.id}`}
            label="Graph Name"
            placeholder="Graph Name"
            onConfirm={(newValue) =>
              setGraphAndSavedGraph({ ...graph, metadata: { ...graph.metadata, name: newValue } })
            }
            defaultValue={graph.metadata?.name ?? 'Untitled Graph'}
            readViewFitContainerWidth
          />
        </div>
        <div className="graph-info-item">
          <InlineEditableTextfield
            key={`graph-description-${graph.metadata?.id}`}
            label="Description"
            placeholder="Graph Description"
            defaultValue={graph.metadata?.description ?? ''}
            onConfirm={(newValue) =>
              setGraphAndSavedGraph({ ...graph, metadata: { ...graph.metadata, description: newValue } })
            }
            readViewFitContainerWidth
          />
        </div>
        <div className="graph-info-item">
          <Label htmlFor="">Revisions</Label>
          <GraphRevisions />
        </div>
      </div>
    </div>
  );
};
