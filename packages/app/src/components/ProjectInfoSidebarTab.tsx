import { useMemo, type FC } from 'react';
import { InlineEditableTextfield } from '@atlaskit/inline-edit';
import { ProjectPluginsConfiguration } from './ProjectPluginConfiguration';
import { Field, Label } from '@atlaskit/form';
import Select from '@atlaskit/select';
import { projectState, savedGraphsState } from '../state/savedGraphs';
import { css } from '@emotion/react';
import { ProjectRevisions } from './ProjectRevisionList';
import { useAtom, useAtomValue } from 'jotai';
import { ProjectReferencesConfiguration } from './ProjectReferencesConfiguration';
import { ProjectMCPConfiguration } from './ProjectMCPConfiguration';
import { MainGraphIcon } from './graphList/MainGraphIcon';

const styles = css`
  .project-info-layout {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }

  .project-info-item {
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

  .project-plugins-section {
    margin-top: auto;
    margin-bottom: 0;
  }

  .project-info-divider {
    border-top: 1px solid var(--grey-darkish);
    margin: 0 0 16px;
  }

  .main-graph-field-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .main-graph-field-label svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .project-info-action {
    margin-top: 8px;
  }
`;

export const ProjectInfoSidebarTab: FC = () => {
  const [project, setProject] = useAtom(projectState);
  const savedGraphs = useAtomValue(savedGraphsState);

  const graphOptions = useMemo(
    () => [
      { label: '(None)', value: undefined },
      ...savedGraphs.map((g) => ({ label: g.metadata!.name, value: g.metadata!.id })),
    ],
    [savedGraphs],
  );

  const selectedMainGraph = graphOptions.find((g) => g.value === project.metadata.mainGraphId);

  return (
    <div css={styles} className="project-info-section">
      <div className="project-info-layout">
        <div className="project-info-item">
          <InlineEditableTextfield
            key={`name-${project.metadata.id}`}
            label="Project Name"
            placeholder="Project Name"
            readViewFitContainerWidth
            defaultValue={project.metadata.title}
            onConfirm={(newValue) => setProject({ ...project, metadata: { ...project.metadata, title: newValue } })}
          />
        </div>

        <div className="project-info-item">
          <InlineEditableTextfield
            key={`description-${project.metadata.id}`}
            label="Description"
            placeholder="Project Description"
            defaultValue={project.metadata?.description ?? ''}
            onConfirm={(newValue) =>
              setProject({ ...project, metadata: { ...project.metadata, description: newValue } })
            }
            readViewFitContainerWidth
          />
        </div>

        <div className="project-info-item">
          <Field name="mainGraph" label={<MainGraphFieldLabel />}>
            {() => (
              <Select
                options={graphOptions}
                value={selectedMainGraph}
                onChange={(newValue) => {
                  setProject({
                    ...project,
                    metadata: { ...project.metadata, mainGraphId: newValue?.value ?? undefined },
                  });
                }}
              />
            )}
          </Field>
        </div>

        <div className="project-info-divider" />

        <div className="project-info-item">
          <ProjectMCPConfiguration />
        </div>

        <div className="project-info-item">
          <ProjectReferencesConfiguration />
        </div>

        <div className="project-info-item">
          <Label htmlFor="">Revisions</Label>
          <ProjectRevisions />
        </div>

        <div className="project-info-item project-plugins-section">
          <ProjectPluginsConfiguration />
        </div>
      </div>
    </div>
  );
};

const MainGraphFieldLabel: FC = () => (
  <span className="main-graph-field-label">
    <MainGraphIcon />
    <span>Main Graph</span>
  </span>
);
