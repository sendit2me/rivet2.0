import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from 'jotai/vanilla';
import {
  clampCanvasBackgroundPatternOpacity,
  DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY,
  DEFAULT_CANVAS_BACKGROUND_CUSTOM_COLOR,
  formatCanvasBackgroundCustomColor,
  getCanvasBackgroundColor,
  MAX_CANVAS_BACKGROUND_PATTERN_OPACITY,
  MIN_CANVAS_BACKGROUND_PATTERN_OPACITY,
  defaultExecutorState,
  getExecutorOptions,
  getStartupDefaultExecutor,
  normalizeCanvasBackgroundCustomColor,
  parseCanvasBackgroundCustomColor,
  resolveCanvasBackgroundColorMode,
  resolveCanvasBackgroundPattern,
  resolveEditorPreferences,
  selectedExecutorState,
} from './settings.js';
import { memoryStorage } from './storage.js';

function restoreRecoilPersistStorage(previousStorage: unknown) {
  if (previousStorage === undefined) {
    memoryStorage.delete('recoil-persist');
  } else {
    memoryStorage.set('recoil-persist', previousStorage);
  }
}

test('resolveEditorPreferences applies editor defaults when settings are missing', () => {
  assert.deepEqual(resolveEditorPreferences(undefined), {
    applyDefaultNodeColors: false,
    openNodeSettingsOnCreate: true,
  });
  assert.deepEqual(resolveEditorPreferences({}), {
    applyDefaultNodeColors: false,
    openNodeSettingsOnCreate: true,
  });
});

test('resolveEditorPreferences respects explicit editor settings', () => {
  assert.deepEqual(
    resolveEditorPreferences({
      defaultNodeColors: true,
      openNodeSettingsOnCreate: false,
    }),
    {
      applyDefaultNodeColors: true,
      openNodeSettingsOnCreate: false,
    },
  );
});

test('selectedExecutorState snapshots the startup default after it is set', () => {
  const previousStorage = memoryStorage.get('recoil-persist');
  const store = createStore();

  try {
    store.set(defaultExecutorState, 'nodejs');
    assert.equal(store.get(selectedExecutorState), 'nodejs');

    store.set(selectedExecutorState, store.get(selectedExecutorState));
    store.set(defaultExecutorState, 'browser');

    assert.equal(store.get(selectedExecutorState), 'nodejs');
  } finally {
    restoreRecoilPersistStorage(previousStorage);
  }
});

test('selectedExecutorState reads the persisted startup default from preloaded storage', () => {
  const previousStorage = memoryStorage.get('recoil-persist');

  try {
    memoryStorage.set('recoil-persist', {
      ...(previousStorage ?? {}),
      defaultExecutor: 'nodejs',
    });

    const store = createStore();

    assert.equal(getStartupDefaultExecutor(), 'nodejs');
    assert.equal(store.get(selectedExecutorState), 'nodejs');
  } finally {
    restoreRecoilPersistStorage(previousStorage);
  }
});

test('selectedExecutorState falls back to Browser for invalid persisted startup defaults', () => {
  const previousStorage = memoryStorage.get('recoil-persist');

  try {
    memoryStorage.set('recoil-persist', {
      ...(previousStorage ?? {}),
      defaultExecutor: 'bad-executor',
    });

    const store = createStore();

    assert.equal(getStartupDefaultExecutor(), 'browser');
    assert.equal(store.get(selectedExecutorState), 'browser');
  } finally {
    restoreRecoilPersistStorage(previousStorage);
  }
});

test('getExecutorOptions exposes Node in desktop and hosted internal-executor shells', () => {
  assert.deepEqual(getExecutorOptions({ isDesktop: false, hasInternalExecutorUrl: false }), [
    { label: 'Browser', value: 'browser' },
  ]);

  assert.deepEqual(getExecutorOptions({ isDesktop: true, hasInternalExecutorUrl: false }), [
    { label: 'Browser', value: 'browser' },
    { label: 'Node', value: 'nodejs' },
  ]);

  assert.deepEqual(getExecutorOptions({ isDesktop: false, hasInternalExecutorUrl: true }), [
    { label: 'Browser', value: 'browser' },
    { label: 'Node', value: 'nodejs' },
  ]);
});

test('resolveCanvasBackgroundPattern falls back to grid for invalid stored values', () => {
  assert.equal(resolveCanvasBackgroundPattern('grid'), 'grid');
  assert.equal(resolveCanvasBackgroundPattern('dots'), 'dots');
  assert.equal(resolveCanvasBackgroundPattern('crosses'), 'crosses');
  assert.equal(resolveCanvasBackgroundPattern('bad-pattern'), 'grid');
  assert.equal(resolveCanvasBackgroundPattern(undefined), 'grid');
});

test('resolveCanvasBackgroundColorMode falls back to grey for invalid stored values', () => {
  assert.equal(resolveCanvasBackgroundColorMode('grey'), 'grey');
  assert.equal(resolveCanvasBackgroundColorMode('black'), 'black');
  assert.equal(resolveCanvasBackgroundColorMode('custom'), 'custom');
  assert.equal(resolveCanvasBackgroundColorMode('bad-color'), 'grey');
  assert.equal(resolveCanvasBackgroundColorMode(undefined), 'grey');
});

test('canvas background custom color parsing produces safe rgba values', () => {
  assert.deepEqual(parseCanvasBackgroundCustomColor('rgba(10,20,30,0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseCanvasBackgroundCustomColor('rgba(999,-2,20,2)'), { r: 255, g: 0, b: 20, a: 1 });
  assert.equal(normalizeCanvasBackgroundCustomColor('rgba(12.4,20.6,30,0.33333)'), 'rgba(12,21,30,0.333)');
  assert.equal(normalizeCanvasBackgroundCustomColor('bad-color'), DEFAULT_CANVAS_BACKGROUND_CUSTOM_COLOR);
  assert.equal(formatCanvasBackgroundCustomColor({ r: 260, g: -1, b: 12.4, a: 1.2 }), 'rgba(255,0,12,1)');
});

test('getCanvasBackgroundColor resolves preset and custom canvas colors', () => {
  assert.equal(getCanvasBackgroundColor({ mode: 'grey', customColor: 'rgba(1,2,3,1)' }), 'var(--grey-darker)');
  assert.equal(getCanvasBackgroundColor({ mode: 'black', customColor: 'rgba(1,2,3,1)' }), '#000000');
  assert.equal(getCanvasBackgroundColor({ mode: 'custom', customColor: 'rgba(1,2,3,0.4)' }), 'rgba(1,2,3,0.4)');
});

test('clampCanvasBackgroundPatternOpacity keeps canvas pattern opacity in range', () => {
  assert.equal(clampCanvasBackgroundPatternOpacity(0.04), 0.04);
  assert.equal(clampCanvasBackgroundPatternOpacity(-1), MIN_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(1), MAX_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(Number.NaN), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(Number.POSITIVE_INFINITY), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(null), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity('0.04'), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
});
