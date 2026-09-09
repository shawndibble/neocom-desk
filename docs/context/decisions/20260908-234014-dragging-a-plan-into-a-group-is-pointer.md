# Scope decisions — Dragging a plan into a group is pointer-only (issue #627)

_Recorded 2026-09-08 · issue #627._

- **The drag handle is pointer-only: `aria-hidden`, out of the tab order, and
  no `KeyboardSensor`.** `EntryList.tsx`'s handle is focusable and keyboard-
  draggable because it sits in a `SortableContext`, where
  `sortableKeyboardCoordinates` walks the sort order one row at a time. This
  list has no sort order to walk — `BuildPlanRecord` has no ordinal — so a
  `KeyboardSensor` here would step a flat 25px per arrow press and announce
  raw droppable ids. The pointer alternative WCAG 2.5.7 asks for is the
  per-row "Move to group" menu shipped in #626, which reaches every
  destination the handle does. This rules out keyboard dragging as a
  follow-up: the answer is to keep the menu good, not to add a sensor.

- **No group reordering, and no plan ordering.** Group headers became drop
  targets, not sortables. `BuildGroup.order` exists and invites it, but
  ordering plans would need a new field on `BuildPlanRecord` plus a sync
  story, which is its own ticket.

- **No auto-expand-on-hover over a collapsed group.** A collapsed header is
  itself the drop target, and `Industry.tsx`'s `handleMovePlan` already
  expands the group after the move — so hovering to open it would only add a
  mid-drag reflow to no end.

- **Dragging _out_ of a group is only what falls out of rows being drop
  targets.** Dropping on an ungrouped row clears `buildGroupId`; there is no
  dedicated "remove from group" drop zone, so a list with every plan grouped
  has no drag-out target at all. The menu's "No group" covers that case, and a
  zone that appears mid-drag would reflow the list under the pointer.
