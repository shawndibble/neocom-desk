# Scope decisions — A grant replaced by the same Character is dropped, never revoked at SSO

_Recorded 2026-11-22._

- **A server grant replaced by a new one from the same Character is dropped from Firestore, never revoked at SSO.** This covers Grant again on a moon owner (own corp or Reconnect), an Alerts Grant saved again, and a Corp Tax Book sync grant opted into again by its holder.
  - **Why.** Every grant and every device login share one EVE client ID. Revoking one of a Character's refresh tokens ends that Character's whole authorization of this app: the token just stored, and every device's login for them.
  - **What happened.** A CEO pressed Grant again for three of their own corps. Those three CEOs, and only those three, came back marked "Log in again" on Characters. Connecting the same corps the first time (no revoke) had left every CEO's device login alive.
  - **Cost.** The old token is left live at SSO, but no one holds it once its encrypted copy is gone.
- **Revoking on removal, and on replacement by a different Character, is unchanged for now.** Under the same SSO behaviour, those revokes also end the earlier Character's device logins. That is a separate decision.
