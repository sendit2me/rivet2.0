import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function getSourceSnippet(relativePath: string, label: string): string {
  const source = readFileSync(path.join(packageRoot, relativePath), 'utf8');
  const labelIndex = source.indexOf(`label: '${label}'`);
  assert.notEqual(labelIndex, -1, `${label} should exist in ${relativePath}`);

  const objectStart = source.lastIndexOf('{', labelIndex);
  assert.notEqual(objectStart, -1, `Could not find object start for ${label} in ${relativePath}`);

  let depth = 0;
  let inString: "'" | '"' | '`' | undefined;
  let isEscaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === '\\') {
        isEscaped = true;
        continue;
      }

      if (character === inString) {
        inString = undefined;
      }

      continue;
    }

    if (character === '\'' || character === '"' || character === '`') {
      inString = character;
      continue;
    }

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }
  }

  assert.fail(`Could not find object end for ${label} in ${relativePath}`);
}

function assertSourceFoldingEnabled(relativePath: string, label: string): void {
  const snippet = getSourceSnippet(relativePath, label);
  assert.match(snippet, /enableFolding:\s*true/, `${label} should enable folding in ${relativePath}`);
}

function assertSourceFoldingDisabled(relativePath: string, label: string): void {
  const snippet = getSourceSnippet(relativePath, label);
  assert.doesNotMatch(snippet, /enableFolding:\s*true/, `${label} should not enable folding in ${relativePath}`);
}

test('targeted built-in code/json node editors opt into folding', () => {
  assertSourceFoldingEnabled('src/model/nodes/CodeNode.ts', 'Code');
  assertSourceFoldingEnabled('src/model/nodes/ObjectNode.ts', 'JSON Template');
  assertSourceFoldingEnabled('src/model/nodes/HttpCallNode.ts', 'Headers');
  assertSourceFoldingEnabled('src/model/nodes/HttpCallNode.ts', 'Body');
  assertSourceFoldingEnabled('src/model/nodes/ToolNode.ts', 'Schema');
  assertSourceFoldingEnabled('src/model/nodes/MCPToolCallNode.ts', 'Tool Arguments');
  assertSourceFoldingEnabled('src/model/nodes/MCPGetPromptNode.ts', 'Prompt Arguments');
  assertSourceFoldingEnabled('src/plugins/assemblyAi/TranscribeAudioNode.ts', 'Transcript Parameters (JSON)');
});

test('excluded adjacent node editors do not opt into folding', () => {
  assertSourceFoldingDisabled('src/model/nodes/ToolNode.ts', 'Description');
  assertSourceFoldingDisabled('src/model/nodes/TextNode.ts', 'Text');
  assertSourceFoldingDisabled('src/model/nodes/PromptNode.ts', 'Prompt Text');
  assertSourceFoldingDisabled('src/model/nodes/CommentNode.ts', 'Text');
  assertSourceFoldingDisabled('src/model/nodes/ExtractObjectPathNode.ts', 'Path');
  assertSourceFoldingDisabled('src/model/nodes/ExtractYamlNode.ts', 'Object Path');
  assertSourceFoldingDisabled('src/model/nodes/ExtractRegexNode.ts', 'Regex');
  assertSourceFoldingDisabled('src/plugins/openai/nodes/CreateAssistantNode.ts', 'Instructions');
  assertSourceFoldingDisabled('src/plugins/openai/nodes/RunThreadNode.ts', 'Instructions');
  assertSourceFoldingDisabled('src/plugins/openai/nodes/ThreadMessageNode.ts', 'Text');
});
