'use strict';

/**
 * Provider registry.
 *
 * To add a new provider (e.g. Outlook Web, Fastmail) add a new key here.
 * No other files need changing.
 *
 * Each provider must define:
 *   id              string     — unique key
 *   label           string     — display name
 *   color           string     — CSS hex colour for sidebar accent
 *   services        Service[]  — ordered list of web apps
 *   defaultService  string     — service.id to open first
 *   unreadTitleRegex RegExp    — extracts unread count N from page title
 *   avatarSelector  string     — CSS selector for the user avatar <img>
 *   mailtoComposeUrl function  — (rawMailtoUrl: string) => string
 *   safeDomains     string[]   — domains the ad-blocker must NOT cancel
 */

const PROVIDERS = {
  google: {
    id:    'google',
    label: 'Google',
    color: '#4285F4',

    services: [
      { id: 'mail',     label: 'Gmail',    url: 'https://mail.google.com' },
      { id: 'calendar', label: 'Calendar', url: 'https://calendar.google.com' },
      { id: 'drive',    label: 'Drive',    url: 'https://drive.google.com' },
      { id: 'docs',     label: 'Docs',     url: 'https://docs.google.com' },
    ],

    defaultService: 'mail',

    // Gmail title: "(3) Inbox - user@gmail.com"  OR  "Inbox (3) - user@gmail.com"
    // Match count anywhere in the title to handle both formats
    unreadTitleRegex: /\((\d+)\)/,

    // DOM-based unread poller — runs inside the Gmail page every 30 s as a fallback.
    // Returns the inbox unread count as a number, or -1 if it can't be determined.
    unreadScript: `(function(){
      try {
        // Gmail: inbox nav link has aria-label like "Inbox, 3 unread conversations"
        var link = document.querySelector('a[href*="#inbox"][aria-label]');
        if (link) {
          var m = link.getAttribute('aria-label').match(/(\\d+)/);
          if (m) return +m[1];
        }
        // Fallback: title
        var tm = document.title.match(/\\((\\d+)\\)/);
        if (tm) return +tm[1];
      } catch(e) {}
      return -1;
    })()`,

    // Selector for the avatar image on a logged-in Gmail page
    avatarSelector: 'a[aria-label*="Google Account"] img, img[data-src*="googleusercontent"]',

    // Compose URL for mailto: links
    mailtoComposeUrl: (rawUrl) =>
      `https://mail.google.com/mail/?extsrc=mailto&url=${encodeURIComponent(rawUrl)}`,

    // These domains must never be blocked — Gmail breaks without them
    safeDomains: [
      'google.com',
      'googleapis.com',
      'gstatic.com',
      'googleusercontent.com',
      'accounts.google.com',
      'mail.google.com',
      'calendar.google.com',
      'drive.google.com',
      'docs.google.com',
    ],
  },

  zoho: {
    id:    'zoho',
    label: 'Zoho',
    color: '#E42527',

    services: [
      { id: 'mail',      label: 'Mail',      url: 'https://mail.zoho.com' },
      { id: 'calendar',  label: 'Calendar',  url: 'https://calendar.zoho.com' },
      { id: 'workdrive', label: 'WorkDrive', url: 'https://workdrive.zoho.com' },
      { id: 'writer',    label: 'Writer',    url: 'https://writer.zoho.com' },
    ],

    defaultService: 'mail',

    // Zoho Mail title formats vary — try parenthesised count OR bare number at title start
    unreadTitleRegex: /\((\d+)\)|^(\d+)\s/,

    // DOM-based unread poller — runs inside Zoho Mail every 15 s.
    // Returns the count as a number, or -1 if no recognised element is found.
    unreadScript: `(function(){
      try {
        // Method 1: Zoho Mail v2 folder-tree — scan all list items for one whose
        // text starts with "Inbox" and is followed by a number (the unread count).
        // Zoho renders these as <li> or <div> nodes without aria-labels.
        var all = document.querySelectorAll('li, [role="treeitem"], [role="listitem"]');
        for (var i = 0; i < all.length; i++) {
          var txt = all[i].textContent || '';
          if (/^\\s*inbox/i.test(txt)) {
            var m = txt.match(/(\\d+)/);
            if (m) return +m[1];
          }
        }
        // Method 2: any element whose class contains "zmbadge" (Zoho's CSS-module badge)
        var badge = document.querySelector('[class*="zmbadge"]');
        if (badge) {
          var n = parseInt(badge.textContent.trim(), 10);
          if (!isNaN(n) && n >= 0) return n;
        }
        // Method 3: older Zoho Mail class-based selectors
        var legacy = ['.zm-unread-count','[data-foldertype="inbox"] .count',
          '[data-folder-type="0"] .zmMFolderCount','#zmFolderInbox .count','.inbox-count'];
        for (var j = 0; j < legacy.length; j++) {
          var el = document.querySelector(legacy[j]);
          if (el) { var v = parseInt(el.textContent.trim(),10); if (!isNaN(v) && v>=0) return v; }
        }
      } catch(e) {}
      return -1;
    })()`,

    // Zoho Mail renders the user photo as an <img> loaded from contacts.zoho.com
    // (or regional variants: contacts.zoho.in, contacts.zohoeu.com, etc.).
    // Accept any Zoho contacts subdomain to handle all regional data centres.
    avatarSelector: [
      'img[src*="contacts.zoho.com/file"]',
      'img[src*="contacts.zoho.in/file"]',
      'img[src*="contacts.zohoeu.com/file"]',
      'img[src*="contacts.zoho.com.au/file"]',
      'img[src*="contacts.zoho.jp/file"]',
      'img[src*="contacts.zoho"]',
    ].join(', '),

    mailtoComposeUrl: (rawUrl) => {
      try {
        const parsed  = new URL(rawUrl);
        const to      = parsed.pathname.replace(/^\//, '');
        const subject = parsed.searchParams.get('subject') || '';
        const body    = parsed.searchParams.get('body')    || '';
        return 'https://mail.zoho.com/zm/#compose'
          + `?to=${encodeURIComponent(to)}`
          + `&subject=${encodeURIComponent(subject)}`
          + `&body=${encodeURIComponent(body)}`;
      } catch {
        return 'https://mail.zoho.com';
      }
    },

    safeDomains: [
      'zoho.com',
      'zohocdn.com',
      'zohostatic.com',
      'zohomail.com',
      'zohopublic.com',
      'zohoio.com',
      'mail.zoho.com',
      'calendar.zoho.com',
      'workdrive.zoho.com',
      'writer.zoho.com',
    ],
  },
  outlook: {
    id:    'outlook',
    label: 'Outlook',
    color: '#0078D4',   // Microsoft blue

    services: [
      { id: 'mail',     label: 'Mail',     url: 'https://outlook.office.com/mail' },
      { id: 'calendar', label: 'Calendar', url: 'https://outlook.office.com/calendar' },
      { id: 'onedrive', label: 'OneDrive', url: 'https://onedrive.live.com' },
      { id: 'people',   label: 'People',   url: 'https://outlook.office.com/people' },
    ],

    defaultService: 'mail',

    // Outlook Web title: "(3) Mail - user@domain.com - Outlook"
    // Outlook PWA also uses "[3] Mail - ..." in some builds — match either.
    unreadTitleRegex: /\((\d+)\)|\[(\d+)\]/,

    // DOM-based fallback — handles multiple Outlook Web aria-label formats
    unreadScript: `(function(){
      try {
        // Method 1: aria-label on any element containing "inbox" + a number
        var els = document.querySelectorAll('[aria-label]');
        for (var i = 0; i < els.length; i++) {
          var label = els[i].getAttribute('aria-label') || '';
          if (!/inbox/i.test(label)) continue;
          var m  = label.match(/(\\d+)\\s*unread/i);   if (m)  return +m[1];
          var m2 = label.match(/unread[:\\s]+(\\d+)/i); if (m2) return +m2[1];
          var m3 = label.match(/inbox[^0-9]*(\\d+)/i);  if (m3) return +m3[1];
        }
        // Method 2: data-automationid / data-unique-id inbox container → badge child
        var inboxItem = document.querySelector(
          '[data-automationid*="inbox" i], [data-unique-id*="inbox" i]'
        );
        if (inboxItem) {
          var badge = inboxItem.querySelector('[aria-label*="unread" i], [class*="count"], [class*="badge"]');
          if (badge) { var n = parseInt(badge.textContent.trim(), 10); if (!isNaN(n) && n >= 0) return n; }
          // New Outlook: unread count is a plain text node next to folder name
          var txt = inboxItem.textContent || '';
          var mc = txt.match(/(\\d+)/g);
          if (mc && mc.length === 1) return +mc[0];
        }
        // Method 3: New Outlook Web (2024) — folder tree nodes with counter spans
        var nodes = document.querySelectorAll('[data-testid*="Folder"], [data-testid*="folder"], li[role="treeitem"]');
        for (var k = 0; k < nodes.length; k++) {
          var node = nodes[k];
          var nodeLabel = node.getAttribute('aria-label') || node.textContent || '';
          if (!/inbox/i.test(nodeLabel)) continue;
          // Look for a numeric counter element inside the node
          var counter = node.querySelector('[data-testid*="count" i], [data-testid*="badge" i], span[title]');
          if (counter) { var cv = parseInt(counter.textContent.trim(), 10); if (!isNaN(cv) && cv > 0) return cv; }
          // Or a bare number span inside the node
          var spans = node.querySelectorAll('span');
          for (var s = 0; s < spans.length; s++) {
            var sv = parseInt(spans[s].textContent.trim(), 10);
            if (!isNaN(sv) && sv > 0 && spans[s].textContent.trim() === String(sv)) return sv;
          }
        }
        // Method 4: title fallback "(3) Mail - Outlook"
        var tm = document.title.match(/\\((\\d+)\\)/);
        if (tm) return +tm[1];
      } catch(e) {}
      return -1;
    })()`,

    // Outlook Web — profile button img (blob/substrate URL, no Graph API headers needed)
    // then Fluent UI Persona fallbacks. Listed most-specific → least-specific.
    // Post-2024 Outlook Web uses MeControl* attributes; older builds use the aria-label
    // selectors. The diagnostic block in viewManager.js (gated on provider.id === 'outlook')
    // logs which selector is matching the actual DOM — use it to refine this list.
    avatarSelector: [
      '[data-app-section="MeControlAvatar"] img',
      'button[data-app-section*="MeControl" i] img',
      '#owaPersonaButton img',
      '[data-testid="me-control-avatar"] img',
      'button[aria-label*="your profile" i] img',
      'button[aria-label*="account manager" i] img',
      'button[aria-label*="my account" i] img',
      'button[aria-label*="profile" i] img',
      'button[aria-label*="account" i] img',
      '[data-testid*="ProfilePhoto"] img',
      '[data-testid*="avatar" i] img',
      '[class*="Persona"] img[src]',
      '[class*="ms-Persona"] img[src]',
      'img[src*="graph.microsoft.com"]',
      'img[src*="substrate.office.com"]',
    ].join(', '),

    mailtoComposeUrl: (rawUrl) => {
      try {
        const parsed  = new URL(rawUrl);
        const to      = parsed.pathname.replace(/^\//, '');
        const subject = parsed.searchParams.get('subject') || '';
        const body    = parsed.searchParams.get('body')    || '';
        return 'https://outlook.office.com/mail/deeplink/compose'
          + `?to=${encodeURIComponent(to)}`
          + `&subject=${encodeURIComponent(subject)}`
          + `&body=${encodeURIComponent(body)}`;
      } catch {
        return 'https://outlook.office.com/mail';
      }
    },

    safeDomains: [
      'microsoft.com',       // *.microsoft.com — login, graph, cdn, etc.
      'microsoftonline.com', // login.microsoftonline.com (auth)
      'office.com',          // outlook.office.com and related
      'office365.com',       // legacy *.office365.com endpoints
      'live.com',            // personal accounts, onedrive.live.com
      'windows.net',         // Azure blob storage (attachments)
      'msauth.net',          // auth redirects
      'msecnd.net',          // Microsoft CDN
      'sharepoint.com',      // OneDrive storage backend
      'sfx.ms',              // Microsoft CDN
      'substrate.office.com', // profile photos API
    ],
  },
  fastmail: {
    id:    'fastmail',
    label: 'Fastmail',
    color: '#1A1A2E',

    services: [
      { id: 'mail',     label: 'Mail',     url: 'https://app.fastmail.com/mail' },
      { id: 'calendar', label: 'Calendar', url: 'https://app.fastmail.com/calendar' },
      { id: 'contacts', label: 'Contacts', url: 'https://app.fastmail.com/contacts' },
    ],

    defaultService: 'mail',

    // Fastmail title: "(3) Inbox - user@fastmail.com - Fastmail"
    unreadTitleRegex: /\((\d+)\)/,

    // DOM-based unread poller — runs inside Fastmail every 30 s.
    unreadScript: `(function(){
      try {
        // Fastmail uses aria-label on the inbox nav item
        var els = document.querySelectorAll('[aria-label]');
        for (var i = 0; i < els.length; i++) {
          var label = els[i].getAttribute('aria-label') || '';
          if (!/inbox/i.test(label)) continue;
          var m = label.match(/(\\d+)/);
          if (m) return +m[1];
        }
        // Fallback: title
        var tm = document.title.match(/\\((\\d+)\\)/);
        if (tm) return +tm[1];
      } catch(e) {}
      return -1;
    })()`,

    // Fastmail renders avatar in the top-right account button
    avatarSelector: 'img[alt*="profile" i], img[alt*="avatar" i], [class*="Avatar"] img, [class*="avatar"] img',

    mailtoComposeUrl: (rawUrl) => {
      try {
        const parsed  = new URL(rawUrl);
        const to      = parsed.pathname.replace(/^\//, '');
        const subject = parsed.searchParams.get('subject') || '';
        const body    = parsed.searchParams.get('body')    || '';
        return 'https://app.fastmail.com/mail/drafts/?to=' + encodeURIComponent(to)
          + '&subject=' + encodeURIComponent(subject)
          + '&body=' + encodeURIComponent(body);
      } catch {
        return 'https://app.fastmail.com/mail';
      }
    },

    safeDomains: [
      'fastmail.com',
      'fastmail.fm',
      'fastmail.net',
      'app.fastmail.com',
      'static.fastmailusercontent.com',
    ],
  },

  yahoo: {
    id:    'yahoo',
    label: 'Yahoo Mail',
    color: '#6001D2',

    services: [
      { id: 'mail',     label: 'Mail',     url: 'https://mail.yahoo.com' },
      { id: 'calendar', label: 'Calendar', url: 'https://calendar.yahoo.com' },
    ],

    defaultService: 'mail',

    // Yahoo Mail title: "(3) Yahoo Mail - user@yahoo.com"
    unreadTitleRegex: /\((\d+)\)/,

    // DOM-based unread poller — runs inside Yahoo Mail every 30 s.
    unreadScript: `(function(){
      try {
        // Yahoo Mail inbox nav item
        var els = document.querySelectorAll('[data-test-id="inbox-link"], [href*="#Inbox"], [class*="Nav"] [class*="count"]');
        for (var i = 0; i < els.length; i++) {
          var txt = els[i].textContent || '';
          var m = txt.match(/(\\d+)/);
          if (m) return +m[1];
        }
        // aria-label approach
        var labels = document.querySelectorAll('[aria-label*="inbox" i]');
        for (var j = 0; j < labels.length; j++) {
          var lab = labels[j].getAttribute('aria-label') || '';
          var lm = lab.match(/(\\d+)/);
          if (lm) return +lm[1];
        }
        // Fallback: title
        var tm = document.title.match(/\\((\\d+)\\)/);
        if (tm) return +tm[1];
      } catch(e) {}
      return -1;
    })()`,

    // Yahoo Mail profile avatar
    avatarSelector: 'img[data-test-id="Avatar"], [class*="Avatar"] img, img[src*="yahoo.com"][alt]',

    mailtoComposeUrl: (rawUrl) => {
      try {
        const parsed  = new URL(rawUrl);
        const to      = parsed.pathname.replace(/^\//, '');
        const subject = parsed.searchParams.get('subject') || '';
        const body    = parsed.searchParams.get('body')    || '';
        return 'https://compose.mail.yahoo.com/?to=' + encodeURIComponent(to)
          + '&subject=' + encodeURIComponent(subject)
          + '&body=' + encodeURIComponent(body);
      } catch {
        return 'https://mail.yahoo.com';
      }
    },

    safeDomains: [
      'yahoo.com',
      'yahooapis.com',
      'yimg.com',
      'yql.yahoo.com',
      'mail.yahoo.com',
      'calendar.yahoo.com',
    ],
  },

  proton: {
    id:    'proton',
    label: 'ProtonMail',
    color: '#6D4AFF',

    services: [
      { id: 'mail',     label: 'Mail',     url: 'https://mail.proton.me' },
      { id: 'calendar', label: 'Calendar', url: 'https://calendar.proton.me' },
      { id: 'drive',    label: 'Drive',    url: 'https://drive.proton.me' },
    ],

    defaultService: 'mail',

    // ProtonMail title: "(3) Inbox | ProtonMail"  — uses parenthesised count or bare count
    // Proton may also use "3 unread" in some contexts; try both patterns.
    unreadTitleRegex: /\((\d+)\)|^(\d+)\s/,

    // DOM-based unread poller — runs inside Proton Mail every 30 s.
    // Proton's web app is a React SPA; class names are hashed, so we rely on
    // data attributes and aria roles wherever possible.
    unreadScript: `(function(){
      try {
        // Method 1: Proton sidebar folder item for Inbox
        var items = document.querySelectorAll('[data-testid="navigation-link:inbox"], [href*="/inbox"]');
        for (var i = 0; i < items.length; i++) {
          var txt = items[i].textContent || '';
          var m = txt.match(/(\\d+)/);
          if (m) return +m[1];
        }
        // Method 2: aria-label on nav items containing "inbox"
        var els = document.querySelectorAll('[aria-label]');
        for (var j = 0; j < els.length; j++) {
          var lab = els[j].getAttribute('aria-label') || '';
          if (!/inbox/i.test(lab)) continue;
          var lm = lab.match(/(\\d+)/);
          if (lm) return +lm[1];
        }
        // Method 3: Proton renders unread count as a <span> next to the folder name
        var allItems = document.querySelectorAll('[class*="folder"], [class*="Folder"]');
        for (var k = 0; k < allItems.length; k++) {
          var content = allItems[k].textContent || '';
          if (!/inbox/i.test(content)) continue;
          var cm = content.match(/(\\d+)/);
          if (cm) return +cm[1];
        }
        // Method 4: title fallback "(3) Inbox | ProtonMail"
        var tm = document.title.match(/\\((\\d+)\\)/);
        if (tm) return +tm[1];
      } catch(e) {}
      return -1;
    })()`,

    // Proton account avatar (top-right header button)
    avatarSelector: '[data-testid="heading:userdropdown"] img, [class*="UserDropdown"] img, [aria-label*="account" i] img',

    mailtoComposeUrl: (rawUrl) => {
      try {
        const parsed  = new URL(rawUrl);
        const to      = parsed.pathname.replace(/^\//, '');
        const subject = parsed.searchParams.get('subject') || '';
        const body    = parsed.searchParams.get('body')    || '';
        return 'https://mail.proton.me/u/0/inbox#mailto='
          + encodeURIComponent('mailto:' + to
            + (subject ? '?subject=' + encodeURIComponent(subject) : '')
            + (body ? (subject ? '&' : '?') + 'body=' + encodeURIComponent(body) : ''));
      } catch {
        return 'https://mail.proton.me';
      }
    },

    safeDomains: [
      'proton.me',
      'protonmail.com',
      'protonmail.ch',
      'proton.ch',
      'mail.proton.me',
      'calendar.proton.me',
      'drive.proton.me',
      'account.proton.me',
    ],
  },
};

module.exports = { PROVIDERS };
