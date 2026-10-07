# Share links

User goal: send someone a short URL to an appraisal or a fitting; the recipient (account or not) sees it read-only and can open it in the app.

| Route / piece | What | Where |
|---|---|---|
| `/share/:shareId` | Stored Share Link, 9-char id, 7 days | `src/routes/SharedLink.tsx` |
| `/share/fitting?f=<code>` | Permanent Fitting Share Code URL, no storage or expiry | `src/routes/FittingShared.tsx` |
| Create: Appraisal "Copy Share Link" | `createShareLink` | `src/features/market/AppraisalPanel.tsx:191` |
| Create: Fittings Export "Copy Share Link" / "Copy permanent link" | | `src/features/fittings/useFittingExport.ts:64` |
| Shared Appraisal screen | read-only table, totals, export | `src/features/market/AppraisalShareScreen.tsx` |
| Shared Fitting view | stats at all skills V, modules, Copy Fitting | `FittingShared.tsx FittingShareView` |
| Frame + "Open Neocom Desk" | | `src/features/share/ShareShell.tsx` |
| Store | Firestore `shares/{id}` | `src/features/share/shareStore.ts`, `firestore.rules:243` |

Both routes sit outside `RequireCharacter`/`ScopeGate` (`src/app/App.tsx:360-370`; `routeScopes.test.ts` asserts the exemption). The literal `/share/fitting` outranks `:shareId`.

See also: `entities-share.md` (another author; id format, 7-day TTL and in-memory reuse agree).

## Controls and behavior

**Creating**
- Appraisal icon button "Copy Share Link": snapshot = hub id, price percent, `generatedAt` (epoch s), items with per-unit prices at 100% (`buildAppraisalSnapshot`, max `MAX_SNAPSHOT_ITEMS` = 1000). Disabled with no Character, sync not configured, no rows, too many items, or while saving. Tooltips only for too-large, saving, failed, copied ("works for 7 days"). Clipboard refusal shows a "Share Link - works for 7 days" row with Copy (`manual`). Icon becomes a tick when copied.
- Fitting: encodes `fittingShareCode`; too large -> "Too large to share as a link."; no Character or sync not configured -> "Couldn't create the Share Link. Try again."; clipboard refusal after save -> "Share Link ready - choose Copy Share Link again to copy it." A reused link copies with no await so it stays inside the click gesture.

