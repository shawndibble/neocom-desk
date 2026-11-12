# Scope decisions — Vetting: what a corporation can set

_Recorded 2026-11-12._

- **Every setting has a default that keeps the behaviour of a corp that never opens
  Settings.** A settings document written before a setting existed reads as the
  default (`normalizeVettingSettings`), so nothing is migrated.
- **Welcome message and contact line** (600 and 200 characters, empty by default).
  The welcome shows on the apply page; the contact line shows on the status page
  once the report is shared.
- **Questions:** up to 8, each optional or required, answered before Send. A
  report keeps each answer with the question as it read then, so a later edit
  does not rewrite it. Applications only; a promotion review asks none.
- **Minimums:** character age, skill points, and characters declared (none, none
  and 1 by default). Age and skill points are met by any one declared character;
  a character that did not share Skills cannot meet the skill-point minimum. They
  are shown on the apply page and enforced on Send, because nothing can be checked
  before the read. Applications only.
- **Rejection wording:** "Rejected" by default, or "Not at this time". Showing the
  pilot the reason is off by default; when on, the pilot sees the note of each
  reviewer who said no, and the reviewer is told so before writing it.
- **Invite-only is off by default.** When on, the apply link works only with a live
  invite code. Any reviewer can make or revoke an invite link, with a label saying
  who it is for; a report shows the label it started from. Up to 50 invites.
- **Telling reviewers** about a new report is a server-pushed event, on by default
  for the corp, and reaches only the devices that chose it (ADR 0027). Reviewers
  are the Characters who opened the vetting page in the last 30 days, since the
  server holds no role list.
- **Telling the pilot** is an in-game mail the deciding reviewer sends from their
  own Character, like an SRP result mail. The corp setting only decides whether it
  is offered. The server cannot send mail.
- **Left for later:** required sources, sign-offs per role, adjustable thresholds
  and turning checks off.
