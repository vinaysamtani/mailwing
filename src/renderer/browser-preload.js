'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Named bridge for the in-app browser toolbar, under window.mailwingBrowser.
 * Deliberately separate from the main window's `window.mailwing` API — this
 * document only ever drives the navigation controls for its own BrowserView.
 *
 * Channel names are literals rather than imports from shared/constants.js:
 * a preload script can't resolve app-relative requires, so pulling the
 * constants in makes the whole preload fail to load. Same convention as
 * preload.js — keep these strings in sync with the IPC.BROWSER_* values.
 */
contextBridge.exposeInMainWorld('mailwingBrowser', {
  back:         () => ipcRenderer.send('browser-back'),
  forward:      () => ipcRenderer.send('browser-forward'),
  reload:       () => ipcRenderer.send('browser-reload'),
  stop:         () => ipcRenderer.send('browser-stop'),
  openExternal: () => ipcRenderer.send('browser-open-external'),

  // main pushes { url, canGoBack, canGoForward, loading } on every navigation
  onState: (cb) => ipcRenderer.on('browser-state', (_e, state) => cb(state)),
});
