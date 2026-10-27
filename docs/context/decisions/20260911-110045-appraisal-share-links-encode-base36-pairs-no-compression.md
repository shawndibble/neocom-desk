# Scope decisions — Appraisal share links encode base36 pairs, no compression dependency (issue #831)

_Recorded 2026-09-11 · issue #831._

- **No compression library.** The ticket described the payload as a
  "compressed query/hash param," but 200 `typeId:quantity` pairs (the
  human-set ceiling, see issue comments) encode to a few KB at most —
  well under what any chat client truncates — as plain `typeId-quantity`
  pairs, each side base36 (both are always positive integers), joined by
  `_`. That is small enough with no dependency at all, so `lz-string`/`pako`
  were ruled out rather than added: this repo has neither today, and the
  byte budget the ticket actually cares about (chat-client truncation) is
  already met without one.
- **The item cap is checked on both encode and decode**, not only when a
  link is generated. A share payload is fully player-controlled and renders
  inside the app's own chrome (the ticket's own scam-forgery concern), so a
  hand-built payload carrying more pairs than `encodeAppraisalShare` would
  ever produce is rejected wholesale at decode time (`appraisalShare.ts`)
  rather than silently truncated or priced anyway.
- **Only matched, priced rows are ever encoded.** A paste's unmatched lines
  (no resolvable `typeId`) never enter the link — they cannot be, since the
  format carries `typeId:quantity` only. "Unmatched/unresolvable ... never
  silently dropped" (an acceptance criterion carried over from
  `20260908-164742-appraisal-prices-at-a-trade-hub-and-shares.md`) is instead
  honoured on the _receiving_ side: a decoded `typeId` this build's bundled
  SDE cannot name (a stale cache, a removed type, or a tampered payload) is
  reported in the read-only view rather than dropped, distinct from an
  unmatched paste name on the live tab.
- **The read-only route (`/share/appraisal`) carries the hub id as a bare
  string through `engine/market/appraisalShare.ts`, not a `TradeHub`.** The
  engine module never imports `@/market/hubs` — the same engine/feature split
  `engine/market/appraisal.ts` already draws around Trade Hubs — so hub
  validation (`getTradeHub`) lives in `features/market/appraisalShareData.ts`
  instead, alongside the SDE/price lookups only that layer may reach.
