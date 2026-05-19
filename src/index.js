import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Set body height to window.innerHeight directly. On iOS standalone PWAs, the
// CSS 100dvh / 100svh / 100lvh values can disagree with what the browser
// reports as window.innerHeight — usually dvh comes back smaller than the
// actually visible viewport, which leaves the bottom nav floating above the
// screen edge. Using innerHeight as the source of truth bypasses that.
if (typeof window !== 'undefined') {
  const setBodyHeight = () => {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
    if (h > 0 && document.body) {
      document.body.style.height = h + 'px';
    }
  };
  setBodyHeight();
  // Re-apply once DOM is fully parsed in case body wasn't yet available.
  if (document.readyState !== 'complete') {
    window.addEventListener('DOMContentLoaded', setBodyHeight, { once: true });
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
