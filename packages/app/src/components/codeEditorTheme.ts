export function resolveMonacoTheme(theme: string | undefined, appTheme: string | undefined): string | undefined {
  return theme === 'prompt-interpolation' && appTheme ? `prompt-interpolation-${appTheme}` : theme;
}
