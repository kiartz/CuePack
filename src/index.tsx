import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Auto-reload once when a new deployment on Vercel invalidates old asset hashes (404 on chunk load)
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const lastReload = sessionStorage.getItem('cuepack_chunk_reload');
  const now = Date.now();
  if (!lastReload || now - Number(lastReload) > 10000) {
    sessionStorage.setItem('cuepack_chunk_reload', String(now));
    window.location.reload();
  }
});

// Global Error Handler for debugging white screens
window.addEventListener('error', (event) => {
  const msg = String(event.message || '');
  if (msg.includes('ResizeObserver loop')) return;
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    const lastReload = sessionStorage.getItem('cuepack_chunk_reload');
    const now = Date.now();
    if (!lastReload || now - Number(lastReload) > 10000) {
      sessionStorage.setItem('cuepack_chunk_reload', String(now));
      window.location.reload();
    }
    return;
  }
  console.error('Runtime Error:', event.message, event.filename, event.lineno);
});

// Catch unhandled promise rejections (e.g. async errors)
window.addEventListener('unhandledrejection', (event) => {
  const reason = String(event.reason || '');
  if (reason.includes('Failed to fetch dynamically imported module') || reason.includes('Importing a module script failed')) {
    event.preventDefault();
    const lastReload = sessionStorage.getItem('cuepack_chunk_reload');
    const now = Date.now();
    if (!lastReload || now - Number(lastReload) > 10000) {
      sessionStorage.setItem('cuepack_chunk_reload', String(now));
      window.location.reload();
    }
    return;
  }
  console.error('Unhandled Promise Rejection:', event.reason);
});

import { ThemeProvider } from './context/ThemeContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);