export const DEFAULT_MONACO_THEME = 'vs-dark';
const VS_DARK_FOREGROUND = '#d4d4d4';
const VS_LIGHT_FOREGROUND = '#1d2733';

export function resolveMonacoTheme(theme: string | undefined, appTheme: string | undefined): string | undefined {
  return theme === 'prompt-interpolation' && appTheme ? `prompt-interpolation-${appTheme}` : theme;
}

function getDefaultMonacoTheme(appTheme: string | undefined): string {
  return appTheme === 'bright' ? 'vs' : DEFAULT_MONACO_THEME;
}

export function resolveMonacoDisplayTheme(theme: string | undefined, appTheme: string | undefined): string {
  const resolvedTheme = resolveMonacoTheme(theme, appTheme);

  if (appTheme === 'bright' && resolvedTheme === DEFAULT_MONACO_THEME) {
    return 'vs';
  }

  return resolvedTheme ?? getDefaultMonacoTheme(appTheme);
}

export function resolveMonacoForeground(theme: string | undefined, appTheme: string | undefined): string | undefined {
  const resolvedTheme = resolveMonacoDisplayTheme(theme, appTheme);

  if (resolvedTheme === 'vs' || resolvedTheme === 'prompt-interpolation-bright') {
    return VS_LIGHT_FOREGROUND;
  }

  if (resolvedTheme === DEFAULT_MONACO_THEME || resolvedTheme.startsWith('prompt-interpolation-')) {
    return VS_DARK_FOREGROUND;
  }

  return undefined;
}
