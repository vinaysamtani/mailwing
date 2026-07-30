'use strict';

const { BrowserView, net, app } = require('electron');
const { PROVIDERS }        = require('../shared/providers');
const { APPS }             = require('../shared/apps');
const { SIDEBAR_WIDTH, IPC } = require('../shared/constants');
const sessionManager       = require('./sessionManager');
const appsManager          = require('./appsManager');
const notifications        = require('./notifications');
const contextMenu          = require('./contextMenu');
const linkRouter           = require('./linkRouter');

let accounts   = null; // set via init()
let mainWin    = null; // set via init()
let trayModule = null; // set via setTray() after tray is initialised

// Map from "accountId:serviceId" → BrowserView
const views = new Map();

// Unread counts per account (mail view only)
const unreadCounts = new Map();

// Currently visible view key
let activeKey = null;

// Update-banner state — when the renderer is showing the update banner, the
// BrowserView must shift down to leave the banner visible (BrowserViews are a
// native overlay drawn ABOVE the host window's HTML, so they would otherwise
// occlude the banner everywhere except the sidebar strip).
const UPDATE_BANNER_HEIGHT = 36; // matches #update-banner height in styles.css
let bannerVisible = false;

// macOS: leave a thin strip at the top of the content area for the renderer's
// #title-drag-bar so the user can drag / double-click the top of the window
// (the BrowserView covers the area and can't itself be a drag region).
// Height matches #title-drag-bar in styles.css.
const TITLEBAR_HEIGHT = process.platform === 'darwin' ? 28 : 0;

// Apps Panel — when open, the apps-list sub-sidebar (220 px) sits between the
// main sidebar and the content area. Active BrowserViews must shift their x
// bounds to leave that strip uncovered. Width matches #apps-list in styles.css.
const APP_SIDEBAR_WIDTH = 220;
let appsPanelOpen        = false;
let preAppsPanelActiveKey = null; // mail viewKey to restore when the panel closes

// Apps BrowserViews. Keyed by appId; lazily created on first show. Notes is a
// special case (no view — renderer paints #apps-notes-view directly).
const appViews   = new Map();
let activeAppId  = null;

// Live limit + LRU. When the user opens a 6th app, the least-recently-used
// live app is hibernated: its BrowserView is destroyed and its appId moves
// into `hibernatedApps`. The session partition (cookies, IndexedDB, cache)
// stays on disk so rehydration is fast and the user lands authenticated.
const MAX_LIVE_APPS = 5;
const appLRU         = []; // appIds, oldest first; bumped on showApp
const hibernatedApps = new Set();
// Auto-hide loading overlay if did-finish-load doesn't fire (rare, but a
// loading spinner stuck forever would be worse than the wrong final state).
const LOADING_TIMEOUT_MS = 30_000;

// Subdomain patterns used by every provider's sign-in / auth flow. The
// post-popup-close handler reloads the parent BrowserView only when a popup
// has touched one of these — so calendar-invite RSVP popups, "compose in new
// window", and passkey ceremonies that don't redirect through an auth host
// don't unnecessarily reload the user's mailbox.
//   accounts.google.com / accounts.zoho.com — Google, Zoho
//   account.proton.me                       — Proton (singular, hence accounts?)
//   login.microsoftonline.com / login.live.com / login.yahoo.com
//   signin.* / auth.* / oauth.* — generic fallbacks for less-common providers
const AUTH_HOST_PATTERN = /^(accounts?|login|signin|auth|oauth)\./i;

// ─── Init ────────────────────────────────────────────────────────────────────

function init({ win, accountsModule }) {
  mainWin  = win;
  accounts = accountsModule;
}

function setTray(t) {
  trayModule = t;
}

// ─── Bounds ──────────────────────────────────────────────────────────────────

function getBannerOffset() {
  return bannerVisible ? UPDATE_BANNER_HEIGHT : 0;
}

function getViewBounds() {
  const { width, height } = mainWin.getContentBounds();
  // The banner overlays the drag bar when visible, so use whichever is taller
  // rather than stacking — keeps the BrowserView from being pushed down twice.
  const yOffset = Math.max(getBannerOffset(), TITLEBAR_HEIGHT);
  const xExtra  = appsPanelOpen ? APP_SIDEBAR_WIDTH : 0;
  return {
    x:      SIDEBAR_WIDTH + xExtra,
    y:      yOffset,
    width:  Math.max(1, width  - SIDEBAR_WIDTH - xExtra),
    height: Math.max(1, height - yOffset),
  };
}

/** Toggle whether the update banner is taking up its row at the top of the window. */
function setBannerVisible(visible) {
  bannerVisible = !!visible;
  relayout();
}

/** Off-screen position with real dimensions so responsive layouts render fully. */
function getOffscreenBounds() {
  const { width, height } = mainWin.getContentBounds();
  return {
    x:      -9999,
    y:      0,
    width:  Math.max(1, width  - SIDEBAR_WIDTH),
    height: Math.max(1, height),
  };
}

// ─── View lifecycle ──────────────────────────────────────────────────────────

