# Scope decisions (round 20) — Install prompt & notifications

_Recorded 2026-09-01._

- **No true server push.** Doing so would mean sending EVE refresh tokens
  off-device or standing up a real polling backend, reversing ADR 0001.
  Out of scope for this work.
- Event-detection logic (the "did X change" diff per Notification Event)
  lives in `src/engine` as pure, TDD'd code shared by both pollers; only the
  scheduling/permission/orchestration shell is service-worker-only and not
  unit-testable the way the rest of the app is.
- Notification preferences are **device-local** (`useLocalSetting`
  precedent), not synced Editable Data — browser permission is inherently
  per-device, so syncing "what I want to hear about" across devices would be
  misleading when each device's actual permission grant is independent.
- Preferences scope: one master, app-wide, device-level kill switch gates
  both the real OS `Notification` permission and every per-Character toggle
  beneath it; below that, every Notification Event is independently
  toggleable per Character, on by default.
- Settings UI: per-character collapsible sections (Trained-skills precedent,
  issue #108), each with a select-all/none checkbox for that character's
  event toggles, plus a text search that filters event types in place across
  all sections (Market Browser/Trained-skills search pattern).
