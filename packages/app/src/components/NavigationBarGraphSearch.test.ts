import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const navigationBarSource = readFileSync(new URL('./NavigationBar.tsx', import.meta.url), 'utf8');

test('graph search results render stats and mini node surfaces', () => {
  assert.match(navigationBarSource, /getGraphSearchStats\(searching\.matches\)/);
  assert.match(navigationBarSource, /className="search-results-summary"/);
  assert.match(navigationBarSource, /\.stopSearching \{[\s\S]*color: var\(--foreground\);/);
  assert.match(
    navigationBarSource,
    /\.stopSearching \{[\s\S]*&:hover \{[\s\S]*background: var\(--form-control-bg-hover\);[\s\S]*color: var\(--foreground-bright\);/,
  );

  const resultHeaderBlock = /\.search-result-row-header \{(?<styles>[\s\S]*?)\n    \}/.exec(navigationBarSource);
  const resultRowBlock = /\.search-result-row \{(?<styles>[\s\S]*?)\n    \}/.exec(navigationBarSource);
  const resultContentBlock = /\.search-result-content-snippets \{(?<styles>[\s\S]*?)\n    \}/.exec(navigationBarSource);

  assert.match(resultHeaderBlock?.groups?.styles ?? '', /background: var\(--node-color-0\);/);
  assert.match(resultRowBlock?.groups?.styles ?? '', /background: var\(--node-body-bg\);/);
  assert.match(resultContentBlock?.groups?.styles ?? '', /background: var\(--node-body-bg\);/);
});