**Opening `/share/:shareId`** (`loadShare`)
- Bad id shape -> `not-found` with no Firestore read; `permission-denied` -> `not-found`; other error -> `failed`; missing or expired -> `not-found`; unknown type -> `unsupported`.
- A result for a previous id is ignored if the visitor follows another link.
- `appraisal`: `parseAppraisalSnapshot` -> `AppraisalShareScreen` (invalid state on parse failure). Never redirects, even signed in (the live tab re-prices; the sender's figures would vanish).
- `fitting`: `FittingShareView`; a visitor with a Character is `Navigate`d into the editor (`fittingEditLocation(code)`); malformed payload -> empty code -> invalid.
- `ShareShell` titled "Shared link": spinner; `goneTitle` "This link has expired"; `unsupportedTitle` "needs a newer Neocom Desk"; `failedTitle` "Couldn't load this link".

**ShareShell**: no nav; logo, `<h1>`, header `actions` (export menu), content, button "Open Neocom Desk" to `openInApp` or `/`. Signed out (count 0): `/login` plus `setLoginReturnTo(target.path)`; while the count loads it links straight but also stashes. Router `state` reaches only signed-in visitors.

**Shared Appraisal**: StatChips hub at {percent}%, Sell total (accent), Buy total, volume, Generated, Expires. Columns Quantity, Item (sticky), Buy each, Sell each (phone hidden), Buy total, Sell total, Volume (phone hidden); sortable; missing price = dash; each-prices exact, totals `IskAmount`. Export CSV/XLSX/copy (`surface: 'appraisal-shared'`) only with rows. Invalid: "This link isn't valid". "Open Neocom Desk" -> `/market/appraisal?hub=<id>&<price percent param>&share=<id>` (`sharedAppraisalOpenInApp`); `useSharedAppraisalSeed` reads `?share=` once, strips it (replace), re-reads the share and pastes its text into the tab; a dead share seeds nothing.

**Shared Fitting**: warning banner "Shown at every skill level V, with no clone"; fitting's own implants if any; viewer's own damage profile. Content: ship icon/name, `FittingRing`, `FittingStatsSections` (abyssal weather picker, retry), `FittingModuleList`. Buttons "Open in Neocom Desk" (to `/login`, stashing the editor path) and "Copy Fitting" (EFT; "Copied"/"Couldn't copy" for 2 s). "This link expires {date}" only via a stored link. Does not use `ShareShell`.

## Persistence and sync

- Firestore `shares` (`firebase/firestore/lite`): `type`, `payload`, `createdAt` (server), `expiresAt`. No uid or Character id. Nothing in Dexie. Reuse map is in memory only (`madeThisSession`).
- Writing needs a Firebase session (`ensureAnySession(characterId)`); reading needs none.

## Scopes and states

No ESI call, no scope. Creating requires `isSyncConfigured()`. States: loading spinner, expired/unknown, unsupported, failed, invalid payload, ready (see Controls).

## Rules and thresholds

- `SHARE_TYPES = ['appraisal','fitting']`, `SHARE_TTL_MS` 7 d. Rules: `get` iff `expiresAt > request.time`; `list` denied; `create` needs auth, id `^[0-9A-Za-z]{9}$`, exact keys, type in list, `payload` map, `createdAt == request.time`, `expiresAt` future and < 8 d; appraisal `items` list <= 1000; fitting `code` <= 20100 chars; update/delete denied. A Firestore TTL deletes docs (can lag ~1 day), so `loadShare` also checks expiry.
- Id: 9 base-62 chars, unbiased rejection sampling, ~53 bits, minted client-side (`engine/share/shareId.ts`); a collision is refused by the create-only rule.
- Reuse: same content returns the session's link unless < 24 h from expiry (`REUSE_MARGIN_MS`).

## Decisions

`docs/context/decisions/20261002-125432-stored-short-share-links-in-firestore.md`; earlier packed encoding `20260911-110045-appraisal-share-links-encode-base36-pairs-no-compression.md`; `20260908-164742-appraisal-prices-at-a-trade-hub-and-shares.md`. No dedicated ADR.

## Tests assert

- `SharedLink.test.tsx`: appraisal shows at its shared prices plus expiry; a signed-in visitor is never redirected from an appraisal; "Open" goes to the live Appraisal tab at the share's hub and percent, re-reading by id; a signed-out visitor goes through login first; expired or unknown reads as expired; a malformed stored appraisal is an invalid link, not a crash; a fitting redirects a signed-in visitor to the editor on its code; a malformed fitting payload is invalid for a signed-out visitor.
- `shareStore.test.ts`: `shareUrl` is `/share/<id>` on this origin; `saveShare` signs in, then creates with server `createdAt` and a week expiry; `loadShare` returns type and payload; an expired doc is gone; missing or rule-refused is gone; an impossible id never touches Firestore; unknown type = unsupported, network failure = failed; `createShareLink` stores under a fresh id and returns the short URL, same content gives the same link without a second doc, different content or type makes a new link, no reuse within a day of expiry, nothing remembered after a failed save.
- `FittingShared.test.tsx`: invalid message with no code or an undecodable one; read-only All V view with no session, and Copy Fitting writes EFT text (`[Rifter, Rifter]`); a signed-in visitor is redirected without computing stats; load-failed message when resolving throws; hull named above the Ring and cargo in the module list.

## Interview Q&A

1. Why stored short links? Big appraisals and fits exceed sane URLs (decision `20261002-125432`).
2. Who can read one? Anyone with the 9-char id; `get` only, no list, no uid (`firestore.rules:243-263`).
3. How is expiry enforced? Rules, client re-check, TTL policy (lags ~1 day).
4. How are duplicates avoided? In-session reuse by content unless < 24 h left (`shareStore.ts`).
5. Why copy inside the click? The client-minted id lets a reused link copy with no await; failures fall to a manual-copy row.
6. Appraisal vs fitting for a signed-in visitor? Appraisal shows frozen prices; a fitting opens in the editor under their pilot (CONTEXT.md Fitting Share Code).
7. Limits? 1000 items, 20100-char code, 7 d, create-only.
8. Signed-out "Open Neocom Desk"? `/login` with the target stashed.
9. Newer doc type? `unsupported`, "needs a newer Neocom Desk".
10. Why does creating need sync? It needs a Firebase session (`ensureAnySession`).

## Observed gaps

- Appraisal Share button greys out for no Character, no sync or empty list without a tooltip (`AppraisalPanel.tsx:586-600`).
- Only two share types; unknown ones show a generic message.
- Reuse is per session; a reload or another device mints a second doc for identical content.
- No revoke or list of own links.
- `FittingShareView` duplicates `ShareShell`'s frame; permanent `/share/fitting?f=` embeds the fitting in the URL (capped) and never expires.

## Improvement ideas

- Revoke and list own links; show expiry at creation; persist reuse across reloads; disabled-reason tooltips.
