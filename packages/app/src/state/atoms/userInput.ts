import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { type NodeId, type ProcessId } from '@ironclad/rivet-core';
import { createHybridStorage } from '../storage.js';

const { storage } = createHybridStorage('userInput');

export const userInputModalOpenState = atom<boolean>(false);

export type ProcessQuestions = {
  nodeId: NodeId;
  processId: ProcessId;
  questions: string[];
};

export const userInputModalQuestionsState = atom<Record<NodeId, ProcessQuestions[]>>({});
export const lastAnswersState = atomWithStorage<Record<string, string>>('lastAnswers', {}, storage);
