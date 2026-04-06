'use strict';

const { ipcMain, nativeTheme, Menu, BrowserWindow, app, shell } = require('electron');
const os = require('os');
const { IPC }       = require('../shared/constants');
const { PROVIDERS } = require('../shared/providers');

let registered = false;

/**
 * Register all IPC handlers.
 * Must be called once after BrowserWindow, viewManager, accounts, and tray are ready.
 */
function register({ win, viewManager, accounts, tray }) {
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
    viewManager.destroyAccountViews(accountId);
    accounts.removeAccount(accountId);
    win.webContents.send(IPC.ACCOUNTS_UPDATED, accounts.getAccounts());
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
}

function cleanup() {
  if (!registered) return;
  for (const channel of Object.values(IPC)) {
    ipcMain.removeAllListeners(channel);
  }
  registered = false;
}

module.exports = { register, cleanup };
