# Scope decisions — Local list rows wash by Threat level

_Recorded 2026-10-08._

- **A Local list row is tinted by its Threat level, and a Dangerous badge is filled solid.** On a phone each row is a card, and the badge alone did not make a Dangerous pilot stand out while scrolling. Dangerous gets a red wash and a red left edge; Active gets a faint amber wash and edge; Low threat stays on the panel; Inactive is dimmed so a stale pilot recedes. This only adds colour to the levels of `20261008-181210`: no new level, no green, and no word "safe".
- **The pilot column is no longer pinned (`stickyStart`).** In the phone card the pinned cell painted a dark, narrow box around the name and hid the row's tint. The list's columns are short enough that a pinned name is not needed from the tablet width up.
- **Rejected: a danger percentage and a gang percentage on every card.** A mock-up showed them, with Snuggly and Mixed badges and a "Last active" line. The list shows kills by space instead, the verdict has no Snuggly level (it can never say a pilot is harmless), and the ratios stay in the pilot's modal (`20261008-143948`).
