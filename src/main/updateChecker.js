'use strict';

const https   = require('https');
const { app } = require('electron');
const Store   = require('electron-store');

const { IPC } = require('../shared/constants');

// GitHub Releases API for the upstream repo. README points users here, so this
// is the source of truth for "what is the latest published version".
const RELEASES_API_URL = 'https://api.github.com/repos/vinaysamtani/mailwing/releases/latest';

// First check 10 s after launch (give the renderer time to attach its
// onUpdateAvailable listener), then every 6 hours while the app is open.
const FIRST_CHECK_DELAY_MS = 10_000;
const RECHECK_INTERVAL_MS  = 6 * 60 * 60 * 1000;

const store = new Store({ name: 'update-state' });

let mainWin = null;

function start({ win }) {
  mainWin = win;
  setTimeout(checkNow, FIRST_CHECK_DELAY_MS);
  setInterval(checkNow, RECHECK_INTERVAL_MS);
}

async function checkNow() {
  try {
    const release = await fetchLatestRelease();
    if (!release || !release.tag_name) return;

    const latest  = normaliseVersion(release.tag_name);
    const current = normaliseVersion(app.getVersion());
    if (compareVersions(latest, current) <= 0) return; // not newer

    const dismissed = store.get('dismissedVersion', '');
    if (dismissed && compareVersions(latest, normaliseVersion(dismissed)) === 0) return;

    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send(IPC.UPDATE_AVAILABLE, {
        version: release.tag_name,   // raw tag, e.g. "v1.2.0"
        url:     release.html_url,    // GitHub release page
        name:    release.name || release.tag_name,
        body:    release.body || '',
      });
    }
  } catch (e) {
    // Silent — never bother the user about a failed update poll.
    console.log('[updateChecker] check failed:', e.message);
  }
}

function dismiss(version) {
  store.set('dismissedVersion', String(version || ''));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      RELEASES_API_URL,
      {
        headers: {
          'User-Agent': 'Mailwing-Updater',
          'Accept':     'application/vnd.github+json',
        },
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end',  () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error',   reject);
  });
}

/** Strip a leading 'v' if present so "v1.2.0" and "1.2.0" compare equal. */
function normaliseVersion(s) {
  return String(s || '').replace(/^v/i, '').trim();
}

/**
 * Compare two dotted-numeric version strings. Returns:
 *   < 0 if a is older than b
 *   = 0 if equal
 *   > 0 if a is newer than b
 * Tolerates extra parts (1.2.0.1) and trailing pre-release suffixes (1.2.0-beta)
 * by ignoring anything after the first non-numeric segment.
 */
function compareVersions(a, b) {
  const partsA = a.split(/[.-]/).map(p => parseInt(p, 10));
  const partsB = b.split(/[.-]/).map(p => parseInt(p, 10));
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const va = Number.isFinite(partsA[i]) ? partsA[i] : 0;
    const vb = Number.isFinite(partsB[i]) ? partsB[i] : 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

module.exports = { start, checkNow, dismiss };
