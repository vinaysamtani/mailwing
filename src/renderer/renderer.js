'use strict';

// ─── SVG icon library ─────────────────────────────────────────────────────────
// Uses currentColor (inherits stroke colour from .service-btn CSS).

const SERVICE_ICONS = {
  mail: `<svg viewBox="0 0 22 22"><rect x="2" y="5" width="18" height="13" rx="2"/><polyline points="2,8 11,14 20,8"/></svg>`,
  calendar: `<svg viewBox="0 0 22 22"><rect x="3" y="4" width="16" height="15" rx="2"/><line x1="3" y1="9" x2="19" y2="9"/><line x1="7" y1="2" x2="7" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/><rect x="7" y="12" width="3" height="3" rx="0.5" style="fill:currentColor;stroke:none"/></svg>`,
  drive: `<svg viewBox="0 0 22 22"><polygon points="11,3 20,18 2,18"/><line x1="5.5" y1="13" x2="16.5" y2="13"/><line x1="8" y1="3" x2="14" y2="13"/></svg>`,
  docs: `<svg viewBox="0 0 22 22"><path d="M6 2h8l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><polyline points="14,2 14,7 19,7"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="8" y1="14" x2="14" y2="14"/><line x1="8" y1="17" x2="12" y2="17"/></svg>`,
  workdrive: `<svg viewBox="0 0 22 22"><path d="M4.5 15a4.5 4.5 0 0 1-.9-8.9 6 6 0 0 1 11.6 0A4.5 4.5 0 0 1 17.5 15"/><polyline points="9,15 11,17 13,15"/><line x1="11" y1="12" x2="11" y2="17"/></svg>`,
  writer: `<svg viewBox="0 0 22 22"><path d="M14.5 3.5l4 4-9.5 9.5-4.5 1 1-4.5z"/><line x1="13" y1="5" x2="17" y2="9"/><line x1="3" y1="19" x2="19" y2="19"/></svg>`,
  onedrive: `<svg viewBox="0 0 22 22"><path d="M3.5 14a3.5 3.5 0 0 1-.5-7 5 5 0 0 1 9.8-1A3.5 3.5 0 0 1 18.5 14"/></svg>`,
  people: `<svg viewBox="0 0 22 22"><circle cx="8" cy="7" r="3"/><path d="M2 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="16" cy="8" r="2.5"/><path d="M19 19c0-2.8-1.6-5-4-5.5"/></svg>`,
};

function getServiceIcon(id) {
  return SERVICE_ICONS[id] || SERVICE_ICONS.mail;
}

// ─── Avatar fallback colours ──────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#1a73e8', '#e8710a', '#188038', '#a142f4',
  '#d93025', '#0097a7', '#e91e63', '#f57c00',
];

// ─── Module state ─────────────────────────────────────────────────────────────
let cachedAccounts  = [];
let cachedProviders = [];
let cachedUnread    = {};
let cachedNotes     = [];
let cachedApps      = [];
let cachedAppsRegistry = {}; // key → { key, label, url, category, allowedHosts? }
let hibernatedAppIds = new Set();
let activeAccountId = null;
let activeServiceId = 'mail';
let draggedAccountId = null; // drag-to-reorder state

// Apps Panel state — the special id 'notes' refers to the built-in non-removable
// Notes entry, which renders inside the right column (no BrowserView).
const NOTES_ENTRY_ID = 'notes';
let appsPanelOpen     = false;
let activeAppEntryId  = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  if (window.mailwing.platform === 'darwin') {
    document.body.classList.add('macos');
  }

  const isDark = await window.mailwing.getDarkMode();
  applyTheme(isDark);

  [cachedAccounts, cachedProviders, cachedApps, cachedAppsRegistry] = await Promise.all([
    window.mailwing.getAccounts(),
    window.mailwing.getProviders(),
    window.mailwing.apps.getAll(),
    window.mailwing.apps.getRegistry(),
  ]);

  if (cachedAccounts.length > 0) {
    activeAccountId = cachedAccounts[0].id;
    const provider  = cachedProviders.find(p => p.id === cachedAccounts[0].provider);
    activeServiceId = provider?.services[0]?.id || 'mail';
  }

  buildWelcomeScreen();
  buildProviderPicker();
  renderSidebar();
  renderAppsList();

  // ── Push events ────────────────────────────────────────────────────────────
  window.mailwing.onAccountsUpdated((accounts) => {
    cachedAccounts = accounts;
    if (activeAccountId && !accounts.find(a => a.id === activeAccountId)) {
      activeAccountId = accounts.length > 0 ? accounts[0].id : null;
    }
    renderSidebar();
    syncWelcomeScreen();
  });

  window.mailwing.onUnreadUpdated((counts) => {
    cachedUnread = counts;
    updateUnreadBadges();
  });

  window.mailwing.onDarkModeChanged(applyTheme);
  window.mailwing.onShowBugReport(() => openBugReport());

  // Notes list stays in sync with the store; main process broadcasts after every CRUD.
  window.mailwing.onNotesUpdated((notes) => {
    cachedNotes = notes;
    if (activeAppEntryId === NOTES_ENTRY_ID && appsPanelOpen) {
      renderNotesList();
    }
  });

  // Apps list / hibernation pushes from main.
  window.mailwing.apps.onUpdated((apps) => {
    cachedApps = apps;
    if (activeAppEntryId && activeAppEntryId !== NOTES_ENTRY_ID &&
        !cachedApps.find(a => a.id === activeAppEntryId)) {
      // Active app was removed elsewhere — fall back to Notes.
      activeAppEntryId = NOTES_ENTRY_ID;
      if (appsPanelOpen) selectAppEntry(NOTES_ENTRY_ID);
    }
    renderAppsList();
  });

  window.mailwing.apps.onHibernationChanged((ids) => {
    hibernatedAppIds = new Set(ids);
    renderAppsList();
  });

  // Update banner: main drives this as electron-updater finds, downloads, and
  // finishes staging a newer release.
  window.mailwing.onUpdateAvailable((info) => showUpdateBanner(info));
  window.mailwing.onUpdateProgress(({ percent }) => showUpdateProgress(percent));
  window.mailwing.onUpdateReady((info) => showUpdateReady(info));
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(isDark) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
}

