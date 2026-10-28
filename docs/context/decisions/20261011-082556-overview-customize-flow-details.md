# Scope decisions — overview customize flow details

_Recorded 2026-10-11._

- **The Undo toast is persistent, not 8 seconds.** _Superseded by `20261027-195313-undo-toasts-expire-after-8-seconds.md`: it now expires after 8 s._ Remove, add, resize,
  duplicate, reset and a role replacing the layout each raise one `Toast` with
  Undo, and it stays until dismissed (close button, Escape, the next toast or a
  route change). The design record said 8 s, but the repo's `Toast` makes any
  toast carrying an action persistent on purpose (WCAG 2.2.1: a timer must not
  remove a control the pilot may be about to use). Cancel drops the toast, since
  its Undo would point at a layout older than the Customize snapshot.
- **Acknowledge is Dismiss for the danger type.** Acknowledging a danger Alert
  dismisses that type's feed entries (the synced `dismissedAt`), and Mark all
  read dismisses every non-danger entry. No new synced field: the panel and the
  Danger banner read the same dismissals, so they cannot disagree.
- **Snooze 1h is device-local.** A device-local setting maps an alert group to
  an until-time, offered only for types that can be snoozed (price alerts).
  Another device keeps showing the alert; that is the price of not syncing a
  timer.
- **Coming-soon kinds are listed, not addable.** Survey, Route safety, Hauling,
  Kills and Jump timers have no data source in the app yet (no standalone loader,
  or no ESI endpoint for jump fatigue). The Gallery shows them as "Coming soon"
  with no Add, and the Role chooser leaves them out of the layouts it builds, so
  a role never produces a widget that cannot draw. Each needs a follow-up ticket.
- **A first run waits for the first sync pull.** A second device holds no
  layout row until its first pull lands, and a choice made before then would be
  stamped now and overwrite the layout built on the first device. The Role
  chooser, and the migration of a returning pilot's old settings, wait until the
  settings store has hydrated, the first sync has completed (or has failed, the
  device is offline, or six seconds have passed), and Dexie holds no layout row.
  The settings API has no unstamped write, so waiting is the guard.
- **Adding from the phone Gallery closes the sheet.** The sheet covers the page,
  so the Undo toast and the new widget's outline would sit behind it; closing
  lets the pilot see what they added. The desktop drawer stays open to add
  several.
- **Phone Customize is a list, not the grid.** Reorder, remove and add with 44px
  targets; sizes, views and ranges are set on a larger screen, and it says so.
