import { atom } from 'jotai';
import { getStaticGlobalVariableIds } from '../../domain/graphEditing/globalVariables.js';
import { graphState } from '../atoms/graph.js';
import { projectState } from '../savedGraphs.js';

export const enabledStaticGlobalVariableIdsState = atom((get) =>
  getStaticGlobalVariableIds(get(projectState), get(graphState), { includeDisabled: false }),
);
