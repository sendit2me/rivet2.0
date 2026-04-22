import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  ExpressionNodeImpl,
  IsomorphicCodeRunner,
  NotAllowedCodeRunner,
  interpolateExpressionSource,
  type ExpressionNode,
  type InternalProcessContext,
  type NodeBodySpec,
  type PortId,
} from '../../../src/index.js';

const createNode = (data: Partial<ExpressionNode['data']>) => {
  return new ExpressionNodeImpl({
    ...ExpressionNodeImpl.create(),
    data: {
      ...ExpressionNodeImpl.create().data,
      ...data,
    },
  });
};

const createContext = (codeRunner = new IsomorphicCodeRunner()) =>
  ({
    codeRunner,
    graphInputNodeValues: {},
    contextValues: {},
  }) as InternalProcessContext;

describe('ExpressionNode', () => {
  it('can create node', () => {
    const node = ExpressionNodeImpl.create();

    assert.strictEqual(node.type, 'expression');
    assert.strictEqual(node.title, 'Expression');
  });

  it('creates one code editor and no manual input/output editors', () => {
    const node = ExpressionNodeImpl.create();
    const editors = new ExpressionNodeImpl(node).getEditors();

    assert.deepStrictEqual(editors, [
      {
        type: 'code',
        label: 'Expression',
        helperMessage:
          'Use {{var}} to create input ports. Inputs are inserted as raw JS source, so string values should include quotes.',
        dataKey: 'expression',
        language: 'javascript',
        enableFolding: true,
      },
    ]);
  });

  it('renders a colorized expression preview body', () => {
    const node = createNode({
      expression: '{{a}} == "123" ?\n  {{b}} :\n  {{c}}',
    });

    assert.deepStrictEqual(node.getBody(), {
      type: 'colorized',
      text: '{{a}} == "123" ?\n  {{b}} :\n  {{c}}',
      language: 'javascript',
      fontSize: 12,
      fontFamily: 'monospace',
    } satisfies NodeBodySpec);
  });

  it('creates interpolation-derived input ports and one fixed output', () => {
    const node = createNode({
      expression: '{{a}} == "123" ? {{b}} : {{c}}',
    });

    assert.deepStrictEqual(
      node.getInputDefinitions().map((definition) => [definition.id, definition.dataType]),
      [
        ['a', 'string'],
        ['b', 'string'],
        ['c', 'string'],
      ],
    );
    assert.deepStrictEqual(node.getOutputDefinitions(), [
      {
        id: 'output',
        title: 'Output',
        dataType: 'any',
      },
    ]);
  });

  it('evaluates a raw-source ternary expression', async () => {
    const node = createNode({
      expression: '{{a}} == "123" ? {{b}} : {{c}}',
    });

    const result = await node.process(
      {
        ['a' as PortId]: { type: 'string', value: '"123"' },
        ['b' as PortId]: { type: 'string', value: '"yes"' },
        ['c' as PortId]: { type: 'string', value: '"no"' },
      },
      createContext(),
    );

    assert.deepStrictEqual(result, {
      output: {
        type: 'any',
        value: 'yes',
      },
    });
  });

  it('supports raw JS source snippets for numbers, booleans, arrays, and objects', async () => {
    const node = createNode({
      expression: '({ num: {{num}}, bool: {{bool}}, arr: {{arr}}, obj: {{obj}} })',
    });

    const result = await node.process(
      {
        ['num' as PortId]: { type: 'string', value: '1' },
        ['bool' as PortId]: { type: 'string', value: 'true' },
        ['arr' as PortId]: { type: 'string', value: '[1, 2, 3]' },
        ['obj' as PortId]: { type: 'string', value: '{ ok: true }' },
      },
      createContext(),
    );

    assert.deepStrictEqual(result.output?.value, {
      num: 1,
      bool: true,
      arr: [1, 2, 3],
      obj: { ok: true },
    });
  });

  it('treats missing interpolation inputs as undefined', async () => {
    const node = createNode({
      expression: 'typeof {{missing}}',
    });

    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result.output?.value, 'undefined');
  });

  it('trims the parsed expression before evaluation', async () => {
    const node = createNode({
      expression: '\n  {{a}} + 1  \n',
    });

    const result = await node.process(
      {
        ['a' as PortId]: { type: 'string', value: '41' },
      },
      createContext(),
    );

    assert.deepStrictEqual(result.output?.value, 42);
  });

  it('trims the parsed expression source used for debugging', () => {
    const parsedExpression = interpolateExpressionSource('\n  {{a}} == "123" ? {{b}} : {{c}}  \n', {
      ['a' as PortId]: { type: 'string', value: '"123"' },
      ['b' as PortId]: { type: 'string', value: '"yes"' },
      ['c' as PortId]: { type: 'string', value: '"no"' },
    });

    assert.equal(parsedExpression, '"123" == "123" ? "yes" : "no"');
  });

  it('discovers later valid interpolation tokens even when an earlier opener is broken', () => {
    const node = createNode({
      expression: '{{broken + {{value}}',
    });

    assert.deepStrictEqual(
      node.getInputDefinitions().map((definition) => definition.id),
      ['value'],
    );
  });

  it('keeps escaped interpolation tokens literal and does not create ports for them', async () => {
    const node = createNode({
      expression: '"{{{a}}}"',
    });

    assert.deepStrictEqual(node.getInputDefinitions(), []);

    const result = await node.process({}, createContext());

    assert.deepStrictEqual(result.output?.value, '{{a}}');
  });

  it('evaluates object literal expressions correctly', async () => {
    const node = createNode({
      expression: '{ value: {{value}}, nested: { ok: true } }',
    });

    const result = await node.process(
      {
        ['value' as PortId]: { type: 'string', value: '42' },
      },
      createContext(),
    );

    assert.deepStrictEqual(result.output?.value, {
      value: 42,
      nested: { ok: true },
    });
  });

  it('throws on invalid JavaScript after interpolation', async () => {
    const node = createNode({
      expression: '{{a}} +',
    });

    await assert.rejects(
      () =>
        node.process(
          {
            ['a' as PortId]: { type: 'string', value: '1' },
          },
          createContext(),
        ),
      /Unexpected token|Unexpected end of input|missing/i,
    );
  });

  it('respects disabled dynamic code execution', async () => {
    const node = createNode({
      expression: '1 + 1',
    });

    await assert.rejects(
      () => node.process({}, createContext(new NotAllowedCodeRunner())),
      /Dynamic code execution is disabled\./,
    );
  });
});
