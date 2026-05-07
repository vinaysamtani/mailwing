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

  // ── Notes / Todo ──────────────────────────────────────────────────────────
  getNotes:        ()             => ipcRenderer.invoke('get-notes'),
  addNote:         (text)         => ipcRenderer.invoke('add-note',    { text }),
  toggleNote:      (id)           => ipcRenderer.invoke('toggle-note', { id }),
  removeNote:      (id)           => ipcRenderer.invoke('remove-note', { id }),
  updateNote:      (id, patch)    => ipcRenderer.invoke('update-note', { id, patch }),
  onNotesUpdated:  (cb)           => ipcRenderer.on('notes-updated', (_e, d) => cb(d)),

  // ── Update notifications ──────────────────────────────────────────────────
  onUpdateAvailable: (cb)         => ipcRenderer.on('update-available', (_e, d) => cb(d)),
  dismissUpdate:     (version)    => ipcRenderer.send('dismiss-update',    { version }),
  openReleasePage:   (url)        => ipcRenderer.send('open-release-page', { url }),
  setBannerVisible:  (open)       => ipcRenderer.send('banner-visible',    { open }),

  // ── Static info ───────────────────────────────────────────────────────────
  platform: process.platform,
});
