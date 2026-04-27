import type { CSSProperties } from 'react';

export const DEFAULT_UI_FONT_SIZE = 14;
export const MIN_UI_FONT_SIZE = 14;
export const MAX_UI_FONT_SIZE = 20;
export const UI_FONT_SIZE_STEP = 1;

export const UI_FONT_SIZE_TOKENS = {
  '--ui-font-size-2xs': 10,
  '--ui-font-size-xs': 11,
  '--ui-font-size-sm': 12,
  '--ui-font-size-compact': 13,
  '--ui-font-size-base': 14,
  '--ui-font-size-lg': 16,
  '--ui-font-size-xl': 20,
  '--ui-font-size-2xl': 24,
  '--ui-font-size-icon-xl': 32,
} as const;

export type UiFontSizeCssVariable = '--ui-font-scale' | keyof typeof UI_FONT_SIZE_TOKENS;

export type UiFontSizeCssVariables = CSSProperties & Record<UiFontSizeCssVariable, string>;

export function clampUiFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize)) {
    return DEFAULT_UI_FONT_SIZE;
  }

  return Math.min(MAX_UI_FONT_SIZE, Math.max(MIN_UI_FONT_SIZE, Math.round(fontSize)));
}

export function getUiFontScale(fontSize: number): number {
  return clampUiFontSize(fontSize) / DEFAULT_UI_FONT_SIZE;
}

export function getUiFontSizeCssVariables(fontSize: number): UiFontSizeCssVariables {
  const scale = getUiFontScale(fontSize);

  return Object.fromEntries([
    ['--ui-font-scale', String(scale)],
    ...Object.entries(UI_FONT_SIZE_TOKENS).map(([name, defaultSize]) => [
      name,
      `${Math.round(defaultSize * scale)}px`,
    ]),
  ]) as UiFontSizeCssVariables;
}
