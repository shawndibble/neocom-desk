# Scope decisions — Local list rows wash by Threat level

_Recorded 2026-10-08._

- **A Local list row is tinted by its Threat level, and a Dangerous badge is filled solid.** On a phone each row is a card, and the badge alone did not make a Dangerous pilot stand out while scrolling. Dangerous gets a red wash and a red left edge; Active gets a faint amber wash and edge; Low threat and Inactive stay on the panel, since dimming the row would drop the corporation line below AA contrast. This only adds colour to the levels of `20261008-181210`: no new level, no green, and no word "safe".
- **The pilot column is no longer pinned (`stickyStart`).** In the phone card the pinned cell painted a dark, narrow box around the name and hid the row's tint. The list's columns are short enough that a pinned name is not needed from the tablet width up.
