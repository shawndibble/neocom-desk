# Scope decisions — Notifications Topics layout: Apply to all, topic state line, one opener per row (issue #4565)

_Recorded 2026-10-20 · issue #4565._

- **"Apply to all" sets every Character to the majority value, per channel.** A tie goes to on, so it fixes exactly the Characters marked as differing. It rules out copying the active Character's values, which would silently overwrite the majority.
- **The topic's phone line reads "Device {n} · Alerts {m} of {total}".** `n` and `m` count events with that channel on for at least one Character that can use the event; `total` is the topic's event count. Corp with no usable Character reads "Needs Corporation permission" instead, and its rows drop the per-event "None can use this" note.
- **The event name opens the per-Character view; the "All n alike" / "n differs" note is status text, not a second opener.** §6c restraint: one row, one opener. The note sits beside the toggles, so the "differs" signal stays visible without a second control.
- **Topic navigation lives in the `topic` URL param.** Desktop tabs and the phone drill-in share it; a phone drill pushes history so Back returns to the Topic list. A search ignores it and stacks every matching topic.
