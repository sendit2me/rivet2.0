import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  PromptNodeImpl,
  type DataValue,
  type InternalProcessContext,
  type PromptNode,
} from '../../../src/index.js';

const createNode = (data: Partial<PromptNode['data']>) => {
  return new PromptNodeImpl({
    ...PromptNodeImpl.create(),
    data: {
      ...PromptNodeImpl.create().data,
      ...data,
    },
  });
};

describe('PromptNode', () => {
  const context = {
    graphInputNodeValues: {
      graphValue: { type: 'string', value: 'from graph' },
    },
    contextValues: {
      contextValue: { type: 'string', value: 'from context' },
    },
  } as InternalProcessContext;

  it('interpolates connected prompt text values without reparsing braces in values', async () => {
    const node = createNode({
      promptText: 'Prompt: {{input}}',
    });

    const result = await node.process(
      {
        input: { type: 'string', value: 'foo {{not-a-port}} bar' },
      } satisfies Record<string, DataValue>,
      context,
    );

    assert.deepStrictEqual(result.output, {
      type: 'chat-message',
      value: {
        type: 'user',
        message: 'Prompt: foo {{not-a-port}} bar',
        isCacheBreakpoint: undefined,
      },
    });
  });

  it('resolves graph and context interpolation references without exposing prompt input ports', async () => {
    const node = createNode({
      promptText: '{{@graphInputs.graphValue}} / {{@context.contextValue}}',
    });

    assert.deepStrictEqual(node.getInputDefinitions(), []);

    const result = await node.process({}, context);

    assert.deepStrictEqual(result.output?.value, {
      type: 'user',
      message: 'from graph / from context',
      isCacheBreakpoint: undefined,
    });
  });
});
