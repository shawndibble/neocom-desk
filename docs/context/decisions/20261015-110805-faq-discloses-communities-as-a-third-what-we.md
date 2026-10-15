# Scope decisions — FAQ discloses Communities as a third What-we-store group

_Recorded 2026-10-15._

- **Communities are a third group in the FAQ's "what we store", beside synced and device-only.** Community data (membership, shared blueprints, Fittings, Skill Plans, Requests, Pledges) lives in separate Firestore collections that other Members read, so it cannot honestly sit under "syncs between your devices" or "stays on this device". It is typed apart (`COMMUNITY_COLLECTION_FAQ_ITEM` in `features/faq/whatWeStore.ts`) and a test checks every collection in `firestore.rules`' Community block against it.
- **The FAQ intro no longer says EVE data "stays on this device" without exception.** It names the exceptions: alerts you have seen, push and Alerts when closed if turned on, and what you share with a Community. Rules out an unqualified "never uploaded".
- **The FAQ says Delete all data does not leave a Community.** It only purges `characters/{uid}`; leaving is what deletes Community data at once, and the 90-day idle purge removes the rest (`purgeCharacterCommunities`). Rules out a "Delete all data deletes everything" claim.
- **Every question in the FAQ has a stable anchor** (`/help/faq#<id>`) that opens and scrolls to it, so they are available for deep links. The landing page cannot link into `/help` (it sits behind login), so its FAQ links `/privacy.html` instead.
