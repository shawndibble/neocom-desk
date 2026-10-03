# Scope decisions — LP Value defaults to each store's market rate

_Recorded 2026-10-02._

Supersedes the **LP Value** default of 0 ("the app never guesses a rate")
recorded with the Blueprint Acquisition modal
(`20260922-164023-blueprint-acquisition-modal-compares-every-source-a-pick.md`)
and carried into automatic blueprint pricing
(`20260929-094139-automatic-blueprint-pricing-weighs-every-source-the-tier.md`).

- **With no LP Value set, a store's LP is priced at that store's market rate.**
  Asked for by the pilot so the Implant Finder can weigh an LP Store implant
  against a market one, and to be used everywhere LP is priced. Pricing LP at
  0 made every LP pick look nearly free, which is worse than an honest
  estimate.
- **The market rate is per corporation, not one number for all LP.** LP is
  earned and spent with one corporation, and stores differ several-fold in
  what their LP buys. A single app-wide figure would be confidently wrong for
  most of them.
- **It is the LP Store page's own ISK/LP, read off the store's best offers.**
  The store is priced by `computeLoyaltyOfferRows` — the same pipeline, so
  the two can't disagree — at the Trade Hub the caller is pricing at (the
  modal's hub, a plan's hub), selling at the hub's sell price, with untrained
  trade skills and no standing so fees are the full ones and the rate errs
  low. The rate is the median of the five best offers, counting only offers
  the hub has at least five redemptions' worth of for sale, and needs three
  such offers — so one thin, lucky order can't set it.
- **A typed LP Value still wins, and applies to every store.** It is the
  pilot's own judgement of what their LP is worth; 0 (the default) means "use
  the market".
- **No rate is not a rate of 0.** When neither the pilot nor the market
  prices a store's LP, the Blueprint Acquisition modal shows the ISK side and
  says the LP is unpriced, and automatic blueprint pricing and the LP Store's
  "Plan in Industry" leave that redemption out rather than counting its LP as
  free.