function createView(accountId, serviceId) {
  const accountList = accounts.getAccounts();
  const account     = accountList.find(a => a.id === accountId);
  if (!account) throw new Error('viewManager: account not found: ' + accountId);

  const provider = PROVIDERS[account.provider];
  if (!provider) throw new Error('viewManager: unknown provider: ' + account.provider);

  const service = provider.services.find(s => s.id === serviceId);
  if (!service) throw new Error('viewManager: unknown service: ' + serviceId);

  const sess = sessionManager.getOrCreateSession(accountId, provider);

  const view = new BrowserView({
    webPreferences: {
      session:                sess,
      contextIsolation:       true,
      nodeIntegration:        false,
      spellcheck:             true,
      backgroundThrottling:   false, // keep timers/animations running when unfocused
    },
  });

  // Place off-screen but with the real window dimensions.
  // A 1×1 viewport causes responsive SPAs (e.g. Zoho Mail) to collapse their
  // sidebar and never render the folder tree — unread counts become inaccessible.
  mainWin.addBrowserView(view);
  view.setBounds(getOffscreenBounds());

  view.webContents.loadURL(service.url);

  // Gracefully recover from renderer crashes — reload to the service's home URL
  // rather than leaving a dead, blank view that can corrupt main-process state.
  view.webContents.on('render-process-gone', (_event, _details) => {
    if (view.webContents.isDestroyed()) return;
    try { view.webContents.loadURL(service.url); } catch { /* already destroyed */ }
  });

  // Popups/new windows: auth and the provider's own apps stay in-app on the
  // shared session (passkey challenges and OAuth open child windows that need
  // the parent's cookies); everything else follows the user's link preference.
  const partition = 'persist:mailwing-' + accountId;
  view.webContents.setWindowOpenHandler(linkRouter.makeWindowOpenHandler({
    inAppDomains: provider.inAppDomains || provider.safeDomains,
    partition,
    session:      sess,
    getParent:    () => mainWin,
  }));

  // Same-tab navigation to a non-provider host would strand the view on an
  // external page with no way back — route those out instead.
  linkRouter.guardNavigation(view.webContents, {
    allowedDomains: provider.safeDomains,
    partition,
    session:        sess,
    getParent:      () => mainWin,
  });

  // Right-click: copy/paste, spellcheck suggestions, link and image actions.
  contextMenu.attach(view.webContents, {
    allowNavigation: true,
    getWindow:       () => mainWin,
    openExternal:    (url) => linkRouter.openInSystemBrowser(url),
    openInApp:       (url) => linkRouter.openInBrowserWindow(url, {
      session: sess, partition, parent: mainWin,
    }),
  });

  // After an auth popup closes (post-login, post-passkey), the parent view is
  // often still on the signed-out landing page. Reload it so the inbox appears
  // without requiring an app restart. Only fire when the popup actually visited
  // an auth host — otherwise routine popups (calendar-invite RSVP, compose in
  // new window) would trigger spurious mailbox reloads on close.
  let reloadingFromPopup = false;
  view.webContents.on('did-create-window', (childWin, details) => {
    // Popups are real windows (auth, calendar RSVP, "open in new window") and
    // need their own context menu — otherwise right-click dies again the moment
    // a sign-in form opens.
    contextMenu.attach(childWin.webContents, {
      allowNavigation: true,
      getWindow:       () => childWin,
      openExternal:    (url) => linkRouter.openInSystemBrowser(url),
    });

    let sawAuthHost = false;
    const checkHost = (rawUrl) => {
      try {
        const h = new URL(rawUrl).hostname;
        if (AUTH_HOST_PATTERN.test(h)) sawAuthHost = true;
      } catch {}
    };
    if (details && details.url) checkHost(details.url);
    const trackUrl = (_e, url) => { if (url) checkHost(url); };
    childWin.webContents.on('did-navigate',            trackUrl);
    childWin.webContents.on('did-redirect-navigation', trackUrl);
    childWin.on('closed', () => {
      if (reloadingFromPopup) return;
      if (!sawAuthHost) return;
      if (!view || !view.webContents || view.webContents.isDestroyed()) return;
      reloadingFromPopup = true;
      try { view.webContents.reload(); } catch {}
      setTimeout(() => { reloadingFromPopup = false; }, 5000);
    });
  });

  // Mail views: track unread count, extract avatar, and inject provider CSS overrides
  if (serviceId === 'mail') {
    attachTitleWatcher(view, accountId, provider);
    attachUnreadPoller(view, accountId, provider);
    attachAvatarExtractor(view, accountId, provider, sess);
    if (provider.mailCSS) {
      view.webContents.on('did-finish-load', () => {
        view.webContents.insertCSS(provider.mailCSS).catch(() => {});
      });
    }
  }

  views.set(viewKey(accountId, serviceId), view);
  return view;
}

