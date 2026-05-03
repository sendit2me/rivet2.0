import { css } from '@emotion/react';
import { useEffect, useMemo, useRef, useState, type FC, type MouseEvent as ReactMouseEvent } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { type ProjectId } from '@valerypopoff/rivet2-core';
import { useAtom, useAtomValue } from 'jotai';
import CloseIcon from 'majesticons/line/multiply-line.svg?react';
import { openedProjectsSortedIdsState, openedProjectsState, projectState } from '../state/savedGraphs';
import clsx from 'clsx';
import { useLoadProject } from '../hooks/useLoadProject';
import { useSyncCurrentStateIntoOpenedProjects } from '../hooks/useSyncCurrentStateIntoOpenedProjects';
import { type SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { isInTauri } from '../utils/tauri.js';
import { useRunMenuCommand } from '../hooks/useMenuCommands.js';
import { useRivetWorkspaceHost } from '../hooks/useRivetWorkspaceHost.js';
import { OverlayTabs } from './OverlayTabs.js';

export const styles = css`
  position: absolute;

  left: 0;
  top: 0;
  right: 0;
  height: var(--project-selector-height);
  z-index: 250;

  background: var(--grey-darkerish);
  border-bottom: 1px solid var(--grey);

  display: flex;
  align-items: stretch;

  .file-menu {
    position: relative;
    flex-shrink: 0;
    height: calc(100% + 1px);
    margin-bottom: -1px;
  }

  .file-menu-button {
    align-items: center;
    background: var(--grey-darkerish);
    border: 0;
    border-bottom: 1px solid var(--grey);
    border-right: 1px solid var(--grey-darkest);
    color: var(--grey-lightest);
    cursor: pointer;
    display: flex;
    height: 100%;
    justify-content: center;
    margin: 0;
    min-width: 50px;
    padding: 0 16px;
    font-size: var(--ui-font-size-sm);
    user-select: none;

    &:hover,
    .file-menu.open & {
      background-color: var(--grey-darkish);
      border-bottom-color: var(--grey);
    }
  }

  .file-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    background-color: var(--grey-darkest);
    border: 2px solid var(--grey-darkish);
    border-radius: var(--ui-button-radius-sm);
    corner-shape: squircle;
    box-shadow: 0 8px 16px var(--shadow-dark);
    font-family: 'Roboto Mono', monospace;
    color: var(--foreground);
    font-size: var(--ui-font-size-compact);
    padding: 8px;
    z-index: 300;
    min-width: 150px;
  }

  .file-dropdown.open {
    display: block;
  }

  .file-dropdown button {
    display: block;
    width: 100%;
    background: transparent;
    border: 0;
    border-radius: var(--ui-button-radius-sm);
    corner-shape: squircle;
    color: inherit;
    cursor: pointer;
    padding: 4px 8px;
    justify-content: flex-start;
    white-space: nowrap;
    text-align: left;
    font-size: var(--ui-font-size-base);
    transition:
      background-color 0.1s ease-out,
      color 0.1s ease-out;

    &:hover {
      background-color: var(--tertiary-light);
      color: var(--primary-text);
    }
  }

  .file-dropdown-separator {
    height: 1px;
    margin: 6px 4px;
    background: var(--grey-darkish);
  }

  .projects-container {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .projects-container.empty {
    flex: 0 0 auto;
  }

  .projects {
    display: flex;
    align-items: stretch;
    height: 100%;
    gap: 1px;
    padding-right: 1px;
    width: 100%;
  }

  .draggableProject {
    display: flex;
    min-width: 50px;
    flex-shrink: 1;
  }

  .project {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px 0 12px;
    cursor: pointer;
    user-select: none;
    display: flex;
    gap: 8px;
    font-size: var(--ui-font-size-sm);
    height: calc(100% + 1px);
    margin-bottom: -1px;
    background: var(--grey-darkerish);
    border-bottom: 1px solid var(--grey);
    flex-shrink: 1;
    min-width: 50px;
    position: relative;

    svg {
      width: 12px;
      height: 12px;
    }

    .project-name {
      display: flex;
      align-items: center;
      align-self: stretch;
      overflow: hidden;
      gap: 8px;
      min-width: 50px;
      flex-shrink: 1;
      white-space: nowrap;
      text-overflow: ellipsis;

      > span {
        min-width: 50px;
        flex-shrink: 1;
      }
    }

    &:hover {
      background-color: var(--grey-darkish);
      border-bottom: 1px solid var(--grey);
    }

    &.active {
      background-color: var(--primary);
      border-bottom: 1px solid var(--primary);
      color: var(--foreground-on-primary);
    }

    &.active:hover {
      background-color: var(--primary-dark);
      border-bottom-color: var(--primary-dark);
    }

    &.active .close-project {
      color: rgba(255, 255, 255, 0.88);
    }

    &.active .close-project:hover {
      color: var(--foreground-on-primary);
      background-color: rgba(0, 0, 0, 0.16);
    }

    &.unsaved {
      font-style: italic;
    }

    > .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      visibility: hidden;
    }

    &:hover .actions {
      visibility: visible;
    }

    .close-project {
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--grey-light);
      width: 20px;
      height: 20px;
      border-radius: var(--ui-button-radius-sm);
      corner-shape: squircle;

      svg {
        width: 12px;
        height: 12px;
      }

      &:hover {
        color: var(--grey-lightest);
        background-color: var(--grey);
      }
    }
  }

  .project::after {
    content: '';
    display: block;
    position: absolute;
    right: -1px;
    width: 1px;
    background-color: var(--grey-darkest);
    height: 100%;
  }
`;

export const ProjectSelector: FC<{
  mode?: 'project' | 'workspace';
}> = ({ mode = 'project' }) => {
  const projectMode = mode === 'project';
  const openedProjects = useAtomValue(openedProjectsState);
  const [openedProjectsSortedIds, setOpenedProjectsSortedIds] = useAtom(openedProjectsSortedIdsState);
  const currentProject = useAtomValue(projectState);
  const { closeProject } = useRivetWorkspaceHost();

  const sortedOpenedProjects = useMemo(() => {
    return openedProjectsSortedIds
      .map((projectId) => ({
        id: projectId,
        project: openedProjects[projectId]!,
      }))
      .filter((item) => item.project != null);
  }, [openedProjectsSortedIds, openedProjects]);
  const visibleProjects = projectMode ? sortedOpenedProjects : [];

  const loadProject = useLoadProject();

  useSyncCurrentStateIntoOpenedProjects({ enabled: projectMode });

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      setOpenedProjectsSortedIds((prev) => {
        const oldIndex = prev.indexOf(active?.id as ProjectId);
        const newIndex = prev.indexOf(over?.id as ProjectId);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleSelectProject = (projectId: ProjectId) => {
    if (projectId === currentProject.metadata.id) {
      return;
    }

    const projectInfo = openedProjects[projectId];
    if (projectInfo) {
      loadProject(projectInfo);
    }
  };

  return (
    <div css={styles}>
      {!isInTauri() && <ProjectFileMenu />}
      <div className={clsx('projects-container', { empty: visibleProjects.length === 0 })}>
        <div className="projects">
          <DndContext onDragEnd={handleDragEnd}>
            <SortableContext items={visibleProjects} strategy={horizontalListSortingStrategy}>
              {visibleProjects.map((project) => {
                return (
                  <SortableProject
                    key={project.id}
                    projectId={project.project.projectId}
                    onCloseProject={() => void closeProject(project.project.projectId)}
                    onSelectProject={() => handleSelectProject(project.project.projectId)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      </div>
      <OverlayTabs showGraphSearch={projectMode} />
    </div>
  );
};

const ProjectFileMenu: FC = () => {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const runMenuCommandImpl = useRunMenuCommand();

  const runMenuCommand: typeof runMenuCommandImpl = (command) => {
    setFileMenuOpen(false);
    runMenuCommandImpl(command);
  };

  useEffect(() => {
    if (!fileMenuOpen) {
      return;
    }

    const handleWindowMouseDown = (event: MouseEvent) => {
      if (fileMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setFileMenuOpen(false);
    };

    window.addEventListener('mousedown', handleWindowMouseDown);

    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
    };
  }, [fileMenuOpen]);

  return (
    <div ref={fileMenuRef} className={clsx('file-menu', { open: fileMenuOpen })}>
      <button
        type="button"
        className="file-menu-button"
        aria-expanded={fileMenuOpen}
        aria-haspopup="menu"
        onClick={() => setFileMenuOpen((open) => !open)}
      >
        File
      </button>
      <div className={clsx('file-dropdown', { open: fileMenuOpen })} role="menu">
        <button type="button" role="menuitem" onClick={() => runMenuCommand('new_project')}>
          New project
        </button>
        <button type="button" role="menuitem" onClick={() => runMenuCommand('open_project')}>
          Open project
        </button>
        <div className="file-dropdown-separator" role="separator" />
        <button type="button" role="menuitem" onClick={() => runMenuCommand('save_project')}>
          Save project
        </button>
        <button type="button" role="menuitem" onClick={() => runMenuCommand('save_project_as')}>
          Save project as...
        </button>
        <div className="file-dropdown-separator" role="separator" />
        <button type="button" role="menuitem" onClick={() => runMenuCommand('import_graph')}>
          Import graph
        </button>
        <button type="button" role="menuitem" onClick={() => runMenuCommand('export_graph')}>
          Export graph
        </button>
        <div className="file-dropdown-separator" role="separator" />
        <button type="button" role="menuitem" onClick={() => runMenuCommand('settings')}>
          Settings
        </button>
      </div>
    </div>
  );
};

export const SortableProject: FC<{
  projectId: ProjectId;
  onCloseProject?: () => void;
  onSelectProject?: () => void;
}> = ({ projectId, onCloseProject, onSelectProject }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging, transition } = useSortable({
    id: projectId,
  });

  const constrainedTransformX = transform?.x ?? 0;

  return (
    <div
      className="draggableProject"
      ref={setNodeRef}
      style={{
        transform: `translate3d(${constrainedTransformX}px, 0px, 0)`,
        transition,
      }}
      {...attributes}
    >
      <ProjectTab
        projectId={projectId}
        dragListeners={listeners}
        isDragging={isDragging}
        onCloseProject={onCloseProject}
        onSelectProject={onSelectProject}
      />
    </div>
  );
};

export const ProjectTab: FC<{
  projectId: ProjectId;
  isDragging: boolean;
  dragListeners?: SyntheticListenerMap;
  onCloseProject?: () => void;
  onSelectProject?: () => void;
}> = ({ projectId, dragListeners, onCloseProject, onSelectProject }) => {
  const openedProjects = useAtomValue(openedProjectsState);
  const currentProject = useAtomValue(projectState);

  const project = openedProjects[projectId];

  const unsaved = !project?.fsPath;
  const fileName = unsaved ? 'Unsaved' : project.fsPath!.split('/').pop();
  const projectDisplayName = `${project?.title}${fileName ? ` [${fileName}]` : ''}`;

  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      onSelectProject?.();
    }
  };

  const closeProject = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onCloseProject?.();
  };

  return (
    <div
      className={clsx('project', { active: currentProject.metadata.id === projectId, unsaved })}
      onMouseDown={handleMouseDown}
    >
      <div className="project-name" {...dragListeners}>
        <span>{projectDisplayName}</span>
      </div>
      <div className="actions">
        <button className="close-project" onMouseDown={(e) => e.stopPropagation()} onClick={closeProject}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
};
