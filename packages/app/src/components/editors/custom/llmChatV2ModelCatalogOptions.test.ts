import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import type { ChartNode, CustomEditorDefinition } from '@valerypopoff/rivet2-core';

import {
  clearRefreshedModelOptionsForTests,
  forgetRefreshedModelOptions,
  getVisibleModelOptions,
  includeCurrentModelOption,
  rememberRefreshedModelOptions,
  type ModelOption,
} from './llmChatV2ModelCatalogOptions.js';

const editor = (modelOptions: ModelOption[]): CustomEditorDefinition<ChartNode> => ({
  type: 'custom',
  label: 'Model',
  customEditorId: 'LLMChatV2ModelCatalog',
  data: {
    modelOptions,
  },
});

afterEach(() => {
  clearRefreshedModelOptionsForTests();
});

test('getVisibleModelOptions prefers refreshed editor-owned options over stale editor data', () => {
  rememberRefreshedModelOptions('node:openai:input', [{ value: 'gpt-live', label: 'gpt-live' }]);

  assert.deepEqual(
    getVisibleModelOptions({
      editor: editor([{ value: 'gpt-stale', label: 'gpt-stale' }]),
      currentModel: 'gpt-live',
      optionsKey: 'node:openai:input',
    }),
    [{ value: 'gpt-live', label: 'gpt-live' }],
  );
});

test('getVisibleModelOptions falls back to editor model options before refresh', () => {
  assert.deepEqual(
    getVisibleModelOptions({
      editor: editor([{ value: 'gpt-static', label: 'gpt-static' }]),
      currentModel: 'gpt-static',
      optionsKey: 'node:openai:input',
    }),
    [{ value: 'gpt-static', label: 'gpt-static' }],
  );
});

test('forgetRefreshedModelOptions clears stale refreshed options for a refresh key', () => {
  rememberRefreshedModelOptions('node:openai:input', [{ value: 'gpt-old', label: 'gpt-old' }]);
  forgetRefreshedModelOptions('node:openai:input');

  assert.deepEqual(
    getVisibleModelOptions({
      editor: editor([{ value: 'gpt-static', label: 'gpt-static' }]),
      currentModel: 'gpt-static',
      optionsKey: 'node:openai:input',
    }),
    [{ value: 'gpt-static', label: 'gpt-static' }],
  );
});

test('includeCurrentModelOption keeps custom current model visible when absent from refreshed catalog', () => {
  assert.deepEqual(includeCurrentModelOption([{ value: 'gpt-live', label: 'gpt-live' }], 'custom-model'), [
    { value: 'custom-model', label: 'custom-model (Current)' },
    { value: 'gpt-live', label: 'gpt-live' },
  ]);
});
