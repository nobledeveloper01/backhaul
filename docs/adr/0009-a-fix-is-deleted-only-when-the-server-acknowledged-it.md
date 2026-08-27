# ADR-0009 — A fix is deleted only when the server acknowledged it

## Status

Accepted — 2026-08-27.

## Context

Phase 1's first exit gate is one sentence and it is absolute:

> **Zero position loss** across a simulated 1,000 km airplane-mode trip,
> verified for order and for duplicates.

The capture loop is native and survives app kills, reboots and OEM battery
managers (ADR-0002). What it captures goes into a native SQLite queue. The
question this decision settles is not how to store a fix — it is **when a fix
may be removed**, which is the only irreversible thing this product does to its
own evidence.

Deleting too late costs disk. Deleting too early costs a stretch of road nobody
can ever account for, on a trip that may be argued about in six months. Those
are not comparable, and the design should not pretend they are.

There are four plausible-sounding moments to delete, and three of them are
wrong:

- **When the batch was sent.** Wrong: the request may never arrive.
- **When a response arrived.** Wrong: the response may be a 500, or a 401.
- **When the batch was acknowledged.** Almost right, and it is the one that
  hides a bug — a server that acknowledges *part* of a batch, now or after some
  future change, silently loses the rest.
- **When the server acknowledged that exact fix, by id.**

## Decision

> **A sample is deleted from the phone when, and only when, the server has
> acknowledged that exact sample by id.**

`acknowledge(queue, acknowledgedIds)` takes the ids the server confirmed, not
the batch that was sent. Those are usually the same collection and the
difference is the entire point: passing the batch would be a one-word change
that quietly discards whatever the server did not take.

Three supporting rules follow from it:

- **Reading and deleting are separate native calls.** `peek` returns rows
  without removing them; `acknowledge` removes exactly the ids it is given. A
  single `takeBatch` that removed as it read would lose the batch whenever the
  upload failed.
- **Oldest first, always.** A queue drained newest-first looks better on a
  shipper's map after an outage, and leaves the oldest samples to be lost last
  — which inverts the priority, because the stretch nobody can account for is
  the one that has been waiting longest.
- **There is no eviction policy.** At `QUEUE_CAPACITY` the queue reports
  `critical` and keeps everything. Dropping the oldest samples is the obvious
  thing to do and it is precisely backwards: those are the ones a dispute will
  ask about. If the queue ever fills, the answer is to tell somebody, not to
  make the problem smaller.

Failure never deletes. Not a network failure, and not a refusal: a 401 means
get a token, not throw away the trip.

## Consequences

The queue can grow without bound in software, and does not in practice: at the
slowest sampling interval `QUEUE_CAPACITY` is about forty days of queueing, and
at the fastest about a day and a half. Four hours of no signal at a fix a
minute is 240 rows — well under a tenth of it.

Duplicate delivery is expected rather than exceptional, because a device that
does not receive an acknowledgement retries. That is harmless by construction:
the sample id is the server's primary key.

**The gate is met in software and is tested.** `packages/domain/test/queue.test.ts`
simulates seventeen hours and roughly a thousand fixes across a four-hour
outage, two shorter ones, three process restarts and every batch delivered
twice, and asserts nothing is lost, nothing is duplicated, and everything
arrives in order. Breaking the delete rule fails five of its tests — checked by
breaking it.

A guard test asserts the simulation is actually simulating: over 900 fixes
captured, the queue at least 240 deep, more than 20 uploads. A trip that
quietly stopped producing samples would otherwise pass every assertion by
having nothing to check.

**What this does not do** is meet the other two gates. Under 4% battery an hour
and a 72-hour soak both need real hardware — specifically a Transsion handset,
where OEM battery management is the actual risk — and no simulation stands in
for either.
