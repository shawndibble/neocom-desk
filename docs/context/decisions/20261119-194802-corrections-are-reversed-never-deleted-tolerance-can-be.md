# Scope decisions — Corrections are reversed, never deleted; tolerance can be overridden per day

_Recorded 2026-11-19._

- **An officer undoes a correction or write-off by reversing it, never by deleting it.** The record gains `reversed: {by, at, reason}` and stops counting everywhere (Statement drafts, allocation, the running account, the member's Tax tab, the server's mirror). The Miner's ledger keeps the original and adds an offsetting row dated the day it was undone, so the rows still add up. An edit is a reversal plus a new Adjustment that names it in `replaces`. Accounting systems do the same (original, reversal, replacement).
- **A correction already billed on an issued Statement cannot be reversed**, as the Statement is frozen (D22): the officer adds an opposite correction instead.
- **An Adjustment can be an opening balance** (`kind: 'opening'`): the balance rolled over from another system, dated at the book's start by default.
- **A day's tolerance can be overridden by an officer.** A `toleranceExemptions` record says the most of that Miner-day's shortfall the book forgives: 0 charges the whole shortfall (reversing a Market adjustment), another amount forgives up to it and leaves the rest owed (editing it). The newest record for a day decides; nothing is deleted. It replaces the book's percent for that day only, and only when a payment reached the day.
- **A Miner's own paid-through day** is a field on their Miner record (`paidThrough`), readable by them, so their Tax tab can close the same days the corp book does.
- This change is the engine and the readers only; nothing writes the new fields until the server actions ship, so it changes no number today.