function attachTitleWatcher(view, accountId, provider) {
  const applyTitle = (title) => {
    if (!title) return;

    // ── Unread count ─────────────────────────────────────────────────────
    const match = provider.unreadTitleRegex.exec(title);
    // Only update the count when the title actually contains unread info.
    // Skipping non-matching titles (e.g. individual email subject lines in SPAs)
    // prevents SPA navigations from incorrectly zeroing out the live count.
    if (match) {
      // regex may have alternation groups — pick the first defined capture group
      const raw   = match[1] ?? match[2];
      const count = raw != null ? parseInt(raw, 10) : 0;
      const prev  = unreadCounts.get(accountId) || 0;
      unreadCounts.set(accountId, count);
      if (count > prev) notifications.fireNewEmailNotification(accountId, count - prev);
      broadcastUnread();
    }

    // ── Email extraction ─────────────────────────────────────────────────
    // Only discover the account email once (when it is not yet set). After
    // that, stop updating from titles so that a compose-window title like
    // "Re: Hi - recipient@example.com" never overwrites the account email
    // with the recipient's address.
    const stored = accounts.getAccounts().find(a => a.id === accountId);
    if (stored && !stored.email) {
      const emailMatch = title.match(/\b([\w.+%-]+@[\w.-]+\.[a-z]{2,})\b/i);
      if (emailMatch) {
        accounts.updateAccount(accountId, { email: emailMatch[1] });
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
        }
      }
    }
  };

  // Fire on explicit title changes AND on SPA navigations (hash-based routing)
  view.webContents.on('page-title-updated', (_e, title) => applyTitle(title));
  view.webContents.on('did-finish-load',    ()          => applyTitle(view.webContents.getTitle()));
  view.webContents.on('did-navigate-in-page', ()        => applyTitle(view.webContents.getTitle()));
}

/**
 * Runs provider.unreadScript inside the mail page every 30 s as a DOM-based fallback.
 * This catches providers whose title doesn't reliably encode the unread count.
 */
