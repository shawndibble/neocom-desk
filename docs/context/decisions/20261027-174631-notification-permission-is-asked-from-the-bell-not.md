# Scope decisions — Notification permission is asked from the bell, not a banner

_Recorded 2026-10-27._

- **The browser-permission explainer moves from a bottom banner into the bell's
  alerts panel.** It appears at the top of the panel the first time the bell is
  opened, with Enable and Not now side by side on their own line. Either one
  ends it: once ever per device, as before. A player who never opens the bell
  is never prompted. This supersedes the first-screen deferral (issue #1788):
  `firstScreen.ts` is gone, and `notifications` leaves the shared onboarding
  banner slot (`corp-grant` > `install` remain).
- **Ticking Settings' Device pop-ups is the other ask.** While permission is
  undecided the box reads unticked; ticking it makes the browser request and,
  on a grant, switches the channel on. A denial leaves it unticked and the
  blocked notice takes over. The separate "Turn on device notifications" row is
  removed, and asking from Settings also ends the bell explainer. Every other
  device-notification change stays in Settings > Notifications.
- **The "Alerts when closed" offer follows a grant inside the same block.**
  iOS Safari outside an installed PWA gets the "install first" copy with no
  Enable button.
- **The Install Prompt is unchanged:** it already waits for five page visits
  (20261013-082344).
