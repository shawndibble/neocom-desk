# Scope decisions — A Survey pasted straight into the Survey page can be linked back to a Shared Pop

_Recorded 2026-11-26._

- **The Survey page offers the link when the pop's start link was not used.** A pilot who pastes a
  first scan into `/mining/survey` never carries the `pop=` start parameter, so the Survey
  never reached the pop (see the "started from a pop links back" decision). The owner's Survey
  info section now shows a one-line prompt above Additional information when a moon Survey has
  candidate Shared Pops. It reuses `linkSharedPopSurveyCallable`; no new function, rule or index.
- **Always a click, never automatic.** One strong match reads "Is this scan from X? Link / Not
  this one"; several candidates show a select and "Link" / "None of these". A link replaces what
  every viewer's Calendar shows, so the pilot confirms it.
- **Candidates are the pilot's own Shared Pops** that are shown, past Ready (the shared Ready
  time, even when the pop is shown at Auto-fracture), not Fully Mined, and carry no linked
  Survey (any `surveyId`, even one whose Share Link has expired: the officer re-links or a
  pilot starts a new Survey from the pop). A Survey location that is a solar system or the
  pop's own refinery filters by place; a manual name or an NPC station filters nothing, since
  the system of a station is not known here.
- **Ranking is the overlap of base ores.** The scan's ores and the pop's ore make-up are
  compared as sets of base ores (a Moon ore variant counts as its base, since a pop names only
  base ores), scored as shared over combined. A pop with no ore in common is dropped; one that
  shares no ore make-up stays, unscored, last. A strong match is exactly one candidate whose set
  equals the scan's; anything else is a pick.
- **The server refuses to overwrite from this prompt.** `linkSharedPopSurveyCallable` takes an
  optional `onlyIfUnlinked`; with it, a pop that already has a live link answers
  `failed-precondition` "already linked" and is left as it was. The prompt always sends it, so a
  pilot whose cached pop list is stale cannot replace a link another pilot just made. On that
  refusal the pops are re-read from the server (past the cache) and the prompt goes away. A
  start link, an officer's `linkSurvey` and the Calendar's "Start a new Survey" are unchanged:
  they still replace, newest wins.
- **Dismissal is per Survey and device-local.** "Not this one" and "None of these" are remembered
  in a local setting (`miningSurveyPopLinkDismissed`, capped at 50 Surveys), never synced and
  never stored on the Survey.
- **Owner and moon Surveys only, signed in only.** A visitor sees no prompt, nor does a Survey
  with no moon ore. With no Character holding a token there are no pops, so there is no prompt.
