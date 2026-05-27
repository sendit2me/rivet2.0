import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from 'jotai/vanilla';
import {
  clampCanvasBackgroundPatternOpacity,
  DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY,
  MAX_CANVAS_BACKGROUND_PATTERN_OPACITY,
  MIN_CANVAS_BACKGROUND_PATTERN_OPACITY,
  defaultExecutorState,
  getExecutorOptions,
  getStartupDefaultExecutor,
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

test('clampCanvasBackgroundPatternOpacity keeps canvas pattern opacity in range', () => {
  assert.equal(clampCanvasBackgroundPatternOpacity(0.04), 0.04);
  assert.equal(clampCanvasBackgroundPatternOpacity(-1), MIN_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(1), MAX_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(Number.NaN), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(Number.POSITIVE_INFINITY), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity(null), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
  assert.equal(clampCanvasBackgroundPatternOpacity('0.04'), DEFAULT_CANVAS_BACKGROUND_PATTERN_OPACITY);
});
