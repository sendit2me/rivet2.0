import type { DataId, Project, Settings } from '@valerypopoff/rivet2-core';
import stableStringify from 'safe-stable-stringify';

export type RemoteExecutorUploadCache = {
  sessionKey?: string;
  uploadKey?: string;
};

export type RemoteExecutorUploadResult = 'cached' | 'uploaded';

export type RemoteExecutorUploadTransport = {
  sendDynamicData: (payload: { project: Project; settings: Settings }) => boolean;
  sendStaticData: (id: DataId, value: string) => boolean;
};

export function resetRemoteExecutorUploadCache(cache: RemoteExecutorUploadCache): void {
  cache.sessionKey = undefined;
  cache.uploadKey = undefined;
}

export function uploadRemoteExecutorProjectIfNeeded(options: {
  cache: RemoteExecutorUploadCache;
  project: Project;
  projectData?: Record<DataId, string>;
  sessionKey: string;
  settings: Settings;
  transport: RemoteExecutorUploadTransport;
}): RemoteExecutorUploadResult {
  const { cache, project, projectData, sessionKey, settings, transport } = options;
  const uploadKey = createRemoteExecutorUploadKey(project, settings, projectData);

  if (cache.sessionKey === sessionKey && cache.uploadKey === uploadKey) {
    return 'cached';
  }

  const projectUploadSent = transport.sendDynamicData({ project, settings });
  if (!projectUploadSent) {
    throw new Error('Remote executor disconnected before the project upload could be sent.');
  }

  for (const [id, dataValue] of getStaticProjectDataEntries(projectData)) {
    const staticDataSent = transport.sendStaticData(id, dataValue);
    if (!staticDataSent) {
      throw new Error('Remote executor disconnected before static project data could be sent.');
    }
  }

  cache.sessionKey = sessionKey;
  cache.uploadKey = uploadKey;
  return 'uploaded';
}

function createRemoteExecutorUploadKey(
  project: Project,
  settings: Settings,
  projectData: Record<DataId, string> | undefined,
): string {
  const key = stableStringify({
    project,
    projectData: Object.fromEntries(getStaticProjectDataEntries(projectData)),
    settings,
  });

  if (key == null) {
    throw new Error('Failed to create remote executor upload cache key.');
  }

  return key;
}

function getStaticProjectDataEntries(projectData: Record<DataId, string> | undefined): Array<[DataId, string]> {
  return Object.entries(projectData ?? {}).sort(([left], [right]) => left.localeCompare(right)) as Array<
    [DataId, string]
  >;
}
