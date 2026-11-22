# Scope decisions — Mining Tax payee cards are for actions

_Recorded 2026-11-22._

- **A card on the Tax tab is for an action, so only a Payee with something owed gets one.** Its name and figure are plain text (the figure red with a `−`); Settle up is the one primary button, and Ledger and Link payment are text actions beside it, folding into a ⋮ menu on a phone. A Payee in credit is a one-line note with a Ledger link, and a settled Payee is not listed: Manage Payees opens its ledger and the table's Payee filter reaches its entries. This rules out the name-filters-the-table and figure-opens-the-ledger shortcuts the card carried, which were invisible.
- **Money reads by colour and sign, never the word "credit".** A ledger balance and a card figure owed are red with a `−`; money ahead is green with no word. Ledger amounts stay uncoloured, as on desktop, and a charge keeps its `−` to tell it from a payment.
- **The way into a ledger from a row's detail modal is the Payee's name**, an accent link, not a separate "Open … ledger" line.
- **A phone ledger row is two lines** (title and one signed amount; date and balance), via the dense stack, not four labelled lines with blanks.
