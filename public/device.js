// Works out which "Get the app" steps fit the device and browser someone is holding. No imports, so the tests
// can run it in Node with a pretend user agent.
//   ios-safari   iPhone or iPad in Safari: Share, then Add to Home Screen
//   ios-chrome   iPhone or iPad in Chrome or Edge: their own Share button, then Add to Home Screen
//   ios-other    iPhone or iPad in an app's built-in browser (Facebook, Gmail, Google app...) or Firefox: open it in Safari first
//   android      Android phone or tablet: one Install button when the browser offers it, else the ⋮ menu
//   mac-safari   Safari on a Mac: File, then Add to Dock
//   desktop      Chrome or Edge on a computer: one Install button when offered, else the install icon in the address bar
//   none         a computer browser that can't install apps (Firefox): send it to the phone instead
export function deviceKind({ ua = '', platform = '', touchPoints = 0 } = {}) {
  const ipadAsMac = /Macintosh/.test(ua) && (platform === 'MacIntel' || !platform) && touchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || ipadAsMac) {
    if (/FBAN|FBAV|Instagram|Line\/|GSA\/|Snapchat|Pinterest|LinkedInApp|Twitter|MicroMessenger|FxiOS|DuckDuckGo/.test(ua)) return 'ios-other';
    if (/CriOS|EdgiOS/.test(ua)) return 'ios-chrome';
    if (/Safari\//.test(ua) || ipadAsMac) return 'ios-safari';
    return 'ios-other'; // a built-in browser with no name we know
  }
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|Firefox/.test(ua)) return 'mac-safari';
  if (/Chrome|Chromium|Edg\//.test(ua) && !/Firefox/.test(ua)) return 'desktop';
  return 'none';
}
export const isIOSKind = (k) => k.startsWith('ios');
export const isTablet = ({ ua = '', platform = '', touchPoints = 0 } = {}) => /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1) || (/Android/.test(ua) && !/Mobile/.test(ua));
// What to call the thing in their hand, so the steps read naturally.
export const deviceWord = (env) => { const k = deviceKind(env); if (isTablet(env)) return 'tablet'; if (k === 'desktop' || k === 'mac-safari' || k === 'none') return 'computer'; return 'phone'; };
// iOS 26 moved Safari's Share button behind the ••• button; older iPhones show Share at the bottom. Safari 26
// still says "OS 18_6" in its user agent, so its own "Version/26" comes first.
export const iosVersion = (ua = '') => { const m = /Version\/(\d+)/.exec(ua) || /OS (\d+)_/.exec(ua); return m ? Number(m[1]) : 0; };
// Whether to offer "Get the app" on this device. Never inside the app itself, never after "Not now", and
// never once this device is known to have the app: it opened from the icon, the browser said it installed,
// the browser lists it as installed, or (iPhone and iPad, whose app keeps its own storage) the board knows
// this browser's one-time code was used by the new app.
export const offerApp = ({ standalone = false, kind = 'none', noThanks = false, installed = false } = {}) => !standalone && kind !== 'none' && !noThanks && !installed;
