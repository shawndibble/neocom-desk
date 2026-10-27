# Scope decisions — Communities mail invites (issue #3604)

_Recorded 2026-10-12 · issue #3604._

- **No new scope.** `esi-mail.send_mail.v1` is already in the base `SCOPES`
  set (see `20260921-014556-mail-reply-and-forward.md`), so most users hold
  it. A Character whose grant lacks it sees the control disabled with a
  request to grant the missing permission, through the normal grant flow. No
  consent screen of its own.
- **First from-scratch mail the app sends.** Mail Reply and Forward ruled out
  composing to anyone. This is a narrow exception: one fixed template, to one
  looked-up Character, only from a Community's invite panel. It is not a
  general compose.
- **Admin only.** Only the Community's admin sends, from the Character that
  holds the admin role. Delegating invites to roles is a later design if
  Communities gain roles.
- **Fixed template.** Community name, admin name and the invite link. No
  free-text note: a free note is a spam hole.
- **The link is the primary path, mail the fallback.** The panel leads with
  copy-the-link and sharing it yourself. Mail invite sits beneath it as a
  secondary option, so a pilot who can reach the invitee does so first.
- **Capped, and the cap is shown.** 20 mail invites per admin per day, and one
  mail per target Character per Community. The panel always shows how many
  sends remain today. This is the abuse limit; ESI's own mail limits are not
  relied on.
- **Name not found, nothing sent.** The existing name lookup
  (`src/features/travel/pilotLookup.ts`) resolves the name. No match shows a
  plain error and sends no mail.
- **Result is "Sent" only.** A time-stamped "Sent" row. No invited-versus-joined
  tracking: ESI gives no read receipt and it would need a new data store.
- **Regenerating the link kills mailed links.** Mail carries the same
  multi-use, no-expiry invite link; revoking or regenerating it voids every
  mail already sent. The UI says so.
