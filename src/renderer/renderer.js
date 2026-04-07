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
let activeAccountId = null;
let activeServiceId = 'mail';
let draggedAccountId = null; // drag-to-reorder state

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  if (window.mailwing.platform === 'darwin') {
    document.body.classList.add('macos');
  }

  const isDark = await window.mailwing.getDarkMode();
  applyTheme(isDark);

  [cachedAccounts, cachedProviders] = await Promise.all([
    window.mailwing.getAccounts(),
    window.mailwing.getProviders(),
  ]);

  if (cachedAccounts.length > 0) {
    activeAccountId = cachedAccounts[0].id;
    const provider  = cachedProviders.find(p => p.id === cachedAccounts[0].provider);
    activeServiceId = provider?.services[0]?.id || 'mail';
  }

  buildWelcomeScreen();
  buildProviderPicker();
  renderSidebar();

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

    // ── Provider badge: small circle bottom-right showing "G" / "Z" etc. ─
    if (provider) {
      const badge = document.createElement('span');
      badge.className   = 'provider-badge';
      badge.textContent = provider.label[0].toUpperCase();
      badge.style.background = provider.color;
      btn.appendChild(badge);
    }

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

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function handleKeydown(e) {
  // Close modal on Escape
  if (e.key === 'Escape') {
    const modal = document.getElementById('bug-report-modal');
    if (!modal.classList.contains('hidden')) {
      closeBugReport();
      return;
    }
  }

  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

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

document.addEventListener('keydown', handleKeydown);

// ─── Start ────────────────────────────────────────────────────────────────────
init().catch(console.error);
