import type { NodeGraph, Project } from '@valerypopoff/rivet2-core';
import { getStaticGlobalVariableIds } from '../../../domain/graphEditing/globalVariables.js';

export {
  getGraphsWithLiveGraph,
  getMissingStaticSetGlobalWarning,
  getStaticGlobalVariableIds,
  getStaticSetGlobalId,
} from '../../../domain/graphEditing/globalVariables.js';

export type GlobalVariableOption = {
  label: string;
  value: string;
};

export function getGlobalVariableOptions(
  project: Pick<Project, 'graphs'> | undefined,
  liveGraph?: NodeGraph,
): GlobalVariableOption[] {
  const ids = getStaticGlobalVariableIds(project, liveGraph);

  return Array.from(ids)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      label: id,
      value: id,
    }));
}
