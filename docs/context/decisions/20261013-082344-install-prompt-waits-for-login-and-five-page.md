# Scope decisions — Install Prompt waits for login and five page visits

_Recorded 2026-10-13._

- **The Install Prompt mounts in `Layout`, behind `RequireCharacter`.** It
  used to mount in `App`, so on a phone it showed on `/login`, the
  `/callback` spinner and public share pages — before the player had used
  anything. Because it is once-ever per device, a dismissal there spent it
  for good. This supersedes the "`InstallPrompt` is mounted in `App`" premise
  in 20260915-174844; the shared banner slot stays as it is.
- **It then waits for five page visits.** A visit is a pathname change
  inside the signed-in shell (a page tab is its own pathname); the landing
  screen is not one, and neither is a `replace` navigation — those are
  redirects (bare page path → default tab), so one tap counts once. The count is device-local (`installPrompt.pageVisits`,
  like `installPrompt.seen`), persists across sessions, and stops at five.
  Asking to install before the player has clicked around is asking too
  early.
- **The native `beforeinstallprompt` event is read from the boot-time
  `useInstallApp` store.** Chromium fires it early, often while `/login` is
  still up, so a listener that only attaches when `Layout` mounts would miss
  it.
