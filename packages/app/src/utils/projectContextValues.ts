import type { DataValue } from '@valerypopoff/rivet2-core';
import { cloneDeep } from 'lodash-es';
import type { ProjectContext } from '../state/savedGraphs.js';
import { entries } from './typeSafety.js';

export function getProjectContextValues(projectContext: ProjectContext): Record<string, DataValue> {
  const contextValues: Record<string, DataValue> = {};

  for (const [id, contextValue] of entries(projectContext)) {
    contextValues[id] = cloneDeep(contextValue.value);
  }

  return contextValues;
}
