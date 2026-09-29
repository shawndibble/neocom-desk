# Scope decisions — Projections are per device (issue #2240)

_Recorded 2026-09-28 · issue #2240._

- **A Projection belongs to the device that uploaded it, not to the
  Character.** This supersedes round 45's "A Projection is replaced wholesale,
  never merged"
  (`20260903-224842-server-push-and-the-notification-catalog.md`) for the
  cross-device case. Each row is built from device-local state: the master
  switch, the browser-channel gate, the per-event browser toggles, OS
  permission and the stored domain baselines. Only the Feed slice of
  preferences syncs. So one device's Projection says nothing about what
  another device wants. Under the old rule, a phone with "industry job
  complete" switched off deleted the desktop's rows for that event on every
  upload, and a row one device wanted was pushed to every device, including
  those that had switched it off.

- **A device's upload replaces only its own rows.** Each row carries its
  uploader's `deviceId` and is stored as `{deviceId}:{Occurrence Key}`.
  `registerDevice` deletes and rewrites only that device's unfired rows for
  each Character. It also deletes that device's unfired rows for a Character
  it no longer holds. Within one device, a Projection is still replaced
  wholesale and never merged, for the reasons round 45 gave.

- **Each row is pushed only to its own device.** The dispatcher reads the
  row's device registration by id. If the registration is gone (logged out,
  or the token was deleted after an UNREGISTERED send), the row is deleted
  there and then instead of waiting for the 7-day stale purge. If the
  registration no longer lists the row's Character, the row is deleted
  unsent. Two devices that project the same occurrence each get their own row
  and their own push.

- **What is given up: one device's upload no longer corrects another
  device's stale rows.** Before, any device opening re-uploaded the Character's
  whole window and so retracted whatever had drifted, including rows another
  device had written. Now a stale row from the phone keeps firing on the phone
  until the phone next opens. The prediction wording (see
  `20260907-114310-a-scheduled-push-is-a-prediction-and-the.md`) is what
  covers that window, just as it covers a device that is simply closed.

- **Legacy rows are swept lazily, with no migration.** A row written before
  this change has no `deviceId` and uses the bare Occurrence Key as its doc
  id. On a device's first per-device upload, each Character it holds has its
  legacy unfired rows deleted in the same batch that writes the new rows, so a
  dispatch tick never sees both. The registration doc's `perDeviceProjections`
  marker stops the sweep from running again. Until a row is swept, the
  dispatcher fans it out to every device holding its Character, exactly as
  before, so a device that was closed at deploy time loses no pushes.
  Stragglers age out through the existing 7-day stale purge.
