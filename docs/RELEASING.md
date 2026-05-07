# Releasing Mailwing

A new release goes from "I want to ship" to "users see the update banner" in roughly 10 minutes of clock time, most of it spent waiting for CI. This runbook walks through every step.

## Prerequisites

- You have push access to `main` and tag-push permission.
- The GitHub Actions secrets for code-signing on macOS (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) are configured if you want a signed release. Without them the build still ships, just unsigned (Gatekeeper warnings + no passkey support — see `docs/GOTCHAS.md`).
- Your working tree is clean and on `main` at the commit you want to release.

## Steps

### 1. Update CHANGELOG.md

Add a new top-level section above the previous version, dated today. Group entries by **Added / Changed / Fixed / Docs** (Keep-a-Changelog style — see existing entries for the shape).

Be specific. "Improved Outlook" is not useful. "Outlook reading pane no longer hidden; clicking an email previews it again" is.

### 2. Bump `package.json`

```sh
# package.json — single line edit
"version": "X.Y.Z"
```

Use semver:
- `Z` (patch) for bug-fix-only releases.
- `Y` (minor) for new features that don't break anything.
- `X` (major) only if there's a breaking change for users.

### 3. Commit

```sh
git add CHANGELOG.md package.json
git commit -m "chore(release): vX.Y.Z"
```

### 4. Tag and push

```sh
git tag vX.Y.Z
git push origin main vX.Y.Z
```

Both pushes are necessary. The tag push triggers the release workflow.

### 5. Watch CI

Open `https://github.com/vinaysamtani/mailwing/actions`. The "Build & Release" workflow should kick off. Three platform builds run in parallel; expect 6–10 minutes total.

When all three jobs finish green, a "release" job runs and publishes a GitHub Release at `https://github.com/vinaysamtani/mailwing/releases/tag/vX.Y.Z` with the .dmg, .exe, and .AppImage attached.

If a build fails: read the log, fix the issue, push to `main`, and **re-tag** (delete the broken tag locally + remotely, then push the new one). Don't try to "rerun" — fix forward.

### 6. Compute the macOS DMG SHA256

Download the .dmg from the GitHub release page, then:

```sh
shasum -a 256 ~/Downloads/Mailwing-X.Y.Z-universal.dmg | awk '{print $1}'
```

Copy the 64-char hex output.

### 7. Bump the Homebrew cask

Edit `distribution/homebrew/mailwing.rb`:

```ruby
version "X.Y.Z"
sha256 "<the 64-char hex from step 6>"
```

Commit and push:

```sh
git add distribution/homebrew/mailwing.rb
git commit -m "chore(homebrew): bump cask to vX.Y.Z"
git push origin main
```

`brew install --cask vinaysamtani/mailwing/mailwing` will now resolve to the new version.

### 8. Smoke-check on a clean Mac

Worth doing for any release that touches main-process code:

1. Download the .dmg from the GitHub release page on a Mac that does NOT have a dev checkout.
2. Drag `Mailwing.app` to `/Applications`.
3. Right-click → **Open** (Gatekeeper warning, since the build is unsigned).
4. Confirm the app boots, shows your accounts, and has the new feature(s).

### 9. Existing users see the update

The in-app updater polls GitHub Releases on launch + every 6 hours. Within minutes, anyone running the previous version gets a banner offering the new one. There is nothing to push to them — the GitHub Release is the source of truth.

## When something goes wrong

- **CI built but didn't release.** Make sure the tag matches `v*.*.*` (e.g. `v1.2.0`, not `1.2.0`).
- **DMG install fails with a checksum error via brew.** The Homebrew formula's `sha256` doesn't match the `.dmg` actually on the release page. Recompute and re-push the formula.
- **`brew install --cask` says "no version".** Livecheck normally finds the latest GitHub tag automatically; if it doesn't, it usually means the GitHub release wasn't created (re-check the release-job logs in CI).
- **You tagged the wrong commit.** Delete the tag locally + remotely, fix, retag:
  ```sh
  git tag -d vX.Y.Z
  git push origin :refs/tags/vX.Y.Z
  # ... fix and re-tag
  ```
- **You shipped a regression.** Cut a follow-up patch release immediately (steps 1–7 again). Never amend or force-push the original tag — released users have already grabbed it from GitHub.

## What this runbook deliberately does NOT include

- Pre-release / beta channels — out of scope for v1.
- Auto-download / silent install — blocked on getting an Apple Developer ID. See the passkey GOTCHA for the same root cause.
- Marketing / social posts — the GitHub Release page is the canonical announcement.
