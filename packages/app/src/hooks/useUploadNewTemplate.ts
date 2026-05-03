import { useAtomValue } from 'jotai';
import { projectState } from '../state/savedGraphs';
import { graphState } from '../state/graph';
import { type GraphId } from '@rivet2/rivet-core';
import { type UseMutationResult } from '@tanstack/react-query';
import { type PostTemplateBody, type PutTemplateVersionBody } from '../utils/communityApi';
import { createTemplate, serializeTemplateProject, unpublishTemplate, uploadTemplateVersion } from '../utils/communityTemplates';
import { useHandledMutation } from './useHandledMutation';
import { pluginsState } from '../state/plugins';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';
import { withDerivedProjectPluginSpecs } from '../utils/pluginUsage';

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
  const graph = useAtomValue(graphState);
  const pluginStates = useAtomValue(pluginsState);
  const projectNodeRegistry = useProjectNodeRegistry();

  const mutation = useHandledMutation({
    mutationFn: async (params: {
      templateName: string;
      version: string;
      description: string;
      versionDescription: string;
      graphsToInclude: GraphId[];
    }) => {
      const projectToUpload = withDerivedProjectPluginSpecs(
        {
          ...project,
          graphs: {
            ...project.graphs,
            [graph.metadata!.id!]: graph,
          },
        },
        {
          appPluginStates: pluginStates,
          currentGraph: graph,
          registry: projectNodeRegistry,
        },
      );
      const serializedProject = serializeTemplateProject(projectToUpload, params.graphsToInclude);
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
            plugins: (projectToUpload.plugins ?? []).map((plugin) => plugin.id),
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
