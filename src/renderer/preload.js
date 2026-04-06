'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a minimal, typed API to the renderer under window.mailwing.
 * No raw IPC is exposed — every channel goes through a named wrapper.
 */
contextBridge.exposeInMainWorld('mailwing', {
  // ── Async request / response ──────────────────────────────────────────────
  getAccounts:  () => ipcRenderer.invoke('get-accounts'),
  getProviders: () => ipcRenderer.invoke('get-providers'),
  getDarkMode:  () => ipcRenderer.invoke('get-dark-mode'),

  // ── Fire and forget ───────────────────────────────────────────────────────
  switchView:         (accountId, serviceId) => ipcRenderer.send('switch-view',             { accountId, serviceId }),
  addAccount:         (provider)             => ipcRenderer.send('add-account',             { provider }),
  removeAccount:      (accountId)            => ipcRenderer.send('remove-account',          { accountId }),
  reloadView:         (accountId, serviceId) => ipcRenderer.send('reload-view',             { accountId, serviceId }),
  // Shows a native OS popup menu — always on top of any BrowserView
  showAddAccountMenu: ()                     => ipcRenderer.send('show-add-account-menu'),
  showAccountMenu:    (accountId)            => ipcRenderer.send('show-account-context-menu', { accountId }),
  reorderAccounts:    (ids)                  => ipcRenderer.send('reorder-accounts',          { ids }),

  // ── Push events from main ─────────────────────────────────────────────────
  onAccountsUpdated: (cb) => ipcRenderer.on('accounts-updated',  (_e, d) => cb(d)),
  onUnreadUpdated:   (cb) => ipcRenderer.on('unread-updated',    (_e, d) => cb(d)),
  onDarkModeChanged: (cb) => ipcRenderer.on('dark-mode-changed', (_e, d) => cb(d)),
  onShowBugReport:   (cb) => ipcRenderer.on('show-bug-report',   ()      => cb()),

  // ── Bug reporting ─────────────────────────────────────────────────────────
  getSystemInfo: ()      => ipcRenderer.invoke('get-system-info'),
  openExternal:  (url)   => ipcRenderer.send('open-external', { url }),
  overlayMode:   (open)  => ipcRenderer.send('overlay-mode',  { open }),

  // ── Static info ───────────────────────────────────────────────────────────
  platform: process.platform,
});
