# Scope decisions — A grant replaced by the same Character is dropped, never revoked at SSO

_Recorded 2026-11-22. Narrows `20261018-231926-corp-tax-book-scheduled-sync.md` ("a new opt-in … whose token is revoked") and amends ADRs 0020 and 0025._

- **The server never revokes at SSO a token of the Character a grant now belongs to. It only drops that token from Firestore.** This covers:
  - a Feeder grant replaced by the same Character (Grant again on an own corp, or a Reconnect);
  - an Alerts Grant saved again;
  - a Corp Tax Book sync grant its holder opts into again;
  - a scheduled run whose rotated token a same-Character re-grant overtook (`refreshGrant`);
  - the new token of a refused Feeder grant save (`orphan`, `putBackGrant`, `unwindAccept`).
  - **Why.** Every grant and every device login share one EVE client ID. Revoking one of a Character's refresh tokens ends that Character's whole authorization of this app: the grant just stored, and every device's login for them.
  - **What happened.** A CEO pressed Grant again for three of their own corps. Those three CEOs, and only those three, came back marked "Log in again" on Characters. Connecting the same corps the first time (no revoke) had left every CEO's device login alive.
  - **Cost.** The dropped token stays live at SSO, but no one holds it once its encrypted copy is gone.
- **Revoking on removal, and on replacement by a different Character, is unchanged for now.** Under the same SSO behaviour, those revokes also end the earlier Character's device logins. That is a separate decision.
- **No repair of logins already lost.** A device login that one of these revokes ended needs "Log in again" once. A grant ended the same way stops reading at its next sync (`token-revoked`) and needs Grant again once more. With this decision in place, that second Grant again revokes nothing.
