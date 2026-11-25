# Authenticator [![Build Status](https://travis-ci.com/Authenticator-Extension/Authenticator.svg?branch=dev)](https://travis-ci.com/Authenticator-Extension/Authenticator) [![Crowdin](https://d322cqt584bo4o.cloudfront.net/authenticator-firefox/localized.svg)](https://crowdin.com/project/authenticator-firefox) <img align="right" width="100" height="100" src="https://github.com/Authenticator-Extension/Authenticator/raw/dev/images/icon.svg">

> Authenticator generates 2-Step Verification codes in your browser.

## Available for Chrome, Firefox, Microsoft Edge and Safari

[<img src="https://raw.githubusercontent.com/wiki/Authenticator-Extension/Authenticator/readme-images/chrome-web-store.png" title="Chrome Web Store" width="170" height="48" />](https://chrome.google.com/webstore/detail/authenticator/bhghoamapcdpbohphigoooaddinpkbai) [<img src="https://raw.githubusercontent.com/wiki/Authenticator-Extension/Authenticator/readme-images/firefox-add-ons.png" title="Firefox Add-ons" width="170" height="48" />](https://addons.mozilla.org/en-US/firefox/addon/auth-helper?src=external-github) [<img src="https://raw.githubusercontent.com/wiki/Authenticator-Extension/Authenticator/readme-images/microsoft-store.png" title="Microsoft Store" height="48">](https://microsoftedge.microsoft.com/addons/detail/ocglkepbibnalbgmbachknglpdipeoio) [<img width="150" alt="Download on the App Store" src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"/>](https://apps.apple.com/us/app/authen/id1602945200?mt=12)

## Build Setup

``` bash
# install development dependencies
npm install
# compile
npm run [chrome, firefox, prod]
```

To reproduce a build:

``` bash
npm ci
npm run prod
```

To reproduce a build for Safari, please follow contribution guidance in [Authenticator-Extension/Authen](https://github.com/Authenticator-Extension/Authen#how-to-contribute)

## Development (Chrome)

``` bash
# install development dependencies
npm install
# compiles the Chrome extension to the `./test/chrome` directory
npm run dev:chrome
# load the unpacked extension from the `./test/chrome/ directory in Chrome
```

Note that Windows users should download a tool like [Git Bash](https://git-scm.com/download/win) or [Cygwin](http://cygwin.com/) to build.

## Per-account static password

Each account has its own **Set static password / Edit static password** action directly on the account card. New accounts start with an empty password. Existing accounts without a custom setting inherit the legacy global value once on upgrade (after unlocking encrypted accounts); explicit per-account values are preserved. The global setting is no longer shown or used when copying. Full JSON backup contains each account's static password and restores it together with the OTP secret. Standard OTP text and QR codes are for interoperability and do not carry this setting. Configure a main encryption password for encrypted storage and encrypted backups.

## Chrome releases

The Chrome extension package workflow builds and tests pull requests and feature branches, and publishes the ZIP to GitHub Releases after a successful build of the `release` branch. Each release uses the Chrome manifest version (for example, `chrome-v7.0.1`). Bump `manifests/manifest-chrome.json` before publishing a new version; previous release assets are not replaced by a different commit. Download the ZIP from Releases, unzip it, and use **Load unpacked** at `chrome://extensions` with Developer mode enabled. The original multi-browser release workflow is still available for manually created `v*` tags.

## Google Drive and stable Chrome identity

Since Chrome v7.0.3, this fork includes its own public Chrome OAuth client ID and a fixed extension ID: `aghhgbfijfbebmpcaogdadknmiadiffk`. No client secret is required for Chrome's native identity API. All builds use the same identity by default; the `CHROME_GOOGLE_CLIENT_ID` Actions variable can override the public client ID if needed, provided it is registered for the same extension ID.

**Important upgrade from v7.0.2 or earlier:** A fixed extension ID changes the identity of the previous unpacked-path build. Before installing v7.0.3, open the old extension, set an encryption password, and download a full encrypted JSON backup. Keep the old extension installed until the new one has successfully imported and verified all accounts and their static passwords. Do not replace the old installation in place.

For Google Drive backup, enable Google Drive API in the Google Cloud project and configure the OAuth consent screen. If the project is in testing mode, add the intended Google account as a test user. Open Backup > Google Drive > Sign in and approve access. Set a main encryption password before uploading; Drive uploads only encrypted account records. The extension uses the limited `drive.file` scope. Existing Drive backups can be downloaded from the Google Drive website and imported into Authenticator.

For cross-device Chrome Sync, install the same fixed-ID build on both devices, sign into the same Chrome account, and enable Browser Sync in Authenticator preferences. Keep an encrypted JSON backup independently of Chrome Sync.

### Restore from Google Drive (7.0.5)

Open Backup > Google Drive > History / restore. Select a snapshot, enter the backup encryption password, preview additions and duplicates, then confirm. Set and unlock a local main encryption password first; the source backup password and local password may differ. Existing records are preserved and duplicate UUIDs or matching account credentials are skipped. Every source record must decrypt and validate before importing. Standard OTP exports do not carry static passwords, but complete Drive snapshots do. Enable daily automatic backup separately; it checks hourly while Chrome is running, runs when due and unlocked, and never uploads plaintext. Auto backup is off by default. A failed backup is reported in the Drive page and retried at the next check. Google Drive remains a snapshot backup, not bidirectional real-time synchronization.
