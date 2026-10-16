# Scope decisions — Offline fitting share copies the permanent link; offline Save to EVE saves only My Fittings

_Recorded 2026-10-16._

- **Copy Share Link with no connection (or when the share store refuses) copies
  the permanent view link instead.** The short **Share Link** is a sync-server
  write, which hangs or fails offline. The fallback is the logged-out
  `/share/fitting?f=<code>` URL, not the editor's `/ships/fittings?f=` one: the
  code carries the whole Fitting and that page decodes it locally, needs no
  Character, and a visitor who has one is redirected into the editor on it. The
  notice says which link was copied and why. **Share to Community** is disabled
  offline, with the reason shown under the menu item, because a disabled menu
  item takes no hover for a tooltip.

- **Save to EVE needs a connection; the My Fittings copy does not.** The menu
  item is disabled offline with "Needs a connection." If the dialog is open
  when the connection drops, it says so and its button becomes "Save to My
  Fittings", which saves only the local copy (when "Also save to My Fittings"
  is ticked). A network failure before ESI heard the write reports "Couldn't
  reach EVE"; a timeout after the request went out is _unconfirmed_ ("may not
  have saved") because the Fitting may have landed. This rules out queueing an
  In-game Fitting write for later: ESI writes stay online-only.
