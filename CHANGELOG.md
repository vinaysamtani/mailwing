# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
