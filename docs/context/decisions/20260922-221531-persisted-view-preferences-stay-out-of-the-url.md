# Scope decisions — persisted view preferences stay out of the URL (issue #1299)

_Recorded 2026-09-22 · issue #1299._

- **The URL holds short-lived view state only; a stored preference is never mirrored into it.** A value saved long-term — a device-local setting (`useLocalSetting`) or a synced one (`sync.defaultCharacterFilter`) — stays a _default_. A query parameter overrides it for that view (URL wins; absent → the stored default), and nothing read from the URL is ever written back to storage. Rules out a filter that silently rewrites the reader's saved default because they opened someone's link, and a URL that grows a parameter for every preference just to restate what the device already remembers. See ADR 0015.