function attachUnreadPoller(view, accountId, provider) {
  if (!provider.unreadScript) return;

  const poll = async () => {
    if (!view || !view.webContents || view.webContents.isDestroyed()) return;
    try {
      const result = await view.webContents.executeJavaScript(provider.unreadScript);
      if (typeof result === 'number' && result >= 0) {
        const prev = unreadCounts.get(accountId) || 0;
        unreadCounts.set(accountId, result);
        if (result > prev) notifications.fireNewEmailNotification(accountId, result - prev);
        broadcastUnread();
      }
    } catch { /* page not ready yet — next tick will retry */ }
  };

  // Poll once after initial load, then on every subsequent load + on a timer
  view.webContents.on('did-finish-load', poll);
  const timer = setInterval(poll, 15_000);

  // Clean up the interval when the view is destroyed
  view.webContents.once('destroyed', () => clearInterval(timer));

  // ── Diagnostic (Zoho-only): drill into the nav pane to find the unread count element ──
  // Dev builds only — this dumps the DOM of a signed-in mailbox to stdout, which must
  // never happen in a shipped binary. Run `npm start` against a real account to collect
  // selectors, then encode them in providers.js.
  if (!app.isPackaged && provider.id === 'zoho') {
    let diagnosed = false;
    const runDiag = async () => {
      if (diagnosed || !view || !view.webContents || view.webContents.isDestroyed()) return;
      // Only run once the title shows the user is logged in (contains '@')
      const title = view.webContents.getTitle();
      if (!title.includes('@')) return;
      diagnosed = true;
      try {
        const info = await view.webContents.executeJavaScript(`(function(){
          var out = { title: document.title, navTitles: [], numericEls: [], countEls: [] };
          // All elements inside the left nav with a title attribute
          var nav = document.querySelector('[aria-label="Left navigation pane"]') || document.body;
          nav.querySelectorAll('[title]').forEach(function(el) {
            var t = el.getAttribute('title');
            if (t) out.navTitles.push({ tag: el.tagName, cls: el.className.substring(0,60), title: t, text: el.textContent.trim().substring(0,30) });
          });
          // All spans/divs whose entire text is a positive integer (could be unread count)
          document.querySelectorAll('span, div, li, td').forEach(function(el) {
            var t = el.textContent.trim();
            if (/^\\d{1,4}$/.test(t)) {
              out.numericEls.push({ tag: el.tagName, id: el.id, cls: el.className.substring(0,60), text: t,
                parentCls: el.parentElement ? el.parentElement.className.substring(0,60) : '' });
            }
          });
          // Elements whose id/class contains count/unread/badge
          document.querySelectorAll('[id*="count" i],[id*="unread" i],[id*="badge" i],[class*="count"],[class*="unread"],[class*="badge"]').forEach(function(el) {
            out.countEls.push({ tag: el.tagName, id: el.id, cls: el.className.substring(0,60), text: el.textContent.trim().substring(0,20) });
          });
          return out;
        })()`);
        console.log('[Mailwing diag-zoho]');
        console.log('  title:', info.title);
        console.log('  nav title-attrs:', JSON.stringify(info.navTitles.slice(0, 20), null, 2));
        console.log('  numeric elements:', JSON.stringify(info.numericEls.slice(0, 20), null, 2));
        console.log('  count/unread/badge elements:', JSON.stringify(info.countEls.slice(0, 20), null, 2));
      } catch (e) {
        console.log('[Mailwing diag-zoho] error:', e.message);
      }
    };
    view.webContents.on('did-finish-load',     () => setTimeout(runDiag, 15000));
    view.webContents.on('did-navigate-in-page', () => setTimeout(runDiag, 3000));
    view.webContents.on('page-title-updated',   () => setTimeout(runDiag, 5000));
  }

  // ── Diagnostic (Outlook-only): discover folder-tree unread counter selectors and
  //    profile-button avatar location for the post-2024 Outlook Web layout.
  //    Remove this block once concrete selectors are encoded in providers.js.
  //    Dev builds only — see the note on the Zoho block above.
  if (!app.isPackaged && provider.id === 'outlook') {
    let diagnosed = false;
    const runDiag = async () => {
      if (diagnosed || !view || !view.webContents || view.webContents.isDestroyed()) return;
      const title = view.webContents.getTitle();
      // Outlook titles include "@" once the user is signed in
      if (!title.includes('@')) return;
      diagnosed = true;
      try {
        const info = await view.webContents.executeJavaScript(`(function(){
          var out = { title: document.title, ariaLabels: [], buttons: [], dataAttrs: [], treeitems: [] };
          // aria-labels matching inbox/unread/profile/account/me
          document.querySelectorAll('[aria-label]').forEach(function(el) {
            var lab = el.getAttribute('aria-label') || '';
            if (!/inbox|unread|profile|account|\\bme\\b/i.test(lab)) return;
            var img = el.querySelector ? el.querySelector('img') : null;
            out.ariaLabels.push({
              tag: el.tagName,
              label: lab.substring(0, 80),
              text: (el.textContent || '').trim().substring(0, 40),
              imgSrc: img ? (img.getAttribute('src') || '').substring(0, 120) : ''
            });
          });
          // buttons with their aria-label and any nested img.src
          document.querySelectorAll('button').forEach(function(b) {
            var lab = b.getAttribute('aria-label') || '';
            if (!lab) return;
            var img = b.querySelector('img');
            out.buttons.push({
              label: lab.substring(0, 80),
              imgSrc: img ? (img.getAttribute('src') || '').substring(0, 120) : '',
              dataApp: b.getAttribute('data-app-section') || '',
              dataTestId: b.getAttribute('data-testid') || ''
            });
          });
          // data-testid / data-app-section matching profile|persona|me|inbox|folder|count
          document.querySelectorAll('[data-testid], [data-app-section]').forEach(function(el) {
            var t = el.getAttribute('data-testid') || '';
            var a = el.getAttribute('data-app-section') || '';
            var combined = t + ' ' + a;
            if (!/profile|persona|me|inbox|folder|count/i.test(combined)) return;
            out.dataAttrs.push({
              tag: el.tagName,
              testId: t,
              appSection: a,
              text: (el.textContent || '').trim().substring(0, 30)
            });
          });
          // treeitems (folder tree nodes)
          document.querySelectorAll('[role="treeitem"], li[role="treeitem"]').forEach(function(el) {
            var lab = el.getAttribute('aria-label') || '';
            if (!/inbox/i.test(lab) && !/inbox/i.test(el.textContent || '')) return;
            var spans = [];
            el.querySelectorAll('span').forEach(function(s) {
              var st = (s.textContent || '').trim();
              if (st && st.length < 20) spans.push(st);
            });
            out.treeitems.push({
              label: lab.substring(0, 80),
              text: (el.textContent || '').trim().substring(0, 80),
              spans: spans.slice(0, 8)
            });
          });
          return out;
        })()`);
        console.log('[Mailwing diag-outlook]');
        console.log('  title:', info.title);
        console.log('  aria-labels (top 20):', JSON.stringify(info.ariaLabels.slice(0, 20), null, 2));
        console.log('  buttons (top 20):',     JSON.stringify(info.buttons.slice(0, 20), null, 2));
        console.log('  data-attrs (top 20):',  JSON.stringify(info.dataAttrs.slice(0, 20), null, 2));
        console.log('  treeitems (inbox):',    JSON.stringify(info.treeitems.slice(0, 10), null, 2));
      } catch (e) {
        console.log('[Mailwing diag-outlook] error:', e.message);
      }
    };
    view.webContents.on('did-finish-load',      () => setTimeout(runDiag, 15000));
    view.webContents.on('did-navigate-in-page', () => setTimeout(runDiag, 3000));
    view.webContents.on('page-title-updated',   () => setTimeout(runDiag, 5000));
  }
}

