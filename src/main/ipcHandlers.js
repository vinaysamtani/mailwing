'use strict';

const { ipcMain, nativeTheme, Menu, BrowserWindow, app, shell } = require('electron');
const os = require('os');
const { IPC }       = require('../shared/constants');
const { PROVIDERS } = require('../shared/providers');
const { APPS }      = require('../shared/apps');
const notes         = require('./notes');
const appsManager   = require('./appsManager');

let registered = false;

/**
 * Register all IPC handlers.
 * Must be called once after BrowserWindow, viewManager, accounts, and tray are ready.
 */
function register({ win, viewManager, accounts, tray, updateChecker }) {
  if (registered) return;
  registered = true;

  // ── Invokeable (async request/response) ──────────────────────────────────

  ipcMain.handle(IPC.GET_ACCOUNTS, () => accounts.getAccounts());

  ipcMain.handle(IPC.GET_PROVIDERS, () =>
    Object.values(PROVIDERS).map(p => ({
      id:       p.id,
      label:    p.label,
      color:    p.color,
      // Send full service list so renderer can render service buttons
      services: p.services.map(s => ({ id: s.id, label: s.label })),
    }))
  );

  ipcMain.handle(IPC.GET_DARK_MODE, () => nativeTheme.shouldUseDarkColors);

  ipcMain.handle(IPC.GET_SYSTEM_INFO, () => ({
    os:              process.platform,
    osVersion:       os.release(),
    appVersion:      app.getVersion(),
    electronVersion: process.versions.electron,
  }));

  // ── Fire-and-forget (send) ────────────────────────────────────────────────

  ipcMain.on(IPC.SWITCH_VIEW, (_e, { accountId, serviceId }) => {
    viewManager.showView(accountId, serviceId);
  });

  ipcMain.on(IPC.ADD_ACCOUNT, (_e, { provider }) => {
    if (!PROVIDERS[provider]) return;
    const id = accounts.addAccount(provider);
    viewManager.showView(id, PROVIDERS[provider].defaultService);
    win.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
    tray.updateContextMenu();
  });

  ipcMain.on(IPC.REMOVE_ACCOUNT, (_e, { accountId }) => {
    // Apps linked to this email account get unlinked before the account is
    // removed: their views are torn down so the next open creates a fresh
    // standalone partition, and their store entries are updated to clear
    // linkedAccountId. The email's session partition stays on disk (Electron
    // garbage-collects unused partitions over time) so any data the apps
    // wrote there isn't yanked from under them while they're still live.
    const linkedApps = appsManager.getApps().filter(a => a.linkedAccountId === accountId);
    for (const app of linkedApps) {
      if (viewManager.destroyAppView) viewManager.destroyAppView(app.id);
      appsManager.updateApp(app.id, { linkedAccountId: null });
    }

    viewManager.destroyAccountViews(accountId);
    accounts.removeAccount(accountId);

    win.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
    if (linkedApps.length > 0) {
      win.webContents.send(IPC.APPS_UPDATED, appsManager.getApps());
    }
    tray.updateContextMenu();
  });

  ipcMain.on(IPC.RELOAD_VIEW, (_e, { accountId, serviceId }) => {
    viewManager.reloadView(accountId, serviceId);
  });

  // Show a native OS popup menu to pick a provider.
  // Native menus always render on top of BrowserViews — no z-index issues.
  ipcMain.on(IPC.SHOW_ADD_MENU, (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender) || win;
    const template  = Object.values(PROVIDERS).map(p => ({
      label: `Add ${p.label} Account`,
      click: () => {
        const id = accounts.addAccount(p.id);
        viewManager.showView(id, PROVIDERS[p.id].defaultService);
        win.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
        tray.updateContextMenu();
      },
    }));
    Menu.buildFromTemplate(template).popup({ window: senderWin });
  });

  // Show a native context menu for an existing account (colour + remove).
  ipcMain.on(IPC.SHOW_ACCOUNT_MENU, (event, { accountId }) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender) || win;

    const COLOR_OPTIONS = [
      { label: 'Blue',                  color: '#1a73e8' },
      { label: 'Red',                   color: '#d93025' },
      { label: 'Green',                 color: '#188038' },
      { label: 'Purple',                color: '#a142f4' },
      { label: 'Orange',                color: '#e8710a' },
      { label: 'Teal',                  color: '#0097a7' },
      { label: 'Pink',                  color: '#e91e63' },
      { label: 'Yellow',                color: '#f9ab00' },
      { label: 'Default (provider)',    color: null      },
    ];

    const colorSubmenu = COLOR_OPTIONS.map(({ label, color }) => ({
      label,
      click: () => {
        accounts.updateAccount(accountId, { color });
        win.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
      },
    }));

    const template = [
      { label: 'Colour', submenu: colorSubmenu },
      { type: 'separator' },
      {
        label: 'Remove Account',
        click: () => {
          // If any apps are linked to this account, defer the actual remove
          // to the renderer's confirm modal so the user can see the impact.
          // The renderer fires REMOVE_ACCOUNT once they confirm; that handler
          // does the unlink + destroy + remove.
          const linkedApps = appsManager.getApps().filter(a => a.linkedAccountId === accountId);
          if (linkedApps.length > 0) {
            win.webContents.send(IPC.REQUEST_ACCOUNT_REMOVE, {
              accountId,
              linkedApps: linkedApps.map(a => ({ id: a.id, label: a.label })),
            });
            return;
          }
          // No linked apps → preserve the previous instant-remove behaviour.
          viewManager.destroyAccountViews(accountId);
          accounts.removeAccount(accountId);
          win.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
          tray.updateContextMenu();
        },
      },
    ];
    Menu.buildFromTemplate(template).popup({ window: senderWin });
  });

  // Persist a new drag-drop ordering of account buttons.
  ipcMain.on(IPC.REORDER_ACCOUNTS, (_e, { ids }) => {
    accounts.reorderAccounts(ids);
  });

  // Open a URL in the system browser.
  ipcMain.on(IPC.OPEN_EXTERNAL, (_e, { url }) => {
    shell.openExternal(url);
  });

  // Hide/reveal the active BrowserView so HTML overlays (modals) can show through.
  ipcMain.on(IPC.OVERLAY_MODE, (_e, { open }) => {
    if (open) viewManager.hideActiveView();
    else      viewManager.revealActiveView();
  });

  // Renderer tells main when the update banner is taking up its top row, so
  // the BrowserView can be shifted down to leave the banner visible.
  ipcMain.on(IPC.BANNER_VISIBLE, (_e, { open }) => {
    viewManager.setBannerVisible(open);
  });

  // ── Notes / Todo ─────────────────────────────────────────────────────────
  // Personal scratch list — global, not per-account. Persisted in notes.json.

  const broadcastNotes = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.NOTES_UPDATED, notes.getNotes());
  };

  ipcMain.handle(IPC.GET_NOTES, () => notes.getNotes());

  ipcMain.handle(IPC.ADD_NOTE, (_e, { text }) => {
    const id = notes.addNote(text);
    broadcastNotes();
    return id;
  });

  ipcMain.handle(IPC.TOGGLE_NOTE, (_e, { id }) => {
    notes.toggleNote(id);
    broadcastNotes();
  });

  ipcMain.handle(IPC.REMOVE_NOTE, (_e, { id }) => {
    notes.removeNote(id);
    broadcastNotes();
  });

  ipcMain.handle(IPC.UPDATE_NOTE, (_e, { id, patch }) => {
    notes.updateNote(id, patch);
    broadcastNotes();
  });

  // ── Update notifications ─────────────────────────────────────────────────
  // The banner UI calls these from the renderer. electron-updater downloads in
  // the background; INSTALL_UPDATE applies the staged update and relaunches.

  ipcMain.on(IPC.INSTALL_UPDATE, () => {
    if (updateChecker) updateChecker.quitAndInstall();
  });

  ipcMain.on(IPC.DISMISS_UPDATE, (_e, { version }) => {
    if (updateChecker) updateChecker.dismiss(version);
  });

  ipcMain.on(IPC.OPEN_RELEASE_PAGE, (_e, { url }) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) {
      shell.openExternal(url);
    }
  });

  // ── Apps Panel ────────────────────────────────────────────────────────────

  const broadcastApps = () => {
    if (!win.isDestroyed()) win.webContents.send(IPC.APPS_UPDATED, appsManager.getApps());
  };

  ipcMain.handle(IPC.APPS_GET_ALL, () => appsManager.getApps());

  ipcMain.handle(IPC.APPS_GET_REGISTRY, () => APPS);

  ipcMain.handle(IPC.APPS_GET_HIBERNATED, () =>
    viewManager.getHibernatedAppIds ? Array.from(viewManager.getHibernatedAppIds()) : []
  );

  ipcMain.handle(IPC.APPS_ADD, (_e, { input }) => {
    if (!input || typeof input.label !== 'string' || typeof input.url !== 'string') return null;
    // Whitelist before passing to appsManager so the renderer can't write
    // arbitrary fields into the store.
    const safeInput = {
      label:           input.label,
      url:             input.url,
      registryKey:     input.registryKey || null,
      accentColor:     input.accentColor || null,
      linkedAccountId: input.linkedAccountId || null,
    };
    const id = appsManager.addApp(safeInput);
    broadcastApps();
    return id;
  });

  ipcMain.handle(IPC.APPS_REMOVE, async (_e, { id }) => {
    // Look up the app BEFORE destroying its view so we know whether it's
    // linked — a linked app shares its session with an email account, and we
    // must not wipe that shared partition's storage on remove.
    const app = appsManager.getApps().find(a => a.id === id);
    const wasLinked = !!(app && app.linkedAccountId);

    if (viewManager.destroyAppView) viewManager.destroyAppView(id);
    appsManager.removeApp(id);

    if (!wasLinked) {
      // Standalone partition: clear on-disk session data so the partition
      // doesn't leak after the entry is gone. A subsequent re-add of the
      // same app prompts a fresh login.
      try {
        const { session } = require('electron');
        await session.fromPartition('persist:mailwing-app-' + id).clearStorageData();
      } catch { /* ignore — session may not exist */ }
    }
    broadcastApps();
    return true;
  });

  ipcMain.handle(IPC.APPS_UPDATE, (_e, { id, patch }) => {
    if (!id || !patch || typeof patch !== 'object') return false;
    // Whitelist keys so the renderer can't smuggle arbitrary fields in.
    const ALLOWED = ['label', 'url', 'accentColor', 'linkedAccountId'];
    const safePatch = {};
    for (const k of ALLOWED) if (k in patch) safePatch[k] = patch[k];
    appsManager.updateApp(id, safePatch);
    broadcastApps();
    return true;
  });

  ipcMain.on(IPC.APPS_PANEL_OPEN, () => {
    if (viewManager.setAppsPanelOpen) viewManager.setAppsPanelOpen(true);
  });

  ipcMain.on(IPC.APPS_PANEL_CLOSE, () => {
    if (viewManager.setAppsPanelOpen) viewManager.setAppsPanelOpen(false);
  });

  ipcMain.on(IPC.APPS_SWITCH, (_e, { entryId }) => {
    if (!entryId || entryId === 'notes') {
      if (viewManager.showAppEntry) viewManager.showAppEntry('notes');
      return;
    }
    const app = appsManager.getApps().find(a => a.id === entryId);
    if (!app) return;
    const registryEntry = app.registryKey ? APPS[app.registryKey] : null;
    if (viewManager.showApp) viewManager.showApp(app, registryEntry);
  });

  ipcMain.on(IPC.APPS_SHOW_CONTEXT_MENU, (event, { id }) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender) || win;
    const app       = appsManager.getApps().find(a => a.id === id);
    if (!app) return;

    // Use the same palette as email accounts so the visual language matches.
    const APP_COLOR_OPTIONS = [
      { label: 'Blue',                color: '#1a73e8' },
      { label: 'Red',                 color: '#d93025' },
      { label: 'Green',               color: '#188038' },
      { label: 'Purple',              color: '#a142f4' },
      { label: 'Orange',              color: '#e8710a' },
      { label: 'Teal',                color: '#0097a7' },
      { label: 'Pink',                color: '#e91e63' },
      { label: 'Yellow',              color: '#f9ab00' },
      { label: 'No accent',           color: null      },
    ];

    const colorSubmenu = APP_COLOR_OPTIONS.map(({ label, color }) => ({
      label,
      type:    'radio',
      checked: app.accentColor === color,
      click:   () => {
        appsManager.updateApp(id, { accentColor: color });
        broadcastApps();
      },
    }));

    const template = [
      { label: 'Edit…',         click: () => win.webContents.send(IPC.APPS_EDIT_REQUEST,    { id }) },
      { label: 'Accent colour', submenu: colorSubmenu },
      { type:  'separator' },
      { label: 'Remove…',       click: () => win.webContents.send(IPC.APPS_CONFIRM_REMOVE,  { id }) },
    ];
    Menu.buildFromTemplate(template).popup({ window: senderWin });
  });
}

function cleanup() {
  if (!registered) return;
  for (const channel of Object.values(IPC)) {
    ipcMain.removeAllListeners(channel);
  }
  registered = false;
}

module.exports = { register, cleanup };
