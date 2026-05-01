import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import type { GraphId, Project, ProjectId } from '@ironclad/rivet-core';

export type RivetAppHostProjectSavedEvent = {
  project: Omit<Project, 'data'>;
  path: string | null;
  saveAs: boolean;
};

export type RivetAppHostActiveProjectChangedEvent = {
  project: Omit<Project, 'data'> | null;
  projectId: ProjectId | null;
  path: string | null;
};

export type RivetAppHostOpenProjectCountChangedEvent = {
  count: number;
  projectIds: ProjectId[];
};

export type RivetAppHostOpenErrorEvent = {
  error: unknown;
  operation: 'loadProject' | 'openProjectSnapshot' | 'openProjectPath';
  path?: string | null;
  projectId?: ProjectId;
  openedGraph?: GraphId;
};

export type RivetAppHostCallbacks = {
  onProjectSaved?: (event: RivetAppHostProjectSavedEvent) => void;
  onActiveProjectChanged?: (event: RivetAppHostActiveProjectChangedEvent) => void;
  onOpenProjectCountChanged?: (event: RivetAppHostOpenProjectCountChangedEvent) => void;
  onOpenError?: (event: RivetAppHostOpenErrorEvent) => void;
};

const HostCallbacksContext = createContext<RivetAppHostCallbacks>({});

export const HostCallbacksProvider: FC<{ callbacks?: RivetAppHostCallbacks; children: ReactNode }> = ({
  callbacks,
  children,
}) => {
  const value = useMemo(() => callbacks ?? {}, [callbacks]);
  return <HostCallbacksContext.Provider value={value}>{children}</HostCallbacksContext.Provider>;
};

export function useRivetAppHostCallbacks(): RivetAppHostCallbacks {
  return useContext(HostCallbacksContext);
}
