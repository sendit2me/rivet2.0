import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = dirname(fileURLToPath(import.meta.url));

test('host.css owns the shared reset used by standalone and embedded app mounts', () => {
  const hostCss = readFileSync(join(srcDir, 'host.css'), 'utf8');
  const appTsx = readFileSync(join(srcDir, 'App.tsx'), 'utf8');

  const colorsImportIndex = hostCss.indexOf("@import './colors.css';");
  const resetImportIndex = hostCss.indexOf("@import '@atlaskit/css-reset';");

  assert.ok(colorsImportIndex >= 0, 'host.css should import app colors before the shared reset');
  assert.ok(resetImportIndex > colorsImportIndex, 'host.css should import the shared reset after app styles');
  assert.match(hostCss.slice(resetImportIndex), /body,[\s\S]*font-family: var\(--font-family\);/);
  assert.match(hostCss.slice(resetImportIndex), /code,[\s\S]*font-family: var\(--font-family-monospace\);/);
  assert.doesNotMatch(appTsx, /@atlaskit\/css-reset/);
});

test('rendered Markdown output uses Rivet typography tokens', () => {
  const indexCss = readFileSync(join(srcDir, 'index.css'), 'utf8');

  assert.match(indexCss, /\.rivet-markdown-output\.markdown-body\s*{[\s\S]*font-family: var\(--font-family\);/);
  assert.match(
    indexCss,
    /\.rivet-markdown-output\.markdown-body code,[\s\S]*font-family: var\(--font-family-monospace\);/,
  );
});

test('app font loading and global code typography stay on Rivet font tokens', () => {
  const indexCss = readFileSync(join(srcDir, 'index.css'), 'utf8');
  const indexHtml = readFileSync(join(srcDir, '..', 'index.html'), 'utf8');

  assert.match(indexHtml, /family=Roboto:wght@300;400;500;700;900&family=Roboto\+Mono&display=swap/);
  assert.match(indexCss, /code\s*{[\s\S]*font-family: var\(--font-family-monospace\);/);
  assert.doesNotMatch(indexCss, /source-code-pro|Menlo|Monaco|Consolas|'Courier New'/);
});

test('app root is locked to the iframe viewport', () => {
  const appSource = readFileSync(join(srcDir, 'components', 'RivetApp.tsx'), 'utf8');
  const hostCss = readFileSync(join(srcDir, 'host.css'), 'utf8');
  const resetImportIndex = hostCss.indexOf("@import '@atlaskit/css-reset';");
  assert.ok(resetImportIndex >= 0, 'host.css should import the Atlaskit reset before reasserting the viewport lock');

  const postResetCss = hostCss.slice(resetImportIndex);

  assert.match(postResetCss, /html,\s*body\s*{[\s\S]*width: 100%;[\s\S]*height: 100%;[\s\S]*overflow: hidden;/);
  assert.match(appSource, /const styles = css`[\s\S]*position: fixed;[\s\S]*inset: 0;/);
  assert.match(appSource, /const styles = css`[\s\S]*width: 100%;[\s\S]*height: 100%;/);
});

test('portal typography tokens keep popup surfaces on Rivet fonts', () => {
  const hostCss = readFileSync(join(srcDir, 'host.css'), 'utf8');
  const indexCss = readFileSync(join(srcDir, 'index.css'), 'utf8');

  for (const token of [
    '--ds-font-family-body: var(--font-family);',
    '--ds-font-family-heading: var(--font-family);',
    '--ds-font-family-sans: var(--font-family);',
    '--ds-font-family-brand: var(--font-family);',
    '--ds-font-family-code: var(--font-family-monospace);',
    '--ds-font-family-monospace: var(--font-family-monospace);',
    '--ds-font-heading-xxsmall:',
    '--ds-font-label:',
    '--ds-surface-overlay: var(--grey-dark-colorish);',
    '--ds-border: var(--settings-collapsible-border);',
    '--ds-shadow-overlay: 0 0 0 1px var(--settings-collapsible-border), 0 2px 1px var(--shadow),',
    '--toastify-font-family: var(--font-family);',
  ]) {
    assert.ok(indexCss.includes(token), `index.css should define ${token}`);
  }

  const resetImportIndex = hostCss.indexOf("@import '@atlaskit/css-reset';");
  const postResetCss = hostCss.slice(resetImportIndex);

  assert.match(postResetCss, /\.atlaskit-portal,[\s\S]*\.atlaskit-portal-container\s*{/);
  assert.match(postResetCss, /--ds-font-family-heading: var\(--font-family\);/);
  assert.match(postResetCss, /--ds-font-heading-xxsmall:[\s\S]*var\(--ds-font-family-heading, var\(--font-family\)\)/);
  assert.match(postResetCss, /--ds-font-label:[\s\S]*var\(--label-font-family,/);
  assert.match(postResetCss, /--ds-surface-overlay: var\(--grey-dark-colorish\);/);
  assert.match(postResetCss, /--ds-border: var\(--settings-collapsible-border\);/);
  assert.match(postResetCss, /--ds-shadow-overlay: 0 0 0 1px var\(--settings-collapsible-border\),/);
  assert.match(postResetCss, /--toastify-font-family: var\(--font-family\);/);
});

test('app rounded surfaces keep squircle geometry with plain-radius fallback', () => {
  const indexCss = readFileSync(join(srcDir, 'index.css'), 'utf8');
  const nodeStyles = readFileSync(join(srcDir, 'components', 'nodeStyles.ts'), 'utf8');

  assert.match(indexCss, /button\s*{[\s\S]*border-radius: var\(--ui-button-radius\);[\s\S]*corner-shape: squircle;/);
  assert.match(
    indexCss,
    /@supports not \(corner-shape: squircle\)\s*{[\s\S]*--ui-button-radius: calc\(5px \* var\(--ui-font-scale\)\);[\s\S]*--ui-button-radius-sm: calc\(4px \* var\(--ui-font-scale\)\);/,
  );
  assert.match(nodeStyles, /--node-card-radius: calc\(20px \* var\(--ui-font-scale\)\);/);
  assert.match(
    nodeStyles,
    /@supports not \(corner-shape: squircle\)\s*{[\s\S]*--node-card-radius: calc\(10px \* var\(--ui-font-scale\)\);/,
  );
});
