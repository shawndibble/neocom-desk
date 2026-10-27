# Scope decisions — First login with one character goes to Overview (issue #1771)

_Recorded 2026-09-25 · issue #1771._

- **`/callback` lands a genuinely first-ever login on `/overview`.** When the
  roster held zero Characters before the login (so it holds exactly one now),
  `Callback` navigates to `/overview` instead of `/characters`; a pending
  `takeLoginReturnTo()` target still wins, and adding an alt to an existing
  roster still lands on `/characters`. This reverses part of decision
  `20260907-084400` ("`/callback` is unchanged") for that one case: its reason
  — picking between the new Character and the others — does not apply to a list
  of one.
