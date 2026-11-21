# Mining › Tax: resolve a problem in the app

Source: `src/mockups/MiningTaxResolve.stories.tsx` (`mockups-miningtaxresolve--*`). Sample data; the ticket text wins over the picture.

## The idea

Every problem the Tax tab reports has the same five possible outcomes, split by who has to agree. The tab offers only the ones that apply, self-service first:

| Settle it yourself | Ask the corporation |
|---|---|
| **Pay it** — costs ISK | **I already paid** — send the proof (amount, time, journal ref) |
| **Fix my records** — costs nothing | **I don't owe this** — say why; they waive it or keep the bill |
| **Not paying** — hide it, optionally tell them why | |

Today the tab leads every warning with "ask an officer" — the slowest, least certain outcome — and offers no control for it. After an answer, the problem leaves the attention strip for one quiet line and comes back only when an officer hands it back, with what to do next. Hiding is never "resolved": the row reads "Not paying — {corp} still bills this".

New components: `ResolveOptions` (A), `ResolveDialog` (B), `QuietStatusLine`, `LeftCorpNotice`, `QueueCard: won't pay`, `RequiredNextStep`, `TaxContactSetting`, `WalletCheck`, `AutoCreditedLine`. Everything else is the real `AttentionStrip`, `OwedBalances`, `DataTable`, `Modal` and `src/components/ui` primitives.

## Today

| | |
|---|---|
| The strip, opened: both items end in advice, neither has a control | ![](today-1440.png) |
| Compare with the book: a table, a sentence, Close | ![](today-compare-1440.png) |

## Two ways to offer the outcomes

| | |
|---|---|
| **A · Inline** — the likeliest outcome is the row's button; the rest are one menu away. Fast for the obvious case, but the menu can't say what each outcome does. | ![](a-inline-1440.png) |
| **B · Resolve** — one button per problem opens every outcome with its consequence. The likeliest is preselected, so the common case is still Resolve → Enter. A problem with only one sensible outcome (a duplicate Assignment) skips the dialog. | ![](b-uncredited-1440.png) |

### B, per situation

| | 1440 | 390 |
|---|---|---|
| Uncredited donations: the proof already filled in | ![](b-uncredited-1440.png) | ![](b-uncredited-phone-390.png) |
| A Conflict: Fix my records, with what it moves | ![](b-conflict-1440.png) | |
| A day billed at a higher rate: Not paying, reason ticked | ![](b-not-paying-1440.png) | |

## "I already paid", checked before anyone is asked

The pilot's own journal entry already gives the amount, EVE time, journal ref and who received it. The app checks first — the corporation's wallet as the book last synced it (all 7 divisions), or, for ISK paid to a person, that person's own wallet on their own device — so an officer only ever sees a claim with the search done.

| | 1440 | 390 |
|---|---|---|
| Two donations checked: one was in the corp wallet and is credited on the spot; only the other goes to an officer | ![](paid-checked-1440.png) | ![](paid-checked-phone-390.png) |
| Paid to a person: the pilot picks the payment; it went to the CEO, who confirms from his own wallet. Another corporation is flagged too | ![](paid-to-person-1440.png) | |
| Officer: every claim arrives checked — credited automatically (one quiet line, Undo), found in an uncounted division, not in the corp wallet, or too old to check | ![](officer-checked-1440.png) | ![](officer-checked-phone-390.png) |
| The CEO: tax paid to him personally, found in his own wallet — record it as tax in one click | ![](ceo-paid-to-you-1440.png) | |

## Paying a Corp Tax Book: an amount, not days

The book pays a Miner's oldest days first and can't target a moon or a day, so the pilot pays an amount. The pay side shipped as Settle up's preview off the Miner's Running account (`SettleUpDialog`), so its mockup is gone; the officer's card says where the money went.

| | 1440 | 390 |
|---|---|---|
| Officer: where the member's payment landed, and what is held | ![](officer-held-1440.png) | |

## After the pilot answers

| | 1440 | 390 |
|---|---|---|
| Only the bill an officer kept still needs them — with the officer's instructions and Resolve again. The rest is one quiet line; rows say Sent, Proof sent, Not paying. | ![](after-1440.png) | ![](after-phone-390.png) |
| A corporation the pilot left: pay it or stop showing it | ![](left-the-corp-1440.png) | |

## The officer's side

| | 1440 | 390 |
|---|---|---|
| Needs you: proof, a dispute and a won't-pay. Won't-pay reuses the leaver's two answers (Write off · Send reminder), so it adds no new gesture. | ![](officer-queue-1440.png) | ![](officer-queue-phone-390.png) |
| Keeping a bill requires what the member should do next; they read it word for word | ![](officer-keep-bill-1440.png) | |
| Who gets the EVE mail: the CEO by default, or a mailing list, or named officers | ![](officer-contact-1440.png) | |

## Notes for the build

- The Payee card's "ask the corp to sync its book before paying again" is today's copy and still a dead end; it changes with the rest.
- "Ask the corporation" always lands in Needs you; the EVE mail is for officers not in Neocom Desk at the time, and needs the member's mail permission. Without it, Needs you alone.
- EVE delivers to a mailing list only from its members, so a member not on the corp's list falls back to the CEO.
- Auto-credit only on exactly one match (sender, exact amount, not already credited); two candidates go to an officer side by side.
- "Too old to check" is never "not found". The sync keeps only donations it credits or flags, so wallet history before the book started (or past ESI's window) can't be searched; keeping every donation the sync sees would shrink that gap.
- A person's own wallet is checked on their own device: personal wallet tokens never leave it (CLAUDE.md).
- Open question: an open dispute does not pause the 14-day Conflict clock today. The Overdue flow's pause budget (14 days per Late notice) is the precedent to weigh.
