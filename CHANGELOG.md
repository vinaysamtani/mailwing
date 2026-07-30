# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-07-30

Promotes 1.3.0-beta.1 to stable and adds right-click menus and a choice of where links open.

### Added
- **Right-click menus.** Right-clicking anywhere in the app previously did nothing — Electron ships no default context menu. There are now native menus in mail views, pinned apps, sign-in popups, compose windows and the sidebar itself, with copy/paste, cut, paste-and-match-style, link and image actions, and web search for a selection.
- **Spelling suggestions are finally reachable.** Spellcheck was already underlining misspelled words in mail and compose windows, but there was no way to act on it. Right-click an underlined word for corrections, or add it to your dictionary.
- **Choose where links open.** Links in an email can now open in Mailwing rather than your default browser, in a window with back/forward/reload, the page's address, and an "Open in Browser" button to hand the page off. Set the default under **Settings → Open Links In**; right-click any link to override it for that one link. Defaults to your OS browser, so nothing changes unless you opt in.

### Fixed
- Diagnostic logging that shipped in 1.3.0-beta.1 no longer runs in released builds. It inspected the page structure of a signed-in mailbox to help identify unread-count and avatar elements, and wrote what it found to the app's console output. It is now limited to development builds.
- Dismissing an update banner now sticks. Previously the banner reappeared a few minutes later once the background download finished, so dismissing it looked broken.
- Clicking a link that opens in the same tab no longer strands your mailbox on an external page. Because the main window has no back button, the only way back was restarting the app.
- Links to a provider's unrelated properties (for example Google search results or Yahoo news) no longer open in a bare in-app window with no navigation controls. They now follow your link preference like any other link, while sign-in and companion apps such as Drive, Docs and Calendar continue to open in-app on your account's session.

### Docs
- `docs/GOTCHAS.md` now separates passkey behaviour in development builds from signed releases, and records that a *missing* passkey prompt is a different problem from the signature failure mode.

## [1.3.0-beta.1] - 2026-05-28

> **Pre-release / testing build.** Flagged as a pre-release on GitHub and not marked "Latest", so stable users are never auto-served it. Auto-update keeps beta builds on the beta channel.

### Added
- **Apps Panel** — pin web apps (Cloudflare, GitHub, GitLab, Slack, Linear, Notion, Figma, Stripe, ChatGPT, Claude, …) in the sidebar alongside your email accounts. Each app runs in its own isolated session, is organised by category in the picker, and inactive apps hibernate to free memory.
- **One-click auto-update** — new versions now download in the background and install on a single "Restart to update" click, powered by `electron-updater`. This replaces the notification-only banner from 1.2.0 (which only opened the releases page). Updates are channel-aware: a pre-release build tracks the beta channel, a stable build only sees stable releases.

### Changed
- Build pipeline publishes update metadata (`latest*.yml`) and a macOS `.zip` target as release assets so `electron-updater` can find new versions; a semver pre-release tag (e.g. `v1.3.0-beta.1`) is flagged as a GitHub pre-release automatically.
- README macOS section updated for signed + notarised builds — the Gatekeeper workaround is no longer documented.

## [1.2.3] - 2026-05-26

### Changed
- First Apple-signed and notarised release. Builds now ship with a Developer ID Application signature, so macOS no longer shows a Gatekeeper "unidentified developer" warning and passkey ceremonies (Touch ID / Secure Enclave / caBLE) work — previously blocked because macOS refuses passkey APIs to binaries it can't validate (see `docs/GOTCHAS.md`, `docs/SIGNING.md`). No code or feature changes from 1.2.2.

## [1.2.2] - 2026-05-19

### Fixed
- Clicking a `mailto:` link from another app no longer "hangs" after you pick an account in the picker. Compose now opens in its own window sharing the account's session partition, instead of navigating the warmed mailbox view to the provider's compose URL — no more blank-screen reload, no more out-of-sync sidebar highlight, and your inbox is still there after you send.

### Added
- macOS: a thin (28 px) draggable strip across the top of the content area so the top of the window behaves like a native title bar — drag to move, double-click to zoom (per System Settings → Desktop & Dock). The strip uses the sidebar background so the chrome forms an inverted L; traffic lights stay where they were. Windows/Linux are unchanged.

## [1.2.1] - 2026-05-07

