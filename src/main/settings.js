'use strict';

const Store = require('electron-store');

const store = new Store({ name: 'settings' });

// Where a link that isn't an in-app domain should open.
//   'browser' — the OS default browser (the pre-1.4 behaviour, and the default)
//   'app'     — Mailwing's own browser window, on the originating session
const LINK_TARGET_BROWSER = 'browser';
const LINK_TARGET_APP     = 'app';

function normaliseLinkTarget(value) {
  return value === LINK_TARGET_APP ? LINK_TARGET_APP : LINK_TARGET_BROWSER;
}

/** Default target for links that aren't provider/in-app domains. */
function getLinkTarget() {
  return normaliseLinkTarget(store.get('linkTarget', LINK_TARGET_BROWSER));
}

function setLinkTarget(value) {
  store.set('linkTarget', normaliseLinkTarget(value));
}

module.exports = {
  getLinkTarget,
  setLinkTarget,
  LINK_TARGET_BROWSER,
  LINK_TARGET_APP,
};
