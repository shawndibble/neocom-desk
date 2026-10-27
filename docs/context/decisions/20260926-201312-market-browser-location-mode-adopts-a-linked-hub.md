# Scope decisions — Market Browser Location Mode adopts a linked hub or region (issue #2042)

_Recorded 2026-09-26 · issue #2042._

- **The Market Browser is the one exception to "nothing read from the URL is
  ever written back to storage" (decision `20260922-221531`): a valid `?hub=`
  or `?region=` a link opens with is copied into the device's Trade Hub /
  Location Mode.** The Market Browser's URL only ever holds one of `hub` or
  `region` at a time (`buildMarketParams`), so switching Location Mode drops
  the other one. Without the copy, a pilot who opens a `?hub=amarr` link,
  switches to Region, then switches back to Trade Hub would land on their own
  saved hub (Jita, say). The hub the link pointed at would be gone after one
  unrelated click. Keeping the linked location in the stored setting is what
  lets it survive that round trip. This has shipped since the Location Mode
  toggle did. Issue #2042 moved it from a hidden effect in
  `useMarketBrowser.ts` to a named option, `adoptLinked` on
  `useRememberedUrlParams` (`src/lib/useUrlState.ts`), so no other view picks
  it up by copying the pattern.

- **No other view opts in.** Courier Search's remembered filter and the
  Contracts Search mode keep the default rule: the URL wins for that view, the
  stored value stays a default, and a link never rewrites it. What made the
  exception worth it here is the one-of-two URL shape plus a toggle that
  drops half of it. Neither of the other views has that shape. This rules out
  turning `adoptLinked` on for a view just because it also has a remembered
  default.
