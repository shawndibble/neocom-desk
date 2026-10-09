# Scope decisions — D-Scan worth is lowest hub sell; last scan is device-local (issue #3151)

_Recorded 2026-10-09 · issue #3151._

- **Worth is hulls only, priced at the lowest sell order at the app's market hub.** Fittings and cargo cannot be seen on a D-Scan, so the total is a floor; a hull with no price reads "price unavailable" and is left out of the total, never 0. Drones and structures are not hulls and are left out.
- **The last scan lives in Dexie `settings` under `dscan.lastScan`, one record, device-local.** No `sync.` prefix, so it never reaches Firestore. Only the live Pilot Lookup compares and saves; a Shared D-Scan shows worth but no diff and never overwrites the viewer's last scan. Pasting the identical scan again keeps the stored one, so the diff reads "same hulls".
