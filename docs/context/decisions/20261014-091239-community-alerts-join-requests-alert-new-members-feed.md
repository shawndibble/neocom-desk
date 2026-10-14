# Scope decisions — Community alerts: join requests alert, new Members feed-only

_Recorded 2026-10-14._

- **A Community's admin gets two Notification Events: "Community join request" (bell and notification) and "Community member joined" (Feed only by default).** A request is waiting on the admin; a new Member needs nothing from them, so it earns a Feed row, not an interruption. Both are per Character, like every event, and fire only for Communities that Character administers. A Member the admin just approved does not alert twice: the join request alert already announced them.
- **They are foreground-poller alerts: they fire while the app is open, not as Web Push.** The Scheduled Push projection carries ESI-derived future times; a join request has none, and a server push would need Cloud Functions that CI does not deploy. Rules out an alert while the app is closed until a server-side push is built.
- **The poll never signs a Character in.** It reads only for a Character the Communities page has seen administer a Community, and only while the Firebase session is already that Character's. Minting a token per Character every five minutes would cost a function call each and swap the session out from under the sync sweep. Rules out alerts for an admin alt until that alt is the active Character.
- **The roster is refetched only when the Member count moves**, since it costs a document read per Member.
- **A Member who leaves and another who joins between two polls goes unseen**, because the roster is refetched only when the count moves. Accepted: the poll is five minutes and the Communities page always shows the true roster.
- **Alerts begin once the Communities page has been opened** on this device as the admin (after a transfer of admin, a fresh device or cleared site data).
