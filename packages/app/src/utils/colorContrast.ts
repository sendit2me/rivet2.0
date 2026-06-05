export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export const CONTRAST_FOREGROUND_DARK = '#000';
export const CONTRAST_FOREGROUND_LIGHT = '#fff';

const HEX_COLOR_PATTERN = /^#(?<hex>[0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR_NUMBER_PATTERN = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const RGB_COLOR_PATTERN = new RegExp(
  `^rgba?\\(\\s*(?<r>${RGB_COLOR_NUMBER_PATTERN})\\s*,\\s*(?<g>${RGB_COLOR_NUMBER_PATTERN})\\s*,\\s*(?<b>${RGB_COLOR_NUMBER_PATTERN})(?:\\s*,\\s*${RGB_COLOR_NUMBER_PATTERN})?\\s*\\)$`,
  'i',
);

export function getContrastingMonochromeColor(color: RgbColor): typeof CONTRAST_FOREGROUND_DARK | typeof CONTRAST_FOREGROUND_LIGHT {
  const blackContrast = getContrastRatio({ r: 0, g: 0, b: 0 }, color);
  const whiteContrast = getContrastRatio({ r: 255, g: 255, b: 255 }, color);

  return blackContrast >= whiteContrast ? CONTRAST_FOREGROUND_DARK : CONTRAST_FOREGROUND_LIGHT;
}

export function getContrastingMonochromeColorForCssColor(
  color: string,
  fallback: string,
): typeof CONTRAST_FOREGROUND_DARK | typeof CONTRAST_FOREGROUND_LIGHT | string {
  const parsedColor = parseCssColorLiteral(color);

  return parsedColor ? getContrastingMonochromeColor(parsedColor) : fallback;
}

export function parseCssColorLiteral(color: string): RgbColor | undefined {
  const normalizedColor = color.trim();
  const hexMatch = HEX_COLOR_PATTERN.exec(normalizedColor);

  if (hexMatch?.groups?.hex) {
    return parseHexColor(hexMatch.groups.hex);
  }

  const rgbMatch = RGB_COLOR_PATTERN.exec(normalizedColor);

  if (rgbMatch?.groups) {
    const groups = rgbMatch.groups as { r: string; g: string; b: string };

    return {
      r: clampColorChannel(Number.parseFloat(groups.r)),
      g: clampColorChannel(Number.parseFloat(groups.g)),
      b: clampColorChannel(Number.parseFloat(groups.b)),
    };
  }

  return undefined;
}

function getContrastRatio(foreground: RgbColor, background: RgbColor): number {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(color: RgbColor): number {
  const toLinearChannel = (channel: number) => {
    const normalizedChannel = clampColorChannel(channel) / 255;

    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinearChannel(color.r);
  const g = toLinearChannel(color.g);
  const b = toLinearChannel(color.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseHexColor(hex: string): RgbColor {
  const fullHex =
    hex.length === 3
      ? hex
          .split('')
          .map((character) => character + character)
          .join('')
      : hex;

  return {
    r: Number.parseInt(fullHex.slice(0, 2), 16),
    g: Number.parseInt(fullHex.slice(2, 4), 16),
    b: Number.parseInt(fullHex.slice(4, 6), 16),
  };
}

function clampColorChannel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(255, Math.max(0, Math.round(value)));
}