function attachAvatarExtractor(view, accountId, provider, sess) {
  let extracted = false;

  const tryExtract = async () => {
    // The view may be destroyed (account removed, render crash, app quitting)
    // before this timer fires — webContents becomes undefined in that case.
    if (extracted || !view || !view.webContents || view.webContents.isDestroyed()) return;

    try {
      // Try canvas-based extraction first — works for blob URLs (Outlook MSAL) and
      // same-origin images without needing auth headers. Falls back to returning the
      // raw HTTP src for main-process net.fetch (Gmail / Zoho cookie-based URLs).
      const result = await view.webContents.executeJavaScript(
        `(async function(){
           var sels = ${JSON.stringify(provider.avatarSelector)}.split(',');
           for (var i = 0; i < sels.length; i++) {
             var el = document.querySelector(sels[i].trim());
             if (!el) continue;
             var img = (el.tagName === 'IMG') ? el : el.querySelector('img');
             if (!img) continue;
             if (img.complete && img.naturalWidth > 0) {
               try {
                 var sz = Math.min(Math.max(img.naturalWidth, img.naturalHeight, 32), 128);
                 var canvas = document.createElement('canvas');
                 canvas.width = sz; canvas.height = sz;
                 canvas.getContext('2d').drawImage(img, 0, 0, sz, sz);
                 return canvas.toDataURL('image/jpeg', 0.85);
               } catch(e) {
                 // CORS taint — fall through to src URL for net.fetch
               }
             }
             // Image in DOM but not rendered yet (or CORS-tainted) — return the src
             // URL so the main process can fetch it via session cookies.
             var src = img.getAttribute('src') || img.src || (img.dataset && img.dataset.src) || img.getAttribute('data-original') || '';
             if (src.startsWith('http')) return src;
           }
           // background-image fallback (Zoho, CSS-based avatars)
           for (var j = 0; j < sels.length; j++) {
             var el2 = document.querySelector(sels[j].trim());
             if (!el2) continue;
             var bg = (window.getComputedStyle(el2).backgroundImage || '');
             var m = bg.match(/url\\(["']?(https?:[^"')]+)["']?\\)/);
             if (m) return m[1];
           }
           return '';
         })()`
      );

      if (!result) return;

      if (result.startsWith('data:')) {
        // Canvas succeeded (blob URLs or same-origin images)
        extracted = true;
        accounts.updateAccount(accountId, { avatarDataURL: result });
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
        }
        return;
      }

      if (!result.startsWith('http')) return;

      // HTTP URL — fetch via session cookies (works for Gmail / Zoho)
      const res = await net.fetch(result, { session: sess });
      if (!res.ok) return;

      const buf     = Buffer.from(await res.arrayBuffer());
      const mime    = res.headers.get('content-type') || 'image/jpeg';
      const dataURL = `data:${mime};base64,` + buf.toString('base64');

      extracted = true;
      accounts.updateAccount(accountId, { avatarDataURL: dataURL });

      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
      }
    } catch {
      // Avatar extraction is best-effort; silence all errors
    }
  };

  // Schedule multiple retry attempts after load — Zoho Mail's profile image
  // only appears in the DOM at ~15–30 s (SPA renders asynchronously).
  // Also retry 3 s after each in-page navigation (Zoho fires these as it routes).
  view.webContents.on('did-finish-load', () => {
    // Outlook's MeControl avatar can render as late as ~60 s on slow networks; extra retry at 75 s
    [8000, 15000, 25000, 45000, 75000].forEach(d => setTimeout(tryExtract, d));
  });
  view.webContents.on('did-navigate-in-page', () => setTimeout(tryExtract, 3000));
}

// ─── Show / hide ─────────────────────────────────────────────────────────────

function showView(accountId, serviceId) {
  const key = viewKey(accountId, serviceId);

  // Create lazily on first access
  let view = views.get(key);
  if (!view) view = createView(accountId, serviceId);

  // Move every other view off-screen (keeps them loaded, avoids reload flicker).
  // Keep real dimensions so responsive SPAs don't collapse their layout.
  for (const [k, v] of views) {
    if (k !== key && v.webContents && !v.webContents.isDestroyed()) {
      v.setBounds(getOffscreenBounds());
    }
  }

  activeKey = key;
  view.setBounds(getViewBounds());
  mainWin.setTopBrowserView(view);
}

function reloadView(accountId, serviceId) {
  const view = views.get(viewKey(accountId, serviceId));
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.reload();
  }
}

/** Remove all views from all accounts and clear state (called on window close). */
function destroyAllViews() {
  for (const view of views.values()) {
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.removeBrowserView(view);
      if (view.webContents && !view.webContents.isDestroyed()) view.webContents.destroy();
    } catch { /* ignore */ }
  }
  views.clear();
  activeKey = null;

  for (const view of appViews.values()) {
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.removeBrowserView(view);
      if (view.webContents && !view.webContents.isDestroyed()) view.webContents.destroy();
    } catch { /* ignore */ }
  }
  appViews.clear();
  activeAppId = null;
}

/** Remove all views for an account and clean up. */
function destroyAccountViews(accountId) {
  for (const [key, view] of views) {
    if (!key.startsWith(accountId + ':')) continue;
    try {
      mainWin.removeBrowserView(view);
      view.webContents.destroy();
    } catch { /* ignore */ }
    views.delete(key);
  }

  unreadCounts.delete(accountId);

  if (activeKey && activeKey.startsWith(accountId + ':')) {
    activeKey = null;
  }

  broadcastUnread();
  sessionManager.destroySession(accountId);
}

// ─── Background warm-up ───────────────────────────────────────────────────────

/**
 * Pre-create the mail view for every account that doesn't have one yet.
 * Views are placed off-screen so they load and start polling in the background
 * without being visible. Call once at startup after showing the first account.
 */
function warmUpMailViews() {
  for (const account of accounts.getAccounts()) {
    const provider = PROVIDERS[account.provider];
    if (!provider) continue;
    const key = viewKey(account.id, 'mail');
    if (!views.has(key)) {
      try { createView(account.id, 'mail'); } catch { /* account data not ready */ }
    }
  }
}

// ─── Relayout ─────────────────────────────────────────────────────────────────

/** Called on window resize — updates the active view's bounds. */
function relayout() {
  // When the Apps Panel is open, only the active app view (if any) is on
  // screen; mail views are off-screen via hideActiveView(). Relayouting the
  // mail view here would yank it back into view at the wrong bounds.
  if (appsPanelOpen) {
    if (!activeAppId) return;
    const view = appViews.get(activeAppId);
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      view.setBounds(getViewBounds());
    }
    return;
  }
  if (!activeKey) return;
  const view = views.get(activeKey);
  if (view && view.webContents && !view.webContents.isDestroyed()) {
    view.setBounds(getViewBounds());
  }
}

