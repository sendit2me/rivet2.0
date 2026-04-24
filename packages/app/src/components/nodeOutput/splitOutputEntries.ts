export function getSortedSplitOutputEntries<T>(splitOutputData: Record<string, T> | undefined): Array<[string, T]> {
  return Object.entries(splitOutputData ?? {}).sort(([left], [right]) => Number(left) - Number(right));
}