// ─── Welcome screen ───────────────────────────────────────────────────────────
function buildWelcomeScreen() {
  const container = document.getElementById('welcome-providers');
  container.innerHTML = '';

  cachedProviders.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'welcome-provider-btn';

    const dot = document.createElement('span');
    dot.className = 'welcome-provider-dot';
    dot.style.background = p.color;
    dot.textContent = p.label[0].toUpperCase();

    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(`Add ${p.label} Account`));
    btn.addEventListener('click', () => window.mailwing.addAccount(p.id));
    container.appendChild(btn);
  });

  syncWelcomeScreen();
}

function syncWelcomeScreen() {
  const ws = document.getElementById('welcome-screen');
  ws.classList.toggle('hidden', cachedAccounts.length > 0);
}

// ─── Sidebar empty-state hint ─────────────────────────────────────────────────
function syncSidebarHint() {
  const hint   = document.getElementById('sidebar-hint');
  const addBtn = document.getElementById('add-account-btn');
  const isEmpty = cachedAccounts.length === 0;

  hint.classList.toggle('hidden', !isEmpty);

  if (isEmpty) {
    // Align hint vertically with the centre of the + button
    const rect = addBtn.getBoundingClientRect();
    hint.style.top = `${rect.top + rect.height / 2 - hint.offsetHeight / 2}px`;
  }
}

// ─── Provider picker popup ────────────────────────────────────────────────────
let pickerOpen = false;

function buildProviderPicker() {
  const list = document.getElementById('provider-picker-list');
  list.innerHTML = '';

  cachedProviders.forEach(p => {
    const btn = document.createElement('button');
    btn.className   = 'provider-picker-item';
    btn.role        = 'menuitem';

    const icon = document.createElement('span');
    icon.className        = 'provider-picker-icon';
    icon.style.background = p.color;
    icon.textContent      = p.label[0].toUpperCase();

    const label = document.createElement('span');
    label.textContent = `Add ${p.label} Account`;

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('click', () => {
      closeProviderPicker();
      window.mailwing.addAccount(p.id);
    });
    list.appendChild(btn);
  });
}

function openProviderPicker() {
  if (pickerOpen) return;
  pickerOpen = true;

  const addBtn = document.getElementById('add-account-btn');
  const picker = document.getElementById('provider-picker');
  const rect   = addBtn.getBoundingClientRect();

  picker.style.left = `${rect.right + 8}px`;
  picker.style.top  = `${rect.top}px`;

  document.getElementById('provider-picker-backdrop').classList.remove('hidden');
  picker.classList.remove('hidden');

  // Ensure picker fits in viewport vertically
  const pickerRect = picker.getBoundingClientRect();
  if (pickerRect.bottom > window.innerHeight - 8) {
    picker.style.top = `${window.innerHeight - pickerRect.height - 8}px`;
  }

  window.mailwing.overlayMode(true);
}

function closeProviderPicker() {
  if (!pickerOpen) return;
  pickerOpen = false;
  document.getElementById('provider-picker-backdrop').classList.add('hidden');
  document.getElementById('provider-picker').classList.add('hidden');
  window.mailwing.overlayMode(false);
}

// ─── Sidebar render ───────────────────────────────────────────────────────────
function renderSidebar() {
  renderAccountList();
  renderServiceList();
  syncWelcomeScreen();
  syncSidebarHint();
}

function renderAccountList() {
  const container = document.getElementById('account-list');
  container.innerHTML = '';

  cachedAccounts.forEach((account, index) => {
    const provider   = cachedProviders.find(p => p.id === account.provider);
    // account.color overrides the provider default (set via right-click menu)
    const accentColor = account.color || provider?.color || AVATAR_COLORS[index % AVATAR_COLORS.length];
    const unread      = cachedUnread[account.id] || 0;

    const btn = document.createElement('button');
    btn.className = 'account-btn' + (account.id === activeAccountId ? ' active' : '');
    btn.title     = account.email
      ? `${account.email}${provider ? ' (' + provider.label + ')' : ''}`
      : `${provider?.label ?? account.provider} account ${index + 1}`;
    btn.dataset.accountId = account.id;
    btn.style.setProperty('--provider-color', accentColor);
    btn.draggable = true;

    // ── Avatar or numbered initials ───────────────────────────────────────
    if (account.avatarDataURL) {
      const img = document.createElement('img');
      img.className = 'account-avatar';
      img.src       = account.avatarDataURL;
      img.alt       = btn.title;
      btn.appendChild(img);
    } else {
      const circle = document.createElement('div');
      circle.className       = 'account-initials';
      circle.textContent     = index + 1;
      circle.style.background = accentColor;
      btn.appendChild(circle);
    }

    // ── Provider color ring: always-on border in brand color ─────────────
    btn.classList.add('has-provider-ring');

    // ── Unread count badge ────────────────────────────────────────────────
    const unreadBadge = document.createElement('span');
    unreadBadge.className   = 'unread-badge' + (unread ? '' : ' hidden');
    unreadBadge.textContent = unread > 99 ? '99+' : String(unread);
    btn.appendChild(unreadBadge);

    // ── Click: switch account ─────────────────────────────────────────────
    btn.addEventListener('click', () => switchAccount(account.id));

    // ── Right-click: native OS menu (colour + remove) — always above BrowserViews
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.mailwing.showAccountMenu(account.id);
    });

    // ── Drag-to-reorder ───────────────────────────────────────────────────
    btn.addEventListener('dragstart', (e) => {
      draggedAccountId = account.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', account.id);
      // Delay class so the drag ghost image doesn't show the dimmed state
      setTimeout(() => btn.classList.add('dragging'), 0);
    });

    btn.addEventListener('dragend', () => {
      btn.classList.remove('dragging');
      draggedAccountId = null;
      container.querySelectorAll('.account-btn').forEach(b => b.classList.remove('drag-over'));
    });

    btn.addEventListener('dragover', (e) => {
      if (!draggedAccountId || draggedAccountId === account.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.querySelectorAll('.account-btn').forEach(b => b.classList.remove('drag-over'));
      btn.classList.add('drag-over');
    });

    btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));

    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if (!draggedAccountId || draggedAccountId === account.id) return;

      const ids      = cachedAccounts.map(a => a.id);
      const fromIdx  = ids.indexOf(draggedAccountId);
      const toIdx    = ids.indexOf(account.id);
      if (fromIdx === -1 || toIdx === -1) return;

      // Reorder locally and re-render immediately (optimistic)
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, draggedAccountId);
      cachedAccounts = ids.map(id => cachedAccounts.find(a => a.id === id)).filter(Boolean);
      renderAccountList();

      // Persist to disk via main process
      window.mailwing.reorderAccounts(ids);
    });

    container.appendChild(btn);
  });
}

