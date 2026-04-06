'use strict';

const SIDEBAR_WIDTH = 72;

const IPC = {
  // renderer → main (invoke = async request/response)
  GET_ACCOUNTS:      'get-accounts',
  GET_PROVIDERS:     'get-providers',
  GET_DARK_MODE:     'get-dark-mode',

  // renderer → main (send = fire and forget)
  SWITCH_VIEW:       'switch-view',
  ADD_ACCOUNT:       'add-account',
  REMOVE_ACCOUNT:    'remove-account',
  RELOAD_VIEW:       'reload-view',
  SHOW_ADD_MENU:       'show-add-account-menu',
  SHOW_ACCOUNT_MENU:   'show-account-context-menu',
  REORDER_ACCOUNTS:    'reorder-accounts',
  OPEN_EXTERNAL:       'open-external',
  OVERLAY_MODE:        'overlay-mode',

  // renderer → main (invoke = async request/response)
  GET_SYSTEM_INFO:   'get-system-info',

  // main → renderer (push)
  ACCOUNTS_UPDATED:  'accounts-updated',
  UNREAD_UPDATED:    'unread-updated',
  DARK_MODE_CHANGED: 'dark-mode-changed',
  SHOW_BUG_REPORT:   'show-bug-report',
};

module.exports = { SIDEBAR_WIDTH, IPC };
