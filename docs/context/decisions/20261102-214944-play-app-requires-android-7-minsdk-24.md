# Scope decisions — play app requires android 7 (minSdk 24)

_Recorded 2026-11-02._

- **The Play Store (TWA) app's `minSdkVersion` is 24 (Android 7.0), up from 21.** Bubblewrap 1.27 bundles `androidbrowserhelper` 2.7.x, which declares minSdk 24, so a lower value fails the Gradle manifest merge. Pinning older Bubblewrap to keep Android 5–6 was rejected: it would target an older SDK than Play expects for updates. Play reported 1,776 catalog device models (about 10% of phone models) dropping out for version 4; those users keep the web app and the installed PWA.
- **`twa-manifest.json` shortcuts carry `chosenIconUrl`, never an `icons` array.** Bubblewrap's `ShortcutInfo` rejects the web-manifest shape, so `bubblewrap update` failed before building. `src/app/pwaShortcuts.test.ts` guards this and the minSdk.