function renderServiceList() {
  const container = document.getElementById('service-list');
  container.innerHTML = '';

  if (!activeAccountId) return;
  const account  = cachedAccounts.find(a => a.id === activeAccountId);
  if (!account) return;
  const provider = cachedProviders.find(p => p.id === account.provider);
  if (!provider) return;

  provider.services.forEach(service => {
    const btn = document.createElement('button');
    btn.className = 'service-btn' + (service.id === activeServiceId ? ' active' : '');
    btn.dataset.serviceId = service.id;
    btn.setAttribute('aria-label', service.label);

    const wrap = document.createElement('span');
    wrap.className = 'service-icon-wrap';
    wrap.innerHTML = getServiceIcon(service.id);
    btn.appendChild(wrap);

    const label = document.createElement('span');
    label.className   = 'service-label';
    label.textContent = service.label;
    btn.appendChild(label);

    btn.addEventListener('click', () => switchService(service.id));
    container.appendChild(btn);
  });
}

// ─── Live unread badge update ─────────────────────────────────────────────────
function updateUnreadBadges() {
  document.querySelectorAll('.account-btn').forEach(btn => {
    const count = cachedUnread[btn.dataset.accountId] || 0;
    const badge = btn.querySelector('.unread-badge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.toggle('hidden', count === 0);
  });
}

// ─── Switching ────────────────────────────────────────────────────────────────
function switchAccount(accountId) {
  // Clicking an email account is an exit from the Apps Panel — collapse the
  // panel chrome before switching so the user gets a clean mail-only layout.
  // The subsequent switchView IPC fires immediately after the panel-close
  // IPC and overrides whatever mail view setAppsPanelOpen(false) restored,
  // so there's no visible flicker between the two.
  if (appsPanelOpen) closeAppsPanel();

  activeAccountId = accountId;

  const account  = cachedAccounts.find(a => a.id === accountId);
  const provider = cachedProviders.find(p => p.id === account?.provider);
  const hasService = provider?.services.some(s => s.id === activeServiceId);
  if (!hasService && provider) {
    activeServiceId = provider.services[0]?.id || 'mail';
  }

  window.mailwing.switchView(accountId, activeServiceId);
  renderSidebar();
}

function switchService(serviceId) {
  if (appsPanelOpen) closeAppsPanel();
  activeServiceId = serviceId;
  if (activeAccountId) window.mailwing.switchView(activeAccountId, serviceId);
  renderServiceList();
}

// Account removal is now handled via the native OS context menu (right-click on account button).
// Main process fires ACCOUNTS_UPDATED push which causes renderSidebar() to re-run via onAccountsUpdated.

// ─── Bug report modal ─────────────────────────────────────────────────────────
const GITHUB_ISSUES_URL = 'https://github.com/vinaysamtani/mailwing/issues';

async function openBugReport() {
  window.mailwing.overlayMode(true);
  const modal = document.getElementById('bug-report-modal');
  modal.classList.remove('hidden');
  document.getElementById('bug-title').focus();

  // Populate system info asynchronously
  const sysinfo = document.getElementById('bug-sysinfo');
  try {
    const info = await window.mailwing.getSystemInfo();
    sysinfo.textContent =
      `OS: ${info.os} ${info.osVersion}  •  App: ${info.appVersion}  •  Electron: ${info.electronVersion}`;
  } catch {
    sysinfo.textContent = 'Could not load system info.';
  }
}

function closeBugReport() {
  window.mailwing.overlayMode(false);
  const modal = document.getElementById('bug-report-modal');
  modal.classList.add('hidden');
  document.getElementById('bug-title').value    = '';
  document.getElementById('bug-steps').value    = '';
  document.getElementById('bug-expected').value = '';
  document.getElementById('bug-actual').value   = '';
  document.getElementById('bug-sysinfo').textContent = 'Loading system info…';
}

function submitBugReport() {
  const title    = document.getElementById('bug-title').value.trim();
  const steps    = document.getElementById('bug-steps').value.trim();
  const expected = document.getElementById('bug-expected').value.trim();
  const actual   = document.getElementById('bug-actual').value.trim();
  const sysinfo  = document.getElementById('bug-sysinfo').textContent;

  const body = [
    '**What happened?**',
    title || '(no description)',
    '',
    '**Steps to reproduce:**',
    steps || '(not provided)',
    '',
    '**Expected behavior:**',
    expected || '(not provided)',
    '',
    '**Actual behavior:**',
    actual || '(not provided)',
    '',
    '**Environment:**',
    sysinfo,
  ].join('\n');

  const url = `${GITHUB_ISSUES_URL}/new?template=bug_report.md`
    + `&title=${encodeURIComponent(title)}`
    + `&body=${encodeURIComponent(body)}`;

  window.mailwing.openExternal(url);
  closeBugReport();
}

// ─── Update banner ───────────────────────────────────────────────────────────
// Update lifecycle: 'available' (download started) → 'downloading' (progress) →
// 'ready' (downloaded, one click installs). electron-updater drives all three.
let updateState   = 'idle';
let updateVersion = null;

function revealBanner() {
  document.getElementById('update-banner').classList.remove('hidden');
  // Body class lets the apps-list top padding adjust so the first item isn't
  // hidden behind the banner.
  document.body.classList.add('banner-visible');
  // Tell main to shift the BrowserView down so the banner isn't occluded.
  window.mailwing.setBannerVisible(true);
}

function setBannerText(str) {
  // textContent — version strings come from GitHub and shouldn't be HTML-rendered.
  document.getElementById('update-banner').querySelector('.update-banner-text').textContent = str;
}

function showUpdateBanner(info) {
  if (!info || !info.version) return;
  if (updateState === 'ready') return; // already downloaded — don't downgrade the UI
  updateVersion = info.version;
  updateState   = 'available';

  const btn = document.getElementById('update-download-btn');
  btn.textContent = 'Downloading…';
  btn.disabled = true;
  setBannerText(`Mailwing ${info.version} is downloading…`);
  revealBanner();
}

function showUpdateProgress(percent) {
  if (updateState === 'ready') return;
  updateState = 'downloading';
  const btn = document.getElementById('update-download-btn');
  btn.disabled = true;
  btn.textContent = `Downloading… ${percent}%`;
}

function showUpdateReady(info) {
  updateState = 'ready';
  if (info && info.version) updateVersion = info.version;

  const btn = document.getElementById('update-download-btn');
  btn.disabled = false;
  btn.textContent = 'Restart to update';
  setBannerText(`Mailwing ${updateVersion} is ready to install.`);
  revealBanner();
}

function hideUpdateBanner() {
  document.getElementById('update-banner').classList.add('hidden');
  document.body.classList.remove('banner-visible');
  window.mailwing.setBannerVisible(false);
}

// ─── Apps Panel ──────────────────────────────────────────────────────────────
async function openAppsPanel(initialEntryId = NOTES_ENTRY_ID) {
  // Mutual exclusion with the bug-report modal.
  if (!document.getElementById('bug-report-modal').classList.contains('hidden')) {
    closeBugReport();
  }

  if (!appsPanelOpen) {
    appsPanelOpen = true;
    document.body.classList.add('apps-panel-open');
    document.getElementById('apps-list').classList.remove('hidden');
    // Tell main to hide the active mail BrowserView so the panel's right
    // column is visible. viewManager.setAppsPanelOpen handles the bounds math.
    window.mailwing.apps.openPanel();
  }

  await selectAppEntry(initialEntryId);
  renderAppsList();
}

function closeAppsPanel() {
  if (!appsPanelOpen) return;
  appsPanelOpen = false;
  activeAppEntryId = null;
  document.body.classList.remove('apps-panel-open');
  document.getElementById('apps-list').classList.add('hidden');
  hideNotesView();
  hideAppsEmptyState();
  hideAppLoading();
  // Main restores the previously-active mail view.
  window.mailwing.apps.closePanel();
}

function toggleAppsPanel() {
  if (appsPanelOpen) closeAppsPanel();
  else openAppsPanel(activeAppEntryId || NOTES_ENTRY_ID);
}

async function selectAppEntry(entryId) {
  activeAppEntryId = entryId;

  if (entryId === NOTES_ENTRY_ID) {
    hideAppsEmptyState();
    hideAppLoading();
    // Notes lives inside the renderer — no BrowserView to switch.
    window.mailwing.apps.switchEntry(NOTES_ENTRY_ID);
    await showNotesView();
  } else {
    hideNotesView();
    hideAppsEmptyState();
    // Real app: main creates / rehydrates the BrowserView. Loading overlay is
    // toggled by APPS_LOADING_CHANGED pushes; clear stale state up front.
    hideAppLoading();
    window.mailwing.apps.switchEntry(entryId);
  }

  renderAppsList();
}

async function showNotesView() {
  document.getElementById('apps-notes-view').classList.remove('hidden');
  cachedNotes = await window.mailwing.getNotes();
  renderNotesList();
  // Defer focus to the next frame so the textarea exists in layout first.
  requestAnimationFrame(() => document.getElementById('notes-input').focus());
}

function hideNotesView() {
  document.getElementById('apps-notes-view').classList.add('hidden');
  document.getElementById('notes-input').value = '';
}

function showAppsEmptyState() {
  document.getElementById('apps-empty-state').classList.remove('hidden');
}

function hideAppsEmptyState() {
  document.getElementById('apps-empty-state').classList.add('hidden');
}

function showAppLoading(label) {
  const overlay = document.getElementById('app-loading');
  overlay.classList.remove('hidden');
  if (label) overlay.querySelector('.app-loading-label').textContent = label;
}

function hideAppLoading() {
  document.getElementById('app-loading').classList.add('hidden');
}

function buildAppListIcon(entry, registryEntry) {
  const wrapper = document.createElement('span');
  wrapper.className = 'app-list-icon';

  if (entry.id === NOTES_ENTRY_ID) {
    // Use the same notebook glyph the old sidebar button had.
    wrapper.innerHTML = `<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);">
      <path d="M5 3h9l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
      <polyline points="14,3 14,7 18,7"/>
      <line x1="7" y1="11" x2="15" y2="11"/>
      <line x1="7" y1="14" x2="15" y2="14"/>
      <line x1="7" y1="17" x2="12" y2="17"/>
    </svg>`;
    wrapper.style.background = 'transparent';
    return wrapper;
  }

  if (registryEntry) {
    // Bundled SVG path. Missing files swap to the initials fallback via the
    // error handler below — handy during the rollout where some registry
    // entries ship icons later than others (task #9).
    const img = document.createElement('img');
    img.src   = `./app-icons/${registryEntry.key}.svg`;
    img.alt   = '';
    img.addEventListener('error', () => {
      img.remove();
      wrapper.textContent     = (entry.label || '?')[0].toUpperCase();
      wrapper.style.background = entry.accentColor || '#667085';
    });
    wrapper.appendChild(img);
  } else {
    wrapper.textContent = (entry.label || '?')[0].toUpperCase();
    wrapper.style.background = entry.accentColor || '#667085';
  }
  return wrapper;
}

function renderAppsList() {
  const container = document.getElementById('apps-list-items');
  if (!container) return;
  container.innerHTML = '';

  // Built-in Notes entry always first, non-removable, never hibernated.
  const notesEntry = { id: NOTES_ENTRY_ID, label: 'Notes', registryKey: null };
  const entries    = [notesEntry, ...cachedApps];

  entries.forEach(entry => {
    const registryEntry = entry.registryKey ? cachedAppsRegistry[entry.registryKey] : null;
    const row = document.createElement('button');
    row.className = 'app-list-row' + (entry.id === activeAppEntryId ? ' active' : '');
    row.type      = 'button';
    row.dataset.entryId = entry.id;

    row.appendChild(buildAppListIcon(entry, registryEntry));

    // Label + optional subtitle stacked together so the row stays one
    // logical flex child between the icon and the trailing indicator dots.
    const text = document.createElement('span');
    text.className = 'app-list-text';

    const label = document.createElement('span');
    label.className   = 'app-list-label';
    label.textContent = entry.label;
    text.appendChild(label);

    if (entry.id !== NOTES_ENTRY_ID) {
      const subtitle = document.createElement('span');
      subtitle.className = 'app-list-subtitle';
      if (entry.linkedAccountId) {
        const linked   = cachedAccounts.find(a => a.id === entry.linkedAccountId);
        const provider = linked ? cachedProviders.find(p => p.id === linked.provider) : null;
        // Compact "↗ work@gmail.com (Google)" line — arrow glyph hints at the
        // shared sign-in source. If we don't know the email yet (account just
        // added, no avatar extracted), fall back to the provider label.
        const identity = (linked && linked.email)
          ? linked.email
          : (provider?.label || 'Email account');
        subtitle.textContent  = '↗ ' + identity;
        subtitle.title        = `Linked to ${identity}${provider ? ' (' + provider.label + ')' : ''}`;
        subtitle.classList.add('linked');
      } else {
        subtitle.textContent = 'Standalone';
      }
      text.appendChild(subtitle);
    }

    row.appendChild(text);

    if (entry.id !== NOTES_ENTRY_ID && hibernatedAppIds.has(entry.id)) {
      const dot = document.createElement('span');
      dot.className = 'app-list-hibernated-dot';
      dot.title     = 'Sleeping — will load on click';
      row.appendChild(dot);
    }

    if (entry.accentColor && entry.id !== NOTES_ENTRY_ID) {
      const dot = document.createElement('span');
      dot.className = 'app-list-accent-dot';
      dot.style.background = entry.accentColor;
      row.appendChild(dot);
    }

    row.addEventListener('click', () => selectAppEntry(entry.id));
    row.addEventListener('contextmenu', (e) => {
      if (entry.id === NOTES_ENTRY_ID) return;
      e.preventDefault();
      window.mailwing.apps.showContextMenu(entry.id);
    });

    container.appendChild(row);
  });
}

function renderNotesList() {
  const list  = document.getElementById('notes-list');
  const empty = document.getElementById('notes-empty');
  list.innerHTML = '';

  if (!cachedNotes.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Newest-first
  const sorted = [...cachedNotes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  sorted.forEach(note => {
    const li = document.createElement('li');
    li.className = 'note-item' + (note.done ? ' done' : '');

    const tick = document.createElement('button');
    tick.className   = 'note-tick';
    tick.title       = note.done ? 'Mark as not done' : 'Mark as done';
    tick.setAttribute('aria-label', tick.title);
    tick.textContent = '✓';
    tick.addEventListener('click', () => window.mailwing.toggleNote(note.id));

    const text = document.createElement('div');
    text.className   = 'note-text';
    // textContent (NOT innerHTML) — note bodies are user-supplied free text.
    text.textContent = note.text;

    const del = document.createElement('button');
    del.className   = 'note-delete';
    del.title       = 'Delete';
    del.setAttribute('aria-label', 'Delete');
    del.textContent = '×';
    del.addEventListener('click', () => window.mailwing.removeNote(note.id));

    li.appendChild(tick);
    li.appendChild(text);
    li.appendChild(del);
    list.appendChild(li);
  });
}

async function submitNote() {
  const input = document.getElementById('notes-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  await window.mailwing.addNote(text);
  // onNotesUpdated will re-render with the new item already in cachedNotes.
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function handleKeydown(e) {
  // Escape closes whichever full-window overlay is open.
  if (e.key === 'Escape') {
    const confirmModal = document.getElementById('confirm-modal');
    if (!confirmModal.classList.contains('hidden')) { closeConfirm();      return; }
    const addAppModal  = document.getElementById('add-app-modal');
    if (!addAppModal.classList.contains('hidden'))  { closeAddAppModal();  return; }
    const bugModal     = document.getElementById('bug-report-modal');
    if (!bugModal.classList.contains('hidden'))     { closeBugReport();    return; }
    if (appsPanelOpen) { closeAppsPanel(); return; }
  }

  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  // Cmd/Ctrl+Shift+N → open Apps Panel with Notes selected.
  if (e.shiftKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    openAppsPanel(NOTES_ENTRY_ID);
    return;
  }

  // Cmd/Ctrl+Shift+A → toggle Apps Panel.
  if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault();
    toggleAppsPanel();
    return;
  }

  if (e.shiftKey) return; // other Cmd+Shift+X combos are not ours

  if (e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key, 10) - 1;
    if (cachedAccounts[idx]) { e.preventDefault(); switchAccount(cachedAccounts[idx].id); }
    return;
  }

  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    if (activeAccountId && activeServiceId) {
      window.mailwing.reloadView(activeAccountId, activeServiceId);
    }
  }
}

// ─── Wire up DOM ──────────────────────────────────────────────────────────────
// "+" button: open custom HTML provider picker
document.getElementById('add-account-btn')
  .addEventListener('click', () => openProviderPicker());

// Provider picker backdrop: close on click outside
document.getElementById('provider-picker-backdrop')
  .addEventListener('click', () => closeProviderPicker());

// Bug report: sidebar button, modal actions, backdrop click
document.getElementById('report-bug-btn')
  .addEventListener('click', () => openBugReport());

document.getElementById('bug-cancel')
  .addEventListener('click', () => closeBugReport());

document.getElementById('bug-submit')
  .addEventListener('click', () => submitBugReport());

document.getElementById('bug-view-issues')
  .addEventListener('click', (e) => {
    e.preventDefault();
    window.mailwing.openExternal(GITHUB_ISSUES_URL);
  });

// Close when clicking the backdrop (outside the dialog)
document.getElementById('bug-report-modal')
  .addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBugReport();
  });

