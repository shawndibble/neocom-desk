# Scope decisions — One Auto Assignment at a time (issue #4684)

_Recorded 2026-10-26 · issue #4684._

- **Only one Survey connection (Auto Assignment) runs at a time, across the whole account.** Assign Taxes on a Survey stops whichever was running, on any Character, at once (`startSurveyConnection`). A pilot moves from moon to moon; two running together only ever claimed the same ore and left it unassigned. Rules out per-Character connections for alts mining different moons at once: they assign by hand, or one at a time.
- **Undo on Assign Taxes restores the one it replaced.** Undo puts things back as they were before the click, not just removes the new one.
- **A Survey left open never brings a stopped connection back.** Its follow-up saves (moving ETA, location, ore) update only a connection still in the list (`refreshSurveyConnection`).
- **The overlap warning is gone.** With one connection there is nothing to clash with. A list synced from an older device can still hold two until they expire; the planner still leaves ore both claim unassigned.
- **The Tax tab shows it as one slim accent bar**, "Auto Assignment" then Payee at rate · system · until · (Character, with several tracked), then Stop, like the attention strip, in accent because it is something running, not something wrong. The Survey's Moon tax row always ends with the Mining Tax tab link; Stop takes the place of Assign Taxes left of it while connected.
- **Supersedes 20261021-184224** where it treats two live connections claiming the same ore as a normal case (now only a leftover from an older device), keeps "a handful" of records (now one), and has Undo remove the connection (it now restores the one it replaced, and only while its own is still running).
- **Writes read the stored list from Dexie, not the in-memory store**, which another tab's write reaches only on the next sync, so a tab still showing a replaced connection cannot write it back. Two devices that each start one before syncing: the last write wins.
