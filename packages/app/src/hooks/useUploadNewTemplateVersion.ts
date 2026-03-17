import { projectState } from '../state/savedGraphs';
import { type GraphId } from '@ironclad/rivet-core';
import { type UseMutationResult } from '@tanstack/react-query';
import { type PutTemplateVersionBody } from '../utils/communityApi';
import { myTemplatesQueryKey, serializeTemplateProject, uploadTemplateVersion } from '../utils/communityTemplates';
import { useDependsOnPlugins } from './useDependsOnPlugins';
import { useAtomValue } from 'jotai';
import { useHandledMutation } from './useHandledMutation';

export type UseUploadNewTemplateVersionParams = {
  version: string;
  description: string;
  versionDescription: string;
  graphsToInclude: GraphId[];
};

export function useUploadNewTemplateVersion({
  templateId,
  onCompleted,
}: {
  templateId: string;
  onCompleted: () => void;
}): UseMutationResult<void, Error, UseUploadNewTemplateVersionParams, unknown> {
  const project = useAtomValue(projectState);
  const plugins = useDependsOnPlugins();

  const mutation = useHandledMutation({
    mutationFn: async (params: UseUploadNewTemplateVersionParams) => {
      const serializedProject = serializeTemplateProject(project, params.graphsToInclude);

      await uploadTemplateVersion(
        templateId,
        params.version,
        {
          descriptionMarkdown: params.description,
          versionDescriptionMarkdown: params.versionDescription,
          plugins: plugins.map((plugin) => plugin.id),
          serializedProject: serializedProject as string,
        } satisfies PutTemplateVersionBody,
      );
    },
    errorMessage: 'Failed to upload template version',
    metadata: {
      projectId: project.metadata.id,
      templateId,
    },
    invalidateQueryKey: myTemplatesQueryKey,
    onSuccess: () => {
      onCompleted();
    },
  });

  return mutation;
}
