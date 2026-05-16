import { useState, type FC } from 'react';
import { useAtomValue } from 'jotai';
import { loadedProjectState } from '../state/savedGraphs';
import { useGraphRevisions } from '../hooks/useGraphRevisions';
import { css } from '@emotion/react';
import Button from '@atlaskit/button';
import { type CalculatedRevision } from '../utils/ProjectRevisionCalculator';
import { graphState } from '../state/graph';
import type { GraphId } from '@valerypopoff/rivet2-core';
import { useChooseHistoricalGraph } from '../hooks/useChooseHistoricalGraph';

export const revisionStyles = css`
  .revisions {
    display: flex;
    flex-direction: column;
    margin-right: -12px;
    margin-left: -12px;
  }

  .revision {
    border-bottom: 1px solid var(--grey);
    padding: 8px;
    padding-left: 12px;

    cursor: pointer;

    &:hover {
      background-color: var(--grey-darkish);
    }
  }

  .revision-unavailable {
    cursor: default;

    &:hover {
      background-color: transparent;
    }
  }

  .hash {
    border-radius: 16px;
    corner-shape: squircle;
    @supports not (corner-shape: squircle) {
      border-radius: 8px;
    }
    background-color: black;
    display: inline-flex;
    padding: 2px 4px;
    font-size: var(--ui-font-size-xs);
  }

  .message {
    font-size: var(--ui-font-size-sm);
  }

  .loading-area {
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .loaded-area {
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
`;

export const GraphRevisions: FC<{ graphId?: GraphId }> = ({ graphId }) => {
  const projectState = useAtomValue(loadedProjectState);
  const [enabled, setEnabled] = useState(false);

  if (!projectState.loaded || !projectState.path) {
    return <div>No git history</div>;
  }

  if (!enabled) {
    return (
      <div css={revisionStyles}>
        <Button onClick={() => setEnabled(true)}>Show Revisions</Button>
      </div>
    );
  }

  return (
    <div css={revisionStyles}>
      <GraphRevisionList graphId={graphId} />
    </div>
  );
};

export const GraphRevisionList: FC<{ graphId?: GraphId }> = ({ graphId }) => {
  const { revisions, isLoading, stop, resume, numTotalRevisions, numProcessedRevisions } = useGraphRevisions({ graphId });

  return (
    <div css={revisionStyles}>
      <div className="revisions">
        {revisions.map((revision) => (
          <GraphRevisionListEntry key={revision.hash} graphId={graphId} revision={revision} />
        ))}
        {isLoading ? (
          <div className="loading-area">
            <div>
              Loading... ({numProcessedRevisions} / {numTotalRevisions})
            </div>
            <Button onClick={() => stop()}>Stop Loading</Button>
          </div>
        ) : (
          <div className="loaded-area">
            <span>Searched {numProcessedRevisions} revisions for changes to graph.</span>
            {(numProcessedRevisions < numTotalRevisions || numTotalRevisions === 0) && (
              <Button onClick={() => resume()}>Load More</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const GraphRevisionListEntry: FC<{
  graphId?: GraphId;
  revision: CalculatedRevision;
}> = ({ graphId, revision }) => {
  const currentGraphId = useAtomValue(graphState).metadata?.id;
  const chooseGraph = useChooseHistoricalGraph(revision);
  const revisionGraphId = graphId ?? currentGraphId;

  if (revisionGraphId == null) {
    return null;
  }

  const graphAtRevision = revision.projectAtRevision?.graphs[revisionGraphId];

  if (graphAtRevision == null) {
    return (
      <div className="revision revision-unavailable">
        <div className="hash">
          <span>{revision.hash.slice(0, 6)}</span>
        </div>
        <div className="message">{revision.message}</div>
        <div className="message">Graph is not present in this revision.</div>
      </div>
    );
  }

  return (
    <div className="revision" onClick={() => chooseGraph(revisionGraphId)}>
      <div className="hash">
        <span>{revision.hash.slice(0, 6)}</span>
      </div>
      <div className="message">{revision.message}</div>
    </div>
  );
};
