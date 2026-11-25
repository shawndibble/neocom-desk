# Scope decisions — Calendar folds everything overdue from before today

_Recorded 2026-11-25._

- **Anything overdue from before today folds into the Coming Up rail's summary row.** Replaces the
  two-day window (`LONG_OVERDUE_MS`, from 20261115-211507): a missed event from yesterday sat under
  its own past day heading and read as current. Today's date is cut on the Time format clock, so an
  item that went overdue earlier today stays in place. The row now reads "Overdue before today ·
  oldest N days"; a picked day still folds nothing, and the Overview Calendar widget leaves the same
  items out.