/**
 * Temporarily move the active BrowserView off-screen so HTML overlays
 * (e.g. the bug report modal, confirm dialogs) can render over the full
 * window. When the Apps Panel is open with a live app selected, the
 * "active" view is that app's BrowserView — without this branch the modal
 * would render below the still-visible app view.
 */
function hideActiveView() {
  if (appsPanelOpen && activeAppId) {
    const v = appViews.get(activeAppId);
    if (v && v.webContents && !v.webContents.isDestroyed()) {
      v.setBounds(getOffscreenBounds());
    }
    return;
  }
  if (!activeKey) return;
  const view = views.get(activeKey);
  if (view && !view.webContents.isDestroyed()) {
    view.setBounds(getOffscreenBounds());
  }
}

/** Restore the active BrowserView to its normal on-screen position. */
function revealActiveView() {
  if (appsPanelOpen && activeAppId) {
    const v = appViews.get(activeAppId);
    if (v && v.webContents && !v.webContents.isDestroyed()) {
      v.setBounds(getViewBounds());
      mainWin.setTopBrowserView(v);
    }
    return;
  }
  if (!activeKey) return;
  const view = views.get(activeKey);
  if (view && !view.webContents.isDestroyed()) {
    view.setBounds(getViewBounds());
    mainWin.setTopBrowserView(view);
  }
}

// ─── Accessors ───────────────────────────────────────────────────────────────

function getView(accountId, serviceId) {
  return views.get(viewKey(accountId, serviceId));
}

function getActiveAccountId() {
  if (!activeKey) return null;
  return activeKey.split(':')[0];
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function viewKey(accountId, serviceId) {
  return `${accountId}:${serviceId}`;
}

function broadcastUnread() {
  if (!mainWin || mainWin.isDestroyed()) return;
  const counts = Object.fromEntries(unreadCounts);
  mainWin.webContents.send(IPC.UNREAD_UPDATED, counts);
  // Keep dock badge + menu bar title in sync
  const total = Array.from(unreadCounts.values()).reduce((s, n) => s + n, 0);
  if (trayModule) trayModule.updateBadge(total);
}

// ─── Apps Panel ──────────────────────────────────────────────────────────────
// Lifecycle for app BrowserViews. Hibernation / LRU enforcement lands in the
// next task; this block already supports lazy creation, switching between
// apps, panel open/close, and per-app session partitions.

function setAppsPanelOpen(open) {
  open = !!open;
  if (open === appsPanelOpen) return;

  if (open) {
    // Remember the active mail view so we can restore it on close.
    preAppsPanelActiveKey = activeKey;
    if (activeKey) hideActiveView();
    appsPanelOpen = true;
  } else {
    // Move every app view off-screen so the mail view can come back unobscured.
    for (const v of appViews.values()) {
      if (v.webContents && !v.webContents.isDestroyed()) {
        v.setBounds(getOffscreenBounds());
      }
    }
    activeAppId   = null;
    appsPanelOpen = false;

    if (preAppsPanelActiveKey) {
      const view = views.get(preAppsPanelActiveKey);
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        const [accountId, serviceId] = preAppsPanelActiveKey.split(':');
        showView(accountId, serviceId);
      }
      preAppsPanelActiveKey = null;
    }
  }
}

/**
 * Build the safe-domain list for an app's session: the app URL's hostname,
 * the registry entry's hostname (when registry-based), plus any explicit
 * allowedHosts from the registry entry. When the app is linked to an email
 * account, the linked provider's safeDomains are also folded in so popups
 * to e.g. accounts.google.com stay in-app rather than being routed to the
 * OS browser. The ad-blocker treats this list as always-allowed; the popup
 * handler uses it to decide whether child windows stay in-app on the shared
 * session.
 */
function buildAppSafeDomains(app, registryEntry) {
  const hosts = new Set();
  try { hosts.add(new URL(app.url).hostname); } catch { /* invalid URL */ }
  if (registryEntry && registryEntry.url) {
    try { hosts.add(new URL(registryEntry.url).hostname); } catch { /* invalid */ }
  }
  if (registryEntry && Array.isArray(registryEntry.allowedHosts)) {
    registryEntry.allowedHosts.forEach(h => h && hosts.add(h));
  }
  // Linked apps: include the email provider's safeDomains so SSO popups
  // (accounts.google.com, login.microsoftonline.com, etc.) stay in-app.
  if (app && app.linkedAccountId && accounts) {
    const linkedAccount = accounts.getAccounts().find(a => a.id === app.linkedAccountId);
    if (linkedAccount) {
      const provider = PROVIDERS[linkedAccount.provider];
      if (provider && Array.isArray(provider.safeDomains)) {
        provider.safeDomains.forEach(h => h && hosts.add(h));
      }
    }
  }
  return Array.from(hosts);
}

