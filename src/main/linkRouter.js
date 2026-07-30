'use strict';

const { shell } = require('electron');

const settings     = require('./settings');
const inAppBrowser = require('./inAppBrowser');

/**
 * One place that decides where a link opens.
 *
 * Three outcomes:
 *   1. in-app domain  → stays in Mailwing on the account's session, as a real
 *                       Electron popup so window.opener survives (OAuth and
 *                       passkey flows depend on it). Never user-configurable —
 *                       handing these to the OS browser breaks sign-in.
 *   2. everything else → the user's linkTarget preference: the OS browser
 *                       (default) or a Mailwing browser window.
 *   3. non-http(s)     → always the OS, which owns mailto:, tel:, and friends.
 */

/** Host matches the domain itself or any subdomain of it. */
function matchesDomain(hostname, domains) {
  if (!hostname || !Array.isArray(domains)) return false;
  return domains.some(d => hostname === d || hostname.endsWith('.' + d));
}

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function isWebUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch { return false; }
}

/** Should this URL be kept inside Mailwing on the account's session? */
function isInAppLink(url, domains) {
  const host = hostnameOf(url);
  if (!host) return false;
  return matchesDomain(host, domains);
}

function openInSystemBrowser(url) {
  if (!url) return;
  shell.openExternal(url).catch(() => {});
}

function openInBrowserWindow(url, opts = {}) {
  if (!url) return;
  // inAppBrowser bounces non-web schemes to the OS itself.
  inAppBrowser.open(url, opts);
}

/**
 * Open a link that is NOT an in-app domain, honouring the user's preference.
 *
 * @param {string} url
 * @param {object} [opts] forwarded to inAppBrowser.open ({ session, partition, parent })
 */
function openExternalLink(url, opts = {}) {
  if (!url) return;

  // Let the OS handle mailto:, tel:, msteams:, etc. Our browser window only
  // ever loads http(s).
  if (!isWebUrl(url)) {
    openInSystemBrowser(url);
    return;
  }

  if (settings.getLinkTarget() === settings.LINK_TARGET_APP) {
    openInBrowserWindow(url, opts);
  } else {
    openInSystemBrowser(url);
  }
}

/**
 * Build a setWindowOpenHandler for a view/window that belongs to an account or
 * app. In-app domains are allowed through as real popups on `partition`;
 * everything else is denied and routed by preference.
 *
 * @param {object} cfg
 * @param {string[]} cfg.inAppDomains domains that must stay in-app
 * @param {string}   cfg.partition    partition for allowed popups
 * @param {function} [cfg.getParent]  () => BrowserWindow, to position new windows
 * @param {Electron.Session} [cfg.session] session for Mailwing browser windows
 */
function makeWindowOpenHandler({ inAppDomains, partition, getParent, session }) {
  return ({ url }) => {
    if (isInAppLink(url, inAppDomains)) {
      // Allow in-app with the same isolated session so auth state is shared.
      // Use the partition string rather than a session instance — Electron's
      // setWindowOpenHandler propagates `partition` more reliably through
      // overrideBrowserWindowOptions than a `session` reference, which fixes
      // calendar-invite RSVP popups re-prompting for login.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: {
            partition,
            contextIsolation: true,
            nodeIntegration:  false,
          },
        },
      };
    }

    openExternalLink(url, {
      session,
      partition,
      parent: typeof getParent === 'function' ? getParent() : undefined,
    });
    return { action: 'deny' };
  };
}

/**
 * Guard in-place navigation. A link without target="_blank" would otherwise
 * navigate the mailbox view itself away from the inbox — and with no back
 * button in the main window, the only way back is restarting the app.
 *
 * Navigation is allowed to stay in place only within the provider's own
 * infrastructure (`allowedDomains`, normally safeDomains); anything else is
 * cancelled and routed like any other link.
 *
 * @param {Electron.WebContents} webContents
 * @param {object} cfg
 * @param {string[]} cfg.allowedDomains hosts the view may navigate to in place
 * @param {string}   [cfg.partition]
 * @param {Electron.Session} [cfg.session]
 * @param {function} [cfg.getParent]
 */
function guardNavigation(webContents, { allowedDomains, partition, session, getParent }) {
  if (!webContents || webContents.isDestroyed()) return;

  webContents.on('will-navigate', (event, url) => {
    // about:blank and in-page anchors aren't real departures.
    if (!isWebUrl(url)) return;

    const host = hostnameOf(url);
    if (host && matchesDomain(host, allowedDomains)) return; // provider's own pages

    event.preventDefault();
    openExternalLink(url, {
      session,
      partition,
      parent: typeof getParent === 'function' ? getParent() : undefined,
    });
  });
}

module.exports = {
  matchesDomain,
  isInAppLink,
  openExternalLink,
  openInSystemBrowser,
  openInBrowserWindow,
  makeWindowOpenHandler,
  guardNavigation,
};
