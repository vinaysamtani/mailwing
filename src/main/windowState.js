'use strict';

const { screen } = require('electron');
const Store = require('electron-store');

const store     = new Store({ name: 'window-state' });
let saveTimer   = null;

/**
 * Returns saved bounds if they're still on a visible display, otherwise {}.
 * Spread the result into BrowserWindow options — undefined x/y will be ignored
 * and Electron will centre the window.
 */
function restore() {
  const saved = store.get('windowState');
  if (!saved) return {};

  const { x, y, width, height, isMaximized } = saved;

  // Verify the saved position is still on a connected display
  const onScreen = screen.getAllDisplays().some(d => {
    const b = d.bounds;
    return x >= b.x && y >= b.y
      && x + 100 <= b.x + b.width
      && y + 50  <= b.y + b.height;
  });

  return onScreen
    ? { x, y, width: width || 1280, height: height || 800, isMaximized: !!isMaximized }
    : { width: 1280, height: 800 };
}

/** Debounced save — called on resize/move/close. */
function save(win) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) {
      const prev = store.get('windowState', {});
      store.set('windowState', { ...prev, isMaximized: true });
    } else {
      const [x, y]           = win.getPosition();
      const [width, height]  = win.getSize();
      store.set('windowState', { x, y, width, height, isMaximized: false });
    }
  }, 300);
}

module.exports = { restore, save };
