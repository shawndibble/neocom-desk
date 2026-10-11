# Scope decisions — survey info templates

_Recorded 2026-10-11._

- **A template is a name plus any of location, moon tax and notes.** A pilot
  surveying several moons, belts or ice fields on one day retyped the same
  details each time. Fields are optional per template (the Save dialog asks
  which to keep), so one template can carry just the tax and notes across
  moons. Applying changes only the fields a template holds.
- **Templates are synced, not shared.** They follow the pilot across devices
  (`sync.surveyInfoTemplates`, like the Survey list) because Payees already
  sync per character and the page is used on phone and desktop alike. They are
  never written to a Survey or its Share Link.
- **The tax is stored by payee name and rate, not Payee id.** A template must
  survive a Payee being deleted or recreated, and the Tax tab already matches a
  Survey's payee by name (`ensurePayee`).
- **Delete is immediate, with Undo.** A template is cheap to remake, so there
  is no confirm dialog; the Undo toast puts it back in its place.
- **Applying never asks.** It overwrites the held fields. "Edited" with
  "Update template" and "Save as new…" is the way back from a change, not a
  warning before it.
- **The empty page offers templates as chips.** Picking one is held until the
  first scan starts the Survey, then written into it. With none saved the empty
  page says where they come from.
- **Notes render as limited Markdown for readers.** The owner's box is plain
  text and labelled "(markdown supported)". Readers (non-owners, the public
  page) get bold, italic, strikethrough, lists, inline code and http(s) links;
  raw HTML stays text, headings and images flatten. A single newline stays a
  line break, as the plain-text notes had it. Anyone holding the link reads
  these, which is why the set is small.