/**
 * Hostname safety check for `appLastUrl` writes / reads. Passes when the URL
 * matches (or is a subdomain of) any of the app's safe hosts. Prevents us
 * from saving sign-out pages, OAuth redirect intermediaries, or arbitrary
 * pages reached via a link in the app — only domains the user expects to
 * land on after a successful login round-trip.
 */
function isAppHostAllowed(hostname, app, registryEntry) {
  if (!hostname) return false;
  const allowed = buildAppSafeDomains(app, registryEntry);
  return allowed.some(h => hostname === h || hostname.endsWith('.' + h));
}

/** Save the current URL for an app, but only if it's still on a safe host. */
function saveLastUrlIfSafe(app, registryEntry, url) {
  if (!app || !url) return;
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return; }
  if (isAppHostAllowed(hostname, app, registryEntry)) {
    appsManager.setLastUrl(app.id, url);
  }
}

function createAppView(app, registryEntry) {
  const safeDomains    = buildAppSafeDomains(app, registryEntry);
  const linkedAccountId = app.linkedAccountId || null;
  // Linked apps reuse the email account's session (cookies, ad-blocker filters
  // already attached at warmup); standalone apps get persist:mailwing-app-<id>.
  const sess           = sessionManager.getOrCreateAppSession(app.id, safeDomains, linkedAccountId);

  // Pick the URL to load: prefer the saved last URL when it still passes the
  // hostname safety check (e.g. user was deep inside Cloudflare → /zones/abc),
  // otherwise fall back to the app's configured default. On a sign-out the
  // last URL would fail the check, so the user lands on the default and signs
  // back in.
  let initialUrl   = app.url;
  const savedUrl   = appsManager.getLastUrl(app.id);
  if (savedUrl) {
    let savedHost;
    try { savedHost = new URL(savedUrl).hostname; } catch { /* invalid saved url */ }
    if (savedHost && isAppHostAllowed(savedHost, app, registryEntry)) {
      initialUrl = savedUrl;
    }
  }

  const view = new BrowserView({
    webPreferences: {
      session:              sess,
      contextIsolation:     true,
      nodeIntegration:      false,
      spellcheck:           true,
      backgroundThrottling: false,
    },
  });

  mainWin.addBrowserView(view);
  view.setBounds(getOffscreenBounds());

  view.webContents.loadURL(initialUrl);

  // Recover from renderer crashes — reload the registered default URL.
  // (Don't use savedUrl here — if a crash was triggered by that page, we'd
  // loop. Default URL is the safer recovery target.)
  view.webContents.on('render-process-gone', () => {
    if (view.webContents.isDestroyed()) return;
    try { view.webContents.loadURL(app.url); } catch { /* ignore */ }
  });

  // Popup rule: the app's own auth/child windows stay in-app on the shared
  // session; everything else follows the user's link preference. Same approach
  // as mail views. Apps have no curated inAppDomains, so the computed
  // safeDomains list doubles as the in-app set here.
  const appPartition = 'persist:mailwing-app-' + app.id;
  view.webContents.setWindowOpenHandler(linkRouter.makeWindowOpenHandler({
    inAppDomains: safeDomains,
    partition:    appPartition,
    session:      sess,
    getParent:    () => mainWin,
  }));

  linkRouter.guardNavigation(view.webContents, {
    allowedDomains: safeDomains,
    partition:      appPartition,
    session:        sess,
    getParent:      () => mainWin,
  });

  contextMenu.attach(view.webContents, {
    allowNavigation: true,
    getWindow:       () => mainWin,
    openExternal:    (url) => linkRouter.openInSystemBrowser(url),
    openInApp:       (url) => linkRouter.openInBrowserWindow(url, {
      session: sess, partition: appPartition, parent: mainWin,
    }),
  });

  appViews.set(app.id, view);
  return view;
}

/**
 * Switch the right column of the Apps Panel to the given app entry.
 * Builds the view lazily on first call (or on rehydration after hibernation).
 * Enforces the live-view limit by hibernating the LRU app when a new sixth
 * view would push us over.
 */
function showApp(app, registryEntry) {
  if (!app || !app.id) return;
  if (!appsPanelOpen) return; // defensive — panel must be open to host a view

  let view          = appViews.get(app.id);
  const willCreate  = !view;
  const wasHibernated = hibernatedApps.has(app.id);

  if (willCreate) {
    // About to create — enforce the live limit by hibernating the LRU app
    // (excluding the one we're about to create).
    if (appViews.size >= MAX_LIVE_APPS) hibernateLRUApp(app.id);
    view = createAppView(app, registryEntry);
  }

  // Move every other app view off-screen — keeps them loaded for instant
  // return, no reload flicker.
  for (const [k, v] of appViews) {
    if (k !== app.id && v.webContents && !v.webContents.isDestroyed()) {
      v.setBounds(getOffscreenBounds());
    }
  }

  activeAppId = app.id;
  bumpAppLRU(app.id);
  if (wasHibernated) hibernatedApps.delete(app.id);

  view.setBounds(getViewBounds());
  mainWin.setTopBrowserView(view);

  // Loading overlay during first-add and rehydration.
  if (willCreate) startLoadingOverlay(view, app.label || 'Loading…');

  if (willCreate || wasHibernated) broadcastHibernationChange();
}

function bumpAppLRU(appId) {
  const idx = appLRU.indexOf(appId);
  if (idx >= 0) appLRU.splice(idx, 1);
  appLRU.push(appId);
}

