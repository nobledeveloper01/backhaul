# ADR-0005 — The server is .NET, and parity with the domain is a test

## Status

Accepted — 2026-08-26. Supersedes the Node/Fastify choice in
`03-TECHNICAL-DESIGN.md` §7 and `07-BACKEND-SPEC.md` §2 on runtime and
framework; everything else those documents say about the backend stands.

**This decision was made three times.** .NET was chosen, reversed to NestJS,
and returned to. The NestJS server was built and working — trip lifecycle,
ingest, pricing, all of it — before it was removed. That churn is recorded here
because the reason the question kept reopening is the substance of the
decision, not noise around it.

## Context

Backhaul's rules — whether a trip may change state, what a load is worth, what
demurrage a delay costs, what each party is owed, which position fixes are
worth believing, when silence means something — live in `packages/domain` as
pure TypeScript with no platform dependency (ADR-0001).

The original technical design chose Node for the server for exactly one reason,
stated plainly: **the server could import that package and run those rules
identically to the device.** One implementation, one answer. NestJS delivered
that, and the working proof of it is what makes the trade legible rather than
theoretical.

.NET cannot do that. Every shared rule exists twice, in two languages,
maintained by two sets of edits. Two implementations of a demurrage rule is two
answers to give a shipper, and the second one surfaces when somebody disputes
an invoice.

Against that: EF Core migrations are better than anything in the Node
ecosystem, warnings-as-errors with a real nullable analysis catches at compile
time what Node catches in production, Swagger generation from XML doc comments
puts the explanation next to the code it explains, and the hosting and
operations story is well understood.

The deciding question is not which stack is better. It is whether the
duplication can be made to *fail loudly* rather than drift quietly. It can.

## Decision

The server is **ASP.NET Core Web API on .NET 9**, with **Entity Framework Core**
against **PostgreSQL** and **Swagger** as the published contract.

**Every rule that exists on both sides is held to shared fixtures.**

`packages/domain` is the source of truth. `scripts/emit-fixtures.ts` walks the
engines and writes inputs and expected outputs to `fixtures/parity.json` — the
trip machine's complete edge set, its refusal messages *word for word*, time-in-
state arithmetic, the quote table across real corridors, demurrage, settlement,
percentage rounding, truck classing, haversine distances, track cleaning, and
stall and silence detection. `ParityTests` reads that file and asserts the same
answers. 106 cases.

Regenerating fixtures is part of changing a rule. A rule change that skips it
fails the C# tests, which is the point rather than an inconvenience.

This is the pattern Grid used to keep a Go allocation engine and a Dart one
agreeing to the naira, where the divergence that surfaced was a truncation on
one side and a rounding on the other.

**It earned its keep on the first run.** The refusal message for a back-dated
event embeds a timestamp. TypeScript's `toISOString()` writes
`2026-03-04T06:20:00.000Z`; .NET's round-trip format `"O"` writes
`2026-03-04T06:20:00.0000000+00:00`. Both are valid ISO 8601, both parse, and
they are not the same string — so a driver would have seen a subtly different
sentence depending on which system answered. `Backhaul.Domain.Iso` exists
because of that, and `IsoUtcConverter` extends the same rule to every timestamp
the API emits.

## Consequences

**Real costs, stated plainly:**

- Every shared rule is written twice. That is duplicated effort and it is the
  price of the stack choice, not a hidden one.
- The fixtures cover only what they cover. A rule that exists on the server
  alone — and much of the server is such rules — has no counterpart to check
  against.
- The mobile client and the server are separate release trains with a versioned
  contract between them.

**What is gained:**

- EF Core migrations, and a schema that is reviewed as code.
- Swagger generated from the XML comments on the controllers, so the published
  contract is the explanation that sits with the code and cannot rot separately
  from it. The React Native client generates its API types from that document,
  which removes a class of drift that would otherwise replace the one being
  introduced.
- `TreatWarningsAsErrors` across the solution. A nullable warning in a
  settlement path is a `NullReferenceException` in front of a shipper, and the
  point of choosing a strongly-typed stack is spent if the warnings are
  decoration.

**What does not change:**

The device remains fully offline-capable. Trip state transitions, position
capture and queueing, and proof-of-delivery capture all happen on the phone
with no server involved, and a driver in a dead zone completes an entire trip
without one. The server is where evidence is durably kept and shared, not where
the trip happens.

**The ingest contract is unchanged and must not be softened.**
`POST /v1/tracking/batch` acknowledges only once the batch is committed, never
optimistically, because the device deletes its local rows on that
acknowledgement and on nothing else. The batch row and the samples commit in
one `SaveChanges` for the same reason: written separately, a crash between them
could acknowledge a batch whose samples were never stored — and the device
would already have deleted them.

Verified rather than asserted: an acknowledged batch, its trip, and its history
all survive a process restart against real PostgreSQL, and replaying that batch
afterwards returns the original outcome and writes nothing.
