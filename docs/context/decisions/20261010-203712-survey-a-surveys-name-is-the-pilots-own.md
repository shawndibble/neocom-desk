# Scope decisions — Survey: a Survey's name is the pilot's own, kept in their recents (issue #3530)

_Recorded 2026-10-10 · issue #3530._

- **A Survey's name is personal: it lives on the pilot's recent-Surveys list
  (`sync.surveyHistory`), not on the Survey.** Several Surveys of the same ore
  read alike in the picker, and a name is only the pilot's own label for one.
  Kept off the Survey doc, nobody else sees it: not someone holding the
  `/s/<id>` link, not "Copy chat message", and it needs no Firestore rules
  change. It syncs with the list, so it follows the pilot to a second device,
  and it goes when the entry does (link expired, removed from the list).
- **Anyone with the Survey in their recents can name it, owner or not.** The
  pencil shows only on the Survey tab, for a Survey in that list; the public
  `/s/<id>` page never offers it. A name is trimmed and capped at 40
  characters; clearing it brings back "Mining Survey".
