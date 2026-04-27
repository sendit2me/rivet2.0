import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { type LLMChatV2Node, LLMChatV2NodeImpl } from '../../../src/index.js';

function createNode(data: Partial<LLMChatV2Node['data']> = {}) {
  return new LLMChatV2NodeImpl({
    ...LLMChatV2NodeImpl.create(),
    data: {
      ...LLMChatV2NodeImpl.create().data,
      ...data,
    },
  });
}

describe('LLMChatV2NodeImpl', () => {
  it('creates the unified chat node', () => {
    const node = LLMChatV2NodeImpl.create();

    assert.equal(node.type, 'llmChatV2');
    assert.equal(node.title, 'LLM Chat v2');
    assert.equal(node.data.provider, 'openai');
    assert.equal(node.data.useToolCalling, false);
    assert.equal(node.data.toolChoice, '');
    assert.equal(node.data.toolChoiceFunction, '');
    assert.equal(node.data.parallelToolCalls, false);
    assert.equal(node.data.autoContinueToolCalls, false);
    assert.equal(node.data.maxToolRounds, 3);
  });

  it('adds function-call output when provider built-in tools are enabled', () => {
    const node = createNode({
      provider: 'openai',
      useToolCalling: false,
      enableOpenAIWebSearch: true,
    });

    const outputs = node.getOutputDefinitions();
    const functionCalls = outputs.find((output) => output.id === 'function-calls');

    assert.ok(functionCalls);
    assert.equal(functionCalls?.dataType, 'object[]');
  });

  it('exposes provider-specific thinking budget inputs only for the active provider', () => {
    const anthropicNode = createNode({
      provider: 'anthropic',
      useAnthropicThinkingBudgetInput: true,
    });
    const googleNode = createNode({
      provider: 'google',
      useGoogleThinkingBudgetInput: true,
    });

    const anthropicInputs = anthropicNode.getInputDefinitions();
    const googleInputs = googleNode.getInputDefinitions();

    assert.ok(anthropicInputs.some((input) => input.id === 'anthropicThinkingBudget'));
    assert.ok(!anthropicInputs.some((input) => input.id === 'googleThinkingBudget'));
    assert.ok(googleInputs.some((input) => input.id === 'googleThinkingBudget'));
    assert.ok(!googleInputs.some((input) => input.id === 'anthropicThinkingBudget'));
  });

  it('groups Rivet tool calling controls under Tools', async () => {
    const node = createNode({
      useToolCalling: true,
    });

    const editors = await node.getEditors({});
    const toolsGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'Tools') as any;
    const outputGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'Outputs') as any;

    assert.ok(toolsGroup);
    assert.ok(outputGroup);
    const toolEditorKeys = toolsGroup.editors.map((editor: any) => editor.dataKey);

    assert.deepEqual(toolEditorKeys.slice(0, 5), [
      'useToolCalling',
      'toolChoice',
      'toolChoiceFunction',
      'parallelToolCalls',
      'autoContinueToolCalls',
    ]);
    assert.equal(toolsGroup.editors.find((editor: any) => editor.dataKey === 'useToolCalling')?.label, 'Tool use');
    assert.deepEqual(
      toolsGroup.editors.find((editor: any) => editor.dataKey === 'toolChoice')?.options,
      [
        { value: '', label: 'Default' },
        { value: 'auto', label: 'Auto' },
        { value: 'function', label: 'Specific tool' },
        { value: 'required', label: 'Required' },
      ],
    );
    assert.equal(toolsGroup.editors.find((editor: any) => editor.dataKey === 'toolChoiceFunction')?.label, 'Tool name');
    assert.equal(
      toolsGroup.editors.find((editor: any) => editor.dataKey === 'parallelToolCalls')?.label,
      'Allow parallel toolcalls',
    );
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'toolChoice'));
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'toolChoiceFunction'));
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'autoContinueToolCalls'));
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'maxToolRounds'));
    assert.ok(!outputGroup.editors.some((editor: any) => editor.dataKey === 'useToolCalling'));
  });
});
