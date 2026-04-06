# Contributing to Mailwing

Thank you for taking the time to contribute! This document covers everything you need to go from idea to merged pull request.

---

## Table of contents

1. [Setting up a development environment](#1-setting-up-a-development-environment)
2. [Forking and cloning](#2-forking-and-cloning)
3. [Branching conventions](#3-branching-conventions)
4. [Making changes](#4-making-changes)
5. [Testing your changes](#5-testing-your-changes)
6. [Committing](#6-committing)
7. [Submitting a pull request](#7-submitting-a-pull-request)
8. [Releasing a new version](#8-releasing-a-new-version)
9. [Reporting bugs](#9-reporting-bugs)
10. [Requesting features](#10-requesting-features)

---

## 1. Setting up a development environment

**Prerequisites:**
- [Node.js](https://nodejs.org/) 18 or later
- npm 8 or later
- git

No build step, no transpiler, no bundler. The project is plain CommonJS JavaScript — any text editor works.

---

## 2. Forking and cloning

1. Click **Fork** on the GitHub repository page to create a copy under your account.

2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mailwing.git
   cd mailwing
   ```

3. Add the upstream remote so you can pull in future changes:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/mailwing.git
   ```

4. Install dependencies (also generates the app icons via a postinstall script):
   ```bash
   npm install
   ```

5. Verify everything works:
   ```bash
   npm start
   ```
   The app should launch. The sidebar will be empty on a fresh clone — that is expected.

---

## 3. Branching conventions

Always branch off `main`. Use a short, lowercase, hyphenated name prefixed by type:

| Prefix | Use for |
|---|---|
| `feat/` | New features or providers |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring without behaviour change |
| `docs/` | Documentation-only changes |
| `chore/` | Dependency updates, build scripts, CI |

```bash
git checkout main
git pull upstream main           # start from the latest
git checkout -b feat/fastmail-provider
```

---

## 4. Making changes

### General rules

- **One logical change per pull request.** A PR that fixes a bug and adds a feature is harder to review and harder to revert.
- **Match the surrounding code style.** No linter is enforced; just follow the conventions you see — `'use strict'`, 2-space indentation, single quotes.
- **Plain CommonJS only.** Do not introduce `import`/`export`, TypeScript, or a bundler. `electron-store` is pinned to v8 specifically to maintain CJS compatibility.
- **No speculative abstractions.** If something is only used once, keep it inline. Build the simplest thing that solves the problem.

### Adding a new email provider

The entire provider definition lives in `src/shared/providers.js`. No other files need changing — see the _Adding a new provider_ section in [README.md](README.md) for the full field reference and a copy-paste template.

### Changing IPC channels

All channel names are defined in `src/shared/constants.js`. The renderer accesses them only through the `window.mailwing` API exposed in `src/renderer/preload.js`. Do not hard-code channel strings elsewhere.

### Modifying the sidebar UI

The sidebar is rendered entirely in `src/renderer/renderer.js` (plain DOM, no framework). Styles are in `src/renderer/styles.css`. Both light and dark variants must work — test by toggling your OS appearance while the app is running.

---

## 5. Testing your changes

There is no automated test suite. Test manually before opening a PR:

- **Run the app:** `npm start`
- **Exercise the affected code path** with at least one real account sign-in.
- **Toggle dark mode** (System Preferences / Settings) while the app is open if your change touches UI.
- **Resize and reopen** the window to confirm window-state persistence still works.
- **Test on the platforms you have access to.** Note in the PR description which platforms you tested.

---

## 6. Committing

Keep commits small and focused. Write the subject line in the imperative mood (what the commit _does_, not what you _did_):

```
feat: add Fastmail provider
fix: prevent unread badge overflow past 99+
docs: document avatarSelector field
```

If a commit closes a GitHub issue, add `Closes #123` in the commit body.

```bash
git add src/shared/providers.js
git commit -m "feat: add Fastmail provider"
```

---

## 7. Submitting a pull request

1. Push your branch to your fork:
   ```bash
   git push origin feat/fastmail-provider
   ```

2. Open a pull request against the `main` branch of the upstream repo.

3. Fill in the PR description with:
   - **What** changed and **why**
   - **How you tested it** (OS, number of accounts, specific flows exercised)
   - Any **screenshots or recordings** for UI changes

4. Keep the PR up to date. If `main` moves forward while your PR is open, rebase:
   ```bash
   git fetch upstream
   git rebase upstream/main
   git push --force-with-lease origin feat/fastmail-provider
   ```

5. Respond to review comments promptly. Once approved, a maintainer will merge.

---

## 8. Releasing a new version

> This section is for maintainers with push access to `main`.

### Step 1 — Update `CHANGELOG.md`

Add a new section at the top (below the `# Changelog` header) following the existing format:

```markdown
## [1.1.0] - YYYY-MM-DD

### Added
- …

### Fixed
- …

### Changed
- …
```

Commit this change to `main` before tagging.

### Step 2 — Bump the version

```bash
npm version <major|minor|patch>   # e.g. npm version patch → 1.0.1
# This updates package.json and creates a local git tag automatically.
```

Or set an explicit version:

```bash
npm version 1.1.0
```

### Step 3 — Push the commit and tag

```bash
git push origin main        # push the version bump commit
git push origin v1.1.0      # push the tag — this triggers the release workflow
```

### What happens next

The `release.yml` GitHub Actions workflow fires automatically:

1. Three parallel **Build** jobs run on macOS, Windows, and Ubuntu (≈ 8–15 min total).
2. Once all three pass, a **Create GitHub Release** job publishes the release and attaches the `.dmg`, `.exe`, and `.AppImage` files.

Monitor progress at: `github.com/vinaysamtani/mailwing/actions`

The finished release appears at: `github.com/vinaysamtani/mailwing/releases`

---

## 9. Reporting bugs

Open a [GitHub issue](../../issues/new) and include:

- **OS and version** (e.g. macOS 14.4, Windows 11 23H2)
- **Electron version** (shown in `Help → About` or `package.json`)
- **Steps to reproduce** — the minimal sequence that triggers the bug
- **Expected behaviour** vs **actual behaviour**
- **Console output** if relevant (open DevTools with `Cmd/Ctrl+Shift+I`)

---

## 10. Requesting features

Open a [GitHub issue](../../issues/new) describing:

- The problem you are trying to solve (not just the solution)
- How you currently work around it, if at all
- Any providers or platforms that would be affected

For large changes, discuss the approach in an issue before writing code — it avoids effort spent on a direction that won't be merged.
