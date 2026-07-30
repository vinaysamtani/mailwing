# Gotchas

Hard-won knowledge that's not obvious from reading the code. If you trip on something subtle, please add a section here.

Each entry: short symptom → cause → file:line pointer.

---

## Outlook detects Electron and shortens the auth session

**Symptom:** After signing in to outlook.office.com, the user is signed back out within minutes or after a single restart.

**Cause:** Microsoft auth inspects the User-Agent string. When it sees `Electron/...`, it issues a short-lived token (treated as an unmanaged client). With a plain Chrome UA the session persists normally.

**Pointer:** `src/main/sessionManager.js:32-37` — when `providerConfig.id === 'outlook'`, override the partition's UA to a vanilla Chrome string.

**Don't:** apply the UA override globally. Other providers (e.g. Google) sometimes serve different content for non-Chrome UAs and we don't want to taint them.

---

## Zoho avatar URLs vary by region

**Symptom:** Zoho account is signed in, but the sidebar shows a letter tile rather than the user's photo.

**Cause:** Zoho serves the avatar from `contacts.zoho.{com,in,eu,com.au,jp,...}` depending on the data centre the account is provisioned in. A single hard-coded selector misses regional accounts.

**Pointer:** `src/shared/providers.js:127-137` — the `avatarSelector` is a comma-joined list across Zoho's regional contacts subdomains.

**When adding a new region:** append both `img[src*="contacts.zoho.<tld>/file"]` and the wildcard `img[src*="contacts.zoho"]` fallback is already present.

---

## Provider auth iframes need `X-Frame-Options` and CSP `frame-ancestors` stripped

**Symptom:** Sign-in flow in a `BrowserView` hangs with `ERR_BLOCKED_BY_RESPONSE`. Most often hits Google's iframe-based account chooser and Microsoft cookie-sync iframes.

**Cause:** Providers serve `X-Frame-Options: DENY` (or CSP `frame-ancestors`) on auth-related responses. Embedded iframes in our `BrowserView` aren't recognised as a same-origin top-level frame, so the browser blocks them.

**Pointer:** `src/main/sessionManager.js:71-86` — `webRequest.onHeadersReceived` deletes `x-frame-options` and strips just the `frame-ancestors` directive from CSP, leaving the rest of the policy intact.

**Don't:** strip the entire CSP — it weakens XSS defences across the loaded page. Surgical removal of `frame-ancestors` is enough.

---

## Off-screen `BrowserView`s must keep real dimensions

**Symptom:** Switching to a previously-loaded Zoho Mail view shows a collapsed sidebar / no folder tree, breaking unread polling.

**Cause:** Responsive SPAs (Zoho, post-2024 Outlook, others) detect the viewport. If we park the off-screen view at `1×1`, they fold into mobile layouts and the desktop folder tree never renders. When we then bring the view back on-screen they don't always re-expand.

**Pointer:** `src/main/viewManager.js:46-54` — `getOffscreenBounds()` keeps `width = window.contentWidth - SIDEBAR_WIDTH` and `height = window.contentHeight`, only changing `x` to a large negative offset.

**Rule of thumb:** never resize an off-screen `BrowserView` smaller than the on-screen one.

---

## macOS dock badge disappears after `app.dock.show()`

**Symptom:** On macOS, after closing the main window and reopening from the dock, the unread badge is gone even though the count hasn't changed.

**Cause:** When all windows are hidden, macOS removes the dock icon. `app.dock.show()` re-pins it, but the icon comes back fresh — `setBadgeCount` state is dropped along with it.

**Pointer:** `src/main/index.js:165-168` — call `app.dock.show().then(() => tray.reapplyBadge())` so the badge is re-asserted once the icon is back.

---

## SPAs suspend timers when their `BrowserView` is off-screen

**Symptom:** Background accounts stop receiving new-mail notifications until the user clicks them. Unread counts go stale.

**Cause:** Chromium fires `visibilitychange` to `'hidden'` when a page is occluded; SPA pollers (Gmail's connection daemon, Zoho's sync loop) throttle or stop entirely. Our off-screen `BrowserView`s are technically hidden.

**Pointer:** `src/main/sessionManager.js:28` — every session preloads `src/main/preload-visibility.js`, which forces `document.visibilityState = 'visible'` and intercepts the event so the page never observes a transition.

**Plus:** `backgroundThrottling: false` on the BrowserView itself (`src/main/viewManager.js:77`) — both layers needed.

---

## Web Notification permission must be denied

**Symptom:** Two desktop notifications fire for every new email — one from the OS via Electron, one from the provider's `Notification` API.

**Cause:** When the page is granted Web Notification permission, modern webmail provider UIs raise their own native notifications. We already raise our own from the main process (so we control routing back to the right account) — granting the page's request causes duplicates.

