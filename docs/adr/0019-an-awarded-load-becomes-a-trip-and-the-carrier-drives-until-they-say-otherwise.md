# ADR-0019 — An awarded load becomes a trip, and the carrier drives it until they say otherwise

## Status

Accepted — 2026-08-28.

## Context

Phase 5's exit gate ends *"…and first return load matched and completed end to
end"*. It cannot be met, and not for want of either half: the marketplace works
and the trip machine works, and there is nothing joining them.

`AwardAsync` sets `AwardedToCarrierId` and `AwardedAt` on the load, saves, and
returns true. The load leaves the board. Nothing else happens. No trip is
opened, so there is nothing to track, nothing to capture a delivery against,
no escrow to release and no record to count toward a tier — the shipper and the
carrier have agreed a load inside this product and have to go and arrange the
rest of it somewhere else, which is precisely the thing the wedge exists to
stop them doing.

The reason it was never built is a real question rather than an oversight. A
trip has three parties and an award names two. The shipper posted the load and
the winning bid names the carrier; **nobody has said who is driving**. Vehicle
and driver assignment is a phase 3 feature (`vehicles.ts`, feature 19) and it
is written but has no assignment flow, so at the moment of award there is no
driver to name.

Three answers were available:

1. **Wait for one.** The award opens nothing until the carrier assigns a
   driver. Honest, and it leaves a hole exactly where the product promised
   continuity: between "you have the load" and "we are tracking it".
2. **Open with an empty driver slot.** `TripParties` would have to admit a
   null, and every authorisation path — the one thing on this server that is a
   query filter rather than a check (ADR-0008) — would grow a special case for
   a trip nobody drives.
3. **Open with the carrier as the driver**, and let them hand it over.

## Decision

**Awarding a bid opens the trip, in the same transaction, with the carrier in
the driver's slot.**

Most of this market is owner-operators: one person owns the truck and drives
it, and for them the carrier *is* the driver and there is nothing to reassign.
The test suite already encodes this — `PunctualityEndpointTests` opens trips
with the driver's own number in the carrier slot and calls it what it is.

For a fleet, the carrier holds the trip until they hand it to a driver, which
is a later, separate action and is not this ADR. Until then the trip is
trackable, the shipper can see it, and the thing that was agreed exists in the
product rather than in a WhatsApp thread.

Concretely:

- The trip id is **derived from the load id**, not generated. Awarding is
  idempotent already at the load level (a second award is refused because
  `AwardedAt` is set); deriving the id means a retry cannot mint a second trip
  for one load, and a caller who wants the trip does not need a second lookup
  to find out what it is called.
- The load and the trip commit **in one `SaveChanges`**. An awarded load with
  no trip is the state this ADR exists to eliminate, and it must not be
  reachable by a process dying between two writes — the same rule the tracking
  batch endpoint follows for the same reason.
- The trip opens in state `open`, actor `shipper`, at the award time. It is
  what happened: the shipper awarded it.

## Consequences

The marketplace half of the product now ends where the tracking half begins,
and the round trip can drive one load from posted to delivered without leaving
the API. That is the gate.

**A carrier who does not drive is briefly recorded as the driver.** They are
the driver of record until they hand the trip over, and until the hand-over
exists they stay it. That shows up in one place that matters: `tierOf` counts
completed trips per carrier, and those are counted from trips the *carrier*
holds, so nothing is miscounted. It would matter to a driver's own record, and
a driver who never held the trip has no record from it to lose.

**A trip id is now guessable from a load id.** Both are GUIDs the caller
already holds, and ADR-0008 makes a trip visible only to its three parties, so
knowing an id buys nothing — the same argument that lets the app choose trip
ids in the first place. It is written down because "derived id" and "secret id"
are easy to confuse and this product has one route where an id genuinely is a
capability (ADR-0010), and this is not it.

**Awarding got slower and can now fail for a new reason.** It writes two rows
instead of one. A failure leaves neither, which is the point.
