'use strict';
// Runs before any page script in every BrowserView session.
// Forces document.visibilityState to 'visible' so that SPAs (Zoho Mail, etc.)
// do not suspend their initialisation loop when the view is off-screen.
try {
  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible',
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', {
    get: () => false,
    configurable: true,
  });
  // Suppress any visibilitychange events that could still fire
  document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
} catch (_e) { /* page may already have locked the property — silently skip */ }
