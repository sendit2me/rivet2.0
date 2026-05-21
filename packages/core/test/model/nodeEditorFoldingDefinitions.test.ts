import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CodeNewNodeImpl,
  CodeNodeImpl,
  CommentNodeImpl,
  ExpressionNodeImpl,
  ExtractObjectPathNodeImpl,
  ExtractRegexNodeImpl,
  ExtractYamlNodeImpl,
  GptFunctionNodeImpl,
  HttpCallNodeImpl,
  MCPGetPromptNodeImpl,
  MCPToolCallNodeImpl,
  ObjectNodeImpl,
  PromptNodeImpl,
  TextNodeImpl,
  type ChartNode,
  type EditorDefinition,
  type PluginNodeImpl,
} from '../../src/index.js';
import { TranscribeAudioNodeImpl } from '../../src/plugins/assemblyAi/TranscribeAudioNode.js';
import { CreateAssistantNodeImpl } from '../../src/plugins/openai/nodes/CreateAssistantNode.js';
import { RunThreadNodeImpl } from '../../src/plugins/openai/nodes/RunThreadNode.js';
import { ThreadMessageNodeImpl } from '../../src/plugins/openai/nodes/ThreadMessageNode.js';

type EditorProvider = () => EditorDefinition<any>[] | Promise<EditorDefinition<any>[]>;
type EditorExpectation = { name: string; editors: EditorProvider; label?: string; dataKey?: string };
type BuiltInEditorImpl<T extends ChartNode> = {
  create(): T;
  new (node: T): {
    getEditors(context: never): EditorDefinition<T>[] | Promise<EditorDefinition<T>[]>;
  };
};

const builtIn =
  <T extends ChartNode>(Impl: BuiltInEditorImpl<T>): EditorProvider =>
  () =>
    new Impl(Impl.create()).getEditors({} as never);
const plugin =
  (impl: PluginNodeImpl<any>): EditorProvider =>
  () =>
    impl.getEditors(impl.create().data, {} as never) as EditorDefinition<any>[];

async function getMatchingEditor(expectation: EditorExpectation): Promise<EditorDefinition<any>> {
  assert.ok(
    expectation.label != null || expectation.dataKey != null,
    `Expected ${expectation.name} to provide a label or dataKey locator`,
  );

  const editors = flattenEditors(await Promise.resolve(expectation.editors()));
  const editor = editors.find((candidate) => {
    const label = 'label' in candidate ? candidate.label : undefined;
    const dataKey = 'dataKey' in candidate ? candidate.dataKey : undefined;
    return expectation.label != null ? label === expectation.label : dataKey === expectation.dataKey;
  });

  assert.ok(editor, `Expected editor ${expectation.name} to exist`);
  return editor;
}

function flattenEditors(editors: EditorDefinition<any>[]): EditorDefinition<any>[] {
  return editors.flatMap((editor) => [
    editor,
    ...('editors' in editor && Array.isArray(editor.editors) ? flattenEditors(editor.editors) : []),
  ]);
}

async function assertFolding(expectations: EditorExpectation[], expected: boolean): Promise<void> {
  for (const expectation of expectations) {
    const editor = await getMatchingEditor(expectation);
    assert.equal(editor.enableFolding === true, expected, `${expectation.name} folding state`);
  }
}

test('targeted built-in code/json node editors opt into folding', async () => {
  await assertFolding(
    [
      { name: 'Code (legacy) code editor', editors: builtIn(CodeNodeImpl), dataKey: 'code' },
      { name: 'Code code editor', editors: builtIn(CodeNewNodeImpl), dataKey: 'code' },
      { name: 'Expression code editor', editors: builtIn(ExpressionNodeImpl), dataKey: 'expression' },
      { name: 'Object JSON template editor', editors: builtIn(ObjectNodeImpl), label: 'JSON Template' },
      { name: 'HTTP headers editor', editors: builtIn(HttpCallNodeImpl), label: 'Headers' },
      { name: 'HTTP body editor', editors: builtIn(HttpCallNodeImpl), label: 'Body' },
      { name: 'Tool schema editor', editors: builtIn(GptFunctionNodeImpl), label: 'Schema' },
      { name: 'MCP tool arguments editor', editors: builtIn(MCPToolCallNodeImpl), label: 'Tool Arguments' },
      { name: 'MCP prompt arguments editor', editors: builtIn(MCPGetPromptNodeImpl), label: 'Prompt Arguments' },
      {
        name: 'AssemblyAI transcript parameters editor',
        editors: plugin(TranscribeAudioNodeImpl),
        label: 'Transcript Parameters (JSON)',
      },
    ],
    true,
  );
});

test('excluded adjacent node editors do not opt into folding', async () => {
  await assertFolding(
    [
      { name: 'Tool description editor', editors: builtIn(GptFunctionNodeImpl), label: 'Description' },
      { name: 'Text editor', editors: builtIn(TextNodeImpl), dataKey: 'text' },
      { name: 'Prompt text editor', editors: builtIn(PromptNodeImpl), label: 'Prompt Text' },
      { name: 'Comment text editor', editors: builtIn(CommentNodeImpl), dataKey: 'text' },
      { name: 'Extract Object Path editor', editors: builtIn(ExtractObjectPathNodeImpl), label: 'Path' },
      { name: 'Extract YAML path editor', editors: builtIn(ExtractYamlNodeImpl), label: 'Object Path' },
      { name: 'Extract Regex editor', editors: builtIn(ExtractRegexNodeImpl), label: 'Regex' },
      {
        name: 'OpenAI create assistant instructions editor',
        editors: plugin(CreateAssistantNodeImpl),
        label: 'Instructions',
      },
      { name: 'OpenAI run thread instructions editor', editors: plugin(RunThreadNodeImpl), label: 'Instructions' },
      { name: 'OpenAI thread message text editor', editors: plugin(ThreadMessageNodeImpl), dataKey: 'text' },
    ],
    false,
  );
});
