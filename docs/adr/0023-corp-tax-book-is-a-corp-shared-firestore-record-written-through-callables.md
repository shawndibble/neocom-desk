# 0023 — The Corp Tax Book is a corp-shared Firestore record, written only through callables

## Status

Accepted (2026-10-18)

## Context

A corporation that taxes moon mining needs one record every officer agrees
on: what each miner mined at the corp's refineries, at what rate, what they
were billed, what they paid, and what an officer dismissed and why. The
glossary's **API-Derived Data** says Character data from ESI is cached per
device and never synced, and nothing at corp level reaches Firebase today.
Kept per device, two officers would bill the same miner different amounts,
and a dismissal one officer made would be invisible to the next.

Three facts make the device cache insufficient on its own:

- ESI's observer ledger (`/corporation/{id}/mining/observers/{observer_id}`)
  keeps an undocumented window of history (the character ledger is 30 days;
  90 for the corp is claimed, unconfirmed), and
  `/corporation/{id}/mining/extractions` lists only current Extractions. The
  book is the only long-term record of either.
- Billing works with no app use on the miner's side (mail plus donation), so
  the reader of a miner's lines is often not the officer who synced them, and
  sometimes not in the corp at all (a guest).
- Reading the ledger needs the Accountant role, and roles change in game
  without telling us. A Firebase uid (`char:{id}`) proves who someone is, not
  what roles they hold today.

ADR 0001 keeps refresh tokens on the device; Firebase sees one short-lived
access token per sign-in (`mintFirebaseToken`). ADR 0010 kept EVE tokens off
the server entirely, and ADR 0020 then stored a narrow, opt-in Alerts Grant
and verifies access tokens in a function (`verifyEveToken.ts`). ADR 0018 made
the first exception to API-Derived Data (opted-in blueprints, gated by
Community membership). ADRs 0018 and 0021 route writes that rules cannot
police through callables.

## Decision

- **The Corp Tax Book lives in Firestore, keyed by corporation, shared by
  every officer.** It holds the book's settings (start date, trade hub, Ore
  Form, rates with effective-from dates, grace, minimum Statement, divisions),
  every **Observed Mining Entry**, **Extraction**, **Tax Payment**,
  dismissal, declaration and sent **Statement**, Miner groupings, and who did
  each. This is a second deliberate exception to the **API-Derived Data**
  rule, alongside ADR 0018's, not a change to the rule.
- **Officer access is verified by a Cloud Function from a short-lived access
  token.** The client sends the access token it already holds, never the
  refresh token, as it does for `mintFirebaseToken`. The function reads the
  Character's corporation and roles from ESI with that token, records officer
  access, and drops the token. Nothing is stored, so ADR 0001 holds and no
  grant like ADR 0020's is added.
  - Read access is cached for at most 10 minutes per check and lapses after
    24 hours without renewal.
  - Dismissals, write-offs, rebills and "not tax" marks re-check the role
    live on the call.
  - Roles: view needs CEO, Director, Accountant or Junior_Accountant. Edit
    needs CEO, Director or Accountant. Extraction timers also need
    Station_Manager, which ESI requires for
    `/corporation/{id}/mining/extractions`. Turning the book on needs a
    Director. The CEO can always reclaim the book.
- **Every write goes through a callable**, never a direct client write, and
  each appends to an immutable audit log, which the app shows as an activity
  feed. Observer rows are upserted monotonically, keyed by miner + ore + day +
  structure: quantity never goes down and a response older than the stored
  one is ignored.
- **Reads are keyed by verified character id.** Officers read the whole
  book. Anyone signed in with EVE SSO reads their own lines in any corp's
  book, including after leaving the corp. A book only knows characters that
  mined at its refineries; characters an account holds outside the corp are
  never revealed or linked unless the player adds them.
- **The verify link is an unguessable token** carried in each Statement mail.
  It resolves, without login, to a read-only view of that one Statement: its
  lines, its terms with dates, and the payments credited. Its one write, the
  miner's "Stop reminders" toggle, is a callable authorised by the same token
  and audited like every other write.
- **Sync stays client-driven.** Any officer's client syncs the observers,
  Extractions and wallet donations on visit. A server-side scheduled sync
  would need a stored grant and is a separate decision (follow-up #4068).

## Considered Options

- **Per-device book (rejected).** Matches API-Derived Data, but officers
  disagree on amounts, dismissals are invisible to each other, and history
  older than ESI's window is lost whenever the one officer who kept it
  changes device.
- **Rules-only access with a role claim the client asserts (rejected).** A
  client can claim any role; a demoted Accountant would keep editing the book
  until someone noticed.
- **Server-held refresh token per corp (rejected for v1).** Gives scheduled
  sync and verified roles at once, but takes a refresh token off the device
  (ADR 0001) for a feature that works without one. Revisited only as a CEO
  opt-in narrow grant, as ADR 0020 did for alerts.

## Consequences

- `docs/ARCHITECTURE.md`'s Firebase data gains corp-shared data, gated by
  verified corp role, beside per-character sync data, public caches and
  Community data. The glossary's **API-Derived Data** entry names this
  exception beside ADR 0018's.
- Mining amounts per character, and their corp at the time, are stored and
  readable by the corp's officers. Asset locations, wallets and other
  Character data are not.
- Every Firestore rule and callable for the book needs emulator tests: a
  mistake leaks one corp's ledger to another, or lets a demoted officer
  forgive debt.
- A function makes ESI calls with a caller's access token, so those calls
  count against the application's shared ESI error budget and send
  `X-Compatibility-Date` and `X-User-Agent` like every other ESI call.
- The book can only be as current as the last officer visit. The UI says so
  ("Last synced 3d ago by X") and shows unrecoverable gaps instead of hiding
  them.
- A guest's verify page is reachable by anyone holding the link. It shows no
  more than the mail it came in already said.
