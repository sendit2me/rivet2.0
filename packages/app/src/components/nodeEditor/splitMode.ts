export type SplitModeChoice = 'parallel' | 'sequential';

export const splitModeFromIsSplitSequential = (isSplitSequential: boolean | undefined): SplitModeChoice =>
  isSplitSequential ? 'sequential' : 'parallel';

export const isSplitSequentialFromSplitMode = (splitMode: SplitModeChoice): boolean => splitMode === 'sequential';
