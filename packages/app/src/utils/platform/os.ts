export function isWindowsPlatform(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Windows|Win32|Win64|WOW64/i.test(`${navigator.userAgent} ${navigator.platform}`)
  );
}

export function isMacOSPlatform(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Macintosh|MacIntel|MacPPC|Mac68K|Mac OS X/i.test(`${navigator.userAgent} ${navigator.platform}`)
  );
}
