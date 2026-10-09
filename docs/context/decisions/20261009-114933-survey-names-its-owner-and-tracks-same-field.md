# Scope decisions — A Survey names its owner and tracks same-field updates

_Recorded 2026-10-09._

- **A Survey's payload carries `owner`, the starting Character's name.** This
  reverses "a Share Link never names who shared it" for Surveys only. A
  character name is public in EVE, and the page needs to tell "you started this"
  from "you opened someone else's". The name is a hint, not security: the rules
  don't check it, so anyone creating a survey could write any name, and the worst
  case is a wrong prompt. A survey stored before owners has none and is nobody's.
  The owner is whoever holds a Character of that name on the account; a rename
  ends it.
- **A pasted scan is an update when it is a subset of the latest scan.** Belts
  don't spawn rocks while a pilot mines (they refill at downtime), so an update
  shows only ores the latest scan had, none with more m³ in total, within 1% for
  rounding. A new ore, or an ore that grew, is a different field. Fewer rocks or
  less m³ is still an update. A rock pulled into range by flying closer reads as
  growth and so as different; accepted (Shawn, 2026-10-09).
- **An update always joins the Survey in view, for anyone.** A different scan
  from the owner asks: "Create new survey" (primary) or "Add to existing
  survey". From a pilot who is not the owner it starts a new survey at once.
- **A new survey needs a session, so a different scan on a share page asks for
  login.** The pasted text waits in local storage (short life, taken once) and
  the pilot lands on Mining › Survey after login, where the survey is created
  under their name. They carry on there rather than on a short URL. A pilot who
  is already signed in takes the same path without the login step.
- **History is a synced list of ids, not survey copies.** Each entry is
  `{id, addedAt}`, added when the pilot creates or opens a Survey in the app and
  dropped once its link is gone or past 7 days. Labels load from the share link
  when the dropdown opens, so Firebase gains no duplicate survey records.
