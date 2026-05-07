import { css } from '@emotion/react';
import { Fragment, useEffect, useMemo, useRef, useState, type FC, type MouseEvent as ReactMouseEvent } from 'react';
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
import { popupMenuListStyles, popupMenuRowStyles, popupMenuSeparatorStyles } from './PopupMenu.js';
import { useRivetAppHostUiConfig } from '../providers/HostUiConfigContext.js';
import { getVisibleFileMenuGroups } from '../utils/fileMenuConfiguration.js';
import { overlayOpenState } from '../state/ui.js';

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
    ${popupMenuListStyles};
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 300;
  }

  .file-dropdown.open {
    display: flex;
  }

  .file-dropdown button {
    ${popupMenuRowStyles};
    width: 100%;
    justify-content: flex-start;
    white-space: nowrap;
    text-align: left;
  }

  .file-dropdown-separator {
    ${popupMenuSeparatorStyles};
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
  const [openOverlay, setOpenOverlay] = useAtom(overlayOpenState);
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
  const projectTabsSelected = projectMode && openOverlay === undefined;

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
      setOpenOverlay(undefined);
      return;
    }

    const projectInfo = openedProjects[projectId];
    if (projectInfo) {
      void loadProject(projectInfo).then((loaded) => {
        if (loaded) {
          setOpenOverlay(undefined);
        }
      });
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
                    projectTabsSelected={projectTabsSelected}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      </div>
      <OverlayTabs showGraphSearch={projectMode} showWelcomeScreen={!projectMode} />
    </div>
  );
};

const ProjectFileMenu: FC = () => {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const runMenuCommandImpl = useRunMenuCommand();
  const hostUiConfig = useRivetAppHostUiConfig();
  const visibleFileMenuGroups = getVisibleFileMenuGroups(hostUiConfig.fileMenu);

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

  if (visibleFileMenuGroups.length === 0) {
    return null;
  }

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
        {visibleFileMenuGroups.map((group, groupIndex) => (
          <Fragment key={group.map((item) => item.id).join(':')}>
            {groupIndex > 0 && <div className="file-dropdown-separator" role="separator" />}
            {group.map((item) => (
              <button key={item.id} type="button" role="menuitem" onClick={() => runMenuCommand(item.id)}>
                {item.label}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

export const SortableProject: FC<{
  projectId: ProjectId;
  projectTabsSelected: boolean;
  onCloseProject?: () => void;
  onSelectProject?: () => void;
}> = ({ projectId, onCloseProject, onSelectProject, projectTabsSelected }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
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
        onCloseProject={onCloseProject}
        onSelectProject={onSelectProject}
        projectTabsSelected={projectTabsSelected}
      />
    </div>
  );
};

export const ProjectTab: FC<{
  projectId: ProjectId;
  projectTabsSelected: boolean;
  dragListeners?: SyntheticListenerMap;
  onCloseProject?: () => void;
  onSelectProject?: () => void;
}> = ({ projectId, dragListeners, onCloseProject, onSelectProject, projectTabsSelected }) => {
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
      className={clsx('project', { active: projectTabsSelected && currentProject.metadata.id === projectId, unsaved })}
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
