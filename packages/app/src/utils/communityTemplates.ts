import { array } from '@recoiljs/refine';
import { type GraphId, type Project, serializeProject } from '@rivet2/rivet-core';
import {
  type PostTemplateBody,
  type PutTemplateVersionBody,
  type TemplateResponse,
  templateResponseChecker,
  unpublishTemplateResponseChecker,
} from './communityApi';
import { fetchCommunity, getCommunityApi } from './getCommunityApi';

export const myTemplatesQueryKey = ['my-templates'] as const;

export function fetchMyTemplates(): Promise<readonly TemplateResponse[]> {
  return fetchCommunity('/templates/mine', array(templateResponseChecker));
}

export async function createTemplate(body: PostTemplateBody): Promise<TemplateResponse> {
  const response = await fetch(getCommunityApi('/templates'), {
    credentials: 'include',
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error(`Failed to upload template: ${await response.text()}`);
  }

  const parsed = templateResponseChecker(await response.json());

  if (parsed.type === 'failure') {
    throw new Error(parsed.message);
  }

  return parsed.value;
}

export async function uploadTemplateVersion(
  templateId: string,
  version: string,
  body: PutTemplateVersionBody,
): Promise<void> {
  const response = await fetch(
    getCommunityApi('/templates/:templateId/version/:version').replace(':templateId', templateId).replace(':version', version),
    {
      credentials: 'include',
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error(`Failed to upload template: ${await response.text()}`);
  }
}

export function serializeTemplateProject(project: Project, graphsToInclude: GraphId[]): string {
  const selectedGraphIds = new Set<GraphId>(graphsToInclude);
  const filteredGraphs = Object.fromEntries(
    Object.entries(project.graphs).filter(([graphId]) => selectedGraphIds.has(graphId as GraphId)),
  ) as Project['graphs'];

  return serializeProject(
    {
      ...project,
      metadata: {
        ...project.metadata,
        mainGraphId:
          project.metadata.mainGraphId && selectedGraphIds.has(project.metadata.mainGraphId)
            ? project.metadata.mainGraphId
            : undefined,
      },
      graphs: filteredGraphs,
    },
  ) as string;
}

export async function unpublishTemplate(templateId: string): Promise<boolean> {
  const { success } = await fetchCommunity(`/templates/${templateId}`, unpublishTemplateResponseChecker, {
    method: 'DELETE',
  });

  return success;
}
