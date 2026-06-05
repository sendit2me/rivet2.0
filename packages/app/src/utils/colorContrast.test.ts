import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTRAST_FOREGROUND_DARK,
  CONTRAST_FOREGROUND_LIGHT,
  getContrastingMonochromeColor,
  getContrastingMonochromeColorForCssColor,
  parseCssColorLiteral,
} from './colorContrast';

test('parseCssColorLiteral parses supported literal colors safely', () => {
  assert.deepEqual(parseCssColorLiteral('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseCssColorLiteral('#102030'), { r: 16, g: 32, b: 48 });
  assert.deepEqual(parseCssColorLiteral('rgb(1, 2.4, 300)'), { r: 1, g: 2, b: 255 });
  assert.deepEqual(parseCssColorLiteral('rgba(20, 30, 40, 0.4)'), { r: 20, g: 30, b: 40 });
  assert.equal(parseCssColorLiteral('var(--primary)'), undefined);
});

test('getContrastingMonochromeColor chooses the higher contrast black or white foreground', () => {
  assert.equal(getContrastingMonochromeColor({ r: 255, g: 153, b: 0 }), CONTRAST_FOREGROUND_DARK);
  assert.equal(getContrastingMonochromeColor({ r: 165, g: 95, b: 255 }), CONTRAST_FOREGROUND_DARK);
  assert.equal(getContrastingMonochromeColor({ r: 34, g: 34, b: 34 }), CONTRAST_FOREGROUND_LIGHT);
});

test('getContrastingMonochromeColorForCssColor falls back for non-literal css values', () => {
  assert.equal(getContrastingMonochromeColorForCssColor('#000', 'fallback'), CONTRAST_FOREGROUND_LIGHT);
  assert.equal(getContrastingMonochromeColorForCssColor('rgb(255, 255, 255)', 'fallback'), CONTRAST_FOREGROUND_DARK);
  assert.equal(getContrastingMonochromeColorForCssColor('var(--primary)', 'fallback'), 'fallback');
});
