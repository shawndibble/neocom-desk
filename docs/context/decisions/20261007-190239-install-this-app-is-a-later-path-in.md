# Scope decisions — Install this app is a later path in Settings (issue #2860)

_Recorded 2026-10-07 · issue #2860._

- **Settings › Data & storage has an "Install this app" panel, and the FAQ and the iOS push "Install required" notice link to it.** The banner stays one-shot, but a dismissed banner must not be the end of installing: iPhone push needs the installed app. The panel ignores `installPrompt.seen`, is not mobile-only, shows the native button when `beforeinstallprompt` has fired (captured app-wide in `src/app/installApp.ts`), per-browser steps on iOS and Firefox for Android, and a generic "browser menu → Install app" pointer elsewhere (desktop, Android Chromium without the event). This narrows the mobile-only decision to the banner only.