// ── Apps Panel wiring ──────────────────────────────────────────────────────
document.getElementById('apps-btn')
  .addEventListener('click', () => toggleAppsPanel());

document.getElementById('add-app-btn')
  .addEventListener('click', () => openAddAppModal());

// Enter (without Shift) submits a note; Shift+Enter inserts a newline.
document.getElementById('notes-input')
  .addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitNote();
    }
  });

// Apps-Panel loading overlay (first-add and rehydration) toggled by main.
window.mailwing.apps.onLoadingChanged((info) => {
  if (!appsPanelOpen) return;
  if (info && info.loading) showAppLoading(info.label);
  else                      hideAppLoading();
});

// ── Add App modal wiring ───────────────────────────────────────────────────
document.getElementById('add-app-search')
  .addEventListener('input', (e) => renderAddAppRegistry(e.target.value));

document.getElementById('add-app-custom-btn')
  .addEventListener('click', () => selectAddAppCustom());

document.getElementById('add-app-cancel-1')
  .addEventListener('click', () => closeAddAppModal());
document.getElementById('add-app-cancel-2')
  .addEventListener('click', () => closeAddAppModal());

document.getElementById('add-app-back')
  .addEventListener('click', () => goToAddAppStep(1));

document.getElementById('add-app-save')
  .addEventListener('click', () => submitAddApp());

