'use strict';

const { randomUUID } = require('crypto');
const Store = require('electron-store');

const store = new Store({ name: 'accounts' });

/**
 * Account shape:
 * {
 *   id:            string   — stable UUID, also used as session partition suffix
 *   provider:      string   — key from PROVIDERS registry ('google' | 'zoho' | ...)
 *   email:         string   — populated after avatar extraction (best-effort)
 *   avatarDataURL: string   — base64 data URL shown in sidebar
 *   addedAt:       number   — Unix timestamp ms
 * }
 */

function getAccounts() {
  return store.get('accounts', []);
}

function addAccount(provider) {
  const id      = randomUUID();
  // color: null means "use provider default"; user can override via right-click
  const account = { id, provider, email: '', avatarDataURL: '', color: null, addedAt: Date.now() };
  const list    = getAccounts();
  list.push(account);
  store.set('accounts', list);
  return id;
}

function removeAccount(id) {
  store.set('accounts', getAccounts().filter(a => a.id !== id));
}

function updateAccount(id, patch) {
  const list = getAccounts();
  const idx  = list.findIndex(a => a.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  store.set('accounts', list);
}

/**
 * Persist a new ordering of accounts.
 * @param {string[]} orderedIds  Full list of account IDs in the desired order
 */
function reorderAccounts(orderedIds) {
  const current    = getAccounts();
  const reordered  = orderedIds.map(id => current.find(a => a.id === id)).filter(Boolean);
  // Append any accounts missing from the provided list (safety net)
  current.forEach(a => { if (!orderedIds.includes(a.id)) reordered.push(a); });
  store.set('accounts', reordered);
}

module.exports = { getAccounts, addAccount, removeAccount, updateAccount, reorderAccounts };
