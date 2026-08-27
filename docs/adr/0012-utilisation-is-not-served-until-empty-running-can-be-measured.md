# ADR-0012 — Utilisation is not served until empty running can be measured

## Status

Accepted — 2026-08-27.

## Context

`utilisation.ts` answers the question the product exists to move: what fraction
of a fleet's kilometres are paid for. A truck that runs 830 km loaded and
830 km empty is at 50%, and every point of that is diesel, tyres and a driver's
day paid for by nothing. `worthOfOneReturnLeg()` turns it into the pitch —
what filling one of those empty runs would have earned.

The fleet screen renders both. It has always rendered them from `demoLegs`,
which is fabricated, and until now it did so **unlabelled**, under the heading
"Your fleet". A carrier reading an invented utilisation figure as their own
would act on it. That is what the figure is for.

The obvious fix is to serve it, and every other engine on this product has
been served the same way: mirror the rule in C#, hold both sides to a parity
fixture, add a route. The mirror and the fixtures are done — `Fleet/Utilisation.cs`
and five parity cases, including the degenerate ones that matter (no legs must
be 0% and not NaN; a fleet that never runs empty has no return leg to be worth
anything).

The route is where it stops, because `utilisation()` takes legs and the server
cannot honestly produce them.

A `Leg` is three things: metres driven, whether the truck was loaded, and what
it earned. Two of the three are already in the database.

- **Loaded legs are trips.** Distance comes from the cleaned track — actually
  driven, actually measured — and what it earned is `TripTerms.AgreedKobo`.
- **Empty legs are the gaps between trips.** A truck that delivers into Kano
  and loads again in Kaduna drove those 230 km with nothing on it. This is
  precisely the number a carrier cannot work out for themselves, and precisely
  the number the product is selling.

And the gap is where tracking is off. There are no positions between trips,
because there is no trip. The server can see where one ended and where the next
began, and the only distance available for the stretch between them is a
straight line — which is not what a truck drove, and on the corridors this
product runs is out by a wide margin in a direction that varies by route.

Three ways out were considered.

1. **Straight line, unlabelled.** Understates empty kilometres, which flatters
   utilisation and shrinks the pitch. Safe in direction and still a number
   presented as something it is not.
2. **Straight line with a road factor.** `pricing.ts` already has the problem
   of road-versus-straight distance. Applying a factor produces a better
   estimate and does not change what it is.
3. **Track between trips.** Correct, and it means capture continues when no
   trip is running — a different product, a different consent conversation and
   a different battery budget. Not a schema change; a change to what the app
   is.

## Decision

**No route until the empty leg can be measured rather than estimated.**

The C# mirror and the parity fixtures stay. ADR-0005 already says a rule that
exists on both sides gets a parity case *before* it gets an endpoint, so a
mirror without a route is the state that rule describes as correct
preparation — not dead code.

The fleet screen keeps rendering the walkthrough's figure and **says that it
is the walkthrough's**, in the reader's own language, in the same shape the
trips list uses.

## Consequences

The right-hand column of the served/not-served table in `docs/ROADMAP.md` has
three engines in it, not two: `budget` and `language`, which should never have
a route, and `utilisation`, which should.

Rule 7 — *no estimate is presented as a measurement* — is why this is a
decision rather than an omission. Every other unserved figure on this product
either has a route or has a reason in writing, and "we shipped a number nobody
had measured" is the failure the rule exists to prevent. Half a figure that
says so beats a whole one that does not.

The way forward is option 3, and it is a product decision rather than an
engineering one: it needs the driver's consent to be tracked between trips,
and that conversation belongs with the person who will have it.
