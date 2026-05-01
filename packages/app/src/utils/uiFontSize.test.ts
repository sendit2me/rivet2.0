import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_UI_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  UI_FONT_SIZE_STEP,
  clampUiFontSize,
  getUiFontScale,
  getUiFontSizeCssVariables,
} from './uiFontSize.js';

test('clampUiFontSize normalizes invalid and out-of-range values', () => {
  assert.equal(clampUiFontSize(Number.NaN), DEFAULT_UI_FONT_SIZE);
  assert.equal(clampUiFontSize(Number.POSITIVE_INFINITY), DEFAULT_UI_FONT_SIZE);
  assert.equal(clampUiFontSize(MIN_UI_FONT_SIZE - 1), MIN_UI_FONT_SIZE);
  assert.equal(clampUiFontSize(MAX_UI_FONT_SIZE + 1), MAX_UI_FONT_SIZE);
  assert.equal(clampUiFontSize(14.4), 14);
  assert.equal(clampUiFontSize(14.5), 15);
});

test('UI font size constants keep the settings slider contract explicit', () => {
  assert.equal(DEFAULT_UI_FONT_SIZE, 14);
  assert.equal(MIN_UI_FONT_SIZE, 14);
  assert.equal(MAX_UI_FONT_SIZE, 20);
  assert.equal(UI_FONT_SIZE_STEP, 1);
});

test('getUiFontScale uses the clamped base font size', () => {
  assert.equal(getUiFontScale(DEFAULT_UI_FONT_SIZE), 1);
  assert.equal(getUiFontScale(MIN_UI_FONT_SIZE - 5), MIN_UI_FONT_SIZE / DEFAULT_UI_FONT_SIZE);
  assert.equal(getUiFontScale(MAX_UI_FONT_SIZE + 5), MAX_UI_FONT_SIZE / DEFAULT_UI_FONT_SIZE);
});

test('getUiFontSizeCssVariables returns the default token scale at 14px', () => {
  assert.deepEqual(getUiFontSizeCssVariables(DEFAULT_UI_FONT_SIZE), {
    '--ui-font-scale': '1',
    '--ui-font-size-2xs': '10px',
    '--ui-font-size-xs': '11px',
    '--ui-font-size-sm': '12px',
    '--ui-font-size-compact': '13px',
    '--ui-font-size-base': '14px',
    '--ui-font-size-lg': '16px',
    '--ui-font-size-xl': '20px',
    '--ui-font-size-2xl': '24px',
    '--ui-font-size-icon-xl': '32px',
  });
});

test('getUiFontSizeCssVariables scales tokens from the max base font size', () => {
  assert.deepEqual(getUiFontSizeCssVariables(20), {
    '--ui-font-scale': String(20 / 14),
    '--ui-font-size-2xs': '14px',
    '--ui-font-size-xs': '16px',
    '--ui-font-size-sm': '17px',
    '--ui-font-size-compact': '19px',
    '--ui-font-size-base': '20px',
    '--ui-font-size-lg': '23px',
    '--ui-font-size-xl': '29px',
    '--ui-font-size-2xl': '34px',
    '--ui-font-size-icon-xl': '46px',
  });
});
