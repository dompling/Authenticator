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

Google Drive is disabled until a Chrome-extension OAuth client is configured. The upstream client ID does not belong to this fork.

1. In Google Cloud Console, enable Google Drive API and configure the OAuth consent screen. For a testing app, add the intended Google accounts as test users.
2. Create an OAuth client of type **Chrome Extension**, with item ID `aghhgbfijfbebmpcaogdadknmiadiffk`.
3. In this repository, open Settings > Secrets and variables > Actions > Variables. Set `CHROME_GOOGLE_CLIENT_ID` to your Chrome extension OAuth client ID. A client secret is not required for Chrome's native identity API. The packaging workflow automatically includes the stable public key and OAuth configuration.
4. Build a new version and load the resulting package. Open Backup > Google Drive and sign in. Set a main encryption password before uploading; Drive uploads only encrypted account records. Existing Drive files can be downloaded from the Google Drive website and imported into Authenticator.

To use only cross-device Chrome Sync, set the repository variable `CHROME_STABLE_ID` to `true`. Without either variable, the build retains its existing unpacked-path ID for in-place updates. Enabling the fixed ID changes the extension identity, so **export a full encrypted JSON backup first, keep the old extension installed, install the fixed-ID extension, and import/verify the backup before removing the old extension**. Changing configuration requires building a new version for Releases; workflow artifacts are also available for testing.
