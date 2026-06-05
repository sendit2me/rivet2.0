import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const componentsDir = dirname(fileURLToPath(import.meta.url));

test('SettingsModal uses independent viewport-capped column scrolling', () => {
  const source = readFileSync(join(componentsDir, 'SettingsModal.tsx'), 'utf8');
  const appModalHeaderSource = readFileSync(join(componentsDir, 'AppModalHeader.tsx'), 'utf8');

  assert.match(source, /const SETTINGS_MODAL_HEIGHT = 'calc\(100vh - 48px\)'/);
  assert.match(source, /height=\{SETTINGS_MODAL_HEIGHT\}/);
  assert.doesNotMatch(source, /height="80%"/);
  assert.match(source, /\.settings-modal-sidebar \{[\s\S]*--ds-surface: var\(--grey-dark-colorish\);/);
  assert.match(source, /\.settings-modal-sidebar \{[\s\S]*--ds-border-selected: var\(--primary\);/);
  assert.match(source, /\.settings-modal-sidebar \{[\s\S]*--ds-text-selected: var\(--primary\);/);
  assert.match(source, /\.settings-modal-sidebar \{[\s\S]*--ds-background-selected: color-mix\(in srgb, var\(--primary\) 12%, transparent\);/);
  assert.match(source, /\.settings-modal-sidebar \{[\s\S]*background-color: var\(--grey-dark-colorish\);/);
  assert.match(source, /\.settings-modal-sidebar \{[\s\S]*max-height: 100%;[\s\S]*overflow-x: hidden;[\s\S]*overflow-y: auto;/);
  assert.match(source, /\.settings-modal-sidebar > nav \{[\s\S]*background-color: var\(--grey-dark-colorish\);[\s\S]*overflow-x: hidden;/);
  assert.match(source, /> button span \{[\s\S]*overflow-x: hidden !important;[\s\S]*text-overflow: ellipsis;/);
  assert.match(source, /<aside className="settings-modal-sidebar">[\s\S]*<SideNavigation label="settings">/);
  assert.doesNotMatch(source, /<nav>\s*<SideNavigation/);
  assert.match(source, /main \{[\s\S]*height: 100%;[\s\S]*overflow: auto;/);
  assert.match(source, /main:not\(\.fill-page\) > \* \{[\s\S]*max-width: 850px;/);
  assert.match(source, /overflow: hidden;/);
  assert.doesNotMatch(appModalHeaderSource, /@atlaskit\/button/);
  assert.doesNotMatch(appModalHeaderSource, /appearance="link"/);
  assert.match(
    appModalHeaderSource,
    /<button type="button" css=\{modalHeaderCloseButtonStyles\} aria-label="Close modal" onClick=\{onClose\}>/,
  );
  assert.match(appModalHeaderSource, /const modalHeaderCloseButtonStyles = css`[\s\S]*color: var\(--primary\);/);
  assert.match(appModalHeaderSource, /&:hover,[\s\S]*&:focus-visible \{[\s\S]*color: var\(--primary-light\);/);
  assert.match(appModalHeaderSource, /<CrossIcon label="Close Modal" primaryColor="currentColor" \/>/);
});
