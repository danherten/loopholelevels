import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Prime --vh-real before React mounts so first paint already has the correct
// visible-viewport height; without this the bottom nav can render at 100dvh's
// stale value and only correct itself after the first scroll on iOS.
if (typeof window !== 'undefined') {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
  if (h > 0) document.documentElement.style.setProperty('--vh-real', h + 'px');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
