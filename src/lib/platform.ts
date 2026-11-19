export type Platform = 'android' | 'mac' | 'ios' | 'windows' | 'linux' | 'other';
export type Browser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'samsung' | 'other';

export function detectPlatform(ua = navigator.userAgent): Platform {
  if (/android/i.test(ua)) return 'android';
  // iPadOS se présente comme un Mac : on le repère par l'écran tactile.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/macintosh|mac os x/i.test(ua)) return 'mac';
  if (/windows/i.test(ua)) return 'windows';
  if (/linux|cros/i.test(ua)) return 'linux';
  return 'other';
}

export function detectBrowser(ua = navigator.userAgent): Browser {
  if (/samsungbrowser/i.test(ua)) return 'samsung';
  if (/edg\//i.test(ua)) return 'edge';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/chrome|crios|chromium/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua)) return 'safari';
  return 'other';
}
