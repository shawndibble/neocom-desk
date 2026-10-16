# Scope decisions — Settings has an Offline data panel

_Recorded 2026-10-16._

- **Settings → Offline data (`/settings/offline`, under "Data & device") shows what is really downloaded.** It reads Cache Storage (the `sde-data` entries by their versioned `?v=` URL, via the same helper the warm uses, and the dogma engine's pinned bucket), not a log of past downloads, so a cache the browser evicted reads as not downloaded. Files are shown grouped by pack ("Item info (64 files): 40 of 64 downloaded"), never one row per file.
- **"Download everything for offline" is the background warm with `force`, not a second downloader.** It ignores the cellular / Save-Data / slow-network gate (`lazyAssetWarmGate`) because the pilot asked, but still needs a connection (`NeedsConnection` offline) and a controlling service worker. Its failed count is what is still missing when it finishes, read back from the cache, with a Retry.
- **Persistent storage is asked for once, automatically, after the first Character is added, and never re-prompted.** `storagePersistAsked` in Dexie settings is written before the ask, so a crash or a hung prompt cannot cause a second one. The panel's "Protect this data" button is the only other path and is the pilot's own press. The panel hides the storage estimate where `navigator.storage.estimate()` is unsupported.
