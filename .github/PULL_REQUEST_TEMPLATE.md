<!--
Thanks for contributing to Mailwing! Please fill out the sections below.
Delete any rows that don't apply.
-->

## Summary

<!-- What does this PR do, in 1–3 sentences? -->

## Motivation

<!-- Why is this change needed? Link to an issue or describe the user-facing problem. -->

Closes #

## Manual test matrix

Tick only the rows you actually exercised. It's fine to leave platforms/providers untested if your change can't affect them — note that in the Risk section.

### Platforms

- [ ] macOS (Apple Silicon)
- [ ] macOS (Intel)
- [ ] Windows
- [ ] Linux

### Providers

- [ ] Google (Gmail / Calendar / Drive / Docs)
- [ ] Zoho (Mail / Calendar / WorkDrive / Writer)
- [ ] Outlook (Mail / Calendar / OneDrive / People)
- [ ] Fastmail (Mail / Calendar / Contacts)
- [ ] Yahoo (Mail / Calendar)
- [ ] ProtonMail (Mail / Calendar / Drive)

### Cross-cutting flows (tick what you tested)

- [ ] Add account → sign in → avatar appears in sidebar
- [ ] Receive new mail → unread badge increments
- [ ] Click `mailto:` link from another app → opens compose in the right account
- [ ] Close window on macOS → reopen via dock → badge still correct
- [ ] Reorder accounts → restart app → order persisted

## Screenshots / log captures

<!-- Drop screenshots, GIFs, or main-process console excerpts here. Required for any UI change. -->

## Risk

<!-- What could break? What did you intentionally NOT test? -->

## Notes for reviewers

<!-- Anything else: tradeoffs, open questions, known follow-ups. -->
