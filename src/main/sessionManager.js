'use strict';

const path    = require('path');
const { session } = require('electron');
const { adDomains } = require('./adBlockList');

const VISIBILITY_PRELOAD = path.join(__dirname, 'preload-visibility.js');

// Cache so we never create two sessions for the same account
const sessions = new Map();

/**
 * Returns (or creates) an Electron Session for a given account.
 * Each account gets its own persistent partition: persist:mailwing-{accountId}
 * This fully isolates cookies, localStorage, IndexedDB, and cache.
 *
 * @param {string} accountId
 * @param {object} providerConfig  Full provider entry from providers.js
 * @returns {Electron.Session}
 */
function getOrCreateSession(accountId, providerConfig) {
  if (sessions.has(accountId)) return sessions.get(accountId);

  const sess = session.fromPartition('persist:mailwing-' + accountId, { cache: true });

  // Force visibilityState = 'visible' in every page so SPAs don't suspend
  // when their BrowserView is off-screen.
  sess.setPreloads([VISIBILITY_PRELOAD]);

  // Microsoft auth detects the Electron UA string and may issue shorter-lived sessions.
  // Override with a plain Chrome UA so login persists normally across restarts.
  if (providerConfig && providerConfig.id === 'outlook') {
    sess.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    );
  }

  attachAdBlocker(sess, providerConfig);
  attachNotificationPermission(sess);

  sessions.set(accountId, sess);
  return sess;
}

/**
 * Block ad/tracker domains while allowing the provider's own domains.
 * Safe domains take precedence: if a URL's host matches a safe domain
 * it is always allowed, regardless of the ad-block list.
 */
function attachAdBlocker(sess, providerConfig) {
  const safeDomains = (providerConfig && providerConfig.safeDomains) || [];

  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    try {
      const host = new URL(details.url).hostname;

      const isSafe = safeDomains.some(d => host === d || host.endsWith('.' + d));
      if (isSafe) { callback({ cancel: false }); return; }

      const isAd = adDomains.some(d => host === d || host.endsWith('.' + d));
      callback({ cancel: isAd });
    } catch {
      callback({ cancel: false });
    }
  });

  // Strip X-Frame-Options and frame-restricting CSP from all responses.
  // Google (and other providers) set these on auth/cookie iframes, causing
  // ERR_BLOCKED_BY_RESPONSE and hanging the auth flow inside the BrowserView.
  sess.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    const headers = Object.assign({}, details.responseHeaders);
    // Headers may be lowercase or mixed-case depending on the server
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'x-frame-options') {
        delete headers[key];
      } else if (lower === 'content-security-policy') {
        // Remove only the frame-ancestors directive; leave the rest of the CSP intact
        headers[key] = headers[key].map(v =>
          v.replace(/frame-ancestors[^;]*(;|$)/gi, '').trim()
        );
      }
    }
    callback({ responseHeaders: headers });
  });
}

/**
 * Deny Web Notifications permission so Gmail/Zoho don't double-fire them.
 * We raise our own Electron-native Notification objects from the main process.
 * All other permissions (media, clipboard-read, etc.) are allowed.
 *
 * Also sets the synchronous pre-flight check handler required by Electron 33+
 * for WebAuthn/passkeys. Without setPermissionCheckHandler returning true for
 * publickey-credentials-*, Chromium blocks the WebAuthn call before the page
 * ever sees it and the passkey UI silently never appears.
 */
function attachNotificationPermission(sess) {
  sess.setPermissionRequestHandler((_webContents, permission, callback) => {
    // Explicit allow for WebAuthn / passkey ceremonies — documents intent and
    // survives any future change to the default. Note that on unsigned macOS
    // builds the ceremony will still fail at the OS level (see docs/GOTCHAS.md).
    if (permission === 'publickey-credentials-get' ||
        permission === 'publickey-credentials-create') {
      callback(true);
      return;
    }
    callback(permission !== 'notifications');
  });

  sess.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'publickey-credentials-get' ||
        permission === 'publickey-credentials-create') {
      return true;
    }
    return permission !== 'notifications';
  });
}

/** Remove a session from the cache (called when an account is deleted). */
function destroySession(accountId) {
  sessions.delete(accountId);
}

module.exports = { getOrCreateSession, destroySession };
