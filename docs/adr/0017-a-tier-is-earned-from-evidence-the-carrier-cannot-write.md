# ADR-0017 — A tier is earned from evidence the carrier cannot write

## Status

Accepted — 2026-08-28.

## Context

Phase 3's exit gate is one sentence:

> Tier gates enforced server-side and **proven unbypassable from a modified
> client**.

`tierOf` is written, tested, mirrored in C# and held to the parity fixtures.
It is rendered on the verification screen and on the fleet screen. It gates
nothing: no action anywhere in the product is refused because of a tier, and
the load board's tier filter is a convenience a modified client simply ignores.

That is the familiar shape on this project — written, tested, and deciding
nothing — but adding a gate would not have fixed it, and the reason is worth
writing down.

**The ladder's document rungs are self-declared.** `PUT
/v1/me/verification/{paper}` takes `{ held: true }` and writes it. The comment
above it is honest — *"Records that it exists, not that it is genuine.
Verification is a human step"* — and the human step was never built. `tierOf`
then reads those four booleans as though they were evidence. A carrier taps
four toggles and is `trusted`, subject only to the trip counts.

So a tier gate on bidding would not have been bypassable by a *modified*
client. It would have been bypassable by the ordinary one, in four taps, and
the gate would have read green while proving nothing.

The other half of the ladder is already sound. Trips completed, trips
promised, trips on time and upheld incidents are counted from trips and
reports; `CarrierProfileEntity` says so in its own remarks — *"The record half
is **never written by the carrier**. A rating somebody can type in is a rating
worth nothing."* The papers half sat directly underneath that sentence,
contradicting it.

## Decision

**A paper counts toward a tier when somebody has looked at it. Until then it
is a claim, and it is shown as one.**

1. **A paper has three states**, not two: not held, **submitted**, and
   **verified**. `PUT /v1/me/verification/{paper}` records the carrier's claim
   and moves it to submitted. Nothing a carrier can call moves it further.

2. **`tierOf` reads verified papers only.** The engine does not change — its
   `Documents` still means "held" — but what is passed to it is now the
   reviewed set. The rule was never wrong; its input was.

3. **A fourth role, `Reviewer`**, is the only caller of `PUT
   /v1/verification/{carrierId}/{paper}`. It is not a role any public path can
   reach: first sign-in mints a `driver` (see `SignInRepository`), and a
   reviewer token is issued by ops with `--issue-token`. A reviewer is not a
   party to any trip, so `TripParties.Admit` refuses them everywhere — they can
   review papers and see nothing else.

4. **A load carries a minimum tier**, and `PUT /v1/loads/{id}/bid` refuses a
   carrier below it. The bidder's tier is computed at bid time from their
   reviewed papers and their counted record; it is never read from the request
   and never stored.

5. **The carrier sees both.** The verification screen shows what they have
   sent and what has been confirmed, separately. A screen that showed only the
   confirmed set would look like their upload was lost.

## Consequences

The gate becomes provable, and the proof is a specific test rather than a
sentiment: a carrier submits all four papers, is still `unverified`, and is
still refused the bid — through the real endpoints, with a real token, sending
whatever it likes. Only a reviewer's action changes the answer. That is what
"unbypassable from a modified client" means when written down, and it is not
provable at all while the client can write the inputs.

**Every carrier is `unverified` until somebody reviews them, including today's.**
The four existing booleans become claims. Nobody is demoted in the sense of
losing something they earned — nothing was earned — but a carrier who has been
looking at a Verified badge will stop seeing it, and the pilot has to review
its first carriers before any load with a bar on it can be bid.

That is the cost, and it is the point. A badge that a carrier assigns to
themselves is worse than no badge, because a shipper reads it as this platform
saying something.

**It puts a person in the loop, and the product now depends on them.** Review
is manual, unqueued and unmeasured; there is no SLA, no notification when
something is waiting, and no record of who reviewed what beyond the flag. For
a pilot with one operator that is the right amount of machinery. It is not
enough at a hundred carriers a week, and the thing to build then is the queue
and the audit trail, not an automatic approval.

**What this does not claim.** A reviewed paper means somebody looked at an
upload. It does not mean the licence is real, the insurance is current, or the
person holding the phone is the person on the ID. Liveness and ID match are
still phase 3 features and still unbuilt; `describeTier` should not grow
language that implies more than a human glance.
