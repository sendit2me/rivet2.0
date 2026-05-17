import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('fullscreen object output wraps colorized JSON at word boundaries', () => {
  const nodeFullscreenOutputSource = readFileSync(
    join(componentsDir, 'nodeOutput', 'NodeFullscreenOutput.tsx'),
    'utf8',
  );
  const scalarRenderersSource = readFileSync(
    join(componentsDir, 'renderDataValue', 'createScalarRenderers.tsx'),
    'utf8',
  );
  const largeStoredValuePreviewSource = readFileSync(
    join(componentsDir, 'renderDataValue', 'LargeStoredValuePreview.tsx'),
    'utf8',
  );

  const fullscreenObjectWrapBlock =
    /\.fullscreen-output-body\.wrap-lines \.rendered-object-type pre \{(?<styles>[\s\S]*?)\n  \}/.exec(
      nodeFullscreenOutputSource,
    )?.groups?.styles;
  const largeStoredWrapBlock =
    /\.fullscreen-output-body\.wrap-lines & \.json-preview-content pre \{(?<styles>[\s\S]*?)\n  \}/.exec(
      largeStoredValuePreviewSource,
    )?.groups?.styles;

  assert.ok(fullscreenObjectWrapBlock, 'Expected dedicated fullscreen wrapping styles for rendered object output');
  assert.match(fullscreenObjectWrapBlock, /white-space: pre-wrap;/);
  assert.match(fullscreenObjectWrapBlock, /overflow-wrap: break-word;/);
  assert.match(fullscreenObjectWrapBlock, /word-break: normal;/);
  assert.doesNotMatch(fullscreenObjectWrapBlock, /overflow-wrap:\s*anywhere;/);

  assert.match(scalarRenderersSource, /<ColorizedPreformattedText text=\{stringified\} language="json" wrapWords \/>/);

  assert.match(largeStoredValuePreviewSource, /\.json-preview-content pre \{/);
  assert.ok(largeStoredWrapBlock, 'Expected dedicated fullscreen wrapping styles for large stored JSON previews');
  assert.match(largeStoredWrapBlock, /overflow-wrap: break-word;/);
  assert.match(largeStoredWrapBlock, /word-break: normal;/);
  assert.doesNotMatch(largeStoredWrapBlock, /overflow-wrap:\s*anywhere;/);
  assert.match(
    largeStoredValuePreviewSource,
    /<div className="json-preview-content">\s*<ColorizedPreformattedText text=\{activeChunkText \?\? ''\} language="json" wrapWords \/>/,
  );
});