### Fixed
- Closing in-app popups (calendar-invite RSVPs, compose-in-new-window, passkey ceremonies that don't redirect through an auth host) no longer reloads the active mailbox. The post-popup-close reload — added in 1.2.0 to recover from "stuck on signed-out landing page" — now only fires when the popup actually visited a sign-in host (`accounts.*`, `login.*`, `signin.*`, `auth.*`, `oauth.*`). Sign-in flows still trigger the parent reload as before.
- Removed a leftover `[diag-popup]` `console.log` that was added during the v1.2.0 calendar-invite investigation and printed on every popup creation.

## [1.2.0] - 2026-05-07

### Added
- **Notes / Todo panel** — a personal scratch space accessible from a new icon in the sidebar bottom. Add notes (Enter to submit, Shift+Enter for newline), tick to mark done, click × to delete. Persists in `notes.json` in the user data directory. Cmd/Ctrl+Shift+N opens the panel.
- **In-app update notification** — the app now checks the GitHub Releases API on launch and every six hours; a slim banner across the top of the window announces a newer version with a Download button (opens the release page in the system browser) and a Dismiss × that suppresses the banner for that version. Notification-only by design — no auto-download (unsigned builds preclude Squirrel.Mac auto-update).
- Four additional providers in the registry: Fastmail, Yahoo Mail, ProtonMail (Outlook was already shipping but is now actually working — see Fixed).

### Changed
- Outlook reading pane is no longer hidden; the native 3-column layout (folder tree + message list + reading pane) returns. Clicking a message now previews it again.
- Outlook unread-title regex now matches both `(N)` and `[N]` formats so newer Outlook Web title styles are recognised.
- Outlook avatar selectors include the post-2024 MeControl* attributes; retry schedule extended to 75 s for slow networks.
- Auth-popup webPreferences switched from a `session` instance to a `partition` string for more reliable cookie sharing through `setWindowOpenHandler`.
- macOS entitlements file cleaned up: removed the bogus `com.apple.developer.public-key-credential` key (not a real Apple entitlement); added `com.apple.security.device.bluetooth` for caBLE / cross-device passkeys.
- Permission handlers explicitly allow `publickey-credentials-get` / `publickey-credentials-create` (intent now self-documenting).

### Fixed
- After auth-popup login completes (Gmail session expiry, Outlook re-login), the parent BrowserView now auto-reloads. No more stuck-on-landing-page until app restart.
- Calendar-invite RSVP popups in Gmail no longer prompt for re-login — popups now genuinely inherit the parent account's session partition.
- Avatar extractor and unread poller no longer crash with an `UnhandledPromiseRejectionWarning` when a view is destroyed mid-timer (account removal, render crash, app quit).
- Various race-condition guards in `viewManager.js` for destroyed `webContents`.

### Docs
- New `docs/GOTCHAS.md` — known quirks captured in one place: Outlook UA spoof, Zoho regional avatar domains, CSP `frame-ancestors` stripping, off-screen `BrowserView` dimensions, dock-badge re-apply on macOS, visibility preload, Web `Notification` permission denial, and the passkey signing-requirement on macOS.
- New `docs/adr/0001-session-partition-per-account.md` — first ADR documenting the per-account `persist:mailwing-{accountId}` session-partition design.
- New `docs/RELEASING.md` — runbook for cutting a release.
- New `.github/PULL_REQUEST_TEMPLATE.md` — Summary / Motivation / 3-platform × 6-provider test matrix / risk note.
- README updated to list all six providers (was advertising three).

## [1.0.0] - 2026-04-06

### Added
- Multi-provider support: Google (Gmail, Calendar, Drive, Docs) and Zoho (Mail, Calendar, WorkDrive, Writer)
- Multiple accounts per provider, each with a fully isolated session partition
- System tray icon with live unread email count badge
- Desktop notifications with click-to-focus routing to the correct account
- `mailto:` protocol handler — registers Mailwing as your default mail client
- Ad and tracker blocking at the network level
- Automatic dark mode following the OS system preference
- Window size and position persistence across sessions
- Keyboard shortcuts: `Cmd/Ctrl+1–9` to switch accounts, `Cmd/Ctrl+R` to reload
- Drag-to-reorder account avatars in the sidebar
- Right-click context menu on account avatars: custom accent colour + remove
- Provider badge on each avatar showing which provider the account belongs to
- In-app bug reporting via Help menu and sidebar button
- Pure-JS icon generation via postinstall script (no native dependencies)
- Cross-platform packaging: macOS DMG (x64 + arm64), Windows NSIS, Linux AppImage