// Close on backdrop click (outside the dialog body).
document.getElementById('add-app-modal')
  .addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAddAppModal();
  });

// Pressing Enter in the URL or label fields submits.
['add-app-label', 'add-app-url'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitAddApp(); }
  });
});

// ── Confirm modal wiring ──────────────────────────────────────────────────
document.getElementById('confirm-cancel')
  .addEventListener('click', () => closeConfirm());

document.getElementById('confirm-ok')
  .addEventListener('click', () => {
    const cb = confirmCallback;
    if (cb) cb();
  });

document.getElementById('confirm-modal')
  .addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirm();
  });

// ── Apps right-click context menu wiring ──────────────────────────────────
// Main fires these when the user picks Edit / Remove from the native menu.
window.mailwing.apps.onEditRequest(({ id }) => {
  if (id) openEditAppModal(id);
});

window.mailwing.apps.onConfirmRemove(({ id }) => {
  if (id) confirmRemoveApp(id);
});

// Main fires this when the user picks "Remove Account" on an email account
// that has linked apps — we ask the user to confirm here so they see the
// impact before the account is destroyed.
window.mailwing.onRequestAccountRemove(({ accountId, linkedApps }) => {
  if (!accountId) return;
  const account = cachedAccounts.find(a => a.id === accountId);
  const provider = account ? cachedProviders.find(p => p.id === account.provider) : null;
  const identity = (account && account.email) || provider?.label || 'this account';
  const names = (linkedApps || []).map(a => a.label).join(', ') || 'a linked app';
  const noun  = (linkedApps && linkedApps.length === 1) ? 'app' : 'apps';
  showConfirm({
    title:       `Remove ${identity}?`,
    message:
      `${linkedApps?.length || 0} ${noun} use this account for sign-in: ${names}. ` +
      `Removing the account will unlink ${linkedApps?.length === 1 ? 'it' : 'them'} — ` +
      `the ${noun} will reload as Standalone next time you open ${linkedApps?.length === 1 ? 'it' : 'them'} ` +
      `and you'll need to sign in again. Continue?`,
    okLabel:     'Remove account',
    destructive: true,
    onConfirm:   () => {
      window.mailwing.removeAccount(accountId);
      closeConfirm();
    },
  });
});

