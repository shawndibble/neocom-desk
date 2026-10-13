# Scope decisions — Mail reading pane scrolls with the page, not on its own

_Recorded 2026-10-12._

- **The reading pane no longer has its own vertical scroller.** It grows with
  the message and the page scrolls; only the message list keeps an internal
  scroll. Supersedes the "reading pane gets its own independent scroll" line
  in [mail page rebuild](20260901-172427-mail-page-rebuild.md) (round 18). A
  second scrollbar inside the page was the complaint, and a long mail
  stretching the page is the accepted cost.
- **The pane fits the viewport width; a too-wide body scrolls sideways inside
  the message body only.** The header rows (from, to, date) wrap and never
  scroll. Hand-spaced tables scroll within their own block.
