import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Calculate the correct body height. On iOS standalone PWA, window.innerHeight
// returns a stale value matching the Safari-with-toolbar-visible viewport even
// though the PWA has no toolbar — leaving a black gap below the bottom nav.
// In standalone mode we additionally consider screen.height (orientation-
// aware) as a candidate and take the largest one, which corrects the bug.
function computeBodyHeight() {
  if (typeof window === 'undefined') return 0;
  const isStandalone =
    window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator && window.navigator.standalone === true;
  const cands = [
    window.visualViewport && window.visualViewport.height,
    window.innerHeight,
    document.documentElement && document.documentElement.clientHeight,
  ];
  if (isStandalone && window.screen) {
    // screen.height is the device's portrait height regardless of orientation
    // in most webkit. Pick the orientation-appropriate dimension explicitly.
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
