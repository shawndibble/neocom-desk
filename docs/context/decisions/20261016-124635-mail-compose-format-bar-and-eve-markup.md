# Scope decisions — mail compose, format bar and EVE markup

_Recorded 2026-10-16. Supersedes the "Reply and Forward, not a general compose"
and "inline compose, no modal or route" bullets of
`20260921-014556-mail-reply-and-forward.md`; its scope, CSPA and auto-quote
bullets still stand._

- **General compose is in.** Write a mail from scratch (**New Mail**) as well as
  Reply and Forward, through the one composer. Mobile is the main use: writing
  and answering mail away from the computer and the game.

- **Mobile compose is a full-pane takeover; wide screens keep it inline.** A
  floating Compose button over the list opens it (Gmail/Outlook pattern). Close
  top-left, Send top-right (superseded: see
  `20261016-150102-mail-composer-action-layout.md`). The format bar docks above the keyboard as one
  horizontally scrolling row (superseded: see
  `20261016-183802-mail-format-bar-sits-at-the-top-of.md`); colour and size open a sheet (swatches, size
  steps) rather than crowding the row.

- **Recipients: characters, corporations, alliances and joined mailing lists**,
  up to ESI's 50. Previously only characters could be added by hand.

- **One draft slot per character for New Mail**, holding the whole composer
  (recipients, subject, formatted body), reopened as left. Reply/Forward keep
  their per-mail drafts.

- **WYSIWYG with a Preview ⇄ Source switch; Source is EVE markup, not markdown.**
  Markdown cannot express colour or size, and a WYSIWYG-to-markdown round trip
  would lose them. EVE markup is what goes on the wire, so the round trip is
  lossless and the Source view is the honest view of the 10,000-character
  limit. A pasted markdown table converts to a table; nothing else is read as
  markdown.

- **Format bar: bold, italic, underline, size presets, colour swatches plus a
  custom hex (always opaque), http(s) link, table, clear formatting.** Left out
  for now: line alignment, uppercase, letterspacing, hints, EVE-internal link
  insertion. A format stays only if the test mail below confirms the game keeps
  it from a mail sent through ESI.

- **Tables are pipe rows on the wire.** EVE has no table markup. Sent as
  `| a | b |` rows they read as tidy text in the game; the reader detects pipe
  tables (as well as the existing space-aligned ones) and draws a real table.

- **The reader renders what the game shows**: bold, italic, underline, size,
  colour and links, from one shared parse/sanitize/serialize module used by
  both composer and reader. Show-info links to a character, corporation,
  alliance, item, skill or ship open the app's own modal; a system uses
  **Route Safety**. Region, station and structure links render as styled text
  until a Place Info modal ships (own ticket). `fitting:`, `contract:`,
  `killReport:`, `joinChannel:`, `localsvc:` render as styled, inert text with a
  tooltip.

- **Quotes: Reply keeps plain `> ` lines (formatting stripped); Forward carries
  the original with its formatting** under a header.

- **Default text colour is the game's own.** No wrapper tag on new mail, so the
  client's `#bfffffff` applies. Swatches and the editor canvas sit on a dark,
  EVE-like surface so a colour looks as it will in game, in light theme too.

- **Body limit is shown live** (markup included, 10,000) with the 50-recipient
  cap; Send is blocked past either.

- **In-game behaviour is unverified until one test mail.** The CCP EVE HTML
  guide documents the tags for rendering, but nothing documents whether a mail
  sent through ESI keeps them, or whether `<t>`/tabs survive. Build the safe
  subset; the pilot sends one test mail to themself and the result is recorded
  here. Anything dropped comes off the toolbar.