// ─── Add App modal ───────────────────────────────────────────────────────────
// Two-step flow: step 1 picks a registry entry (or "Custom URL"), step 2 edits
// the label / URL / accent colour, then save. The URL stays editable for
// tenant-bound apps (Atlassian, Slack workspaces, etc.) whose registry URL is
// only a placeholder.

const ADD_APP_COLOR_PALETTE = [
  null,        // "no accent" — registry/initials default
  '#1a73e8',
  '#d93025',
  '#188038',
  '#a142f4',
  '#e8710a',
  '#0097a7',
  '#e91e63',
  '#f9ab00',
];

let addAppDraft  = null; // { registryKey, label, url, accentColor }
let addAppMode   = 'create'; // 'create' | 'edit'
let editingAppId = null;

function openAddAppModal() {
  // Mutual exclusion with the bug-report modal.
  if (!document.getElementById('bug-report-modal').classList.contains('hidden')) {
    closeBugReport();
  }

  addAppDraft  = null;
  addAppMode   = 'create';
  editingAppId = null;
  document.getElementById('add-app-title').textContent  = 'Add App';
  document.getElementById('add-app-save').textContent   = 'Add';
  document.getElementById('add-app-search').value = '';
  renderAddAppRegistry('');
  goToAddAppStep(1);

  document.getElementById('add-app-modal').classList.remove('hidden');
  window.mailwing.overlayMode(true);
  // Defer focus so layout settles first.
  requestAnimationFrame(() => document.getElementById('add-app-search').focus());
}

