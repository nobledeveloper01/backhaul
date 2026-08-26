# ADR-0003 — A trip history is append-only

## Status

Accepted — 2026-08-26.

## Context

Backhaul exists because disputes about Nigerian freight are currently settled
by argument. A record that can be edited after the fact settles nothing: the
first question anyone asks of it is whether it was changed, and there is no
good answer.

This is the same conclusion Grid reached about meter readings, arrived at from
a different direction. Both products are, underneath, evidence.

## Decision

A trip is a list of `TripEvent` values, appended to and never modified. There
is no update path and no delete path. A correction is a new event; the original
survives.

The state machine that governs which events may be appended is written as an
explicit edge set — data, not control flow — so a test can assert the complete
set of transitions and adding one fails the build rather than quietly
permitting a new way for cargo to change hands.

One transition is refused outright: an event dated before the event preceding
it. Everything else the machine disallows produces an explained refusal the UI
can render; a back-dated event is rejected because accepting it corrupts every
duration derived from the history — time in transit, time stalled, time to
delivery — and those durations end up in an invoice.

Two events at the same instant are allowed. A phone with a coarse clock is not
a corrupted history, and refusing it would strand real trips.

## Consequences

Storage grows with events rather than trips. A three-day trip has tens of
events, which is nothing.

The UI must show current state without implying the history is the state — the
trip screen renders `currentState(history)` and the history is available
beneath it.

A dispute resolves through the machine (`disputed → delivered` or
`disputed → cancelled`) and never by inference from tracking data, because the
whole reason a trip is disputed is that the tracking data is being argued
about. Resolution is a human decision recorded as an event, with an actor and a
note that a dispute pack prints verbatim.

A trip cannot go from `disputed` back onto the road. That is deliberate: a
resumed trip is a new trip, and pretending otherwise produces a single record
with two contradictory stories in it.
