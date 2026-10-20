# Scope decisions — Quiet time is per device, enforced on the server, skipped not queued (issue #4566)

_Recorded 2026-10-20 · issue #4566._

- **Quiet time is per device, not per Character.** It describes where a phone sleeps. The window (HH:MM start and end, the device's IANA zone captured when saved, an "attacks through" flag) is stored on the device's registration doc and travels with `registerDevice`; no new endpoint. Older clients that omit the field leave a stored window alone; `null` clears it.
- **The server enforces it, not the device.** iOS and other browsers revoke a push subscription that receives a push and shows nothing, so a service worker cannot swallow one. Both send paths (`pollEveNotifications`, `dispatchDueProjections`) skip a device inside its window.
- **Skipped means not pushed, not lost, and never replayed.** A quiet scheduled row is marked fired unsent; a quiet EVE notification still advances the high-water mark. The Alerts list gets both through the feed sync. Rules out a queue replayed at the end of the window.
- **Attacks through.** One checkbox, default off: the attack and loss ESI types that already default to a device pop-up are pushed during quiet time. The list is duplicated in `functions/src/quietHours.ts` because `functions/` cannot import from `src/`.
