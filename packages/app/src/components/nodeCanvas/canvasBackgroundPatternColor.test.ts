import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const nodeCanvasDir = dirname(fileURLToPath(import.meta.url));
const appSrcDir = resolve(nodeCanvasDir, '..', '..');

test('canvas background pattern color is independent from theme changes', () => {
  const colorsCss = readFileSync(join(appSrcDir, 'colors.css'), 'utf8');
  const canvasBackgroundPatternSource = readFileSync(join(nodeCanvasDir, 'CanvasBackgroundPattern.tsx'), 'utf8');

  assert.equal(colorsCss.match(/--canvas-background-pattern-rgb:/g)?.length, 1);
  assert.equal(colorsCss.match(/--canvas-background-theme-color:/g)?.length, 1);
  assert.match(
    colorsCss,
    /--canvas-background-theme-color: color-mix\(in srgb, var\(--primary\) [^,]+, var\(--neutral-grey-[^)]+\) [^)]+\);/,
  );
  assert.doesNotMatch(colorsCss, /\.theme-[\s\S]*--canvas-background-pattern-rgb:/);
  assert.doesNotMatch(canvasBackgroundPatternSource, /themeState/);
  assert.doesNotMatch(canvasBackgroundPatternSource, /useAtomValue/);
});
