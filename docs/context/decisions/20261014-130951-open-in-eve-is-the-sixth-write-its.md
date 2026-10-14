# Scope decisions — Open in EVE is the sixth write, its own Permission

_Recorded 2026-10-14._

- **A new write scope, `esi-ui.open_window.v1`, joins the Base Grant as its
  own default-on Permission, Open in EVE.** It is the sixth write exception,
  after mail organizing, calendar RSVP, sending mail, Save to EVE and
  autopilot waypoints, and like them it is used only when the pilot presses
  a button. It changes nothing in the game: it opens an information window,
  a type's market window or a contract in the running client. A Permission of
  its own for the same reason as Autopilot waypoints
  (`20261003-175151`): a Character that signed in before it shows only this
  one as missing.

- **Open in EVE sits wherever Show info does.** The Show info modals
  (character, corporation, alliance, item, skill) carry an Open in EVE
  button, and every row, context and ⋮ menu that offers Show info for an
  item offers Open in EVE beside it. Item menus also offer the market
  window. A contract opens from its detail modal and its row menu; ESI
  refuses a contract the Character can't see in game, and the control says
  so rather than failing silently.

- **A Payee stores what it is: character, corporation or alliance.** The
  Payee already carried the `entityId` it pays (learned from a confirmed
  payment); it now also carries `entityKind`, set when the pilot picks the
  Payee from the name search, and synced with it, so Settle up never looks it
  up again. The information window needs only the id, so an older Payee
  with an `entityId` and no kind still opens in EVE; the kind is shown and
  searched on. A Payee name that matches nothing stays a free-text label,
  marked unverified.
