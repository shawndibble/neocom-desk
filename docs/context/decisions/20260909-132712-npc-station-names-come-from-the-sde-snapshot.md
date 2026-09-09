# Scope decisions — NPC station names come from the SDE snapshot, which also discriminates station from structure (issue #655)

_Recorded 2026-09-09 · issue #655._

- **NPC station names, systems and type ids are read from
  `public/data/market/stations.json`, not from `GET /universe/stations/{id}`.**
  The snapshot is the whole `staStations` table — every NPC station in the
  game, static between expansions — and until now only the Market surfaces read
  it while the Character surfaces paid one request per station for the same
  three fields. ESI stays as the fallback for two cases only: an id the
  snapshot predates (a station CCP added since the last `npm run sde:build`)
  and a snapshot that could not be read at all. This rules out treating the
  snapshot as authoritative-and-final; a stale snapshot must lose no name.

- **Snapshot membership is the station-vs-player-structure discriminator, not
  merely a cache.** A contract's `start_location_id`/`end_location_id` carries
  no `location_type`, so `contractLocationName.ts` used to probe the station
  endpoint and fall back to the structure one — a guaranteed 404 on every open
  of a contract at a player structure, against the same
  100-errors-per-minute budget issue #655 exists to protect. Because the table
  is complete, an id the snapshot has loaded and does not hold **is** a player
  structure, so the lookup goes straight to `/universe/structures/{id}`. This
  rules out the `UPWELL_STRUCTURE_ID_FLOOR` range heuristic
  `contractLocationName.ts`'s header had already rejected: the discriminator is
  the table, not a magic number.

- **`lookupNpcStation` answers with three values, not two.** "Loaded, and this
  id is not in it" (a structure) and "could not read the snapshot" (conclude
  nothing) are opposite conclusions, and collapsing them would send every NPC
  station to the structure endpoint on a first offline visit. The second case
  falls back to the pre-#655 probe order verbatim.

- **`stations.json` stays outside the install precache.** Moving it in would
  add ~540 KB to every install to serve surfaces that already degrade
  gracefully without it, and would reverse CONTEXT.md round 10's deliberate
  exclusion of the whole market catalogue. The consequence, stated plainly
  rather than glossed: **this does not make station names work offline.**
  Requests disappear when the app can reach its own origin; offline parity
  still comes from `esiCache`, exactly as before.

- **The fan-outs at `Assets.tsx`, `Clones.tsx` and `ownedStockDetection.ts`
  are left uncapped.** Every id they pass to `loadStationName` is already
  labelled `location_type: 'station'` by ESI, so those `Promise.all(...)` maps
  became snapshot lookups rather than requests. Capping a map lookup would
  slow the page down and spare ESI nothing. This rules out the
  `mapWithConcurrencyLimit` treatment items B/C apply elsewhere — for stations
  the right fix was removing the traffic, not pacing it.

- **`stationTypeID` is carried in the snapshot, and `loadStationSummary` falls
  back to ESI when it is absent.** `staStations.csv` has the column (verified
  against the dump: present and integral for all 5,210 rows), and it is the
  last field that kept the Build Location search calling the endpoint per
  station hit. It is optional on `NpcStationEntry` so a deployed snapshot built
  before this change is tolerated rather than read as `typeId: undefined`.
  Worth being honest about what the +72 KB buys: `buildLocationOptions` never
  reads a station's type id (`npcStation: true` short-circuits to the
  `npcStation` facility preset), so this removes a request, not a wrong
  facility choice.

- **`BpcContractModal` resolves its location through
  `loadContractLocationName` under the active Character** (item F). It called
  `loadStationName` with no structure fallback at all, so a public BPC contract
  sitting in a citadel never showed a location name and spent a 404 per open
  discovering it. BPC Search itself is not per-Character — it reads one shared
  snapshot — but `/universe/structures/{id}` is ACL-checked, so the modal now
  takes a `characterId`, which the panel already holds. A structure outside
  that Character's ACL still renders the id fallback: `null` means "don't
  know", never "has no name".
