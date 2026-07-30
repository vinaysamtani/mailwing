'use strict';

// Toolbar controller for the in-app browser window. Page content lives in a
// BrowserView below this document, so every action here is an IPC round-trip
// to inAppBrowser.js rather than something we can do locally.

const backBtn     = document.getElementById('back');
const forwardBtn  = document.getElementById('forward');
const reloadBtn   = document.getElementById('reload');
const reloadIcon  = document.getElementById('reload-icon');
const urlBox      = document.getElementById('url');
const urlOrigin   = document.getElementById('url-origin');
const urlRest     = document.getElementById('url-rest');
const externalBtn = document.getElementById('open-external');

let loading = false;

backBtn.addEventListener('click',    () => window.mailwingBrowser.back());
forwardBtn.addEventListener('click', () => window.mailwingBrowser.forward());
externalBtn.addEventListener('click', () => window.mailwingBrowser.openExternal());

// Doubles as stop while a page is in flight — same affordance the OS browsers use.
reloadBtn.addEventListener('click', () => {
  if (loading) window.mailwingBrowser.stop();
  else         window.mailwingBrowser.reload();
});

/**
 * Split the URL so the origin can be emphasised and the path muted. A long
 * path shouldn't be able to push the real host out of sight.
 */
function renderUrl(rawUrl) {
  urlBox.title = rawUrl || '';

  if (!rawUrl) {
    urlOrigin.textContent = '';
    urlRest.textContent   = '';
    return;
  }

  try {
    const parsed = new URL(rawUrl);
    // Strip the scheme for a cleaner read; keep it for non-http(s) so the user
    // can still tell a file:// or data: URL apart from a website.
    const isWeb = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    urlOrigin.textContent = isWeb ? parsed.host : `${parsed.protocol}//${parsed.host}`;
    urlRest.textContent   = parsed.pathname === '/' && !parsed.search && !parsed.hash
      ? ''
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    // Not parseable (about:blank, malformed) — show it verbatim rather than nothing.
    urlOrigin.textContent = '';
    urlRest.textContent   = rawUrl;
  }
}

window.mailwingBrowser.onState((state) => {
  if (!state) return;

  renderUrl(state.url);

  backBtn.disabled    = !state.canGoBack;
  forwardBtn.disabled = !state.canGoForward;

  loading = !!state.loading;
  reloadIcon.classList.toggle('loading', loading);
  reloadBtn.title      = loading ? 'Stop' : 'Reload';
  reloadBtn.setAttribute('aria-label', loading ? 'Stop' : 'Reload');
});
