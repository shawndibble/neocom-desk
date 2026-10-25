# Scope decisions — One persisted Firebase session per character (issue #5074)

_Recorded 2026-10-25 · issue #5074._

- **Each Character has its own named Firebase app (`char-<id>`) with its own Auth, Firestore, Functions and persisted session.** Nothing switches a shared session, so a Character mints a token only when its own session is missing or cannot refresh. Rules out the single default-app session that every character-switch re-minted.
- **The default app holds no session.** It serves Analytics and the mint callable (authenticated by access token). Callables that need a user (`callRouted`, Mutamarket) are built on the Character's own app.
- **Share and survey reads and anonymous scan writes use the default-app Firestore, with no session.** The rules already allow them without sign-in.
- **A session saved before this change (default app) is signed out on logout and when its Character is removed.** It is not migrated: the next use mints a fresh per-character session.
- **The two community sweeps run only in the visible leader tab** (the `sweep` election), like the background sync sweep.
- **`underFirebaseSession` stays for now.** It serialises community, corp-book and payout work globally; its original reason (a swapped session) is gone, so dropping it is a safe follow-up.
