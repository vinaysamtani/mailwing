'use strict';

const { BrowserView, net } = require('electron');
const { PROVIDERS }        = require('../shared/providers');
const { SIDEBAR_WIDTH, IPC } = require('../shared/constants');
const sessionManager       = require('./sessionManager');
const notifications        = require('./notifications');

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
  const offset = getBannerOffset();
  return {
    x:      SIDEBAR_WIDTH,
    y:      offset,
    width:  Math.max(1, width  - SIDEBAR_WIDTH),
    height: Math.max(1, height - offset),
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

  // Open popups/new windows in the system browser, except for auth-origin
  // popups which must stay in-app to share the account's session cookies.
  // Passkey challenges and OAuth flows open child windows that need access
  // to the same cookies/auth state as the parent page.
  view.webContents.setWindowOpenHandler(({ url }) => {
    let isAuthOrigin = false;
    try {
      const { hostname } = new URL(url);
      isAuthOrigin = provider.safeDomains.some(
        d => hostname === d || hostname.endsWith('.' + d)
      );
    } catch { /* invalid URL — fall through to system browser */ }

    if (!isAuthOrigin) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }

    // Allow in-app with the same isolated session so auth state is shared.
    // Use the partition string rather than a session instance — Electron's
    // setWindowOpenHandler propagates `partition` more reliably through
    // overrideBrowserWindowOptions than a `session` reference, which fixes
    // calendar-invite RSVP popups re-prompting for login.
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition:        'persist:mailwing-' + accountId,
          contextIsolation: true,
          nodeIntegration:  false,
        },
      },
    };
  });

  // After an auth popup closes (post-login, post-passkey), the parent view is
  // often still on the signed-out landing page. Reload it so the inbox appears
  // without requiring an app restart. Gate on safeDomain so unrelated popups
  // (which shouldn't reach here, but defensive) don't trigger a reload.
  let reloadingFromPopup = false;
  view.webContents.on('did-create-window', (childWin, details) => {
    // Diagnostic — confirm the popup is genuinely sharing the parent's session.
    // Remove once the calendar-invite re-login bug is verified fixed.
    try {
      console.log('[diag-popup]', {
        accountId,
        url: details && details.url,
        sameSession: childWin.webContents.session === sess,
      });
    } catch {}

    let lastUrl = (details && details.url) || '';
    const trackUrl = (_e, url) => { if (url) lastUrl = url; };
    childWin.webContents.on('did-navigate',            trackUrl);
    childWin.webContents.on('did-redirect-navigation', trackUrl);
    childWin.on('closed', () => {
      if (reloadingFromPopup) return;
      let host = '';
      try { host = new URL(lastUrl || childWin.webContents?.getURL?.() || '').hostname; } catch {}
      if (!host) return;
      const isAuthHost = provider.safeDomains.some(
        d => host === d || host.endsWith('.' + d)
      );
      if (!isAuthHost) return;
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
  if (provider.id === 'zoho') {
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
  if (provider.id === 'outlook') {
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
  if (!activeKey) return;
  const view = views.get(activeKey);
  if (view && !view.webContents.isDestroyed()) {
    view.setBounds(getViewBounds());
  }
}

/**
 * Temporarily move the active BrowserView off-screen so HTML overlays
 * (e.g. the bug report modal) can render over the full window.
 */
function hideActiveView() {
  if (!activeKey) return;
  const view = views.get(activeKey);
  if (view && !view.webContents.isDestroyed()) {
    view.setBounds(getOffscreenBounds());
  }
}

/** Restore the active BrowserView to its normal on-screen position. */
function revealActiveView() {
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
};
