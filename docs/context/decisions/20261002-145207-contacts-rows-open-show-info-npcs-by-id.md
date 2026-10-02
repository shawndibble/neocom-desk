# Scope decisions — Contacts rows open Show Info, NPCs by id block, zKillboard's scales quoted

_Recorded 2026-10-02._

- **Clicking a Contacts row opens Show Info; the row menu keeps its entry
  too.** This reverses round 49's "Show Info is a row action, not a second
  click target on the row" (`20260904-162201`) for Contacts. A contact list
  has nothing else for a row click to mean — there is no detail view of a
  contact apart from the person behind it — so leaving the row inert made the
  one thing a reader wants a two-step menu trip. Both tables (This character
  and All characters) do it. A faction row stays unclickable and is styled so,
  because no public faction endpoint feeds the modal; `onRowClick` is
  table-wide, so the row overrides the pointer cursor rather than dropping it.

- **Contacts' This character / All characters is the shared
  `CharacterFilterControl`, in the page header's right-hand corner with export
  and refresh.** It replaces the two tabs (`20260912-211914`'s across tab keeps
  its `/contacts/across` path, so links survive; the control maps
  `current`/`all` onto that path rather than adding a `chars` param). This
  departs from `20260908-192806`, which puts the filter in `meta` beside the
  title and keeps `actions` for verbs: on Contacts the age badge belongs right
  after the title, and the filter switches the whole page rather than one
  panel, so it sits with the page-level controls. Other pages are unchanged.

- **An NPC is told apart from a player by CCP's id blocks, not by employment
  history.** NPC characters (agents, NPC CEOs) are 3,000,000–3,999,999 and NPC
  corporations 1,000,000–1,999,999 (developers.eveonline.com, ID ranges); no
  player entity is ever issued an id in either. "No employment history" was
  the first idea, but it costs a request per contact on a list of hundreds and
  still guesses — a brand-new pilot has one corp too. The id test is free and
  exact. NPCs get an "NPC" tag, an "NPC agent" / "NPC corp" type, a filter
  chip of their own, and a slim Show Info card with no killboard or
  employment tab.

- **zKillboard's own named scales are quoted, ends and all.** The danger and
  gang ratios now show as two-ended meters labelled Snuggly↔Dangerous and
  Solo↔Gang on both the Character and Corporation tabs, so a reader can tell
  whether a pilot or corp hunts and whether alone or in a gang. Those words are
  zKillboard's labels for its own figures, attributed to it, not the app's
  judgment, so they sit within "conditions, never verdicts"
  (`20260912-172628`, `20260929-234357`). The app still adds no verdict of its
  own: "safe", "hostile", "threat" and "avoid" stay out of the copy, and the
  Pilot Lookup copy test keeps checking for them.
