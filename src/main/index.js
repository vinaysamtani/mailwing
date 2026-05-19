'use strict';

const { app, BrowserWindow, shell, nativeTheme, Menu } = require('electron');
const path = require('path');

const { PROVIDERS }   = require('../shared/providers');
const accounts        = require('./accounts');
const windowState     = require('./windowState');
const viewManager     = require('./viewManager');
const notifications   = require('./notifications');
const tray            = require('./tray');
const darkMode        = require('./darkMode');
const ipcHandlers     = require('./ipcHandlers');
const updateChecker   = require('./updateChecker');
const sessionManager  = require('./sessionManager');

// ─── Performance flags ───────────────────────────────────────────────────────
// Must be set before app is ready.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('enable-gpu-rasterization');
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'Metal');
}

// ─── Single-instance lock ────────────────────────────────────────────────────
// On Windows/Linux, a second launch with a mailto: URL fires 'second-instance'
// on the already-running instance so we can handle the URL there.

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ─── mailto: protocol ────────────────────────────────────────────────────────
app.setAsDefaultProtocolClient('mailto');

// ─── Main window ─────────────────────────────────────────────────────────────

const GITHUB_REPO = 'https://github.com/vinaysamtani/mailwing';

let mainWin    = null;
let forceQuit  = false; // set to true by before-quit so the close handler lets the window go

// Keep references to open compose windows so they aren't garbage-collected
// while they're still on screen.
const composeWindows = new Set();

function setAppMenu(win) {
  const { IPC } = require('../shared/constants');

  const helpSubmenu = [
    {
      label: 'Report a Bug',
      accelerator: process.platform === 'darwin' ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
      click: () => win.webContents.send(IPC.SHOW_BUG_REPORT),
    },
    { type: 'separator' },
    {
      label: 'View Existing Issues',
      click: () => shell.openExternal(`${GITHUB_REPO}/issues`),
    },
  ];

  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    { label: 'Help', submenu: helpSubmenu },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const saved = windowState.restore();

  mainWin = new BrowserWindow({
    width:   saved.width  || 1280,
    height:  saved.height || 800,
    x:       saved.x,
    y:       saved.y,
    minWidth:  680,
    minHeight: 500,

    // macOS: traffic-light buttons overlay the sidebar top-left
    // x:10 y:14 keeps all three buttons comfortably inside the 72px sidebar
    titleBarStyle:         process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition:  process.platform === 'darwin' ? { x: 10, y: 14 } : undefined,

    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f2f5',

    webPreferences: {
      preload:          path.join(__dirname, '../renderer/preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       false,
    },

    icon: path.join(__dirname, '../../build/icon.png'),
    show: false, // shown below after 'ready-to-show'
  });

  mainWin.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWin.once('ready-to-show', () => {
    mainWin.show();
    if (saved.isMaximized) mainWin.maximize();
  });

  // Open any links that try to open a new window in the system browser
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ── Init all modules ────────────────────────────────────────────────────
  viewManager.init({ win: mainWin, accountsModule: accounts });
  notifications.init({ accountsModule: accounts, viewManagerModule: viewManager, win: mainWin });
  tray.init({ win: mainWin, accounts, viewManager });
  viewManager.setTray(tray); // wire up so broadcastUnread updates dock + menu bar
  darkMode.init(mainWin);
  ipcHandlers.register({ win: mainWin, viewManager, accounts, tray, updateChecker });
  setAppMenu(mainWin);

  // Background poll: nudges the renderer to show an update banner when a newer
  // GitHub release is published. First check fires 10 s after launch.
  updateChecker.start({ win: mainWin });

  // ── Window state persistence ────────────────────────────────────────────
  let resizeTimer;
  mainWin.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      viewManager.relayout();
      windowState.save(mainWin);
    }, 50);
  });

  mainWin.on('move', () => windowState.save(mainWin));

  // On macOS: hide instead of close so the tray and dock can restore the window.
  // forceQuit is set by before-quit (tray → Quit), which lets the window actually close.
  mainWin.on('close', (e) => {
    windowState.save(mainWin);
    if (process.platform === 'darwin' && !forceQuit) {
      e.preventDefault();
      mainWin.hide();
      // macOS removes the dock icon when all windows are hidden, taking the
      // unread badge with it. Re-pin it and re-apply the badge once the
      // Promise resolves (the icon reappears fresh with no badge otherwise).
      if (app.dock) app.dock.show().then(() => tray.reapplyBadge());
    }
  });

  // ── Restore existing accounts ───────────────────────────────────────────
  const existing = accounts.getAccounts();
  if (existing.length > 0) {
    const first    = existing[0];
    const provider = PROVIDERS[first.provider];
    if (provider) {
      viewManager.showView(first.id, provider.defaultService);
    }
  }

  // Pre-load mail views for all other accounts in the background so their
  // unread pollers start immediately — counts appear without needing to
  // visit each account manually.
  viewManager.warmUpMailViews();

  // Fires only on actual quit (forceQuit = true on macOS, or close on Windows/Linux).
  mainWin.on('closed', () => {
    viewManager.destroyAllViews();
    mainWin = null;
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // macOS: set dock icon explicitly — the BrowserWindow `icon` option only affects
  // the window chrome, not the dock, in dev mode (no built .app bundle).
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, '../../build/icon.png'));
  }

  createWindow();

  app.on('activate', () => {
    // macOS: bring back window if dock icon is clicked after all windows closed
    if (!mainWin) {
      createWindow();
    } else {
      mainWin.show();
      mainWin.focus();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS keep the process alive (user can re-open via dock / tray)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  forceQuit = true;
  ipcHandlers.cleanup();
  tray.destroy();
});

// ─── mailto: handling ─────────────────────────────────────────────────────────

// macOS: OS fires this when a mailto: link is clicked anywhere
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleMailto(url);
});

