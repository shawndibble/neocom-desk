# Scope decisions (round 17) — Skills pages rework

_Recorded 2026-09-01._

- **Trained page**: skill groups start collapsed, one header toggle each,
  plus an "Expand all" control; expand/collapse state does not persist across
  visits. Search filters the group tree in place — the Market Browser's
  pattern (hide non-matching branches, auto-expand matches, 3-char minimum) —
  rather than becoming a flat result list. Every skill row carries a
  hover/focus tooltip with the skill's description (EVE markup stripped, same
  treatment `ImplantChip` already gives implant descriptions); the same text
  also appears at the top of `SkillInspector` once a skill is selected.
- **Skill Plan editing moves to its own route** (`/skills/plans/:planId`),
  off the list page. "New plan" creates the record immediately (unchanged)
  and redirects to it. The list page keeps the **Current skill queue** panel
  (in-game data, character-wide, not plan-specific) plus plan CRUD with
  icon-only row actions (edit/duplicate/delete) and an in-app `Modal`
  replacing `window.confirm` on delete.
- **The editor page is a sidebar plus the plan** (supersedes round 18's "no
  plan-switcher sidebar, pinned toolbar above the list", and #158's list pane
  beside the editor). The sidebar carries the plan list and, below it, a
  single **Plan Tools** panel of three labelled sections: Actions
  (reorder/optimize/marker, the ones used while working the list),
  **Attributes** (the character's current attributes, then the what-if
  implants/booster lenses over them), and Import / Export. The main column
  carries only the plan summary strip and the entry list. Rationale: five
  peer panels said the controls mattered as much as the plan, cost five panel
  header strips of chrome to say it, and left the sidebar empty below a short
  plan list.
  - The **Attributes** section is where the editor route shows the
    character's attributes, rendered by the same `AttributeChips` +
    `DataAgeBadge` pair as the plan list's Attributes panel. They belong on
    this route because they are what every estimate on it is costed against,
    and they belong _inside_ the tools panel because a fourth peer panel is
    what this round removed — and below `lg` it would land as a second
    always-open block above the entry list. Costing a tap on a phone is the
    accepted price. Chips show the clone's _real_ implants and never
    re-render through the what-if lens sitting under them: "current" has to
    keep meaning current, and the lens's effect is visible in the plan's own
    numbers. General character stats (total SP, wallet) stay off this route —
    they explain nothing here.
  - Below `lg` the sidebar is not built at all: the tools move into the one
    column as a **collapsed disclosure** above the entry list, so the whole
    tool set costs one row rather than three panels, and the plan leads the
    page. This supersedes #224's icon-only, sideways-scrolling toolbar — a
    full-width labelled row is a bigger touch target and self-describing.
  - The entry list is capped against the live viewport and scrolls inside its
    own box. The summary strip is the one remaining `position: sticky`
    element, pinned at a plain `top-0` — the window can still scroll when the
    sidebar outgrows the viewport, and the plan's headline numbers should
    survive that. What retires #221/#229 is that there is no second sticky
    panel below it needing its rendered height, so no offset has to be
    measured or kept in sync.
  - "Optimize remaps" and "Optimize at markers" results render inline in the
    Actions section, under the button that produced them, rather than as
    extra panels at the bottom of the page. Still read-only findings to
    consult, not a decision to commit.
- **"Your entries" and "Computed queue" merge into one list**: one row per
  plan entry (not exploded per individual level), draggable, with priority,
  target level, and an icon-only remove button, plus per-level and cumulative
  training time. Prerequisite skills the user did not add directly still
  appear as their own dimmed rows, positioned where the schedule actually
  trains them. (Round 31 supersedes "non-interactive": those rows are
  draggable, and dragging one is a **Prereq Promotion**.)
- **An entry row names the level range it trains, and discloses those levels
  on request.** A "Caldari Carrier V" entry queues I–V as five scheduled
  steps, but the row showed one aggregated time while each prerequisite got a
  dimmed row _per level_ — so a user reported that the entry's own levels
  "did not get added". They had been. The row is now labelled with the range
  it actually trains ("I–V"; "IV–V" for a character already at III — read off
  the schedule, never off the target level), and a caret in front of the name
  reveals one line per level with that level's own time — its running total
  folding to a tooltip below `md` exactly as the row above it does. Those
  lines nest inside the row rather than becoming siblings of it: the
  no-explosion decision above is what keeps the list draggable and scannable,
  so this makes it honest instead of reversing it.
- The merged list's optional columns (attribute-pair badge, priority,
  per-level time, cumulative time) are individually toggleable via a
  "Columns" control — a device-local view preference (not synced, not
  per-plan; same category as the Market Browser's Location Mode), all on by
  default. Narrow screens fold each row to two lines and show cumulative time
  as a tooltip on the per-level time cell rather than its own column.
- A grouping toggle switches the list between the existing priority-band
  grouping and a new attribute-pair grouping. Visual only — drag-and-drop
  still crosses group boundaries freely, same as priority bands today.
- **"Suggest reorder"'s preview becomes a `Modal`** (accept/reject a proposed
  mutation to the plan); "Optimize remaps" and "Optimize at markers" results
  stay inline — read-only findings to consult, not a decision to commit.
- Export (to clipboard / to CSV) collapses into one expandable "Export"
  control instead of two always-visible buttons.
- **"Optimize remaps" only evaluates the plan's current entry order** — it
  does not reorder, by design (CONTEXT.md already rules that reorder never
  applies silently). Its "no remap improves this plan" result, and the button
  itself, get an explanatory tooltip pointing at "Suggest reorder" for plans
  that aren't yet attribute-grouped. No change to the optimizer's math.
- Tooltips (skill descriptions, icon-button labels) get long-press support on
  touch, added once to the shared `Tooltip` component so every existing
  usage benefits — CSS `:focus-within` alone is unreliable on touch (notably
  iOS Safari does not reliably focus a plain `<button>` on tap).
