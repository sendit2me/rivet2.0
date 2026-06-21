import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { type LLMChatV2Node, LLMChatV2NodeImpl } from '../../../src/index.js';
import {
  createsLLMChatV2ToolResponseFormatConflictForEdit,
  hasLLMChatV2ToolResponseFormatConflict,
  LLM_CHAT_V2_TOOL_RESPONSE_FORMAT_CONFLICT_COPY,
} from '../../../src/model/chat-v2/chatV2FeatureCompatibility.js';
import {
  buildLLMChatV2EditorCacheKey,
  resolveLLMChatV2RuntimeProviderOptions,
} from '../../../src/model/nodes/LLMChatV2Node.js';
import {
  cloneLLMChatV2EditorCacheOutputs,
  resolveLLMChatV2RuntimeConfig,
} from '../../../src/model/chat-v2/llmChatV2NodeRuntime.js';

function createNode(data: Partial<LLMChatV2Node['data']> = {}) {
  return new LLMChatV2NodeImpl({
    ...LLMChatV2NodeImpl.create(),
    data: {
      ...LLMChatV2NodeImpl.create().data,
      ...data,
    },
  });
}

function createRuntimeContext(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      openAiKey: 'env-openai-key',
      openAiEndpoint: 'https://api.openai.test/v1/responses',
      openAiOrganization: '',
      chatNodeHeaders: {},
    },
    getPluginConfig: (key: string) => {
      if (key === 'anthropicApiKey') {
        return 'env-anthropic-key';
      }

      if (key === 'googleApiKey') {
        return 'env-google-key';
      }

      return '';
    },
    editorExecutionCache: new Map<string, unknown>(),
    ...overrides,
  } as any;
}

function createRuntimeContextWithPluginEnv(pluginEnv: Record<string, string>) {
  const context = createRuntimeContext();
  return createRuntimeContext({
    settings: {
      ...context.settings,
      pluginEnv,
    },
  });
}

function createPromptInputs(inputs: Record<string, unknown> = {}) {
  return {
    prompt: { type: 'string', value: 'Hello' },
    ...inputs,
  } as any;
}

function getCacheProviderConfig(runtime: Awaited<ReturnType<typeof resolveLLMChatV2RuntimeConfig>>) {
  assert.ok(runtime.cacheKey);
  return JSON.parse(runtime.cacheKey!).providerConfig;
}

