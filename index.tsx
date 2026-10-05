import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startAutoUpdate } from './lib/autoUpdate';
import { listenForInstall } from './lib/install';

startAutoUpdate();
listenForInstall();

// Service worker (offline fallback + Android install): only on the live site (https) or a local
// production preview, never in development where it would get in the way.
if ('serviceWorker' in navigator && !(import.meta as any).env?.DEV && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is optional */ }); });
}

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