function openEditAppModal(appId) {
  const app = cachedApps.find(a => a.id === appId);
  if (!app) return;

  // Mutual exclusion
  if (!document.getElementById('bug-report-modal').classList.contains('hidden')) {
    closeBugReport();
  }

  addAppMode    = 'edit';
  editingAppId  = appId;
  addAppDraft = {
    registryKey:     app.registryKey,
    label:           app.label,
    url:             app.url,
    accentColor:     app.accentColor || null,
    linkedAccountId: app.linkedAccountId || null,
  };

  document.getElementById('add-app-title').textContent = 'Edit App';
  document.getElementById('add-app-save').textContent  = 'Save';
  populateAddAppStep2();
  goToAddAppStep(2);

  document.getElementById('add-app-modal').classList.remove('hidden');
  window.mailwing.overlayMode(true);
  requestAnimationFrame(() => document.getElementById('add-app-label').focus());
}

function closeAddAppModal() {
  document.getElementById('add-app-modal').classList.add('hidden');
  addAppDraft = null;
  // When the Apps Panel is open, overlayMode(false) would restore the previous
  // mail view; the panel still expects the mail view to stay hidden. Only
  // release overlay mode when the panel isn't open.
  if (!appsPanelOpen) window.mailwing.overlayMode(false);
}

function goToAddAppStep(step) {
  document.querySelectorAll('#add-app-modal .add-app-step').forEach(el => {
    el.classList.toggle('hidden', Number(el.dataset.step) !== step);
  });
}

function renderAddAppRegistry(searchTerm) {
  const container = document.getElementById('add-app-registry');
  container.innerHTML = '';
  const term = (searchTerm || '').trim().toLowerCase();

  // Group registry entries by category, preserving categories' declared order.
  const byCategory = new Map();
  Object.values(cachedAppsRegistry).forEach(entry => {
    if (term && !entry.label.toLowerCase().includes(term)) return;
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category).push(entry);
  });

  if (byCategory.size === 0) {
    const empty = document.createElement('div');
    empty.className   = 'add-app-no-matches';
    empty.textContent = 'No matching apps. Use "Add a custom URL" below.';
    container.appendChild(empty);
    return;
  }

  for (const [category, entries] of byCategory) {
    const section = document.createElement('div');
    section.className = 'add-app-category';

    const title = document.createElement('div');
    title.className   = 'add-app-category-title';
    title.textContent = category;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'add-app-category-grid';

    entries.forEach(entry => {
      const btn = document.createElement('button');
      btn.className  = 'add-app-entry';
      btn.type       = 'button';
      btn.dataset.key = entry.key;

      const icon = document.createElement('span');
      icon.className = 'add-app-entry-icon';
      const img = document.createElement('img');
      img.src = `./app-icons/${entry.key}.svg`;
      img.alt = '';
      img.addEventListener('error', () => {
        img.remove();
        icon.textContent      = entry.label[0].toUpperCase();
        icon.style.background = '#667085';
      });
      icon.appendChild(img);

      const label = document.createElement('span');
      label.className   = 'add-app-entry-label';
      label.textContent = entry.label;

      btn.appendChild(icon);
      btn.appendChild(label);
      btn.addEventListener('click', () => selectAddAppRegistryEntry(entry.key));
      grid.appendChild(btn);
    });

    section.appendChild(grid);
    container.appendChild(section);
  }
}

function selectAddAppRegistryEntry(key) {
  const entry = cachedAppsRegistry[key];
  if (!entry) return;
  addAppDraft = {
    registryKey:     key,
    label:           entry.label,
    url:             entry.url,
    accentColor:     null,
    linkedAccountId: null,
  };
  populateAddAppStep2();
  goToAddAppStep(2);
}

function selectAddAppCustom() {
  addAppDraft = {
    registryKey:     null,
    label:           '',
    url:             '',
    accentColor:     null,
    linkedAccountId: null,
  };
  populateAddAppStep2();
  goToAddAppStep(2);
}

function populateAddAppStep2() {
  if (!addAppDraft) return;

  const preview      = document.getElementById('add-app-preview');
  const previewIcon  = preview.querySelector('.add-app-preview-icon');
  const previewLabel = preview.querySelector('.add-app-preview-label');
  const labelInput   = document.getElementById('add-app-label');
  const urlInput     = document.getElementById('add-app-url');
  const hint         = document.getElementById('add-app-url-hint');

  // Preview reflects the chosen registry entry (or "Custom URL")
  previewIcon.innerHTML = '';
  previewIcon.style.background = '';
  if (addAppDraft.registryKey) {
    const entry = cachedAppsRegistry[addAppDraft.registryKey];
    previewLabel.textContent = entry?.label || addAppDraft.label;
    const img = document.createElement('img');
    img.src = `./app-icons/${addAppDraft.registryKey}.svg`;
    img.alt = '';
    img.addEventListener('error', () => {
      img.remove();
      previewIcon.textContent      = (entry?.label || '?')[0].toUpperCase();
      previewIcon.style.background = '#667085';
    });
    previewIcon.appendChild(img);
  } else {
    previewLabel.textContent     = 'Custom URL';
    previewIcon.textContent      = '?';
    previewIcon.style.background = '#667085';
  }

  labelInput.value = addAppDraft.label;
  urlInput.value   = addAppDraft.url;

  // Helpful hint for tenant-bound apps where the registry URL is a placeholder.
  hint.classList.remove('error');
  if (addAppDraft.registryKey) {
    const entry = cachedAppsRegistry[addAppDraft.registryKey];
    if (entry?.allowedHosts && entry.allowedHosts.length) {
      hint.textContent = `If your account lives on a tenant URL (e.g. https://yourteam.${entry.allowedHosts[0]}), enter it here.`;
    } else {
      hint.textContent = '';
    }
  } else {
    hint.textContent = 'Enter the full URL, including https://';
  }

  renderAddAppLinkAccountOptions();
  renderAddAppColorSwatches();
}

