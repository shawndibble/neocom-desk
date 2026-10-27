# Scope decisions — stored short Share Links in Firestore

_Recorded 2026-10-02._

- **A Share Link is short and stored: `/share/<id>`, its content a doc in the
  top-level Firestore `shares` collection.** The old `/share/appraisal?d=` link
  packed `typeId:quantity` pairs into the URL. It was long, and it re-priced
  live, so the recipient never saw the numbers the sender saw.

- **"Share Link" now means only the short, expiring kind.** A Fitting's
  permanent `?f=` URL is a **Fitting Share Code**, not a Share Link. One term,
  one meaning: the code is the editor's own address bar and never expires,
  which is a different thing from a link that dies in a week.

- **A Shared Appraisal is frozen at its prices.** It is not a "quote": that
  word reads as a buyback commitment, and nothing commits the sender to
  anything. The share keeps the priced items
  (`engine/market/appraisalSnapshot.ts`). The page rebuilds the rows and totals
  from them with `buildAppraisal`. Only the engine's inputs are stored, never
  its derived figures, so the view can't drift from the live tab's arithmetic.
  Refine-then-sell is dropped from the snapshot: it depends on the sharer's
  skills, and the share view never showed it.

- **A Fitting's Share Link stores the Fitting Share Code verbatim, not
  frozen stats.** A fit has no prices to freeze, and its stats belong to
  whoever views it. Opened with nobody logged in, it shows the Fitting at
  every skill level V. A logged-in visitor is redirected into the editor on
  the code. The Fitting Export menu's "Copy Share Link" makes the short link;
  the long URL becomes "Copy permanent link".

- **A Shared Appraisal never redirects, even for a logged-in visitor.** Its
  point is the frozen prices, and a redirect into the live tab re-prices them
  before anyone has read them. "Open Neocom Desk" is the visitor's choice.

- **The "Unverified, user-generated link" banner is gone.** The content no
  longer arrives as URL text anyone can hand-edit. It is the doc the sender's
  Share button wrote, and the rules make it create-only.

- **One collection and one route for every share type.** The doc's `type`
  names the page, and `routes/SharedLink.tsx` switches on it. A page that
  becomes shareable adds a type, a payload validator and a case. It needs no
  new collection or route, and its only rules change is adding its type to the
  `type in [...]` list. Types: `appraisal`, `fitting`.

- **A fixed 7 days from creation, then gone.** Opening a link does not extend
  it, and the sender doesn't pick its lifetime. An appraisal's prices are stale
  within about a week anyway. The share page shows the expiry date, since the
  recipient never saw the "works for 7 days" note the sender got.
  - `expiresAt` is a Firestore `Timestamp` with a TTL policy on it
    (`firestore.indexes.json`).
  - TTL deletion lags up to a day, so the `get` rule and the client both
    refuse an expired doc as well.
  - An expired, missing or rules-refused share all read as "This link has
    expired".

- **Public `get` by id, no `list`, and no sender named.** Whoever was sent the
  link may have no account, so reads need no session. The 9-character base-62
  id (~53 bits) is the only thing keeping a share private to its holders, so
  `list` stays denied. Anyone holding the link reads all of the doc, so it
  carries no Character id or uid, and the page shows no "Shared by". Creating
  one needs any Firebase session; the Share button is inside the app, behind
  `RequireCharacter`. The create rule pins:
  - the id shape and the field set;
  - the type;
  - a server `createdAt`;
  - an `expiresAt` under eight days out (a day of clock skew);
  - the appraisal's 1,000-item cap.

  There is no update or delete. A sent share can't be rewritten, and a write
  to a taken id is refused rather than merged. There is no rate limit: a small,
  authenticated audience and the 7-day TTL bound the storage.

- **This widens ADR 0001's "Firebase is sync-only" line a second time.** ADR
  0013's public contract cache was the first. This is a public,
  non-Character collection the client writes. Nothing an EVE token touches
  goes into it.

- **Pressing Share again on the same thing reuses its link.** Links are keyed
  by content for the session. For an appraisal that is the hub, percent, items
  and prices; for a fit it is the Fitting Share Code. Same content, same link,
  even across a refresh that changed no price. Any change makes a new one. A
  link within a day of expiring is not reused. A reused link copies with no
  await, so the copy stays inside the click: that is also the second-press
  recovery when a first copy was refused.

- **The id is minted on the client, and the link is copied only once the doc
  is stored.** A failed save copies nothing. A save can outlast the click's
  user activation, as on Safari, and the copy is then refused. The panel then
  shows the link in a field with its own Copy button instead of losing it. The
  Fitting Export menu instead says to choose Copy Share Link again: the link is
  made by then, so that press copies it with no await.

- **"Open Neocom Desk" lands on the page the share came from, filled in.** For
  a Shared Appraisal that is
  `/market/appraisal?hub=<hub>&percent=<n>&share=<id>`. Market re-reads the
  share, pastes it as `name<TAB>quantity` lines, then strips `?share=` so a
  reload doesn't re-paste.
  - Hub and Price Percent are both per-visit URL overrides.
  - Opening someone's link never rewrites the visitor's own synced settings.
  - The link lives in the query, not router state, so it survives the login a
    visitor with no Character goes through first (`setLoginReturnTo`).

- **Legacy `/share/appraisal?d=` links are removed outright.** Nobody uses
  them. Their encoder, decoder, live re-pricing resolver and tests go with
  them. The narrow-width e2e spec is retargeted at `/share/<id>` with a mocked
  Firestore read. jsdom can't see the phone reflow it guards (#1113).

- **The Sell and Buy total chips read in full, shorthand after**
  (`2,800,260,000 ISK (2.8B)`). This holds on the live Appraisal tab and the
  Shared Appraisal page alike. Clicking a full figure copies it as grouped
  digits (`2,800,260,000`), with "Copied to clipboard" shown on the figure
  itself. That is the Hub Compare cards' existing pattern: people paste these
  into contracts. Per-row totals stay shorthand, so table columns don't
  overflow on a phone.

- **Deploying needs `firebase deploy --only firestore`** for the rules and the
  TTL index override. CI ships Pages only. Until that deploy runs, the rules
  refuse the Share button's write, and the button reports the failure.
