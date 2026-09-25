# Scope decisions — Log out and Remove Character unregister this device's Scheduled Push (issue #1672)

_Recorded 2026-09-25 · issue #1672._

- **A device unregisters its own Scheduled Push when its roster changes.** Removing the last Character, or Logging out, deletes this device's FCM token (`deleteToken`) and cancels any pending rebuild; removing one of several re-uploads the remaining roster. The removed Character's stored Projection is untouched and other devices keep receiving. Refines the "nothing remote" note in `20260925-084119-settings-sections-rail-and-log-out-of-this.md`: that covers Editable Data, not this device's own push registration.