describe('LLMChatV2NodeImpl', () => {
  it('creates the unified chat node', () => {
    const node = LLMChatV2NodeImpl.create();

    assert.equal(node.type, 'llmChatV2');
    assert.equal(node.title, 'LLM Chat');
    assert.equal(node.data.provider, 'openai');
    assert.equal(node.data.apiKeySource, 'environment');
    assert.equal(node.data.customProviderApiKeyEnvVarName, 'CUSTOM_PROVIDER_API_KEY');
    assert.equal(node.data.customProviderBaseURL, '');
    assert.equal(node.data.useCustomProviderBaseURLInput, false);
    assert.equal(node.data.baseURL, '');
    assert.equal(node.data.useBaseURLInput, false);
    assert.equal(node.data.extraProviderOptions, '');
    assert.equal(node.data.useExtraProviderOptionsInput, false);
    assert.equal(node.data.useToolCalling, false);
    assert.equal(node.data.outputReasoning, false);
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
    assert.equal(node.data.retryOnNon200, false);
    assert.equal(node.data.retryOnNon200RepeatTimes, 1);
    assert.equal(node.data.retryOnNon200CooldownMs, 0);
    assert.equal(node.data.outputRequestStatus, false);
  });

  it('R2: always exposes an API key input port (used iff the resolved key source is input)', () => {
    // Full-port-set: the apiKey value channel is always present; the resolved Profile decides the source.
    const apiKey = createNode().getInputDefinitions().find((input) => input.id === 'apiKey');
    assert.deepEqual(apiKey, { id: 'apiKey', title: 'API Key', dataType: 'string', required: false });
  });

  it('R2: drops the model-param + layer-owned-connection input ports (model-config is layer-owned)', () => {
    // Even with the old per-param toggles on, these ports never appear now.
    const inputs = createNode({
      useModelInput: true,
      useTemperatureInput: true,
      useMaxTokensInput: true,
      useHeadersInput: true,
      useExtraProviderOptionsInput: true,
    }).getInputDefinitions();
    for (const id of ['model', 'temperature', 'maxTokens', 'topP', 'seed', 'baseURL', 'customProviderBaseURL', 'headers', 'extraProviderOptions']) {
      assert.ok(!inputs.some((input) => input.id === id), `${id} input port should be gone in R2`);
    }
  });

  it('R2: the editor is config-less — model-config groups removed, only selectors + structural groups remain', async () => {
    const editors = await createNode().getEditors({} as any);
    const groupLabels = editors.filter((editor) => editor.type === 'group').map((editor) => (editor as any).label);
    assert.deepEqual(groupLabels, ['Model config', 'Response format', 'Tools', 'Outputs', 'Technical details']);
    for (const gone of ['Model', 'OpenAI', 'Anthropic', 'Google', 'Parameters', 'Reasoning', 'Provider Advanced']) {
      assert.ok(!groupLabels.includes(gone), `${gone} group should be removed in R2`);
    }
    const technicalDetailsGroup = editors.at(-1) as any;
    assert.equal(technicalDetailsGroup.label, 'Technical details');
    assert.equal(technicalDetailsGroup.editors[0]?.dataKey, 'retryOnNon200');
  });

  it('R2: the body shows the INCOMPLETE state for an unbound node (no silent default)', () => {
    assert.match(createNode().getBody({} as any), /Incomplete/);
  });

  it('adds request transport outputs only when technical details request them', () => {
    const defaultNode = createNode();
    const statusNode = createNode({
      outputRequestStatus: true,
    });
    const retryStatusNode = createNode({
      outputRequestStatus: true,
      retryOnNon200: true,
    });

    assert.ok(!defaultNode.getOutputDefinitions().some((output) => output.id === 'requestStatus'));
    assert.ok(!defaultNode.getOutputDefinitions().some((output) => output.id === 'requestError'));
    assert.deepEqual(
      statusNode.getOutputDefinitions().find((output) => output.id === 'requestStatus'),
      {
        id: 'requestStatus',
        title: 'Response Status',
        dataType: 'number',
      },
    );
    assert.deepEqual(
      retryStatusNode.getOutputDefinitions().find((output) => output.id === 'requestStatus'),
      {
        id: 'requestStatus',
        title: 'Response Status',
        dataType: 'number[]',
      },
    );
    assert.deepEqual(
      statusNode.getOutputDefinitions().find((output) => output.id === 'requestError'),
      {
        id: 'requestError',
        title: 'Response Error',
        dataType: 'string',
      },
    );
    assert.deepEqual(
      retryStatusNode.getOutputDefinitions().find((output) => output.id === 'requestError'),
      {
        id: 'requestError',
        title: 'Response Error',
        dataType: 'string[]',
      },
    );
    assert.equal(
      retryStatusNode.getOutputDefinitions().some((output) => output.id === 'requestStatuses'),
      false,
    );
    assert.equal(
      retryStatusNode.getOutputDefinitions().some((output) => output.id === 'requestErrors'),
      false,
    );
  });

  it('marks the response output as structured when JSON response format is enabled', () => {
    const defaultNode = createNode();
    const jsonNode = createNode({
      responseFormat: 'json',
    });
    const schemaNode = createNode({
      responseFormat: 'json_schema',
    });

    assert.equal(defaultNode.getOutputDefinitions().find((output) => output.id === 'response')?.dataType, 'string');
    assert.deepEqual(jsonNode.getOutputDefinitions().find((output) => output.id === 'response')?.dataType, [
      'object',
      'object[]',
      'any',
      'any[]',
      'string',
      'string[]',
      'number',
      'number[]',
      'boolean',
      'boolean[]',
    ]);
    assert.deepEqual(schemaNode.getOutputDefinitions().find((output) => output.id === 'response')?.dataType, [
      'object',
      'object[]',
      'any',
      'any[]',
      'string',
      'string[]',
      'number',
      'number[]',
      'boolean',
      'boolean[]',
    ]);
  });

  it('adds Tool Calls output when provider built-in tools are enabled', () => {
    const node = createNode({
      provider: 'openai',
      useToolCalling: false,
      enableOpenAIWebSearch: true,
    });

    const outputs = node.getOutputDefinitions();
    const functionCalls = outputs.find((output) => output.id === 'function-calls');

    assert.ok(functionCalls);
    assert.equal(functionCalls.title, 'Tool Calls');
    assert.equal(functionCalls?.dataType, 'object[]');
  });

  it('adds reasoning output when enabled', () => {
    const defaultNode = createNode();
    const reasoningNode = createNode({
      outputReasoning: true,
    });

    assert.ok(!defaultNode.getOutputDefinitions().some((output) => output.id === 'reasoning'));
    assert.deepEqual(
      reasoningNode.getOutputDefinitions().find((output) => output.id === 'reasoning'),
      {
        id: 'reasoning',
        title: 'Reasoning',
        dataType: ['string', 'string[]'],
      },
    );
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
    assert.deepEqual(toolsGroup.editors.find((editor: any) => editor.dataKey === 'toolChoice')?.options, [
      { value: '', label: 'Default' },
      { value: 'auto', label: 'Auto' },
      { value: 'function', label: 'Specific tool' },
      { value: 'required', label: 'Required' },
    ]);
    assert.equal(toolsGroup.editors.find((editor: any) => editor.dataKey === 'toolChoiceFunction')?.label, 'Tool name');
    assert.equal(
      toolsGroup.editors.find((editor: any) => editor.dataKey === 'parallelToolCalls')?.label,
      'Allow parallel toolcalls',
    );
    assert.equal(
      toolsGroup.editors.find((editor: any) => editor.dataKey === 'parallelToolCalls')?.helperMessage,
      undefined,
    );
    assert.equal(
      toolsGroup.editors
        .find((editor: any) => editor.dataKey === 'parallelToolCalls')
        ?.hideIf({
          provider: 'custom',
          useToolCalling: true,
        }),
      true,
    );
    assert.equal(
      toolsGroup.editors
        .find((editor: any) => editor.dataKey === 'parallelToolCalls')
        ?.hideIf({
          provider: 'openai',
          useToolCalling: true,
        }),
      false,
    );
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
    assert.ok(outputGroup.editors.some((editor: any) => editor.dataKey === 'outputReasoning')); // R2: moved here from Reasoning
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

  it('merges extra provider options into the selected Vercel provider namespace', () => {
    assert.deepEqual(
      resolveLLMChatV2RuntimeProviderOptions(
        createNode({
          provider: 'custom',
          extraProviderOptions: '{ "reasoningEffort": "high", "customFlag": true }',
        }).data,
        {},
      ),
      {
        custom: {
          reasoningEffort: 'high',
          customFlag: true,
        },
      },
    );

    assert.deepEqual(
      resolveLLMChatV2RuntimeProviderOptions(
        createNode({
          provider: 'openai',
          extraProviderOptions: '{ "reasoningEffort": "low", "store": false }',
          openAIReasoningEffort: 'high',
        }).data,
        {},
      ),
      {
        openai: {
          reasoningEffort: 'high',
          store: false,
        },
      },
    );
  });

  it('resolves extra provider options from an input port', () => {
    assert.deepEqual(
      resolveLLMChatV2RuntimeProviderOptions(
        createNode({
          provider: 'custom',
          useExtraProviderOptionsInput: true,
          extraProviderOptions: '{ "ignored": true }',
        }).data,
        {
          extraProviderOptions: {
            type: 'string',
            value: '{ "reasoningEffort": "high", "customFlag": true }',
          },
        } as any,
      ),
      {
        custom: {
          reasoningEffort: 'high',
          customFlag: true,
        },
      },
    );

    assert.deepEqual(
      resolveLLMChatV2RuntimeProviderOptions(
        createNode({
          provider: 'custom',
          useExtraProviderOptionsInput: true,
        }).data,
        {
          extraProviderOptions: {
            type: 'object',
            value: { reasoningEffort: 'medium' },
          },
        } as any,
      ),
      {
        custom: {
          reasoningEffort: 'medium',
        },
      },
    );
  });

  it('rejects invalid extra provider options', () => {
    assert.throws(
      () =>
        resolveLLMChatV2RuntimeProviderOptions(
          createNode({
            extraProviderOptions: '{',
          }).data,
          {},
        ),
      /Extra provider options must be valid JSON/,
    );

    assert.throws(
      () =>
        resolveLLMChatV2RuntimeProviderOptions(
          createNode({
            extraProviderOptions: '[]',
          }).data,
          {},
        ),
      /Extra provider options must be a JSON object/,
    );
  });

  it('exposes response-format settings and JSON schema input ports only when needed', async () => {
    const defaultNode = createNode();
    const jsonSchemaNode = createNode({
      responseFormat: 'json_schema',
      useResponseSchemaNameInput: true,
      useResponseSchemaDescriptionInput: true,
    });

    const editors = await defaultNode.getEditors({});
    const responseFormatGroup = editors.find(
      (editor) => editor.type === 'group' && editor.label === 'Response format',
    ) as any;

    assert.ok(responseFormatGroup);
    assert.deepEqual(responseFormatGroup.editors.find((editor: any) => editor.dataKey === 'responseFormat')?.options, [
      { value: '', label: 'Default' },
      { value: 'text', label: 'Text' },
      { value: 'json', label: 'JSON' },
      { value: 'json_schema', label: 'JSON schema' },
    ]);
    assert.ok(!defaultNode.getInputDefinitions().some((input) => input.id === 'responseSchema'));

    const inputs = jsonSchemaNode.getInputDefinitions();
    const inputById = new Map(inputs.map((input) => [input.id, input]));

    assert.deepEqual(inputById.get('responseSchema' as any)?.dataType, ['object', 'gpt-function']);
    assert.equal(inputById.get('responseSchema' as any)?.required, true);
    assert.equal(inputById.get('responseSchemaName' as any)?.dataType, 'string');
    assert.equal(inputById.get('responseSchemaDescription' as any)?.dataType, 'string');
  });

  it('passes JSON schema response format to Custom provider OpenAI-compatible requests', async () => {
    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
      },
      required: ['answer'],
      additionalProperties: false,
    };
    const node = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://api.cerebras.ai/v1',
      customProviderApiKeyEnvVarName: 'CEREBRAS_API_KEY',
      responseFormat: 'json_schema',
      responseSchemaName: 'answer_schema',
      responseSchemaDescription: 'Answer payload',
      extraProviderOptions: '{ "customFlag": true, "response_format": { "type": "json_object" } }',
    });
    const context = createRuntimeContextWithPluginEnv({
      CEREBRAS_API_KEY: 'sk-cerebras-secret',
    });

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: createPromptInputs({
        responseSchema: {
          type: 'object',
          value: schema,
        },
      }),
      context,
    });

    assert.deepEqual(runtime.runOptions.providerOptions, {
      custom: {
        customFlag: true,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'answer_schema',
            description: 'Answer payload',
            strict: true,
            schema,
          },
        },
      },
    });
  });

  it('treats Tool use and structured response formats as mutually exclusive', () => {
    assert.equal(hasLLMChatV2ToolResponseFormatConflict({ useToolCalling: true, responseFormat: '' }), false);
    assert.equal(hasLLMChatV2ToolResponseFormatConflict({ useToolCalling: true, responseFormat: 'text' }), false);
    assert.equal(
      hasLLMChatV2ToolResponseFormatConflict({ useToolCalling: false, responseFormat: 'json_schema' }),
      false,
    );

    assert.equal(hasLLMChatV2ToolResponseFormatConflict({ useToolCalling: true, responseFormat: 'json_schema' }), true);
    assert.deepEqual(LLM_CHAT_V2_TOOL_RESPONSE_FORMAT_CONFLICT_COPY, {
      title: '"Tool use" conflicts with "Structured outputs"',
      paragraphs: [
        '"Tool use" and "Structured outputs" cannot be used at the same time.',
        'Use "Tool use" with Default/Text response format, or turn "Tool use" off before choosing JSON/JSON schema.',
      ],
    });
  });

  it('detects only edits that create a Tool use and structured response-format conflict', () => {
    assert.equal(
      createsLLMChatV2ToolResponseFormatConflictForEdit(
        { useToolCalling: false, responseFormat: 'json_schema' },
        { useToolCalling: true, responseFormat: 'json_schema' },
      ),
      true,
    );
    assert.equal(
      createsLLMChatV2ToolResponseFormatConflictForEdit(
        { useToolCalling: true, responseFormat: '' },
        { useToolCalling: true, responseFormat: 'json' },
      ),
      true,
    );
    assert.equal(
      createsLLMChatV2ToolResponseFormatConflictForEdit(
        { useToolCalling: true, responseFormat: 'json' },
        { useToolCalling: true, responseFormat: 'json_schema' },
      ),
      false,
    );
  });

  it('fails fast before execution when Tool use and structured response format are both enabled', async () => {
    await assert.rejects(
      () =>
        resolveLLMChatV2RuntimeConfig({
          data: createNode({
            useToolCalling: true,
            responseFormat: 'json_schema',
          }).data,
          nodeId: 'node-id' as any,
          inputs: {},
          context: createRuntimeContext(),
        }),
      { message: LLM_CHAT_V2_TOOL_RESPONSE_FORMAT_CONFLICT_COPY.paragraphs[0] },
    );
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
      providerConfig: { baseURL: 'https://example.test' },
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

  it('scopes editor cache keys by API key input without storing the raw secret', async () => {
    const node = createNode({
      apiKeySource: 'input',
      cache: true,
    });
    const context = createRuntimeContext();
    const commonInputs = createPromptInputs();

    const first = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: {
        ...commonInputs,
        apiKey: { type: 'string', value: 'sk-secret-a' },
      },
      context,
    });
    const second = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: {
        ...commonInputs,
        apiKey: { type: 'string', value: 'sk-secret-b' },
      },
      context,
    });

    assert.ok(first.cacheKey);
    assert.ok(second.cacheKey);
    assert.notEqual(first.cacheKey, second.cacheKey);
    assert.doesNotMatch(first.cacheKey!, /sk-secret-a/);
    assert.doesNotMatch(second.cacheKey!, /sk-secret-b/);
  });

  it('fails clearly when the API key input source is selected but no key is provided', async () => {
    const node = createNode({
      apiKeySource: 'input',
    });

    await assert.rejects(
      () =>
        resolveLLMChatV2RuntimeConfig({
          data: node.data,
          nodeId: node.chartNode.id,
          inputs: createPromptInputs(),
          context: createRuntimeContext(),
        }),
      /API Key input is required/,
    );
  });

  it('resolves Custom provider config from base URL and configured API key env var', async () => {
    const node = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://api.cerebras.ai/v1/chat/completions',
      customProviderApiKeyEnvVarName: 'CEREBRAS_API_KEY',
      cache: true,
    });
    const context = createRuntimeContextWithPluginEnv({
      CEREBRAS_API_KEY: 'sk-cerebras-secret',
    });

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: createPromptInputs(),
      context,
    });

    assert.equal(runtime.runOptions.provider, 'custom');
    assert.equal(runtime.runOptions.modelId, 'llama-custom');
    assert.equal(getCacheProviderConfig(runtime).baseURL, 'https://api.cerebras.ai/v1');
    assert.doesNotMatch(runtime.cacheKey!, /sk-cerebras-secret/);
  });

  it('resolves Custom provider base URL from the active input port', async () => {
    const node = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://static.example.ai/v1',
      useCustomProviderBaseURLInput: true,
      customProviderApiKeyEnvVarName: 'CUSTOM_INPUT_API_KEY',
      cache: true,
    });
    const context = createRuntimeContextWithPluginEnv({
      CUSTOM_INPUT_API_KEY: 'sk-input-secret',
    });

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: createPromptInputs({
        customProviderBaseURL: { type: 'string', value: 'https://input.example.ai/v1/chat/completions' },
      }),
      context,
    });

    assert.equal(getCacheProviderConfig(runtime).baseURL, 'https://input.example.ai/v1');
  });

  it('keeps Custom provider and built-in provider base URL input ports separate', async () => {
    const customNode = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://static-custom.example.ai/v1',
      useCustomProviderBaseURLInput: true,
      customProviderApiKeyEnvVarName: 'CUSTOM_SEPARATE_API_KEY',
      cache: true,
    });
    const openAiNode = createNode({
      provider: 'openai',
      model: 'gpt-5',
      baseURL: 'https://static-openai.example.test/v1',
      useBaseURLInput: true,
      customProviderBaseURL: 'https://stale-custom.example.ai/v1',
      cache: true,
    });
    const context = createRuntimeContextWithPluginEnv({
      CUSTOM_SEPARATE_API_KEY: 'sk-custom-secret',
    });
    const inputs = createPromptInputs({
      baseURL: { type: 'string', value: 'https://input-openai.example.test/v1' },
      customProviderBaseURL: { type: 'string', value: 'https://input-custom.example.ai/v1/chat/completions' },
    });

    const customRuntime = await resolveLLMChatV2RuntimeConfig({
      data: customNode.data,
      nodeId: customNode.chartNode.id,
      inputs,
      context,
    });
    const openAiRuntime = await resolveLLMChatV2RuntimeConfig({
      data: openAiNode.data,
      nodeId: openAiNode.chartNode.id,
      inputs,
      context,
    });

    assert.equal(getCacheProviderConfig(customRuntime).baseURL, 'https://input-custom.example.ai/v1');
    assert.equal(getCacheProviderConfig(openAiRuntime).baseURL, 'https://input-openai.example.test/v1');
  });

  it('does not reuse the Custom provider base URL as a built-in provider override', async () => {
    const node = createNode({
      provider: 'openai',
      model: 'gpt-5',
      customProviderBaseURL: 'https://api.cerebras.ai/v1',
      cache: true,
    });

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: createPromptInputs(),
      context: createRuntimeContext(),
    });

    assert.equal(getCacheProviderConfig(runtime).baseURL, 'https://api.openai.test/v1');
  });

  it('ignores inactive base URL fields in editor cache keys', async () => {
    const context = createRuntimeContextWithPluginEnv({
      CUSTOM_CACHE_API_KEY: 'sk-custom-secret',
    });
    const commonInputs = createPromptInputs();
    const firstOpenAIRuntime = await resolveLLMChatV2RuntimeConfig({
      data: createNode({
        provider: 'openai',
        model: 'gpt-5',
        customProviderBaseURL: 'https://custom-a.example.ai/v1',
        cache: true,
      }).data,
      nodeId: 'same-openai-node-id' as any,
      inputs: commonInputs,
      context,
    });
    const secondOpenAIRuntime = await resolveLLMChatV2RuntimeConfig({
      data: createNode({
        provider: 'openai',
        model: 'gpt-5',
        customProviderBaseURL: 'https://custom-b.example.ai/v1',
        useCustomProviderBaseURLInput: true,
        cache: true,
      }).data,
      nodeId: 'same-openai-node-id' as any,
      inputs: commonInputs,
      context,
    });
    const firstCustomRuntime = await resolveLLMChatV2RuntimeConfig({
      data: createNode({
        provider: 'custom',
        model: 'llama-custom',
        customProviderBaseURL: 'https://custom-cache.example.ai/v1',
        baseURL: 'https://hidden-a.example.test/v1',
        useBaseURLInput: true,
        customProviderApiKeyEnvVarName: 'CUSTOM_CACHE_API_KEY',
        cache: true,
      }).data,
      nodeId: 'same-custom-node-id' as any,
      inputs: commonInputs,
      context,
    });
    const secondCustomRuntime = await resolveLLMChatV2RuntimeConfig({
      data: createNode({
        provider: 'custom',
        model: 'llama-custom',
        customProviderBaseURL: 'https://custom-cache.example.ai/v1',
        baseURL: 'https://hidden-b.example.test/v1',
        customProviderApiKeyEnvVarName: 'CUSTOM_CACHE_API_KEY',
        cache: true,
      }).data,
      nodeId: 'same-custom-node-id' as any,
      inputs: commonInputs,
      context,
    });

    assert.equal(firstOpenAIRuntime.cacheKey, secondOpenAIRuntime.cacheKey);
    assert.equal(firstCustomRuntime.cacheKey, secondCustomRuntime.cacheKey);
  });

  it('fingerprints provider header values in editor cache keys', async () => {
    const node = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://api.cerebras.ai/v1',
      customProviderApiKeyEnvVarName: 'CEREBRAS_API_KEY',
      headers: [{ key: 'Authorization', value: 'Bearer raw-header-secret' }],
      cache: true,
    });
    const context = createRuntimeContextWithPluginEnv({
      CEREBRAS_API_KEY: 'sk-cerebras-secret',
    });

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: createPromptInputs(),
      context,
    });

    assert.doesNotMatch(runtime.cacheKey!, /raw-header-secret/);
    assert.doesNotMatch(runtime.cacheKey!, /sk-cerebras-secret/);
    assert.equal(getCacheProviderConfig(runtime).headers.Authorization.startsWith('24:'), true);
  });

  it('fingerprints extra provider option values in editor cache keys without changing runtime options', async () => {
    const node = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://api.cerebras.ai/v1',
      customProviderApiKeyEnvVarName: 'CEREBRAS_API_KEY',
      extraProviderOptions: '{ "reasoningEffort": "high", "byok": { "apiKey": "raw-provider-option-secret" } }',
      cache: true,
    });
    const context = createRuntimeContextWithPluginEnv({
      CEREBRAS_API_KEY: 'sk-cerebras-secret',
    });

    const runtime = await resolveLLMChatV2RuntimeConfig({
      data: node.data,
      nodeId: node.chartNode.id,
      inputs: createPromptInputs(),
      context,
    });

    assert.deepEqual(runtime.runOptions.providerOptions, {
      custom: {
        reasoningEffort: 'high',
        byok: {
          apiKey: 'raw-provider-option-secret',
        },
      },
    });
    assert.ok(runtime.cacheKey);
    assert.doesNotMatch(runtime.cacheKey!, /raw-provider-option-secret/);
    assert.doesNotMatch(runtime.cacheKey!, /reasoningEffort/);
  });

  it('ignores stale static extra provider options in cache keys when input mode is enabled', async () => {
    const firstNode = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://api.cerebras.ai/v1',
      customProviderApiKeyEnvVarName: 'CEREBRAS_API_KEY',
      extraProviderOptions: '{ "stale": "first" }',
      useExtraProviderOptionsInput: true,
      cache: true,
    });
    const secondNode = createNode({
      ...firstNode.data,
      extraProviderOptions: '{ "stale": "second" }',
    });
    const context = createRuntimeContextWithPluginEnv({
      CEREBRAS_API_KEY: 'sk-cerebras-secret',
    });
    const inputs = createPromptInputs({
      extraProviderOptions: {
        type: 'string',
        value: '{ "reasoningEffort": "high", "byok": { "apiKey": "input-option-secret" } }',
      },
    });

    const firstRuntime = await resolveLLMChatV2RuntimeConfig({
      data: firstNode.data,
      nodeId: firstNode.chartNode.id,
      inputs,
      context,
    });
    const secondRuntime = await resolveLLMChatV2RuntimeConfig({
      data: secondNode.data,
      nodeId: firstNode.chartNode.id,
      inputs,
      context,
    });

    assert.deepEqual(firstRuntime.runOptions.providerOptions, secondRuntime.runOptions.providerOptions);
    assert.equal(firstRuntime.cacheKey, secondRuntime.cacheKey);
    assert.ok(firstRuntime.cacheKey);
    assert.doesNotMatch(firstRuntime.cacheKey!, /input-option-secret/);
    assert.doesNotMatch(firstRuntime.cacheKey!, /stale/);
  });

  it('fails clearly when Custom provider configured-key env var is missing', async () => {
    const node = createNode({
      provider: 'custom',
      model: 'llama-custom',
      customProviderBaseURL: 'https://api.cerebras.ai/v1',
      customProviderApiKeyEnvVarName: 'MISSING_CUSTOM_KEY',
    });

    await assert.rejects(
      () =>
        resolveLLMChatV2RuntimeConfig({
          data: node.data,
          nodeId: node.chartNode.id,
          inputs: createPromptInputs(),
          context: createRuntimeContext(),
        }),
      /Custom provider API key env var MISSING_CUSTOM_KEY is not set/,
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

  it('clones editor cache outputs with circular arrays when structuredClone cannot copy a value', () => {
    const circularValue: unknown[] = [() => 'not structured-cloneable'];
    circularValue.push(circularValue);
    const outputs = {
      response: {
        type: 'object[]',
        value: circularValue,
      },
    } as const;

    const cloned = cloneLLMChatV2EditorCacheOutputs(outputs as any);
    const clonedValue = cloned.response.value as unknown[];

    assert.notEqual(clonedValue, circularValue);
    assert.equal(clonedValue[0], circularValue[0]);
    assert.equal(clonedValue[1], clonedValue);
  });
});
