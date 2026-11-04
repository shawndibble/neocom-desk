# Scope decisions — LP store: low volume reads as amber sells/day on a phone, a tag beside the name elsewhere

_Recorded 2026-11-04._

- **On a phone the low-volume warning is the sells/day figure in amber on the card's meta line; from `sm` up it stays a "Low volume" tag beside the name.** Why: with the tag inline a long name lost a third of its line and wrapped to three; the number already says why the offer is flagged. Amber is the existing warning colour the BP and Low volume tags use. This supersedes "shows at every width" in the earlier low-volume decision. The tag comes back beside the name on a phone when the Columns picker hides sells/day or sells/day is the card's corner figure, so the warning never disappears.
- **The tags are inline text after the name, not flex items beside it**, with a no-break space before BP, so a wrapped name keeps its tags on its last line and the item column can shrink instead of widening the table.
- **The desktop list panel is 28rem from lg up** (was 20rem until xl): at 1024px four columns of real figures need about 416px and spilled out of a 318px panel.
