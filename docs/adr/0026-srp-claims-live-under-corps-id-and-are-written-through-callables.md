# 0026 — SRP claims live under `corps/{id}` and are written only through callables

## Status

Accepted (2026-10-23). Builds on ADR 0023. Issue #4608.

## Context

A corporation's ship replacement program (SRP) needs one record every officer
agrees on: each **SRP Claim**, its verified killmail, the amount and who set it,
its state, and the corp's rules. ESI has no claim state and the game client has
no SRP tool. The record is app-owned, so it cannot be a per-device cache
(**API-Derived Data**), the same reasoning as ADR 0023.

Unlike the Corp Tax Book, the people who write most of the data are not
officers. Any pilot in the corp files a claim. That adds a second kind of
caller to a corp-shared record: a member who holds no Corp Role and has granted
no corp scopes.

Three facts shape the design:

- A Firebase uid (`char:{id}`) proves who someone is, not which corporation
  they are in today, and not what roles they hold.
- A killmail's victim and corporation can be read from public ESI with no
  login. That is enough to check a claim's filer against the killmail.
- Dev and production share one Firebase project, so every change stays additive
  and backward-compatible.

## Decision

- **SRP lives in Firestore under `corps/{corporationId}/srp`**, written only
  through callables, each appending to an immutable audit log shown as an
  activity feed. A `corps/{id}` umbrella is the home for corp-shared data, so
  officers and settings are managed in one place. The Corp Tax Book stays at
  `corpTaxBooks/{id}` until a separate ticket moves it (copy first, keep the old
  reads working while both exist).
- **Two caller checks, both from a short-lived access token** the client already
  holds. The function reads the Character's corporation (public affiliation) and,
  for officer calls, roles from ESI, then drops the token. No refresh token
  reaches Firebase, so ADR 0001 holds.
  - **Member filing** needs only that the Character is in the corporation, now
    and at the time of the loss.
  - **Officer calls** follow ADR 0023's pattern: approve, reject, override and
    mark paid need Director or Accountant, re-checked live on the call. Settings
    need a Director. The CEO can always reclaim.
- **The server verifies the killmail.** The callable fetches it from ESI and
  accepts the claim only when the victim is the signed-in Character, the victim's
  corporation at the time is this corp, the loss is within the claim window, and
  no claim exists for that killmail. Hull, system and time come from the
  killmail, never from the client.
- **The amount is worked out on the server** by the chain in the scope decision
  (Hull Rule, killmail value, Appraisal, officer-typed) and stored with the basis
  it used. An officer override stores the new amount, the old one and a reason.
- **Reads are keyed by verified character id.** A pilot reads only their own
  claims. Officers read all of the corp's. Other members read none.
- **Retention.** A scheduled sweep deletes Paid and Rejected claims one year
  after they close and keeps a one-line audit record.
- **Corp scopes and capability.** The officer side adds a corp capability, added
  to `ADDITIVE_CORP_CAPABILITIES` and `CorpCapabilities` so pilots who already
  granted the corp group are not demoted to `roles-without-grant`. The member
  side needs no corp scope. The optional lost-ships list needs
  `esi-killmails.read_killmails.v1`, an opt-in grant requested on the SRP page.

## Considered Options

- **Put SRP inside `corpTaxBooks/{id}` (rejected).** It would force every SRP
  corp to enable mining tax, and the book's officer-only access model does not
  fit member filing.
- **A new top-level `corpSrp/{id}` (rejected).** Simpler for now, but it adds a
  second per-feature top-level collection and a second officer list to manage.
  The `corps/{id}` umbrella keeps corp data together.
- **A client-asserted corporation and killmail (rejected).** A client can claim
  any corporation or any killmail. Verification has to happen in the function.
- **Officers enter claims on the members' behalf (rejected).** It removes the
  reason for the feature: the member side is what the game client lacks.

## Consequences

- `docs/ARCHITECTURE.md`'s Firebase data gains a third kind of corp-shared data
  and the first one members write. The glossary's **API-Derived Data** entry
  already names the corp exceptions; this adds to them.
- Every rule and callable needs emulator tests. A mistake lets a pilot read
  another corp's claims, file for a corporation they are not in, or lets a
  demoted officer approve.
- Function ESI calls (killmail, affiliation, roles) count against the shared ESI
  error budget and send `X-Compatibility-Date` and `X-User-Agent`.
- Killmail value comes from zKillboard, a third party. A call fails soft to the
  Appraisal step and then to officer entry, so an outage never blocks filing.
  Calls send a descriptive User-Agent and respect its rate limits.
- Paid means an officer clicked it. ESI cannot confirm a transfer, so the app
  records a decision, not a payment.
- Result mail is sent from the approving officer's client and can fail. The
  in-app claim state is the record.
- An officer-less corp cannot use SRP. A Director must turn it on first.
