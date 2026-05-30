import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// iOS standalone-PWA viewport quirk: window.innerHeight returns a stale value
// matching the Safari-with-toolbar-visible viewport even though the PWA has no
// toolbar, leaving a black gap below the bottom nav. On iOS standalone we use
// screen.height (orientation-aware) as an additional candidate and take the
// largest. On macOS / Windows desktop PWAs this same trick is harmful — the
// natural innerHeight already accounts for the dock / taskbar, so adding
// screen.height puts content behind the dock. So we gate the override to iOS
// only and leave desktop alone (browser layout handles it correctly).
function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS in 'Request Desktop Site' mode pretends to be a Mac. The giveaway
  // is touch capability — desktop Macs have 0–1 touch points.
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function computeBodyHeight() {
  if (typeof window === 'undefined') return 0;
  const cands = [
    window.visualViewport && window.visualViewport.height,
    window.innerHeight,
    document.documentElement && document.documentElement.clientHeight,
  ];
  const isStandalone =
    window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator && window.navigator.standalone === true;
  if (isStandalone && isIOSDevice() && window.screen) {
    const portrait =
      window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    const scH = portrait
      ? Math.max(window.screen.height || 0, window.screen.width || 0)
      : Math.min(window.screen.height || 0, window.screen.width || 0);
    cands.push(scH);
  }
  return Math.max(0, ...cands.filter((x) => typeof x === 'number' && x > 0));
}

if (typeof window !== 'undefined') {
  const apply = () => {
    // Only override body height on iOS — desktop browsers (including PWAs)
    // already compute the visible viewport correctly. Overriding on desktop
    // causes the body to extend behind the macOS Dock / Windows taskbar.
    if (!isIOSDevice()) return;
    const h = computeBodyHeight();
    if (h > 0 && document.body) {
      document.body.style.height = h + 'px';
    }
  };
  apply();
  if (document.readyState !== 'complete') {
    window.addEventListener('DOMContentLoaded', apply, { once: true });
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