**Pointer:** `src/main/sessionManager.js:99-110` — `setPermissionRequestHandler` returns `false` for `notifications`. All other permissions (mic, clipboard, USB, etc.) are allowed.

---

## Passkey / Touch ID works in signed builds, never in `npm start`

**Status depends entirely on whether the binary running is signed. These are two different worlds — check which one you're in before debugging anything.**

| | Dev (`npm start`) | Signed release build |
|---|---|---|
| Binary | `node_modules/electron/dist/Electron.app` — unsigned | `Mailwing.app`, Developer ID signed + notarised |
| Passkey / Touch ID | **Cannot work.** OS-level block, no workaround | **Works.** Since v1.2.3 |
| Expected behaviour | Prompt appears and hangs | Normal ceremony completes |

### Dev builds: passkey cannot work, and that's not a bug to chase

`npm start` runs Electron's stock prebuilt binary, which ships unsigned. Confirm with:

```sh
codesign -dv node_modules/electron/dist/Electron.app
spctl -a -vv  node_modules/electron/dist/Electron.app
```

`code object is not signed at all` / `source=no usable signature` means the binary cannot do passkey on macOS, period.

**Symptom in dev:** the prompt **appears but is stuck** — Touch ID never reads, "Cancel" re-opens the same prompt in a loop, login never completes. Chromium logs:

```
FIDO: Cannot start caBLE because process is not self-responsible. Launch from Finder to fix.
FIDO: Cannot test Bluetooth power status because process is not self-responsible. Launch from Finder to fix.
```

**Cause:** macOS will not grant Touch ID / Secure Enclave / Bluetooth (caBLE) access to a binary without a usable code signature. "Process not self-responsible" is what Chromium prints when `SecCodeIsResponsibleProcess` and related TCC checks decline to trust the binary. This happens whether launched from a terminal **or** from Finder — the launch path is irrelevant, the missing signature is not.

**To test the passkey flow at all, you must build and sign:** `npm run dist:mac` with a Developer ID in the keychain, then run the produced `.app`. There is no dev shortcut.

### Signed builds: passkey works

v1.2.3 was the first Apple-signed and notarised release, and passkey ceremonies complete normally in it and later. Verify a specific build with:

```sh
codesign -d --entitlements - "/Applications/Mailwing.app"
spctl  -a -vv             "/Applications/Mailwing.app"
```

### A missing prompt is a different problem entirely

**Do not read "it never asked me for a passkey" as this bug.** The signature failure mode is a prompt that appears and *hangs*. If no prompt appears and sign-in succeeds anyway, the provider simply chose another method — a password, a remembered-device / "stay signed in" cookie, or no passkey registered for that account. Microsoft in particular treats passkey as one option among several and will default to password.

To exercise the path deliberately, pick "Sign in with Windows Hello or a security key" (Outlook) or the equivalent explicit passkey option, rather than letting the provider choose. Absence of `FIDO:` lines in the logs means the ceremony was never attempted, not that it was blocked.

### Requirements for a passkey-capable build

1. **Apple Developer Program membership** (~USD 99/year). No free path — Apple does not issue Developer ID certificates outside it.
2. **A Developer ID Application certificate** in the keychain (or as a base64 `.p12` in CI).
3. **The `APPLE_*` GitHub Actions secrets** referenced in `.github/workflows/release.yml` (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
4. **Notarisation** via `scripts/notarize.js` (already wired up; runs only when `APPLE_ID` is set).

Without those, no entitlement set or code change can make passkey work — entitlements bind to a signature, and there is no signature.

**Don't:** chase this through Electron permission handlers. `setPermissionCheckHandler` and `setPermissionRequestHandler` already allow `publickey-credentials-{get,create}` (`src/main/sessionManager.js:106-124`); the gate is below them, in macOS.

**Pointers:**
- `build/entitlements.mac.plist` — the right entitlements (Bluetooth, hardened-runtime exemptions). They take effect *once the binary is signed*.
- `scripts/notarize.js` — runs notarisation when `APPLE_ID` is present in the build env.
- `.github/workflows/release.yml` — CI signing/notarisation pipeline.

---

## In-app popups must inherit the account's session partition

**Symptom:** Opening a calendar invite or a passkey ceremony from Gmail prompts for re-login despite the parent BrowserView being signed in.

**Cause:** When `setWindowOpenHandler` returns `action: 'allow'`, the new window's `webPreferences` must specify the *same* session as the parent. Passing a `session` instance (`session: sess`) works in some Electron versions; passing the partition string (`partition: 'persist:mailwing-' + accountId`) is more reliable inside `overrideBrowserWindowOptions`.

**Pointer:** `src/main/viewManager.js:115-124` — popup webPreferences. Cookies are scoped to the partition, so any popup using a different partition string (or omitting it) gets a clean cookie jar.

**Test before shipping:** open Gmail → click a calendar-invite RSVP button → the popup should land on `calendar.google.com` without showing the Google account chooser.
