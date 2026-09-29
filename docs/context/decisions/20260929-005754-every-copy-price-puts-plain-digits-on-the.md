# Scope decisions — Every Copy price puts plain digits on the clipboard, suggested or read off the market (issue #2294)

_Recorded 2026-09-29 · issue #2294._

- **Any "Copy price" action puts `priceClipboardText`'s plain digits on the
  clipboard — `1000000`, or `12.34` with cents; no thousands separators, no
  `ISK` unit — whether the price is one this app suggests or one read off the
  market.** This extends the clipboard bullet of
  `20260924-002508-suggested-order-prices-are-legal-4-significant-figure.md`,
  which only named suggested prices. Its reason, that EVE's own order price
  field rejects `formatIsk`'s grouped text, holds for a rival's price copied
  from the order book just as much, and the order book is where traders copy
  a price to post against. That decision's "rival prices … are untouched"
  line is about rounding and still stands: an order-book price is already on
  a legal tick, so it is copied exactly, never rounded.
- **Only the clipboard payload is plain.** On-screen text and accessible
  names (e.g. the order row's "More actions for 1,000,000.00 ISK, …") keep
  the formatted figure with its unit.
- **Not covered: copied totals.** An aggregate like an appraisal hub-compare
  total isn't an order price and is never pasted into EVE's price field, so
  it keeps its formatted copy text.
