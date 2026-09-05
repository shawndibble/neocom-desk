# Scope decisions — Mail custom-label filter chips removed; mark-read/unread simplified to selection

_Recorded 2026-09-05._

- **The Custom Label filter chip row (CONTEXT.md's "Custom Label" glossary
  entry: "surfaced as a filter chip row beneath the tab strip in round 22")
  is removed from Mail.** The System Label Tabs strip (All/Inbox/Corp/
  Alliance/Sent) is unaffected — this only reverses round 22's own filter
  chips, not the tab strip round 18 established. `buildCustomLabelList`
  (`src/engine/mail.ts`) and its test suite are removed along with it: no
  remaining caller needs a character's own custom labels for anything.

- **The mark-read/unread `IconButton` in each mail row is removed in favor
  of text styling.** Unread mail renders bold + `text-text`; read mail
  renders regular weight + `text-text-dim`. Selecting a mail (opening it)
  now also marks it locally read — there is no manual mark-unread control
  anymore. `Icon.MarkRead`/`Icon.MarkUnread` (`src/components/ui/icons.tsx`)
  are removed since nothing else renders them.
