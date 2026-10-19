# Scope decisions — Advice worker cancellation withdraws queued work only (issue #4129)

_Recorded 2026-10-19 · issue #4129._

- **Cancelling an advice request withdraws it only while it is queued in the worker.** `buildPlanAdvice` is one synchronous call, so a running build cannot be interrupted; the only pre-emption is terminating the worker, which would force the SDE slice to be re-sent for every cancel. The worker therefore drains its queue one job per macrotask so a `cancel` message is read before the next job, and the page ignores the reply of a job that was already running. A shared in-flight request is withdrawn only when its last signalled waiter leaves.
