import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global Error Handler for debugging white screens
window.addEventListener('error', (event) => {
  const errorBox = document.createElement('div');
  Object.assign(errorBox.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    padding: '20px',
    backgroundColor: '#ef4444',
    color: 'white',
    zIndex: '99999',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap'
  });
  errorBox.textContent = `Runtime Error: ${event.message}\nAt: ${event.filename}:${event.lineno}`;
  document.body.appendChild(errorBox);
});

// Catch unhandled promise rejections (e.g. async errors)
window.addEventListener('unhandledrejection', (event) => {
    const errorBox = document.createElement('div');
    Object.assign(errorBox.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      width: '100%',
      padding: '20px',
      backgroundColor: '#f97316',
      color: 'white',
      zIndex: '99999',
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap'
    });
    errorBox.textContent = `Unhandled Promise Rejection: ${event.reason}`;
    document.body.appendChild(errorBox);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);