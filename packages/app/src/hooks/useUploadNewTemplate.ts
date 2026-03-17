import { useAtomValue } from 'jotai';
import { projectState } from '../state/savedGraphs';
import { type GraphId } from '@ironclad/rivet-core';
import { type UseMutationResult } from '@tanstack/react-query';
import { type PostTemplateBody, type PutTemplateVersionBody } from '../utils/communityApi';
import { createTemplate, serializeTemplateProject, unpublishTemplate, uploadTemplateVersion } from '../utils/communityTemplates';
import { useDependsOnPlugins } from './useDependsOnPlugins';
import { useHandledMutation } from './useHandledMutation';

export function useUploadNewTemplate({ onCompleted }: { onCompleted: () => void }): UseMutationResult<
  void,
  Error,
  {
    templateName: string;
    version: string;
    description: string;
    versionDescription: string;
    graphsToInclude: GraphId[];
  },
  unknown
> {
  const project = useAtomValue(projectState);
  const plugins = useDependsOnPlugins();

  const mutation = useHandledMutation({
    mutationFn: async (params: {
      templateName: string;
      version: string;
      description: string;
      versionDescription: string;
      graphsToInclude: GraphId[];
    }) => {
      const serializedProject = serializeTemplateProject(project, params.graphsToInclude);
      const template = await createTemplate({
        name: params.templateName,
        tags: [],
      } satisfies PostTemplateBody);

      try {
        await uploadTemplateVersion(
          template.id,
          params.version,
          {
            descriptionMarkdown: params.description,
            versionDescriptionMarkdown: params.versionDescription,
            plugins: plugins.map((plugin) => plugin.id),
            serializedProject: serializedProject as string,
          } satisfies PutTemplateVersionBody,
        );
      } catch (error) {
        try {
          await unpublishTemplate(template.id);
        } catch {}

        throw error;
      }
    },
    errorMessage: 'Failed to upload template',
    metadata: {
      projectId: project.metadata.id,
    },
    onSuccess: () => {
      onCompleted();
    },
  });

  return mutation;
}
