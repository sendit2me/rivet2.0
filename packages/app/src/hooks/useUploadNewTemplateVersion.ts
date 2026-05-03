import { projectState } from '../state/savedGraphs';
import { graphState } from '../state/graph';
import { type GraphId } from '@valerypopoff/rivet2-core';
import { type UseMutationResult } from '@tanstack/react-query';
import { type PutTemplateVersionBody } from '../utils/communityApi';
import { myTemplatesQueryKey, serializeTemplateProject, uploadTemplateVersion } from '../utils/communityTemplates';
import { useAtomValue } from 'jotai';
import { useHandledMutation } from './useHandledMutation';
import { pluginsState } from '../state/plugins';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';
import { withDerivedProjectPluginSpecs } from '../utils/pluginUsage';

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
  const graph = useAtomValue(graphState);
  const pluginStates = useAtomValue(pluginsState);
  const projectNodeRegistry = useProjectNodeRegistry();

  const mutation = useHandledMutation({
    mutationFn: async (params: UseUploadNewTemplateVersionParams) => {
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

      await uploadTemplateVersion(
        templateId,
        params.version,
        {
          descriptionMarkdown: params.description,
          versionDescriptionMarkdown: params.versionDescription,
          plugins: (projectToUpload.plugins ?? []).map((plugin) => plugin.id),
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
