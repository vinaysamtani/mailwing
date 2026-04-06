'use strict';

const path = require('path');
const { Notification, app } = require('electron');

let accountsModule   = null;
let viewManagerModule = null;
let mainWin          = null;

// Per-account cooldown to avoid notification spam
const lastNotified  = new Map();
const COOLDOWN_MS   = 5000;

function init({ accountsModule: am, viewManagerModule: vm, win }) {
  accountsModule    = am;
  viewManagerModule = vm;
  mainWin           = win;
}

/**
 * Fire a desktop notification for new mail in a given account.
 * Uses Electron-native Notification (not Web Notifications API) so that
 * click handling is reliable and works even when the app window is hidden.
 *
 * @param {string} accountId
 * @param {number} newCount   Number of new messages since last check
 */
function fireNewEmailNotification(accountId, newCount) {
  const now = Date.now();
  if (now - (lastNotified.get(accountId) || 0) < COOLDOWN_MS) return;
  lastNotified.set(accountId, now);

  if (!Notification.isSupported()) return;

  const account = accountsModule ? accountsModule.getAccounts().find(a => a.id === accountId) : null;
  const label   = account?.email || (account?.provider ? `${account.provider} account` : 'your account');
  const plural  = newCount > 1 ? 's' : '';

  const iconPath = path.join(__dirname, '../../build/icon.png');

  const n = new Notification({
    title: 'New mail',
    body:  `${newCount} new message${plural} in ${label}`,
    icon:  iconPath,
    silent: false,
  });

  n.on('click', () => {
    if (!mainWin || mainWin.isDestroyed()) return;

    // Switch to this account's mail view
    if (viewManagerModule) {
      viewManagerModule.showView(accountId, 'mail');
    }

    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
    app.focus({ steal: true });
  });

  n.show();
}

module.exports = { init, fireNewEmailNotification };
