import { orderBy } from 'lodash-es';

export type LlmSelectorOption = {
  label: string;
  value: string;
};

/** The no-selection value. Matches the byte-identical default: an empty/undefined id (Features 001–004). */
export const LLM_SELECTOR_NONE_VALUE = '';

/**
 * Build `{ value: id, label: name }` options for an LLM Profile/Skill/Preset selector (Feature 005,
 * Phase A), from the entities defined in Settings. Mirrors `getProjectGraphSelectorOptions`:
 * - always leads with a **`None`** option (the no-selection default → byte-identical behavior);
 * - sorts the defined entities by lowercased label;
 * - if `selectedId` is set but no longer exists in Settings, surfaces a **`Missing: <id>`** row so the
 *   dangling reference is visible and fixable rather than silently blank.
 *
 * Pure; the three selectors (Profile/Skill/Preset) share it since they all carry `{ id, name }`.
 */
export function getLlmSelectorOptions(
  items: ReadonlyArray<{ id: string; name?: string }>,
  options: { selectedId?: string } = {},
): LlmSelectorOption[] {
  const itemOptions = orderBy(
    items.map((item) => ({ label: item.name?.trim() ? item.name : item.id, value: item.id })),
    [(option) => option.label.toLocaleLowerCase(), 'label'],
  );

  const noneOption: LlmSelectorOption = { label: 'None', value: LLM_SELECTOR_NONE_VALUE };

  const { selectedId } = options;
  if (selectedId && !itemOptions.some((option) => option.value === selectedId)) {
    return [noneOption, { label: `Missing: ${selectedId}`, value: selectedId }, ...itemOptions];
  }

  return [noneOption, ...itemOptions];
}
