# Scope decisions — Local list rows wash by Threat level

_Recorded 2026-10-08._

- **A Local list row is tinted by its Threat level, and a Dangerous badge is filled solid.** On a phone each row is a card, and the badge alone did not make a Dangerous pilot stand out while scrolling. Dangerous gets a red left edge, border and glow but no red background, which read as too heavy behind the text; Active gets a faint amber wash and edge; Low threat and Inactive stay on the panel, since dimming the row would drop the corporation line below AA contrast. This only adds colour to the levels of `20261008-181210`: no new level, no green, and no word "safe".
- **The pilot column is no longer pinned (`stickyStart`).** In the phone card the pinned cell painted a dark, narrow box around the name and hid the row's tint. The list's columns are short enough that a pinned name is not needed from the tablet width up.

- **Below `sm` a Local list pilot is a card, not a stacked table row.** The card (`PilotCard`) carries a portrait, name and corporation, the 30-day kill count as its one big number, the Threat badge with standing, and kills by space as a stat strip with each space's last kill. The big number is the kill count rather than a danger percentage because the danger ratio is only fetched for pilots who could be Dangerous (`20261008-181210`), so most cards would have had none. From `sm` up the same rows stay a table.

- **A card has no last-kill ages.** The stat strip counts kills per space and stops there; the table keeps its ages. A second badge names the space most recent kills were in ("Mostly nullsec"), and a bar fills toward the 10-kill Dangerous threshold, so the card reads without the dates.
