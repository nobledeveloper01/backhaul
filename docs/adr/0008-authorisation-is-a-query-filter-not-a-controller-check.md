# ADR-0008 — Authorisation is a query filter, not a controller check

## Status

Accepted — 2026-08-27.

## Context

The API has had no authentication and no authorisation at all. Anyone who knows
a trip id can read its whole position history and post positions to it. That is
survivable only because nothing is deployed, and it is the single thing
blocking the phase 2 pilot.

The obvious way to fix it is a guard on each controller action: check the caller
is on the trip, then do the work. That is how most of this gets built, and it
has a failure mode worth naming before writing any of it.

**A controller check protects the endpoint you remembered.** The next endpoint —
a search, an export, a fleet dashboard, a debugging route someone adds on a
Friday — has to remember the same check, in the same words, or it quietly
returns rows it should not. The backend spec is unusually blunt about this,
and it is right to be:

> Position visibility — **enforced at the query layer**: driver, their fleet
> owner, and the shipper on that trip. **No other query path returns a position
> row.**

The thing being protected is not an endpoint. It is a truck's location history,
which is exactly what somebody planning a cargo theft would want, and the
product statement lists theft-by-platform as a live risk.

## Decision

**Authentication** is a bearer token. Tokens are opaque random values, stored
as a SHA-256 hash — a leaked database should not be a set of working
credentials — and carry a principal: a user id and a role.

**Authorisation is a filter applied where rows are read, not a check performed
before reading them.** `PositionRepository` and `TripRepository` take a
`Principal` and compose it into the query. There is no method on either that
returns a position without one.

Three parties can see a trip: the **driver** carrying it, the **carrier** that
owns the truck, and the **shipper** whose goods are on it. A trip stores all
three. Anyone else gets an empty result — not a 403, because the existence of a
trip id is itself information, and a 403 confirms it.

The ingest path gets the same treatment from the other side: a batch is
accepted only for a trip the caller is the driver of. `shouldTrack` already
refuses samples for a trip that is not under way; this refuses samples for a
trip that is not *yours*.

### What this deliberately is not

- **Not OTP.** There is no SMS provider and pretending otherwise would be a
  fake login flow. Tokens are issued out of band for now; the phone-plus-OTP
  exchange is phase 3 and it changes how a token is *obtained*, not what a
  token *is*.
- **Not tiers.** Verification tiers gate awarding and bidding, and neither
  exists yet.
- **Not rate limiting.** Real, required by the spec, and it belongs with a
  reverse proxy rather than in the application.

## Consequences

Every repository method that touches a trip or a position takes a `Principal`.
That is a visible, slightly tedious parameter on a lot of signatures — and it
is the point: a new query cannot be written without confronting the question of
who is allowed to see the answer.

Adding a fourth kind of viewer (an insurer, a regulator, a broker acting for a
shipper) means changing one predicate rather than auditing every call site.

A test asserts that **no public repository method returns positions without a
principal**, by reflection over the type. A rule enforced only by review is a
rule that lasts until the first hurry.

**Unauthorised reads return empty, not forbidden.** A shipper probing trip ids
learns nothing from the response either way. The cost is that a genuine
permissions bug looks like missing data rather than an error, so the refusal is
logged server-side with the principal and the trip.
