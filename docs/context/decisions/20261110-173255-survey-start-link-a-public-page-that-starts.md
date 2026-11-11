# Scope decisions — Survey start link: a public page that starts a Survey with no login

_Recorded 2026-11-10._

- **<Decision>.** <Why, and what it rules out.>

- **`/survey` is the public place to start a Survey and to build a start link.**
  One page: a form (location, moon tax payee and rate, notes), a link that always
  matches it, and the paste area. `/s/<id>` stays the short link of a stored Survey
  (`s` = share). A link's query pre-fills the form, so a recipient can adjust it
  before scanning. The Survey tab's own panel is unchanged, and its "Copy start
  link" builds `/survey?…` links from it.
- **Anyone can start a Survey, signed in or not.** The first valid scan creates it.
  `firestore.rules` now lets a `survey` share (only that type) be created with no
  session, with the payload's keys and sizes bounded. Signed-out starts have no
  owner and land on `/s/<id>`. A logged-in pilot starts it as their Character and
  lands on `/mining/survey` with it open. **Rules need deploying by hand** before
  an anonymous start works.
- **A start link is a template, not a shared Survey.** Each opener starts their own
  Survey; the Survey's `/s/<id>` link is what the fleet then shares. Joining a
  fixed Survey from one link would need client-chosen ids and a first-scan race.
- **The link's details ride in the share's own payload (`prefill`).** The location,
  tax and notes docs (`surveyTax`, `surveyInfo`) can also be created with no sign-in,
  so the device that started a survey can edit it; the rules cannot tell who started
  it, so that guard is the UI's. A prefill shows until a signed-in owner
  stores a newer tax or info doc, which wins as before.
- **Query parameters:** `place`, `placeId`, `payee`, `payeeId`, `rate` (0-100, needs
  a payee), `notes`. Every value is re-validated and capped on read.
- **IDs are named by ESI's public `POST /universe/names`, no login.** A system or NPC
  station `placeId` alone is enough; a structure needs `place` (its name needs a
  login). A `payeeId` (corporation, alliance or character) is looked up, and its
  in-game name replaces the typed one, so the payee cannot be mistyped. One ID per
  request, since ESI 404s a whole batch for one unknown ID. A bad ID warns and the
  typed name is used. The Survey still stores a payee by name only.
- **Logged out:** systems and NPC stations are searched from local data; structures
  and the saved-Payee suggestions need a Character. The payee name is not
  verified, and the form says so.
- **Help sits at the foot of `/survey` and the Survey tab,** with a "Finding IDs"
  part, instead of a page of its own.
- **Same trust as any Survey link:** whoever writes a link chooses the payee shown
  to those who open it, as a Survey's owner already does.
- **Survey details come first on `/survey`, and stay editable on the result page.**
  A pasted scan opens the normal result page: the public `/s/<id>` for a visitor
  with no account, the Survey tab for a logged-in pilot. On the public page the
  device that started the Survey gets the same details form (location, moon tax,
  notes) and stores them as they are set; everyone else gets the read-only panel.
- **"This device started it" is a local record, not a cookie.** `startedHere.ts`
  keeps the ids in browser storage for a week, as the app does for every other
  device-local preference. It is a UI guard, not a credential: the rules cannot
  see who started a Survey, as they could not for a logged-in owner.
- **`surveyInfo` and `surveyTax` creates no longer need a sign-in** (the same as a
  scan), because the visitor who started a Survey with no account sets its details
  afterwards. Anyone holding the link could therefore write details through the API,
  which was already true of any signed-in pilot (a login is free). `surveyIgnores`
  (removing a scan) and the owner handover still need a sign-in. **Rules need
  deploying by hand.**
- **Payee suggestions:** logged in with the search scope, ESI's own search; otherwise
  the exact-name match plus zKillboard's public autocomplete, because ESI has no public
  partial-name search. What is typed in the box goes to zKillboard then.
