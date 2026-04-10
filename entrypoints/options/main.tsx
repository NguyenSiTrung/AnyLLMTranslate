import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

// Ensure minimum window size for options page
const ensureMinimumSize = () => {
  const minWidth = 1000;
  const minHeight = 700;
  
  if (window.innerWidth < minWidth || window.innerHeight < minHeight) {
    // Try to resize the window if we have permission
    if (chrome.windows && chrome.windows.update) {
      chrome.windows.getCurrent((currentWindow) => {
        if (currentWindow && currentWindow.id) {
          chrome.windows.update(currentWindow.id, {
            width: Math.max(currentWindow.width || minWidth, minWidth),
            height: Math.max(currentWindow.height || minHeight, minHeight),
          });
        }
      });
    }
  }
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Check and resize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureMinimumSize);
} else {
  ensureMinimumSize();
}
