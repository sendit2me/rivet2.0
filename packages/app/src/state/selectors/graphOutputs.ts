import { atom } from 'jotai';
import { getDuplicateGraphOutputIds } from '../../domain/graphEditing/graphOutputs.js';
import { graphState } from '../atoms/graph.js';

export const duplicateGraphOutputIdsState = atom((get) => getDuplicateGraphOutputIds(get(graphState)));
