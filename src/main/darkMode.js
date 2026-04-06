'use strict';

const { nativeTheme } = require('electron');
const { IPC } = require('../shared/constants');

/**
 * Push the current OS dark-mode state to the renderer immediately on load,
 * then push again whenever the OS theme changes.
 */
function init(win) {
  // Send initial value once the renderer HTML has loaded
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.DARK_MODE_CHANGED, nativeTheme.shouldUseDarkColors);
    }
  });

  nativeTheme.on('updated', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.DARK_MODE_CHANGED, nativeTheme.shouldUseDarkColors);
    }
  });
}

module.exports = { init };
