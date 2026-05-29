export function isWindowsPlatform(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Windows|Win32|Win64|WOW64/i.test(`${navigator.userAgent} ${navigator.platform}`)
  );
}
