# Scope decisions — Jump clone names are the pilot's own, stored locally and synced

_Recorded 2026-10-13._

- **A jump clone's name is one the pilot gives it here.** ESI stopped sending
  jump clone names in 2021 (esi/esi-issues#1305, still open): `name` is in the
  schema but never in the payload. So every clone read "Unnamed" (#3001),
  however the pilot had named it in game. A pencil beside each clone's heading
  on Clones names it in place, stored in the synced `sync.cloneNicknames`
  blob keyed by `jump_clone_id`. Every place that labels a clone reads it: the
  Clones cards, the verdict card, the CSV export, the Overview's Best clone
  widget and the Skills What-If implant picker. ESI's `name` is still read
  after the pilot's, in case CCP fixes the endpoint. This rules out importing
  names from anywhere else: the game exposes no other source.
- **An unnamed clone is headed by its place, not "Unnamed".** This reverses
  #3001's dimmed "Unnamed". With ESI sending no names, that label sat on every
  clone and read as a bug. The station or structure is what tells two clones
  apart until the pilot names them.
- **Accepted limitation:** it is unverified whether `jump_clone_id` stays the
  same after a pilot jumps into a clone and back out. If it changes, that
  clone's name drops back to its place and the pilot names it again. The
  stale entry costs a few bytes in the synced blob and is not pruned.
- **Accepted limitation:** the blob is last-write-wins as a whole, like
  `sync.skillCloneStates`. Two devices renaming different clones before a
  sync keep only one of the two names.