function dropFromAppLRU(appId) {
  const idx = appLRU.indexOf(appId);
  if (idx >= 0) appLRU.splice(idx, 1);
}

/**
 * Pick the least-recently-used live app to hibernate, excluding the app
 * we're about to open. Walks the LRU list from oldest forward — the first
 * id that still has a live view wins.
 */
function pickLRUForHibernation(excludeAppId) {
  for (const id of appLRU) {
    if (id === excludeAppId) continue;
    if (appViews.has(id))    return id;
  }
  return null;
}

function hibernateLRUApp(excludeAppId) {
  const victimId = pickLRUForHibernation(excludeAppId);
  if (!victimId) return;

  const view = appViews.get(victimId);
  if (!view) return;

  // Capture the last URL before we destroy the renderer. On a future
  // rehydration we re-open the same page (if it's still on a safe host).
  try {
    if (view.webContents && !view.webContents.isDestroyed()) {
      const currentUrl   = view.webContents.getURL();
      const app          = appsManager.getApps().find(a => a.id === victimId);
      const registryEntry = app && app.registryKey ? APPS[app.registryKey] : null;
      saveLastUrlIfSafe(app, registryEntry, currentUrl);
    }
  } catch { /* ignore — capture is best-effort */ }

  try {
    if (mainWin && !mainWin.isDestroyed()) mainWin.removeBrowserView(view);
    if (view.webContents && !view.webContents.isDestroyed()) view.webContents.destroy();
  } catch { /* ignore */ }

  appViews.delete(victimId);
  hibernatedApps.add(victimId);
  dropFromAppLRU(victimId);
  if (activeAppId === victimId) activeAppId = null;
}

function startLoadingOverlay(view, label) {
  notifyLoadingChanged(true, label);
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    notifyLoadingChanged(false);
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.removeListener('did-finish-load', finish);
    }
  };
  if (view && view.webContents && !view.webContents.isDestroyed()) {
    view.webContents.once('did-finish-load', finish);
  }
  setTimeout(finish, LOADING_TIMEOUT_MS);
}

function notifyLoadingChanged(loading, label) {
  if (!mainWin || mainWin.isDestroyed()) return;
  mainWin.webContents.send(IPC.APPS_LOADING_CHANGED, { loading: !!loading, label: label || '' });
}

function broadcastHibernationChange() {
  if (!mainWin || mainWin.isDestroyed()) return;
  mainWin.webContents.send(IPC.APPS_HIBERNATION_CHANGED, Array.from(hibernatedApps));
}

/**
 * Renderer requested switching to an entry by id. 'notes' is a special case
 * (no BrowserView; the renderer paints #apps-notes-view directly). For real
 * apps the caller in ipcHandlers will resolve the full config and call showApp.
 */
function showAppEntry(entryId) {
  if (entryId === 'notes' || !entryId) {
    // Notes selected — hide any active app view so the renderer's notes
    // pane is visible on top of the (empty) content area.
    if (activeAppId) {
      const v = appViews.get(activeAppId);
      if (v && v.webContents && !v.webContents.isDestroyed()) {
        v.setBounds(getOffscreenBounds());
      }
      activeAppId = null;
    }
  }
  // Real app entries are switched via showApp() — see ipcHandlers.js.
}

function destroyAppView(appId) {
  const view = appViews.get(appId);
  if (view) {
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.removeBrowserView(view);
      if (view.webContents && !view.webContents.isDestroyed()) view.webContents.destroy();
    } catch { /* ignore */ }
    appViews.delete(appId);
  }
  if (activeAppId === appId) activeAppId = null;
  dropFromAppLRU(appId);
  const wasHibernated = hibernatedApps.delete(appId);
  sessionManager.destroyAppSession(appId);
  if (wasHibernated) broadcastHibernationChange();
}

/** Current set of hibernated app IDs (snapshot — caller can mutate freely). */
function getHibernatedAppIds() {
  return new Set(hibernatedApps);
}

/**
 * Capture the current URL of every live app view to appsManager.appLastUrl.
 * Called from before-quit so a relaunch lands each app where the user left
 * off. Hostname safety still applies — pages we wouldn't have saved on
 * hibernation (sign-out screens, OAuth redirects) are skipped here too.
 */
function captureAllLiveAppUrls() {
  const apps = appsManager.getApps();
  for (const [appId, view] of appViews) {
    if (!view || !view.webContents || view.webContents.isDestroyed()) continue;
    let currentUrl;
    try { currentUrl = view.webContents.getURL(); } catch { continue; }
    const app           = apps.find(a => a.id === appId);
    const registryEntry = app && app.registryKey ? APPS[app.registryKey] : null;
    saveLastUrlIfSafe(app, registryEntry, currentUrl);
  }
}

module.exports = {
  init,
  setTray,
  showView,
  reloadView,
  getView,
  destroyAllViews,
  destroyAccountViews,
  getActiveAccountId,
  relayout,
  warmUpMailViews,
  hideActiveView,
  revealActiveView,
  setBannerVisible,
  // Apps Panel
  setAppsPanelOpen,
  showApp,
  showAppEntry,
  destroyAppView,
  getHibernatedAppIds,
  captureAllLiveAppUrls,
};
