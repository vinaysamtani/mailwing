'use strict';

const { Tray, Menu, app } = require('electron');
const path = require('path');

let tray            = null;
let mainWin         = null;
let accountsModule  = null;
let viewManagerMod  = null;
let lastUnreadTotal = 0;

function init({ win, accounts, viewManager }) {
  mainWin        = win;
  accountsModule = accounts;
  viewManagerMod = viewManager;

  const iconPath = path.join(__dirname, '../../build/tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Mailwing');

  // Left-click: show / focus
  tray.on('click', () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (mainWin.isVisible()) {
      mainWin.focus();
    } else {
      mainWin.show();
      mainWin.focus();
    }
  });

  updateContextMenu();
}

function updateContextMenu() {
  if (!tray) return;

  const accts = accountsModule ? accountsModule.getAccounts() : [];

  const accountItems = accts.map(a => ({
    label: a.email || `${a.provider} account`,
    click: () => {
      if (!mainWin || mainWin.isDestroyed()) return;
      viewManagerMod.showView(a.id, 'mail');
      mainWin.show();
      mainWin.focus();
    },
  }));

  const template = [
    {
      label: 'Show Mailwing',
      click: () => {
        if (!mainWin || mainWin.isDestroyed()) return;
        mainWin.show();
        mainWin.focus();
      },
    },
    ...(accountItems.length
      ? [{ type: 'separator' }, ...accountItems]
      : []),
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

/**
 * Update badge count shown in dock (macOS) and tray tooltip (all platforms).
 * @param {number} totalUnread
 */
function updateBadge(totalUnread) {
  if (!tray) return;
  lastUnreadTotal = totalUnread;

  if (process.platform === 'darwin') {
    // Dock icon badge (red bubble)
    app.dock.setBadge(totalUnread > 0 ? String(totalUnread) : '');
    // Menu bar: show count as text to the right of the envelope icon
    tray.setTitle(totalUnread > 0 ? String(totalUnread) : '');
  }

  tray.setToolTip(totalUnread > 0 ? `Mailwing (${totalUnread} unread)` : 'Mailwing');
}

/**
 * Re-apply the last known badge value.
 * Call this after app.dock.show() resolves — macOS resets the badge
 * when the dock icon is removed and re-added.
 */
function reapplyBadge() {
  updateBadge(lastUnreadTotal);
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { init, updateBadge, reapplyBadge, updateContextMenu, destroy };
