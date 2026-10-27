# Scope decisions — Clone training verdict counts attribute implants only and compares against jump-when-allowed (issue #3003)

_Recorded 2026-10-08 · issue #3003._

- **The Clones tab's training verdict counts attribute implants only, and compares staying against jumping when the cooldown allows.** Only the five attribute implants change training speed, so skill-hardwiring, ship and other implants are ignored: two clones that differ only in those read as equal. The comparison is never against an instant jump the pilot cannot make: under a cooldown the alternative is stay-then-switch (`stayThenSwitch` in `cloneTrainingTimes`), and a saving under 60 seconds reads as Stay put. The verdict reads the active queue (not a plan); an empty or paused queue, a missing implants grant, an unreadable attribute sheet or an unknown route to the best clone each show one line and no verdict, never a guess. The sort choice is a per-device local setting (`clonesSort`), not URL state.
