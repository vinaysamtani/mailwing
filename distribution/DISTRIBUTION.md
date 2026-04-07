# Mailwing Distribution Checklist

This document tracks what's needed to submit Mailwing to each distribution channel.

---

## Prerequisites (do first)

- [ ] Tag a release (`git tag v1.0.1 && git push --tags`) — CI builds and publishes binaries automatically
- [ ] Add a real `docs/screenshot.png` (run `npm start`, take a screenshot at ~1400×900 px)
- [ ] Confirm GitHub Releases has all three artifacts: `.dmg`, `.exe`, `.AppImage`

---

## Homebrew Cask

**Status:** Formula drafted at `distribution/homebrew/mailwing.rb`

Steps:
1. Create a new tap repo: `github.com/vinaysamtani/homebrew-mailwing`
2. Copy `distribution/homebrew/mailwing.rb` into the tap repo root
3. Compute real `sha256` after a release is published:
   ```sh
   curl -L https://github.com/vinaysamtani/mailwing/releases/download/v1.0.1/Mailwing-1.0.1-universal.dmg | shasum -a 256
   ```
4. Replace `sha256 :no_check` with the real hash and commit
5. Test locally: `brew tap vinaysamtani/mailwing && brew install --cask mailwing`
6. Users install with: `brew install --cask vinaysamtani/mailwing/mailwing`

Optional: Submit to homebrew-cask (requires 30-day repo history + 75 GitHub stars).

---

## winget (Windows Package Manager)

**Status:** Manifest drafted at `distribution/winget/manifests/v/Mailwing/Mailwing/1.0.1/`

Steps:
1. Compute `InstallerSha256` for the `.exe`:
   ```powershell
   Get-FileHash Mailwing-Setup-1.0.1.exe -Algorithm SHA256
   ```
2. Update `Mailwing.Mailwing.installer.yaml` with the real hash
3. Fork `microsoft/winget-pkgs`, copy the manifests folder, open a PR
4. CI validates the manifest automatically; merge typically takes 1-3 business days

---

## AlternativeTo

**Status:** Manual submission required — no API

URL: https://alternativeto.net/software/mailwing/about/  
(Create a new entry if it doesn't exist yet)

Suggested "Alternatives to" list:
- Kiwi for Gmail
- Mimestream
- Mailspring
- Thunderbird
- Bimeister

Suggested tags: `email-client`, `gmail`, `electron`, `multi-account`, `cross-platform`

---

## ProductHunt

**Status:** Manual submission required

Suggested copy:

**Tagline:** One window for Gmail, Zoho, and Outlook — with live unread badges

**Description:**
Mailwing is an open-source, native desktop email client that wraps Gmail, Zoho Mail, and Outlook in a single window. Each account gets a fully isolated session, a live unread badge on the sidebar and dock, and desktop notifications that jump you straight to the right inbox.

No subscriptions. No cloud sync. Free and MIT licensed.

**Media needed:**
- App screenshot (`docs/screenshot.png`)
- Short demo GIF (optional but highly recommended)

**Link:** https://github.com/vinaysamtani/mailwing

---

## Reddit Posts

Post to these subreddits after launch. One post per subreddit, link-post preferred.

| Subreddit | Notes |
|---|---|
| r/macapps | Focus on macOS universal binary, dock badge, system tray |
| r/windows | Focus on NSIS installer, winget, mailto: handler |
| r/linux | Focus on AppImage, no snap/flatpak required |
| r/email | Cross-provider angle — Gmail + Zoho + Outlook in one window |
| r/selfhosted | Open-source angle; no server, no cloud sync |
| r/electronjs | Dev-focused; single `providers.js` to add new providers |

Sample title: **"Mailwing – open-source desktop client for Gmail, Zoho Mail, and Outlook (Electron, free, MIT)"**

---

## Screenshot

Add `docs/screenshot.png`:
1. `npm start`
2. Add a few test accounts (one Gmail, one Zoho, one Outlook)
3. Take a screenshot at 1400×900 px
4. Save as `docs/screenshot.png` and commit
