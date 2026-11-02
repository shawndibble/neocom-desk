# Scope decisions — Accelerator expiring alert

_Recorded 2026-11-01._

- **`acceleratorExpiring` fires once, one lead time before a typed-in accelerator's expiry.** ESI never says an accelerator is running, so the pilot's own answer (`characterAccelerators`) is the only source. A Character with none (a detection-only guess) or an already-expired one fires nothing. Lead times are 12/6/3/2/1 hours (all inside the 72-hour Projection Horizon), default 1 hour, stored as `acceleratorExpiringLeadHours`.
- **Default on, feed and push, opt-out per Character like every event; no ESI scope.** It reads local data only (as `priceAlertTriggered` does), so no grant gates it. Group Skills, severity warning, opens `/characters`.
- **It is a Scheduled Push, worded with a hedge.** The browser builds the Projection row at `expiresAt - lead`; the server only dispatches rows, so nothing in `functions/` changes. The pilot can swap a fresh accelerator in with the app closed, so the wording is "should run out in about N hours", never an assertion.
- **Occurrence Key is `(characterId, event, expiresAt, lead)`.** A replaced accelerator (new expiry) is a new countdown and may fire again; the same expiry reported by the poll and the push is one occurrence.
