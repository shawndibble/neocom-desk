# Scope decisions (round 41) — corp assets are registered, and Assets gets no switch

_Recorded 2026-09-03._

- **The corp assets endpoint was an omission, and it is now registered.**
  `/corporations/{corporation_id}/assets` and
  `esi-assets.read_corporation_assets.v1` join the `corp` group, and
  `canReadAssets` joins `engine/corpRoles.ts`. Round 38 recorded that Assets was
  dropped from the Personal / Corporation switch because there was nothing to
  gate on or read; that half is fixed regardless of what the page does.
- **Its role is `Director`, and only `Director`.** Verified against
  `x-required-roles` on https://esi.evetech.net/meta/openapi.json rather than
  taken from the issue's prose — the same check that caught `Structure_manager`
  in round 39. So `canReadAssets` sits beside `canReadMembers` with an empty
  role list, satisfied by the Director clause alone: the in-game
  Hangar_Take/Hangar_Query roles open a division in the client and open nothing
  in ESI.
- **`/assets` gets no Personal / Corporation switch. The corp asset list does
  not fit the page, and this is the answer round 38 left open.** Three facts
  decide it, none of them a matter of taste:
  - `AssetTreeStation` and `AssetTreeNode` have **no level between a station and
    a container**. The division lives in `location_flag` (`CorpSAG1`..`7`), and
    the only `location_flag` grouping `engine/assetTree.ts` performs is
    `bayKindFor`, which returns null for every one of them. Whether ESI reports
    an office's contents as `location_type: 'item'` or `'other'` changes
    nothing: as `'item'` they nest flat under an Office container, as `'other'`
    they become a pseudo-station keyed on the office id — all seven divisions
    unlabelled either way. Expressing division means a new node kind in a pure
    engine shared with the personal view and with `isShipBayFlag`'s industry
    owned-stock consumer.
  - `engine/assetPath.ts` **keys every node by `item_id`** (`i:<id>`). A division
    has no item id, so it cannot be addressed at all in the URL scheme the
    page's whole navigation model is built on.
  - **Owner is device-local component state; browse position is URL state.**
    `useCorpOwner` starts at `personal` on every mount (round 38), so a corp
    deep link is unreachable, and flipping the switch either strands the URL
    against a tree that cannot answer it or forfeits the back-button drill-down
    `assetPath.ts` exists to provide. Wallet and Industry hold no URL state —
    that is precisely why the switch was exact there and is not here.
- **Corp assets want their own surface under `/corp`, division-first.** Seven
  hangars across many structures is a different question from "where is my
  stuff", and the answer is a division-and-location list rather than a
  station-and-container tree. `features/corp/assets.ts` is the read it will use;
  it is registered, cached under `corpCacheKey`, and unread for now. Filed as
  #330.
- **Growing the `corp` group after users have granted it costs them a re-grant,
  and there is no prompt to tell them.** This is the first addition since round
  37 shipped the group, and it is a property of that design rather than of this
  endpoint: `beginEveLogin` requests the whole group, so a Character who granted
  seven scopes is missing the eighth, `missingCorpScopes` reports it, and
  `useCorpAccess` moves them from `ready` to `roles-without-grant` — which hides
  every corp surface. The grant prompt is offered once per Character per device
  and will not re-offer, so the only way back is the Settings Corp access row.
  Claiming the scope in `corpScopes.ts` anyway is the honest choice: that
  module's entire job is to say which scopes a capability needs, and an empty
  entry would be a lie in the one place nobody could catch it. The missing
  re-offer is filed as #331.
