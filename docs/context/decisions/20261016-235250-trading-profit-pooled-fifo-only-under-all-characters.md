# Scope decisions — Trading profit: pooled FIFO only under All characters; broker fees beside, never subtracted (issue #3995)

_Recorded 2026-10-16 · issue #3995._

- **Pooled FIFO is the All characters view only.** Every Character's fills share one lot book there, so an alt's buys price a main's sales; the single-Character view and Open Orders' cost floor stay per-Character. Rules out a pooled margin on a single-Character view (the hostile reviewer's position was overruled: filling the alt-buys/main-sells blank is the point of All characters).
- **Broker fees are a period total beside the margin, never subtracted.** Journal broker-fee rows carry no order id (decision 20261008-003752), so they cannot be tied to a sale. Rules out per-trade fee netting.
- **The new widget is its own kind `tradingProfit`; the `profit` kind id stays.** Only the `profit` widget's label becomes "Build profit", so saved layouts survive.
- **A sale's renumbered id is the All characters key.** Two Characters' wallets can carry the same `transaction_id`, so the pool renumbers fills uniquely (`pooledTransactionMargins`) after linking each sale's tax inside its own Character's journal.
