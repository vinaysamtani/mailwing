'use strict';

const SIDEBAR_WIDTH = 72;

const IPC = {
  // renderer → main (invoke = async request/response)
  GET_ACCOUNTS:      'get-accounts',
  GET_PROVIDERS:     'get-providers',
  GET_DARK_MODE:     'get-dark-mode',
  GET_NOTES:         'get-notes',
  ADD_NOTE:          'add-note',
  TOGGLE_NOTE:       'toggle-note',
  REMOVE_NOTE:       'remove-note',
  UPDATE_NOTE:       'update-note',

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
  BANNER_VISIBLE:      'banner-visible',
  DISMISS_UPDATE:      'dismiss-update',
  OPEN_RELEASE_PAGE:   'open-release-page',
  INSTALL_UPDATE:      'install-update',

  // renderer → main (invoke = async request/response)
  GET_SYSTEM_INFO:   'get-system-info',

  // ── Apps Panel ────────────────────────────────────────────────────────────
  // renderer → main (invoke)
  APPS_GET_ALL:           'apps-get-all',
  APPS_ADD:               'apps-add',
  APPS_REMOVE:            'apps-remove',
  APPS_UPDATE:            'apps-update',
  APPS_GET_HIBERNATED:    'apps-get-hibernated',
  APPS_GET_REGISTRY:      'apps-get-registry',
  // renderer → main (send)
  APPS_SWITCH:            'apps-switch',
  APPS_PANEL_OPEN:        'apps-panel-open',
  APPS_PANEL_CLOSE:       'apps-panel-close',
  APPS_SHOW_CONTEXT_MENU: 'apps-show-context-menu',
  // main → renderer (push)
  APPS_UPDATED:               'apps-updated',
  APPS_HIBERNATION_CHANGED:   'apps-hibernation-changed',
  APPS_LOADING_CHANGED:       'apps-loading-changed',
  APPS_EDIT_REQUEST:          'apps-edit-request',
  APPS_CONFIRM_REMOVE:        'apps-confirm-remove',
  REQUEST_ACCOUNT_REMOVE:     'request-account-remove',

  // main → renderer (push)
  ACCOUNTS_UPDATED:  'accounts-updated',
  UNREAD_UPDATED:    'unread-updated',
  DARK_MODE_CHANGED: 'dark-mode-changed',
  SHOW_BUG_REPORT:   'show-bug-report',
  NOTES_UPDATED:     'notes-updated',
  UPDATE_AVAILABLE:  'update-available',
  UPDATE_PROGRESS:   'update-progress',
  UPDATE_READY:      'update-ready',
};

module.exports = { SIDEBAR_WIDTH, IPC };
