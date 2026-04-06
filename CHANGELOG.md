# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
