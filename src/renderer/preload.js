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
  onAccountsUpdated:       (cb) => ipcRenderer.on('accounts-updated',       (_e, d) => cb(d)),
  onUnreadUpdated:         (cb) => ipcRenderer.on('unread-updated',         (_e, d) => cb(d)),
  onDarkModeChanged:       (cb) => ipcRenderer.on('dark-mode-changed',      (_e, d) => cb(d)),
  onShowBugReport:         (cb) => ipcRenderer.on('show-bug-report',        ()      => cb()),
  onRequestAccountRemove:  (cb) => ipcRenderer.on('request-account-remove', (_e, d) => cb(d)),

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

  // ── Apps Panel ────────────────────────────────────────────────────────────
  // Grouped under .apps so the surface area stays organised as it grows.
  apps: {
    getAll:        ()                          => ipcRenderer.invoke('apps-get-all'),
    add:           (input)                     => ipcRenderer.invoke('apps-add',          { input }),
    remove:        (id)                        => ipcRenderer.invoke('apps-remove',       { id }),
    update:        (id, patch)                 => ipcRenderer.invoke('apps-update',       { id, patch }),
    getRegistry:   ()                          => ipcRenderer.invoke('apps-get-registry'),
    getHibernated: ()                          => ipcRenderer.invoke('apps-get-hibernated'),
    switchEntry:   (entryId)                   => ipcRenderer.send('apps-switch',          { entryId }),
    openPanel:     ()                          => ipcRenderer.send('apps-panel-open'),
    closePanel:    ()                          => ipcRenderer.send('apps-panel-close'),
    showContextMenu: (id)                      => ipcRenderer.send('apps-show-context-menu', { id }),
    onUpdated:     (cb) => ipcRenderer.on('apps-updated',              (_e, d) => cb(d)),
    onHibernationChanged: (cb) => ipcRenderer.on('apps-hibernation-changed', (_e, d) => cb(d)),
    onLoadingChanged: (cb) => ipcRenderer.on('apps-loading-changed',   (_e, d) => cb(d)),
    onEditRequest:   (cb) => ipcRenderer.on('apps-edit-request',       (_e, d) => cb(d)),
    onConfirmRemove: (cb) => ipcRenderer.on('apps-confirm-remove',     (_e, d) => cb(d)),
  },

  // ── Update notifications ──────────────────────────────────────────────────
  onUpdateAvailable: (cb)         => ipcRenderer.on('update-available', (_e, d) => cb(d)),
  onUpdateProgress:  (cb)         => ipcRenderer.on('update-progress',  (_e, d) => cb(d)),
  onUpdateReady:     (cb)         => ipcRenderer.on('update-ready',     (_e, d) => cb(d)),
  installUpdate:     ()           => ipcRenderer.send('install-update'),
  dismissUpdate:     (version)    => ipcRenderer.send('dismiss-update',    { version }),
  openReleasePage:   (url)        => ipcRenderer.send('open-release-page', { url }),
  setBannerVisible:  (open)       => ipcRenderer.send('banner-visible',    { open }),

  // ── Static info ───────────────────────────────────────────────────────────
  platform: process.platform,
});
