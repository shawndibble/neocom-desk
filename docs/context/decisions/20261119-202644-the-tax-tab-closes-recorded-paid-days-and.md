# Scope decisions — The Tax tab closes recorded-paid days and shows what the corporation changed

_Recorded 2026-11-19._

- **A running account's Tax tab now reads the Miner's own paid-through day** (`minerPaid`) and closes those days as the corp book does (D22): what a day at or before it still shows owed is forgiven, except officers' charges, which stay owed (pooled on the oldest such day that ended short). A day an officer set a limit on (an exemption) is not closed this way. `personalParity.test.ts` pins both pages to the same Owed and Credit.
- **A reversed correction no longer counts and stays in view** on its day, struck through and tagged "Reversed by an officer", with why.
- **A part-paid day says so** ("Billed · paid · owes"), and **a forgiven shortfall is named** ("a Market adjustment"), in the day's detail only, not as separate rows.
- **A balance rolled over from the old system** shows as one line in the corporation's balance note ("Opening balance from the old system: you owe ..."), until an officer reverses it. Its amount still counts on the nearest billed day, as any correction does.
- **No new notifications.** A miner sees an officer's change the next time the Tax tab loads.
