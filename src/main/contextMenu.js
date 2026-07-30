'use strict';

const { Menu, MenuItem, clipboard, shell, app, BrowserWindow } = require('electron');

/**
 * Native right-click menus.
 *
 * Electron ships no default context menu — every webContents fires
 * 'context-menu' and it's on us to build one. Without this, right-clicking
 * anywhere in a mail view, an app view, a compose window or the sidebar's own
 * modals does nothing at all.
 *
 * Actions use explicit `click` handlers rather than menu `role`s on purpose:
 * roles act on the *focused* webContents, and a right-click on a BrowserView
 * doesn't reliably move focus — so a role can silently act on the wrong
 * contents (e.g. paste into the sidebar instead of the mailbox).
 */

// Long selections/links make for unreadable menu labels.
const MAX_LABEL = 32;

function truncate(str, max = MAX_LABEL) {
  const flat = String(str || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** Menus can't render a literal '&' — it's the mnemonic marker on Win/Linux. */
function escapeLabel(str) {
  return String(str || '').replace(/&/g, '&&');
}

function searchUrl(query) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(query);
}

// Electron 30+ moved history off webContents. Keep the old calls as a fallback
// so this still works if the Electron floor ever moves back.
const nav = (wc) => wc.navigationHistory || wc;

/**
 * Attach a context menu to a webContents.
 *
 * @param {Electron.WebContents} webContents
 * @param {object}   [opts]
 * @param {boolean}  [opts.allowNavigation] add Back / Forward / Reload
 * @param {function} [opts.openExternal]    (url) => void — open in the OS browser
 * @param {function} [opts.openInApp]       (url) => void — open in a Mailwing browser
 *                                          window. Omitted where that makes no
 *                                          sense (the in-app browser itself).
 * @param {function} [opts.getWindow]       () => BrowserWindow — the window to
 *                                          anchor the popup to. Needed for
 *                                          BrowserViews, where
 *                                          BrowserWindow.fromWebContents can
 *                                          return null.
 * @param {boolean}  [opts.requireContext]  default true — only show a menu when
 *                                          the click has something actionable
 *                                          under it. See the note below.
 */
function attach(webContents, opts = {}) {
  if (!webContents || webContents.isDestroyed()) return;

  const {
    allowNavigation = false,
    openExternal    = (url) => shell.openExternal(url).catch(() => {}),
    openInApp       = null,
    getWindow       = null,
    requireContext  = true,
  } = opts;

  webContents.on('context-menu', (_event, params) => {
    if (webContents.isDestroyed()) return;

    // A renderer calling preventDefault() on the DOM contextmenu event does NOT
    // suppress this main-process event — verified, not assumed. So anything that
    // draws its own right-click menu (Gmail's message list, and our own sidebar
    // account/app rows) would get a second native menu stacked on top of it.
    //
    // Guard by only showing a menu where the click actually has something to act
    // on. Custom menus live on plain non-editable, non-selectable chrome, so
    // this separates the two cleanly while keeping every useful action.
    const isImage = params.mediaType === 'image' && !!params.srcURL;
    const hasContext = params.isEditable
      || !!params.selectionText
      || !!params.linkURL
      || !!params.misspelledWord
      || isImage;

    if (requireContext && !hasContext) return;

    const menu  = new Menu();
    const flags = params.editFlags || {};
    let   needsSeparator = false;

    // Group items so we only emit separators between groups that actually
    // rendered — avoids leading/trailing/doubled dividers.
    const addGroup = (items) => {
      const real = items.filter(Boolean);
      if (!real.length) return;
      if (needsSeparator) menu.append(new MenuItem({ type: 'separator' }));
      real.forEach(item => menu.append(new MenuItem(item)));
      needsSeparator = true;
    };

    // ── Spellcheck ──────────────────────────────────────────────────────────
    // spellcheck:true is set on mail views, app views and compose windows, so
    // misspellings are underlined; these items are what make them actionable.
    if (params.misspelledWord) {
      const suggestions = (params.dictionarySuggestions || []).slice(0, 5);
      addGroup(
        suggestions.length
          ? suggestions.map(s => ({
              label: escapeLabel(s),
              click: () => webContents.replaceMisspelling(s),
            }))
          : [{ label: 'No spelling suggestions', enabled: false }]
      );
      addGroup([{
        label: 'Add to Dictionary',
        click: () => {
          try {
            webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
          } catch { /* in-memory session, or native macOS speller — ignore */ }
        },
      }]);
    }

    // ── Link ────────────────────────────────────────────────────────────────
    if (params.linkURL) {
      const url = params.linkURL;
      addGroup([
        { label: 'Open Link in Browser', click: () => openExternal(url) },
        openInApp && { label: 'Open Link in Mailwing', click: () => openInApp(url) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(url) },
      ]);
    }

    // ── Image ───────────────────────────────────────────────────────────────
    if (isImage) {
      const src = params.srcURL;
      addGroup([
        { label: 'Copy Image',         click: () => webContents.copyImageAt(params.x, params.y) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(src) },
        { label: 'Save Image As…',     click: () => webContents.downloadURL(src) },
      ]);
    }

    // ── Editable field ──────────────────────────────────────────────────────
    if (params.isEditable) {
      addGroup([
        { label: 'Undo', enabled: !!flags.canUndo, click: () => webContents.undo() },
        { label: 'Redo', enabled: !!flags.canRedo, click: () => webContents.redo() },
      ]);
      addGroup([
        { label: 'Cut',   enabled: !!flags.canCut,   click: () => webContents.cut() },
        { label: 'Copy',  enabled: !!flags.canCopy,  click: () => webContents.copy() },
        { label: 'Paste', enabled: !!flags.canPaste, click: () => webContents.paste() },
        // Pasting rich text into a compose field is a common annoyance; the
        // plain-text variant is why this is worth listing separately.
        {
          label: 'Paste and Match Style',
          enabled: !!flags.canPaste,
          click: () => webContents.pasteAndMatchStyle(),
        },
        {
          label: 'Select All',
          enabled: flags.canSelectAll !== false,
          click: () => webContents.selectAll(),
        },
      ]);
    } else if (params.selectionText) {
      // ── Read-only selection ───────────────────────────────────────────────
      const selection = params.selectionText;
      addGroup([
        { label: 'Copy', enabled: !!flags.canCopy, click: () => webContents.copy() },
        {
          label: `Search the Web for “${escapeLabel(truncate(selection))}”`,
          click: () => openExternal(searchUrl(selection)),
        },
      ]);
    }

    // ── Navigation ──────────────────────────────────────────────────────────
    if (allowNavigation) {
      const history = nav(webContents);
      addGroup([
        { label: 'Back',    enabled: history.canGoBack(),    click: () => history.goBack() },
        { label: 'Forward', enabled: history.canGoForward(), click: () => history.goForward() },
        { label: 'Reload',  click: () => webContents.reload() },
      ]);
    }

    // ── Developer ───────────────────────────────────────────────────────────
    // Dev builds only — a shipped app shouldn't offer DevTools on a mailbox.
    if (!app.isPackaged) {
      addGroup([{
        label: 'Inspect Element',
        click: () => webContents.inspectElement(params.x, params.y),
      }]);
    }

    if (!menu.items.length) return;

    // Anchor to the owning window so the menu lands in the right place for
    // BrowserViews as well as plain windows. fromWebContents can return null
    // for a BrowserView, hence the caller-supplied getWindow first.
    let win = null;
    try { win = (getWindow && getWindow()) || BrowserWindow.fromWebContents(webContents); }
    catch { /* fall through to an unanchored popup */ }

    if (win && !win.isDestroyed()) menu.popup({ window: win });
    else menu.popup();
  });
}

module.exports = { attach };