// Windows / Linux: fired when a second instance is launched with a mailto: URL
app.on('second-instance', (_event, argv) => {
  if (mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  }
  const mailtoUrl = argv.find(a => a.startsWith('mailto:'));
  if (mailtoUrl) handleMailto(mailtoUrl);
});

function handleMailto(rawUrl) {
  if (!mainWin || mainWin.isDestroyed()) return;

  const accts = accounts.getAccounts();
  if (!accts.length) return;

  // Single account: open immediately without a picker
  if (accts.length === 1) {
    openMailtoInAccount(accts[0], rawUrl);
    return;
  }

  // Multiple accounts: show native OS account-picker menu
  const template = accts.map((account, index) => {
    const provider = PROVIDERS[account.provider];
    const label = account.email
      ? `${account.email}${provider ? ' (' + provider.label + ')' : ''}`
      : `${provider?.label ?? account.provider} Account ${index + 1}`;
    return { label, click: () => openMailtoInAccount(account, rawUrl) };
  });

  mainWin.show();
  mainWin.focus();
  app.focus({ steal: true });
  Menu.buildFromTemplate(template).popup({ window: mainWin });
}

function openMailtoInAccount(account, rawUrl) {
  const provider = PROVIDERS[account.provider];
  if (!provider) return;

  // Open the compose URL in its own BrowserWindow that shares the account's
  // session partition. The pre-warmed mail BrowserView stays untouched —
  // no full-page reload, no blank flash, and the user's inbox is still there
  // after they hit send. The shared session means cookies/auth carry over so
  // the provider treats this as the signed-in user.
  const sess = sessionManager.getOrCreateSession(account.id, provider);
  const titleLabel = account.email || provider.label;

  const composeWin = new BrowserWindow({
    width:  900,
    height: 680,
    title:  `Compose — ${titleLabel}`,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f0f2f5',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      session:          sess,
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       true,
    },
  });

  // Keep our chosen title — the provider's page title (e.g. "Inbox - user@…")
  // is misleading for a compose window.
  composeWin.webContents.on('page-title-updated', (e) => e.preventDefault());

  // Mirror viewManager's popup rules: provider/auth hosts open in-app on the
  // shared session (passkey, OAuth, "open in new window"); everything else
  // opens in the OS browser.
  composeWin.webContents.setWindowOpenHandler(({ url }) => {
    let isSafe = false;
    try {
      const { hostname } = new URL(url);
      isSafe = provider.safeDomains.some(
        d => hostname === d || hostname.endsWith('.' + d)
      );
    } catch { /* invalid URL → open externally */ }

    if (!isSafe) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          partition:        'persist:mailwing-' + account.id,
          contextIsolation: true,
          nodeIntegration:  false,
        },
      },
    };
  });

  composeWin.loadURL(provider.mailtoComposeUrl(rawUrl));
  composeWindows.add(composeWin);
  composeWin.on('closed', () => composeWindows.delete(composeWin));

  app.focus({ steal: true });
}
