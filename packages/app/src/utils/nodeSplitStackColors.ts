export type SplitStackGhostColors = {
  frontBackground: string;
  backBackground: string;
};

const DARK_NODE_BACKGROUNDS = new Set([
  'var(--node-color-0)',
  'var(--node-color-8)',
  'var(--node-color-9)',
  'var(--grey-darkish)',
  'var(--grey-dark)',
  'var(--grey-darker)',
  'var(--grey-darkest)',
]);

const BRIGHT_NODE_BACKGROUNDS = new Set([
  'var(--node-color-1)',
  'var(--node-color-3)',
  'var(--node-color-4)',
  'var(--node-color-5)',
  'var(--node-color-6)',
  'var(--node-color-7)',
]);

function mixWithWhite(sourceColor: string, sourcePercent: number): string {
  const whitePercent = 100 - sourcePercent;
  return `color-mix(in srgb, ${sourceColor} ${sourcePercent}%, white ${whitePercent}%)`;
}

function getLiftProfile(nodeBackground: string) {
  if (DARK_NODE_BACKGROUNDS.has(nodeBackground)) {
    return { frontPercent: 68, backPercent: 58 };
  }

  if (BRIGHT_NODE_BACKGROUNDS.has(nodeBackground)) {
    return { frontPercent: 92, backPercent: 86 };
  }

  return { frontPercent: 82, backPercent: 72 };
}

export function getSplitStackGhostColors(nodeBackground: string): SplitStackGhostColors {
  const normalizedBackground = nodeBackground.trim();
  const { frontPercent, backPercent } = getLiftProfile(normalizedBackground);

  return {
    frontBackground: mixWithWhite(normalizedBackground, frontPercent),
    backBackground: mixWithWhite(normalizedBackground, backPercent),
  };
}
