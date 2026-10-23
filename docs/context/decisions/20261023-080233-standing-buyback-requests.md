# Scope decisions — standing buyback Requests (issue #4780)

_Recorded 2026-10-23 · issue #4780._

- **A buyback is a Request, not a new page.** It is a standing Request on the Requests tab (ADR 0021): same board, same callable creation, same Members-only read. A new tab would split one board in two.
- **Buy lines are item types and a fixed list of groups.** Ore, ice, minerals, gas, planetary and salvage, each a table of SDE category and group ids. A corp ticks groups and adds single items; it never builds a rule. Ice is not ore, though both sit in the Asteroid category.
- **The owner may name a buyer Character.** Contracts go to that Character, not always the requester. The callable accepts only a Character that is a Member of the Community, so a client cannot aim contracts at an arbitrary id.
- **A standing Request has no `expiresAt`.** Open means "not closed". The sweep skips it; closing it starts the usual 7-day clock. Nobody used standing Requests before this, so no old client or old sweep has to read one.
- **A second paste replaces the held quote.** One quote per Member per Request: no stale quote, nothing to choose between.
- **A quote is held 14 days.** Buyers sit on a contract for days, so the 30-day Request clock and the 14-day Pledge-stale rule are both the wrong length. 14 days is the stored `expiresAt - quotedAt`.
- **Rate is a percent in tenths, 1 to 200.** 92.5 is allowed, 92.55 is not. Over 100 covers a buyer who pays above hub.
- **A named buyer is checked for membership, not ownership.** The server cannot tell which Characters one person owns, so it only requires the buyer to be a Member. A Member can name another Member as buyer; sellers see "Contracts to <name>" and that Member can ignore the contracts. Accepted for v1: the picker offers only the poster's own Characters.
- **A held Quote records what it was priced at.** The Quote carries the Rate, basis and Trade Hub it used, so an owner's later edit marks it out of date instead of leaving a stale "contract for X ISK" line. A Quote from before those were stored is trusted.
- **The rules bind the Quote's scalars, not its lines.** Rules cannot loop and have a 1000-expression budget, so they check the total, the dates (`expiresAt` is exactly `quotedAt` + 14 days, `quotedAt` within a day of server time), the line count and the optional rate, basis and hub. The lines are display-only, and the total is the Member's own claim. The buyer checks a contract against the real price in game (the next ticket compares it to the contract), never against the stored lines.
