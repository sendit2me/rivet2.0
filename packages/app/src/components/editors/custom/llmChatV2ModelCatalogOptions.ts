import type { CustomEditorDefinition, ChartNode } from '@valerypopoff/rivet2-core';

export type ModelOption = {
  value: string;
  label: string;
};

const refreshedModelOptions = new Map<string, ModelOption[]>();

export function getModelOptions(editor: CustomEditorDefinition<ChartNode>): ModelOption[] {
  return ((editor.data as { modelOptions?: ModelOption[] } | undefined)?.modelOptions ?? []) as ModelOption[];
}

export function includeCurrentModelOption(options: ModelOption[], currentModel: unknown): ModelOption[] {
  if (typeof currentModel !== 'string' || currentModel.trim() === '') {
    return options;
  }

  if (options.some((option) => option.value === currentModel)) {
    return options;
  }

  return [{ value: currentModel, label: `${currentModel} (Current)` }, ...options];
}

export function getVisibleModelOptions(options: {
  editor: CustomEditorDefinition<ChartNode>;
  currentModel: unknown;
  optionsKey: string;
}): ModelOption[] {
  return includeCurrentModelOption(
    refreshedModelOptions.get(options.optionsKey) ?? getModelOptions(options.editor),
    options.currentModel,
  );
}

export function rememberRefreshedModelOptions(optionsKey: string, options: ModelOption[]): void {
  refreshedModelOptions.set(optionsKey, options);
}

export function forgetRefreshedModelOptions(optionsKey: string): void {
  refreshedModelOptions.delete(optionsKey);
}

export function clearRefreshedModelOptionsForTests(): void {
  refreshedModelOptions.clear();
}