function renderAddAppLinkAccountOptions() {
  const select = document.getElementById('add-app-link-account');
  // Rebuild from scratch — the email account list can change between modal opens.
  select.innerHTML = '';

  const noneOpt = document.createElement('option');
  noneOpt.value       = '';
  noneOpt.textContent = 'Standalone (separate login)';
  select.appendChild(noneOpt);

  cachedAccounts.forEach(account => {
    const provider = cachedProviders.find(p => p.id === account.provider);
    const opt      = document.createElement('option');
    opt.value      = account.id;
    const identity = account.email || `${provider?.label || account.provider} account`;
    opt.textContent = `${identity} — ${provider?.label || account.provider}`;
    select.appendChild(opt);
  });

  select.value = addAppDraft.linkedAccountId || '';
}

function renderAddAppColorSwatches() {
  const container = document.getElementById('add-app-colors');
  container.innerHTML = '';
  ADD_APP_COLOR_PALETTE.forEach(color => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'add-app-color-swatch' + (addAppDraft.accentColor === color ? ' active' : '');
    if (color) {
      btn.style.background = color;
    } else {
      btn.classList.add('none');
      btn.textContent = '∅';
      btn.title       = 'No accent colour';
    }
    btn.addEventListener('click', () => {
      addAppDraft.accentColor = color;
      renderAddAppColorSwatches();
    });
    container.appendChild(btn);
  });
}

function validateAddAppDraft() {
  if (!addAppDraft) return 'Pick an app first.';
  if (!addAppDraft.label.trim()) return 'Display name is required.';
  let parsed;
  try { parsed = new URL(addAppDraft.url); }
  catch { return 'Enter a valid URL (e.g. https://example.com).'; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http and https URLs are supported.';
  }
  return null;
}

async function submitAddApp() {
  // Capture latest values from the inputs first.
  addAppDraft.label           = document.getElementById('add-app-label').value.trim();
  addAppDraft.url             = document.getElementById('add-app-url').value.trim();
  addAppDraft.linkedAccountId = document.getElementById('add-app-link-account').value || null;

  const err = validateAddAppDraft();
  if (err) {
    const hint = document.getElementById('add-app-url-hint');
    hint.textContent = err;
    hint.classList.add('error');
    return;
  }

  if (addAppMode === 'edit' && editingAppId) {
    await window.mailwing.apps.update(editingAppId, {
      label:           addAppDraft.label,
      url:             addAppDraft.url,
      accentColor:     addAppDraft.accentColor,
      linkedAccountId: addAppDraft.linkedAccountId,
    });
    closeAddAppModal();
    // The APPS_UPDATED push will refresh the list. If the user changed the
    // URL or sign-in source, the existing BrowserView still points at the old
    // one — they need to close and reopen the app for the new partition /
    // URL to take effect. Deliberate: yanking the page out from under the
    // user mid-session would be more confusing than the manual reload.
    return;
  }

  const newId = await window.mailwing.apps.add({
    registryKey:     addAppDraft.registryKey,
    label:           addAppDraft.label,
    url:             addAppDraft.url,
    accentColor:     addAppDraft.accentColor,
    linkedAccountId: addAppDraft.linkedAccountId,
  });

  closeAddAppModal();

  if (newId) {
    if (!appsPanelOpen) await openAppsPanel(newId);
    else                await selectAppEntry(newId);
  }
}

// ─── Generic confirm modal ───────────────────────────────────────────────────
// Used for destructive actions like Remove App. The callback fires only on the
// OK button (Cancel / backdrop / Escape simply dismiss).
let confirmCallback = null;

function showConfirm({ title, message, okLabel, destructive, onConfirm }) {
  document.getElementById('confirm-title').textContent   = title || 'Confirm';
  document.getElementById('confirm-message').textContent = message || '';
  const okBtn = document.getElementById('confirm-ok');
  okBtn.textContent = okLabel || 'OK';
  okBtn.classList.toggle('destructive', !!destructive);

  confirmCallback = typeof onConfirm === 'function' ? onConfirm : null;
  document.getElementById('confirm-modal').classList.remove('hidden');
  // Push the active BrowserView off-screen so it doesn't paint over the
  // modal. Especially relevant when the Apps Panel has a live app selected —
  // its BrowserView is a native overlay that ignores CSS z-index entirely.
  window.mailwing.overlayMode(true);
  // Focus the OK button so Enter confirms; Escape still cancels via the
  // global handleKeydown.
  requestAnimationFrame(() => okBtn.focus());
}

function closeConfirm() {
  document.getElementById('confirm-modal').classList.add('hidden');
  confirmCallback = null;
  // Only restore the active BrowserView when no other modal is left open
  // (Add App / Bug Report can chain into confirm and back) and we're not
  // still inside the Apps Panel with Notes selected.
  const addAppOpen = !document.getElementById('add-app-modal').classList.contains('hidden');
  const bugOpen    = !document.getElementById('bug-report-modal').classList.contains('hidden');
  if (!addAppOpen && !bugOpen) {
    window.mailwing.overlayMode(false);
  }
}

function confirmRemoveApp(appId) {
  const app = cachedApps.find(a => a.id === appId);
  if (!app) return;
  showConfirm({
    title:       'Remove app',
    message:     `Remove "${app.label}"? Its login session, cookies, and on-disk cache for this entry will be erased — adding ${app.label} again will require a fresh sign-in.`,
    okLabel:     'Remove',
    destructive: true,
    onConfirm:   async () => {
      await window.mailwing.apps.remove(appId);
      closeConfirm();
    },
  });
}

// ── Update banner wiring ──────────────────────────────────────────────────
document.getElementById('update-download-btn')
  .addEventListener('click', () => {
    // The button only does something once the update is staged: one click
    // quits, installs, and relaunches. While downloading it's disabled.
    if (updateState === 'ready') window.mailwing.installUpdate();
  });

document.getElementById('update-dismiss-btn')
  .addEventListener('click', () => {
    if (updateVersion) window.mailwing.dismissUpdate(updateVersion);
    hideUpdateBanner();
  });

document.addEventListener('keydown', handleKeydown);

// ─── Start ────────────────────────────────────────────────────────────────────
init().catch(console.error);
