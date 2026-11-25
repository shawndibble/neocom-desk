# Scope decisions — An open day's own-Payee ore is Outstanding at an estimate

_Recorded 2026-11-25._

- **On the member's side, ore listed for the corporation's own Payee on a day the book hasn't closed yet is Outstanding at an estimate.** It replaces "Record only" in History. The member knows they owe it and has usually stopped mining. EVE's logs record only the day, never a time, so the app can't tell that the day is finished. The estimate is valued from what the book has observed of the day so far, otherwise from the member's own Assignment. Ore listed beyond what was observed is Settling (20261124-211423). The estimate counts in what the member owes and in Settle Up. This supersedes D12's "Before a day is Billable … never owed" (20261018-134402) for own-Payee ore only. Free ore on an open day still reads Pending corp record.
- **Paying early pays the estimate from credit.** Money ahead of every billed day pays the estimates, oldest first. A covered estimate reads Paid. What the credit doesn't reach (ore mined after the payment, or a price move) stays Outstanding as its own row, like a paid Assignment leaving growth to a new one (ADR 0024). Nothing is stored. When the day closes, the book bills it and the running account decides as before.
- **The member-facing "Billed" reads "Outstanding"**, the word every other owed row uses. The Payee column and hint already say the book set the figure.
- **Officers' billing doesn't change.** The book still bills a day only when it closes.
- **Past "Record only" own-Payee days are left alone here.** A closed day the book has no charge for (it observed no ore from that character in that system, or the day is unrated or unread) still reads Record only. What it should say is a follow-up.
