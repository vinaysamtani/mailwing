# Code signing for passkey support

This is a runbook for turning Mailwing's unsigned builds into Apple-signed, notarised builds — the prerequisite for Touch ID / Secure Enclave / Bluetooth (caBLE) passkey ceremonies on macOS.

For *why* this is needed and the matching diagnostic, see `docs/GOTCHAS.md:89-126`. Short version: macOS refuses passkey APIs to any binary whose signature it can't validate. Entitlements alone don't help; the binary needs an Apple Developer ID signature. There is no free path.

Everything in this doc is administrative — no source-code changes. The entitlements file, the notarisation script, and the CI signing pipeline are already in place; they activate the moment a valid signature lands.

---

## What's already wired

Before you start, confirm these haven't drifted:

- `build/entitlements.mac.plist` declares `com.apple.security.device.bluetooth` (caBLE), `cs.allow-jit`, `cs.allow-unsigned-executable-memory`, `cs.disable-library-validation`.
- `src/main/sessionManager.js` allows `publickey-credentials-get` / `publickey-credentials-create` in both `setPermissionRequestHandler` and `setPermissionCheckHandler`.
- `scripts/notarize.js` runs after the build step and skips when `APPLE_ID` is unset.
- `.github/workflows/release.yml` references six `APPLE_*` secrets in its Build step and falls back to an unsigned build when they're absent.

If any of these are missing, fix that first — signing won't do anything if the entitlements or permissions weren't declared.

---

## 1. Enrol in the Apple Developer Program

Open <https://developer.apple.com/programs/enroll/> and follow the flow. Cost is ~USD 99/year. Choose **Individual** (or Organisation if Mailwing is incorporated). Approval typically takes a few hours to a few days.

You'll need:
- An Apple ID that you'll use for the developer account.
- A government-issued ID at hand (Apple may ask).
- Two-factor authentication on the Apple ID (Apple requires it).

When approval lands you get access to the developer portal at <https://developer.apple.com/account>.

## 2. Find your Team ID

In the developer portal, open **Membership Details**. Look for "Team ID" — it's a 10-character alphanumeric string like `ABCDE12345`. Copy it; you'll need it as a GitHub Actions secret.

## 3. Generate a Developer ID Application certificate

This is the certificate the CI build will use to sign `Mailwing.app`. Note: there are several different Apple certificate types — make sure you generate **Developer ID Application** (for distribution outside the Mac App Store), not "Apple Development" or "Mac App Distribution".

**Easiest path — via Xcode** (any recent version):

1. Open Xcode → Settings → Accounts.
2. Add your Apple ID and sign in.
3. Select your team → **Manage Certificates**.
4. Click `+` → **Developer ID Application**. Xcode creates the certificate and installs it into your login keychain.

**Alternative — via the developer portal manually:**

1. <https://developer.apple.com/account/resources/certificates/list>
2. `+` → "Developer ID Application" → Continue.
3. Generate a Certificate Signing Request (CSR) using Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority. Save the `.certSigningRequest` file.
4. Upload the CSR, download the resulting `.cer`, and double-click to install it into the login keychain.

## 4. Export the certificate as a base64-encoded `.p12`

The CI build needs the certificate as a single file plus a password. From Keychain Access:

1. Open the **login** keychain, switch to the **My Certificates** category.
2. Find "Developer ID Application: <Your Name> (<Team ID>)" — expand to confirm a private key is attached. Without the private key, the export will be useless.
3. Right-click the certificate → **Export**. Save as `mailwing-signing.p12`. Set a strong password — you'll add it to GitHub Secrets next.

Convert to base64 (the GitHub Actions secret expects a single-line string):

```sh
base64 -i mailwing-signing.p12 -o mailwing-signing.p12.b64
```

Open `mailwing-signing.p12.b64` and copy the entire contents. Delete the local `.p12` and `.p12.b64` files once you've copied the base64 — you don't need them on disk after the secret is uploaded.

## 5. Generate an app-specific password

Notarisation authenticates with your Apple ID but uses an app-specific password (not your account password). Generate one at <https://appleid.apple.com/account/manage>:

1. Sign in.
2. **Sign-In and Security** → **App-Specific Passwords** → `+`.
3. Label it "Mailwing notarisation". Save the password — it's shown only once.

## 6. Add the six GitHub Actions secrets

In the Mailwing repo on GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add each of these (names matter — they're hard-coded in `.github/workflows/release.yml`):

| Secret name                   | Value                                                |
|-------------------------------|------------------------------------------------------|
| `APPLE_CERTIFICATE`           | The base64 string from step 4                        |
| `APPLE_CERTIFICATE_PASSWORD`  | The `.p12` password you set in step 4                |
| `APPLE_ID`                    | Your Apple Developer account email                   |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from step 5                |
| `APPLE_TEAM_ID`               | The 10-char Team ID from step 2                      |

(The sixth slot Apple sometimes mentions, `KEYCHAIN_PASSWORD`, isn't needed — the CI workflow creates a temporary keychain and sets its own password.)

## 7. Cut a release

Follow `docs/RELEASING.md` as normal:

```sh
# Update CHANGELOG.md and package.json
git add CHANGELOG.md package.json
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

Open `https://github.com/vinaysamtani/mailwing/actions` and watch the "Build & Release" workflow. The macOS job's Build step now picks up `CSC_LINK` (from `APPLE_CERTIFICATE`) and the Apple ID secrets; electron-builder signs and `scripts/notarize.js` notarises. Expect the macOS job to take ~6-10 minutes (notarisation is the slow part).

## 8. Verify the result

Once the release is published, download the new `.dmg` from the GitHub Releases page. On any Mac:

```sh
# Should show a valid Developer ID signature with the bluetooth entitlement.
codesign -d --entitlements - /Applications/Mailwing.app

# Should report "accepted source=Notarized Developer ID"
spctl -a -vv /Applications/Mailwing.app
```

If both pass, install the DMG and try a passkey-protected sign-in (e.g. Google account with a passkey enrolled). Touch ID should activate; the prompt should complete instead of looping.

If `spctl` still says `source=no usable signature` after a successful CI run, the secrets were probably misconfigured — re-check that `APPLE_CERTIFICATE` is a single-line base64 string with no surrounding whitespace, and that `APPLE_TEAM_ID` matches the certificate's Team ID exactly.

## What this *doesn't* enable

- **Auto-update**: still gated on separate code-signing + a Squirrel.Mac update feed. Notarisation is necessary but not sufficient for silent updates. The in-app update banner that currently points users to the GitHub release page is still the right UX.
- **App Store distribution**: Developer ID is for *outside* the Mac App Store. Submitting to the App Store needs a different certificate type and the sandboxed entitlements, plus removing the `cs.allow-unsigned-executable-memory` exemption (which Electron needs but the App Store forbids).

## When the certificate expires

Developer ID Application certificates are valid for 5 years. About a month before expiry:

1. Generate a fresh certificate (step 3).
2. Re-export as base64 `.p12` (step 4).
3. Update the `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` secrets.
4. Cut a new release to confirm the pipeline still works.

The notarisation app-specific password doesn't expire on its own, but if you change your Apple ID password you'll need to regenerate it and update `APPLE_APP_SPECIFIC_PASSWORD`.
