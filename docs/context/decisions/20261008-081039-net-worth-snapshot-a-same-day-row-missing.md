# Scope decisions — Net Worth Snapshot: a same-day row missing a layer is upgraded once (issue #3005)

_Recorded 2026-10-08 · issue #3005._

- **Today's row is rewritten once when it lacks a layer.** A same-day Net Worth Snapshot that does not carry a layer added since it was written (an absent optional field, today `sellStock`) is re-read and rewritten in place, keeping the one-row-per-day id and bumping `updatedAt` for the sync's last-write-wins. A complete row is still final for the day. Past days are never back-filled or interpolated; they genuinely did not know.
