import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canStartWireDragFromPortLabel } from './Port.js';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('canStartWireDragFromPortLabel only allows wire starts from output labels', () => {
  assert.equal(canStartWireDragFromPortLabel(false), true);
  assert.equal(canStartWireDragFromPortLabel(true), false);
});

test('conditional node ports render without the redundant if label', () => {
  const portSource = readFileSync(join(componentsDir, 'Port.tsx'), 'utf8');
  const nodeStylesSource = readFileSync(join(componentsDir, 'nodeStyles.ts'), 'utf8');
  const normalNodeSource = readFileSync(join(componentsDir, 'visualNode', 'NormalVisualNodeContent.tsx'), 'utf8');
  const zoomedOutNodeSource = readFileSync(join(componentsDir, 'visualNode', 'ZoomedOutVisualNodeContent.tsx'), 'utf8');

  assert.match(portSource, /hideLabel = false/);
  assert.match(portSource, /!\s*hideLabel && \(/);
  assert.match(normalNodeSource, /title="if"[\s\S]*hideLabel[\s\S]*input/);
  assert.match(zoomedOutNodeSource, /title="if"[\s\S]*hideLabel[\s\S]*input/);
  assert.doesNotMatch(nodeStylesSource, /\.node\.conditional \.node-title/);
});
