'use strict';

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');

const { IPC } = require('../shared/constants');

// First check 10 s after launch (give the renderer time to attach its update
// listeners), then every 6 hours while the app is open.
const FIRST_CHECK_DELAY_MS = 10_000;
const RECHECK_INTERVAL_MS  = 6 * 60 * 60 * 1000;

const store = new Store({ name: 'update-state' });

let mainWin       = null;
let downloadReady = false;

function send(channel, payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
}

function start({ win }) {
  mainWin = win;

  // Auto-update only works inside a packaged, code-signed app: in dev there is
  // no app-update.yml for electron-updater to read, and macOS rejects unsigned
  // update bundles. Skip the whole machinery outside a packaged build.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload         = true;  // fetch in the background as soon as found
  autoUpdater.autoInstallOnAppQuit = true;  // also apply silently if the user just quits
  autoUpdater.logger               = null;
  // Channel-aware: a pre-release build (version contains a '-', e.g.
  // "1.3.0-beta.1") tracks the beta channel and updates to newer betas; a
  // stable build only ever sees stable releases.
  autoUpdater.allowPrerelease      = /-/.test(app.getVersion());

  autoUpdater.on('update-available', (info) => {
    // Honour a per-version dismissal so we don't nag about a release the user
    // already waved off. The download still proceeds in the background.
    if (store.get('dismissedVersion', '') === String(info.version)) return;
    send(IPC.UPDATE_AVAILABLE, { version: info.version });
  });

  autoUpdater.on('download-progress', (p) => {
    send(IPC.UPDATE_PROGRESS, { percent: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    downloadReady = true;
    // Honour the same dismissal as 'update-available'. Without this the banner
    // reappears a few minutes later when the background download finishes,
    // making the dismissal look broken. The update is still staged on disk and
    // autoInstallOnAppQuit will apply it on the next quit either way.
    if (store.get('dismissedVersion', '') === String(info.version)) return;
    send(IPC.UPDATE_READY, { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    // Silent — never bother the user about a failed update poll.
    console.log('[updateChecker] error:', err && err.message);
  });

  setTimeout(checkNow, FIRST_CHECK_DELAY_MS);
  setInterval(checkNow, RECHECK_INTERVAL_MS);
}

function checkNow() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((e) => {
    console.log('[updateChecker] check failed:', e.message);
  });
}

function dismiss(version) {
  store.set('dismissedVersion', String(version || ''));
}

/** Quit and install the already-downloaded update, then relaunch. */
function quitAndInstall() {
  if (!downloadReady) return;
  // isSilent=false → show the installer UI on Windows; isForceRunAfter=true →
  // relaunch Mailwing once the update is applied.
  autoUpdater.quitAndInstall(false, true);
}

module.exports = { start, checkNow, dismiss, quitAndInstall };
