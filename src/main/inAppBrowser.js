'use strict';

const { BrowserWindow, BrowserView, ipcMain, shell, nativeTheme } = require('electron');
const path = require('path');

const { IPC }     = require('../shared/constants');
const contextMenu = require('./contextMenu');

// Height of the toolbar strip in browser.html. Must match #toolbar in browser.css —
// the content BrowserView is positioned directly below it.
const TOOLBAR_HEIGHT = 44;

// win.id → { win, view }. Also keeps the windows referenced so they aren't
// garbage-collected while still on screen (same reason index.js holds
// composeWindows).
const browsers = new Map();

// Electron 30+ moved history off webContents; fall back for older versions.
const nav = (wc) => wc.navigationHistory || wc;

let ipcRegistered = false;

/** Find the browser record that owns a toolbar webContents (the IPC sender). */
function recordFromSender(sender) {
  const win = BrowserWindow.fromWebContents(sender);
  return win ? browsers.get(win.id) : null;
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  const withView = (fn) => (event) => {
    const rec = recordFromSender(event.sender);
    if (!rec || !rec.view || rec.view.webContents.isDestroyed()) return;
    fn(rec.view.webContents, rec);
  };

  ipcMain.on(IPC.BROWSER_BACK,    withView((wc) => { if (nav(wc).canGoBack())    nav(wc).goBack(); }));
  ipcMain.on(IPC.BROWSER_FORWARD, withView((wc) => { if (nav(wc).canGoForward()) nav(wc).goForward(); }));
  ipcMain.on(IPC.BROWSER_RELOAD,  withView((wc) => wc.reload()));
  ipcMain.on(IPC.BROWSER_STOP,    withView((wc) => wc.stop()));

  // The escape hatch: hand the current page to the real browser and close up.
  ipcMain.on(IPC.BROWSER_OPEN_EXTERNAL, withView((wc, rec) => {
    const url = wc.getURL();
    if (url) shell.openExternal(url).catch(() => {});
    if (rec.win && !rec.win.isDestroyed()) rec.win.close();
  }));
}

/** Position the content view under the toolbar, filling the rest of the window. */
function layout(win, view) {
  if (!win || win.isDestroyed() || !view || view.webContents.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  view.setBounds({
    x: 0,
    y: TOOLBAR_HEIGHT,
    width,
    height: Math.max(0, height - TOOLBAR_HEIGHT),
  });
}

/** Push navigation state to the toolbar document. */
function sendState(win, view, { loading } = {}) {
  if (!win || win.isDestroyed() || !view || view.webContents.isDestroyed()) return;
  const wc = view.webContents;
  win.webContents.send(IPC.BROWSER_STATE, {
    url:           wc.getURL(),
    canGoBack:     nav(wc).canGoBack(),
    canGoForward:  nav(wc).canGoForward(),
    loading:       loading === undefined ? wc.isLoading() : loading,
  });
}

/**
 * Open a URL in a Mailwing browser window.
 *
 * @param {string} url
 * @param {object} opts
 * @param {Electron.Session} [opts.session]   session to load the page in
 * @param {string}           [opts.partition] partition string, used when no session given
 * @param {Electron.BrowserWindow} [opts.parent] window to centre against
 * @returns {Electron.BrowserWindow|null}
 */
function open(url, opts = {}) {
  if (!url) return null;

  // Only ever load web content here. A file:// or javascript: URL arriving from
  // page content must not get a window with the account's cookies attached.
  let scheme;
  try { scheme = new URL(url).protocol; } catch { return null; }
  if (scheme !== 'https:' && scheme !== 'http:') {
    shell.openExternal(url).catch(() => {});
    return null;
  }

  registerIpc();

  const { session, partition, parent } = opts;

  const win = new BrowserWindow({
    width:  1100,
    height: 800,
    minWidth:  480,
    minHeight: 360,
    title: 'Mailwing',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f2f5',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, '../renderer/browser-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       false,
    },
    show: false,
  });

  // The page title is the window title — but the toolbar shows the URL, which
  // is what actually tells the user where they are.
  win.on('page-title-updated', (e) => e.preventDefault());

  // Content view. Prefer an explicit session object; fall back to the partition
  // string. Passing both is an Electron error, so pick exactly one.
  const contentPrefs = {
    contextIsolation:     true,
    nodeIntegration:      false,
    spellcheck:           true,
    backgroundThrottling: false,
  };
  if (session)        contentPrefs.session   = session;
  else if (partition) contentPrefs.partition = partition;

  const view = new BrowserView({ webPreferences: contentPrefs });
  win.addBrowserView(view);
  browsers.set(win.id, { win, view });

  win.loadFile(path.join(__dirname, '../renderer/browser.html'));

  // Load the page only once the toolbar document is ready, so the first
  // BROWSER_STATE push can't land before the renderer has attached its listener.
  win.webContents.once('did-finish-load', () => {
    layout(win, view);
    if (!view.webContents.isDestroyed()) view.webContents.loadURL(url);
    sendState(win, view, { loading: true });
  });

  win.once('ready-to-show', () => {
    if (parent && !parent.isDestroyed()) {
      // Offset slightly from the parent so the new window is visibly distinct
      // rather than landing exactly on top of the mailbox.
      const b = parent.getBounds();
      win.setBounds({
        x: b.x + 40,
        y: b.y + 40,
        width:  win.getBounds().width,
        height: win.getBounds().height,
      });
    }
    win.show();
    // ready-to-show and the toolbar's did-finish-load race; lay out in both so
    // the content view is correctly sized whichever wins.
    layout(win, view);
  });

  // ── Navigation state → toolbar ───────────────────────────────────────────
  const wc = view.webContents;
  const push  = () => sendState(win, view);
  wc.on('did-navigate',            push);
  wc.on('did-navigate-in-page',    push);
  wc.on('did-start-loading',       () => sendState(win, view, { loading: true }));
  wc.on('did-stop-loading',        () => sendState(win, view, { loading: false }));
  wc.on('did-fail-load',           () => sendState(win, view, { loading: false }));

  win.on('resize', () => layout(win, view));

  // Right-click inside the browsed page. No 'openInApp' — we're already in the
  // in-app browser, so offering it again would be a no-op.
  contextMenu.attach(wc, {
    allowNavigation: true,
    openExternal:    (target) => shell.openExternal(target).catch(() => {}),
  });

  // A link inside this window that wants a new window gets another Mailwing
  // browser window on the same session, so the user doesn't get silently
  // bounced out to the OS browser mid-flow.
  wc.setWindowOpenHandler(({ url: childUrl }) => {
    open(childUrl, { session, partition, parent: win });
    return { action: 'deny' };
  });

  win.on('closed', () => {
    browsers.delete(win.id);
    // Explicitly tear the view down — an orphaned BrowserView keeps its
    // webContents (and any media/timers) alive after the window is gone.
    if (!view.webContents.isDestroyed()) {
      try { view.webContents.destroy(); } catch { /* already gone */ }
    }
  });

  return win;
}

/** Close every open browser window (called on quit). */
function closeAll() {
  for (const { win } of browsers.values()) {
    if (win && !win.isDestroyed()) win.destroy();
  }
  browsers.clear();
}

module.exports = { open, closeAll, TOOLBAR_HEIGHT };
