'use strict';

const { randomUUID } = require('crypto');
const Store = require('electron-store');

const store = new Store({ name: 'apps' });

/**
 * App account shape (mirror of accounts.js):
 * {
 *   id:          string  — 'app_' + UUID; also used as session partition suffix
 *   registryKey: string  — key from src/shared/apps.js APPS, or null for custom URLs
 *   label:       string  — user-visible name in the app list (editable)
 *   url:         string  — default URL to load when no lastUrl is set
 *   accentColor: string  — hex like '#1a73e8' or null for the default tint
 *   createdAt:   number  — Unix ms
 * }
 *
 * Last-visited URLs live in a flat map under the `appLastUrl` store key:
 *   { [appId]: 'https://...last visited url...' }
 * Hibernation (and quit) writes here; rehydration reads it back. The hostname
 * safety check lives in viewManager — this module just stores what it's told.
 */

function getApps() {
  return store.get('apps', []);
}

function addApp(input) {
  const id  = 'app_' + randomUUID();
  const app = {
    id,
    registryKey: input.registryKey || null,
    label:       String(input.label || '').trim(),
    url:         String(input.url || '').trim(),
    accentColor: input.accentColor || null,
    createdAt:   Date.now(),
  };
  const list = getApps();
  list.push(app);
  store.set('apps', list);
  return id;
}

function removeApp(id) {
  store.set('apps', getApps().filter(a => a.id !== id));
  // Drop the lastUrl entry too so a re-add with the same id (defensive)
  // doesn't inherit a stale page.
  clearLastUrl(id);
}

function updateApp(id, patch) {
  const list = getApps();
  const idx  = list.findIndex(a => a.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  store.set('apps', list);
}

function getLastUrl(id) {
  const map = store.get('appLastUrl', {});
  return map[id] || null;
}

function setLastUrl(id, url) {
  const map = store.get('appLastUrl', {});
  map[id] = url;
  store.set('appLastUrl', map);
}

function clearLastUrl(id) {
  const map = store.get('appLastUrl', {});
  if (!(id in map)) return;
  delete map[id];
  store.set('appLastUrl', map);
}

module.exports = {
  getApps,
  addApp,
  removeApp,
  updateApp,
  getLastUrl,
  setLastUrl,
  clearLastUrl,
};
