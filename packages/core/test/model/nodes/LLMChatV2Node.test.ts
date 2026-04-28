import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { type LLMChatV2Node, LLMChatV2NodeImpl } from '../../../src/index.js';
import {
  buildLLMChatV2EditorCacheKey,
  resolveLLMChatV2RuntimeProviderOptions,
} from '../../../src/model/nodes/LLMChatV2Node.js';
import { cloneLLMChatV2EditorCacheOutputs } from '../../../src/model/chat-v2/llmChatV2NodeRuntime.js';

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
    assert.equal(node.data.presencePenalty, undefined);
    assert.equal(node.data.usePresencePenaltyInput, false);
    assert.equal(node.data.frequencyPenalty, undefined);
    assert.equal(node.data.useFrequencyPenaltyInput, false);
    assert.deepEqual(node.data.stopSequences, []);
    assert.equal(node.data.useStopSequencesInput, false);
    assert.equal(node.data.seed, undefined);
    assert.equal(node.data.useSeedInput, false);
    assert.equal(node.data.responseFormat, '');
    assert.equal(node.data.responseSchemaName, '');
    assert.equal(node.data.useResponseSchemaNameInput, false);
    assert.equal(node.data.responseSchemaDescription, '');
    assert.equal(node.data.useResponseSchemaDescriptionInput, false);
    assert.equal(node.data.anthropicThinkingMode, '');
    assert.equal(node.data.anthropicThinkingBudget, undefined);
    assert.equal(node.data.useAnthropicThinkingBudgetInput, false);
    assert.equal(node.data.anthropicEffort, '');
    assert.equal(node.data.googleThinkingBudget, undefined);
    assert.equal(node.data.useGoogleThinkingBudgetInput, false);
    assert.equal(node.data.googleThinkingLevel, '');
    assert.equal(node.data.googleIncludeThoughts, false);
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
    assert.equal(toolsGroup.editors.find((editor: any) => editor.dataKey === 'parallelToolCalls')?.helperMessage, undefined);
    assert.match(
      toolsGroup.editors.find((editor: any) => editor.dataKey === 'autoContinueToolCalls')?.helperMessage,
      /sends all tool results back to the model/,
    );
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'toolChoice'));
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'toolChoiceFunction'));
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'autoContinueToolCalls'));
    assert.ok(toolsGroup.editors.some((editor: any) => editor.dataKey === 'maxToolRounds'));
    assert.ok(!outputGroup.editors.some((editor: any) => editor.dataKey === 'useToolCalling'));
    assert.equal(
      outputGroup.editors.find((editor: any) => editor.dataKey === 'outputUsage')?.label,
      'Output usage details',
    );
    assert.match(
      outputGroup.editors.find((editor: any) => editor.dataKey === 'outputUsage')?.helperMessage,
      /Vercel AI SDK usage metadata/,
    );
    assert.equal(
      outputGroup.editors.find((editor: any) => editor.dataKey === 'useAsGraphPartialOutput')?.label,
      'Stream response',
    );
    assert.match(
      outputGroup.editors.find((editor: any) => editor.dataKey === 'useAsGraphPartialOutput')?.helperMessage,
      /Other nodes only receive the final response/,
    );
    assert.equal(
      outputGroup.editors.find((editor: any) => editor.dataKey === 'cache')?.label,
      'Cache outputs (editor only)',
    );
    assert.match(
      outputGroup.editors.find((editor: any) => editor.dataKey === 'cache')?.helperMessage,
      /this node's previous outputs/,
    );
    assert.match(
      outputGroup.editors.find((editor: any) => editor.dataKey === 'cache')?.helperMessage,
      /while the Rivet app is open/,
    );
  });

  it('groups provider reasoning settings after Parameters', async () => {
    const node = createNode();

    const editors = await node.getEditors({});
    const groupLabels = editors.filter((editor) => editor.type === 'group').map((editor) => editor.label);
    const reasoningGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'Reasoning') as any;
    const openAIGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'OpenAI') as any;
    const anthropicGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'Anthropic') as any;
    const googleGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'Google') as any;

    assert.deepEqual(groupLabels.slice(groupLabels.indexOf('Model') + 1, groupLabels.indexOf('Model') + 4), [
      'OpenAI',
      'Anthropic',
      'Google',
    ]);
    assert.equal(groupLabels.indexOf('Reasoning'), groupLabels.indexOf('Parameters') + 1);
    assert.ok(reasoningGroup);
    assert.deepEqual(
      reasoningGroup.editors.map((editor: any) => editor.dataKey),
      [
        'openAIReasoningEffort',
        'openAIReasoningSummary',
        'anthropicThinkingMode',
        'anthropicEffort',
        'anthropicThinkingBudget',
        'googleThinkingLevel',
        'googleThinkingBudget',
        'googleIncludeThoughts',
      ],
    );
    assert.equal(
      reasoningGroup.editors.find((editor: any) => editor.dataKey === 'openAIReasoningEffort')?.hideIf({
        provider: 'openai',
      }),
      false,
    );
    assert.equal(
      reasoningGroup.editors.find((editor: any) => editor.dataKey === 'anthropicThinkingMode')?.hideIf({
        provider: 'anthropic',
      }),
      false,
    );
    assert.deepEqual(
      reasoningGroup.editors.find((editor: any) => editor.dataKey === 'anthropicThinkingMode')?.options,
      [
        { value: '', label: 'Default' },
        { value: 'adaptive', label: 'Adaptive' },
        { value: 'enabled', label: 'Enabled' },
        { value: 'disabled', label: 'Disabled' },
      ],
    );
    assert.deepEqual(
      reasoningGroup.editors.find((editor: any) => editor.dataKey === 'anthropicEffort')?.options,
      [
        { value: '', label: 'Default' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'max', label: 'Max' },
      ],
    );
    assert.equal(
      reasoningGroup.editors.find((editor: any) => editor.dataKey === 'googleThinkingBudget')?.hideIf({
        provider: 'google',
      }),
      false,
    );
    assert.deepEqual(
      reasoningGroup.editors.find((editor: any) => editor.dataKey === 'googleThinkingLevel')?.options,
      [
        { value: '', label: 'Default' },
        { value: 'minimal', label: 'Minimal' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
    );
    assert.ok(!openAIGroup.editors.some((editor: any) => editor.dataKey === 'openAIReasoningEffort'));
    assert.ok(!anthropicGroup.editors.some((editor: any) => editor.dataKey === 'anthropicThinkingMode'));
    assert.ok(!googleGroup.editors.some((editor: any) => editor.dataKey === 'googleThinkingBudget'));
    assert.ok(!googleGroup.editors.some((editor: any) => editor.dataKey === 'googleStructuredOutputs'));
  });

  it('resolves provider-specific reasoning options in the Vercel providerOptions shape', () => {
    assert.equal(resolveLLMChatV2RuntimeProviderOptions(createNode({ provider: 'openai' }).data, {}), undefined);

    assert.deepEqual(
      resolveLLMChatV2RuntimeProviderOptions(
        createNode({
          provider: 'openai',
          openAIReasoningEffort: 'high',
          openAIReasoningSummary: 'auto',
        }).data,
        {},
      ),
      {
        openai: {
          reasoningEffort: 'high',
          reasoningSummary: 'auto',
        },
      },
    );

    assert.equal(resolveLLMChatV2RuntimeProviderOptions(createNode({ provider: 'anthropic' }).data, {}), undefined);
    assert.deepEqual(
      resolveLLMChatV2RuntimeProviderOptions(
        createNode({
          provider: 'anthropic',
          anthropicThinkingMode: 'enabled',
          anthropicThinkingBudget: 12000,
          anthropicEffort: 'low',
        }).data,
        {},
      ),
      {
        anthropic: {
          effort: 'low',
          thinking: {
            type: 'enabled',
            budgetTokens: 12000,
          },
        },
      },
    );

    assert.deepEqual(
      resolveLLMChatV2RuntimeProviderOptions(
        createNode({
          provider: 'google',
          googleThinkingBudget: 8192,
          googleThinkingLevel: 'high',
          googleIncludeThoughts: true,
        }).data,
        {},
      ),
      {
        google: {
          thinkingConfig: {
            thinkingBudget: 8192,
            thinkingLevel: 'high',
            includeThoughts: true,
          },
        },
      },
    );
  });

  it('exposes expanded generation parameters and matching input ports', async () => {
    const node = createNode({
      useTopKInput: true,
      usePresencePenaltyInput: true,
      useFrequencyPenaltyInput: true,
      useStopSequencesInput: true,
      useSeedInput: true,
      useMaxTokensInput: true,
    });

    const editors = await node.getEditors({});
    const parametersGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'Parameters') as any;
    const parameterLabels = parametersGroup.editors.map((editor: any) => editor.label);

    assert.deepEqual(parameterLabels.slice(0, 2), ['Temperature', 'Max output tokens']);
    assert.ok(parameterLabels.includes('Presence penalty'));
    assert.ok(parameterLabels.includes('Frequency penalty'));
    assert.ok(parameterLabels.includes('Stop sequences'));
    assert.ok(parameterLabels.includes('Seed'));
    assert.ok(parameterLabels.includes('Max output tokens'));
    assert.equal(
      parametersGroup.editors.find((editor: any) => editor.dataKey === 'topK')?.helperMessage,
      'Provider-dependent; some providers or models may ignore this setting.',
    );

    const inputs = node.getInputDefinitions();
    const inputById = new Map(inputs.map((input) => [input.id, input]));

    assert.equal(inputById.get('presencePenalty' as any)?.dataType, 'number');
    assert.equal(inputById.get('frequencyPenalty' as any)?.dataType, 'number');
    assert.deepEqual(inputById.get('stopSequences' as any)?.dataType, ['string', 'string[]']);
    assert.equal(inputById.get('seed' as any)?.dataType, 'number');
    assert.equal(inputById.get('maxTokens' as any)?.title, 'Max output tokens');
  });

  it('exposes response-format settings and JSON schema input ports only when needed', async () => {
    const defaultNode = createNode();
    const jsonSchemaNode = createNode({
      responseFormat: 'json_schema',
      useResponseSchemaNameInput: true,
      useResponseSchemaDescriptionInput: true,
    });

    const editors = await defaultNode.getEditors({});
    const responseFormatGroup = editors.find((editor) => editor.type === 'group' && editor.label === 'Response format') as any;

    assert.ok(responseFormatGroup);
    assert.deepEqual(
      responseFormatGroup.editors.find((editor: any) => editor.dataKey === 'responseFormat')?.options,
      [
        { value: '', label: 'Default' },
        { value: 'text', label: 'Text' },
        { value: 'json', label: 'JSON' },
        { value: 'json_schema', label: 'JSON schema' },
      ],
    );
    assert.ok(!defaultNode.getInputDefinitions().some((input) => input.id === 'responseSchema'));

    const inputs = jsonSchemaNode.getInputDefinitions();
    const inputById = new Map(inputs.map((input) => [input.id, input]));

    assert.deepEqual(inputById.get('responseSchema' as any)?.dataType, ['object', 'gpt-function']);
    assert.equal(inputById.get('responseSchema' as any)?.required, true);
    assert.equal(inputById.get('responseSchemaName' as any)?.dataType, 'string');
    assert.equal(inputById.get('responseSchemaDescription' as any)?.dataType, 'string');
  });

  it('scopes editor cache keys by node id', () => {
    const firstNode = LLMChatV2NodeImpl.create();
    const secondNode = {
      ...LLMChatV2NodeImpl.create(),
      data: firstNode.data,
    };
    const commonParts = {
      nodeData: firstNode.data,
      provider: 'openai' as const,
      modelId: 'gpt-5',
      providerConfig: { apiKey: 'test' },
      prompt: { type: 'string', value: 'Hello' },
      systemPrompt: undefined,
      functions: undefined,
      generationParameters: { temperature: 0.5 },
      responseFormatParameters: undefined,
      providerOptions: undefined,
      toolChoice: undefined,
    };

    assert.equal(
      buildLLMChatV2EditorCacheKey({
        ...commonParts,
        nodeId: firstNode.id,
      }),
      buildLLMChatV2EditorCacheKey({
        ...commonParts,
        nodeId: firstNode.id,
      }),
    );
    assert.notEqual(
      buildLLMChatV2EditorCacheKey({
        ...commonParts,
        nodeId: firstNode.id,
      }),
      buildLLMChatV2EditorCacheKey({
        ...commonParts,
        nodeId: secondNode.id,
      }),
    );
  });

  it('builds stable editor cache keys for equivalent object inputs', () => {
    const node = LLMChatV2NodeImpl.create();
    const firstSchema = {
      type: 'object',
      properties: {
        city: { type: 'string' },
        units: { type: 'string' },
      },
      required: ['city'],
    };
    const secondSchema = {
      required: ['city'],
      properties: {
        units: { type: 'string' },
        city: { type: 'string' },
      },
      type: 'object',
    };
    const commonParts = {
      nodeId: node.id,
      nodeData: node.data,
      provider: 'openai' as const,
      modelId: 'gpt-5',
      providerConfig: { headers: { b: '2', a: '1' }, baseURL: 'https://example.test' },
      prompt: { type: 'string', value: 'Hello' },
      systemPrompt: undefined,
      generationParameters: { temperature: 0.5 },
      responseFormatParameters: undefined,
      providerOptions: undefined,
      toolChoice: undefined,
    };

    assert.equal(
      buildLLMChatV2EditorCacheKey({
        ...commonParts,
        functions: [
          {
            name: 'weather',
            description: 'Get weather',
            parameters: firstSchema,
            strict: false,
          },
        ],
      }),
      buildLLMChatV2EditorCacheKey({
        ...commonParts,
        functions: [
          {
            strict: false,
            parameters: secondSchema,
            description: 'Get weather',
            name: 'weather',
          },
        ],
      }),
    );
  });

  it('builds editor cache keys without throwing on circular input metadata', () => {
    const node = LLMChatV2NodeImpl.create();
    const providerConfig: Record<string, unknown> = { baseURL: 'https://example.test' };
    providerConfig.self = providerConfig;

    assert.doesNotThrow(() =>
      buildLLMChatV2EditorCacheKey({
        nodeId: node.id,
        nodeData: node.data,
        provider: 'openai',
        modelId: 'gpt-5',
        providerConfig,
        prompt: { type: 'string', value: 'Hello' },
        systemPrompt: undefined,
        functions: undefined,
        generationParameters: { temperature: 0.5 },
        responseFormatParameters: undefined,
        providerOptions: undefined,
        toolChoice: undefined,
      }),
    );
  });

  it('clones editor cache outputs while preserving excluded output values', () => {
    const outputs = {
      response: {
        type: 'string',
        value: 'Hello',
      },
      'function-calls': {
        type: 'object[]',
        value: [
          {
            name: 'tool',
            arguments: { city: 'Paris' },
          },
        ],
      },
      usage: {
        type: 'control-flow-excluded',
        value: undefined,
      },
    } as const;

    const cloned = cloneLLMChatV2EditorCacheOutputs(outputs as any);

    assert.deepEqual(cloned, outputs);
    assert.notEqual(cloned, outputs);
    assert.notEqual(cloned['function-calls' as any].value, outputs['function-calls'].value);

    (cloned['function-calls' as any].value[0].arguments as any).city = 'Berlin';

    assert.equal((outputs['function-calls'].value[0].arguments as any).city, 'Paris');
    assert.ok(Object.hasOwn(cloned.usage, 'value'));
  });
});
