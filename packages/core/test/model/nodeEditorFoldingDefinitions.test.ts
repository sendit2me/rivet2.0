import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type EditorLocator = {
  label?: string;
  dataKey?: string;
};

function getSourceSnippet(relativePath: string, locator: EditorLocator): string {
  const source = readFileSync(path.join(packageRoot, relativePath), 'utf8');
  const searchNeedle =
    locator.label != null ? `label: '${locator.label}'` : locator.dataKey != null ? `dataKey: '${locator.dataKey}'` : '';
  assert.notEqual(searchNeedle, '', `A label or dataKey locator is required for ${relativePath}`);

  const needleIndex = source.indexOf(searchNeedle);
  const locatorLabel = locator.label ?? locator.dataKey ?? '<unknown>';
  assert.notEqual(needleIndex, -1, `${locatorLabel} should exist in ${relativePath}`);

  const linesBeforeNeedle = source.slice(0, needleIndex).split('\n');
  let objectStart = -1;
  let runningOffset = source.slice(0, needleIndex).length;

  for (let lineIndex = linesBeforeNeedle.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = linesBeforeNeedle[lineIndex]!;
    runningOffset -= line.length;

    if (line.trim() === '{') {
      objectStart = runningOffset + line.indexOf('{');
      break;
    }

    if (lineIndex > 0) {
      runningOffset -= 1;
    }
  }

  assert.notEqual(objectStart, -1, `Could not find object start for ${locatorLabel} in ${relativePath}`);

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

  assert.fail(`Could not find object end for ${locatorLabel} in ${relativePath}`);
}

function assertSourceFoldingEnabled(relativePath: string, locator: EditorLocator): void {
  const snippet = getSourceSnippet(relativePath, locator);
  const locatorLabel = locator.label ?? locator.dataKey ?? '<unknown>';
  assert.match(snippet, /enableFolding:\s*true/, `${locatorLabel} should enable folding in ${relativePath}`);
}

function assertSourceFoldingDisabled(relativePath: string, locator: EditorLocator): void {
  const snippet = getSourceSnippet(relativePath, locator);
  const locatorLabel = locator.label ?? locator.dataKey ?? '<unknown>';
  assert.doesNotMatch(snippet, /enableFolding:\s*true/, `${locatorLabel} should not enable folding in ${relativePath}`);
}

test('targeted built-in code/json node editors opt into folding', () => {
  assertSourceFoldingEnabled('src/model/nodes/CodeNode.ts', { dataKey: 'code' });
  assertSourceFoldingEnabled('src/model/nodes/ExpressionNode.ts', { dataKey: 'expression' });
  assertSourceFoldingEnabled('src/model/nodes/ObjectNode.ts', { label: 'JSON Template' });
  assertSourceFoldingEnabled('src/model/nodes/HttpCallNode.ts', { label: 'Headers' });
  assertSourceFoldingEnabled('src/model/nodes/HttpCallNode.ts', { label: 'Body' });
  assertSourceFoldingEnabled('src/model/nodes/ToolNode.ts', { label: 'Schema' });
  assertSourceFoldingEnabled('src/model/nodes/MCPToolCallNode.ts', { label: 'Tool Arguments' });
  assertSourceFoldingEnabled('src/model/nodes/MCPGetPromptNode.ts', { label: 'Prompt Arguments' });
  assertSourceFoldingEnabled('src/plugins/assemblyAi/TranscribeAudioNode.ts', { label: 'Transcript Parameters (JSON)' });
});

test('excluded adjacent node editors do not opt into folding', () => {
  assertSourceFoldingDisabled('src/model/nodes/ToolNode.ts', { label: 'Description' });
  assertSourceFoldingDisabled('src/model/nodes/TextNode.ts', { dataKey: 'text' });
  assertSourceFoldingDisabled('src/model/nodes/PromptNode.ts', { label: 'Prompt Text' });
  assertSourceFoldingDisabled('src/model/nodes/CommentNode.ts', { dataKey: 'text' });
  assertSourceFoldingDisabled('src/model/nodes/ExtractObjectPathNode.ts', { label: 'Path' });
  assertSourceFoldingDisabled('src/model/nodes/ExtractYamlNode.ts', { label: 'Object Path' });
  assertSourceFoldingDisabled('src/model/nodes/ExtractRegexNode.ts', { label: 'Regex' });
  assertSourceFoldingDisabled('src/plugins/openai/nodes/CreateAssistantNode.ts', { label: 'Instructions' });
  assertSourceFoldingDisabled('src/plugins/openai/nodes/RunThreadNode.ts', { label: 'Instructions' });
  assertSourceFoldingDisabled('src/plugins/openai/nodes/ThreadMessageNode.ts', { dataKey: 'text' });
});
