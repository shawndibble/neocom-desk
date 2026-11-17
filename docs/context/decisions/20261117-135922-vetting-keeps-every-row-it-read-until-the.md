# Scope decisions — vetting keeps every row it read until the review goes (issue #6341)

_Recorded 2026-11-17 · issue #6341._

- **A Vetting review keeps every row its read returned until the review is deleted (ADR 0035).** Uncapped, on the dates the Vetting Report is already deleted (30 days after the decision, 90 after it was shared if nobody decides, or when the pilot deletes it). Rules out deleting the rows on Send, and capping them at the checks' 5,000.
- **Officers only, the same gate as the flags; mail stays headers only; no token; scopes and the 30-day wallet window unchanged.** Rules out a stored subject or text, and a longer window without its own ADR.
- **One log line per review open, not one per source or page.** Paging a source adds nothing to the log. Rules out a line per source.
- **No export in this change.** A CSV can come later (all rows, never filtered). Rules out a download in #6341.
- **Every character shares every source; a source a character declined stays `missing`, as the checks already treat it.** There is no per-source sharing state in the data view. Rules out a "Shared by" column.
- **More than three characters use a `Select` with "All characters" first, not a segmented group.** Applies to the client.
