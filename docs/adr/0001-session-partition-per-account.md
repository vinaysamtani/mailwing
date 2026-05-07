# ADR-0001 — One Electron `Session` partition per account

**Status:** Accepted
**Date:** 2026-05-06

## Context

Mailwing supports multiple accounts per provider. Two Gmail accounts must each be able to be signed in at the same time, in the same window, without one signing the other out. The same applies to multiple Outlook tenants, multiple Zoho data centres, and so on.

Cookies are scoped per origin, not per account. Loading two Gmail accounts in the default Electron session would mean both accounts try to share the same `mail.google.com` cookie jar — only the most-recently-signed-in account's cookies survive. The same constraint applies to localStorage, IndexedDB, service workers, and HTTP cache.

We also have per-provider customisations that must not leak between accounts:
- A custom Chrome User-Agent for Outlook (Microsoft's auth detects Electron and shortens token lifetime).
- An ad/tracker network filter that allows the provider's own domains.
- Permission handlers (deny Web Notifications, allow WebAuthn pre-flight).

## Decision

Each account is given its own persistent Electron `Session` partition, named `persist:mailwing-{accountId}`, where `accountId` is a stable UUID generated when the account is added.

Every per-session customisation is attached at session creation time:

```
session.fromPartition('persist:mailwing-' + accountId, { cache: true })
  → setPreloads([visibility-preload])
  → setUserAgent(...)               // outlook only
  → webRequest.onBeforeRequest(...)  // ad-block + safe-domain allowlist
  → webRequest.onHeadersReceived(...)// strip X-Frame-Options + CSP frame-ancestors
  → setPermissionRequestHandler(...) // deny Web Notifications
  → setPermissionCheckHandler(...)   // allow WebAuthn pre-flight
```

Implementation: `src/main/sessionManager.js` (`getOrCreateSession`).

## Consequences

**Positive**
- Cookie / localStorage / IndexedDB / service-worker isolation is automatic — Chromium enforces it.
- A regression in one account's session never corrupts another's.
- Adding or removing an account never touches another account's stored login state.
- Per-provider quirks (UA spoof, safe-domain ad-block list) are scoped to exactly the right partition.

**Negative**
- Disk usage scales linearly with the number of accounts (each partition stores its own cache / IDB).
- Removing an account requires explicit cleanup: `sessionManager.destroySession(accountId)` is called from `viewManager.destroyAccountViews` (see `src/main/viewManager.js:407`). Forgetting this would leak the session in memory until the app restarts.
- Popups opened by the page (passkey ceremonies, calendar invites) must inherit the same partition explicitly through `setWindowOpenHandler` — `webPreferences.partition` (or `session`) on the override options. Failing to do so breaks SSO into the popup.

## Alternatives considered

**Single shared session.** Rejected — only one account per provider could be signed in at a time. The whole product premise depends on multiple concurrent accounts.

**Ephemeral (in-memory) session per account.** Rejected — users would have to sign in to every account on every launch.

**Session per provider (not per account).** Rejected — same cookie-jar collision problem within a single provider.

## Related

- `src/main/sessionManager.js` — partition lifecycle and per-session hooks.
- `src/main/viewManager.js:69` — `getOrCreateSession` is wired into BrowserView creation.
- `src/main/viewManager.js:115-124` — popups must inherit the partition via `overrideBrowserWindowOptions`.
- `docs/GOTCHAS.md` — symptoms when this isolation breaks.
