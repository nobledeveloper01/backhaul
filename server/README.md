# Backhaul API

ASP.NET Core Web API on .NET 9. The server is where a trip's evidence is
durably kept and shared. It is not where the trip happens — the device does
that, offline, and posts the result.

```bash
# In-memory, no database needed. Swagger at http://localhost:5000/swagger
dotnet run --project src/Backhaul.Api

# With a real PostgreSQL, via Docker
docker compose up --build     # http://localhost:8080/swagger
```

## Layout

| Project | Holds |
|---|---|
| `Backhaul.Domain` | The rules. No ASP.NET, no EF Core, no clock. |
| `Backhaul.Infrastructure` | EF Core context, entities, migrations, repositories. |
| `Backhaul.Api` | Controllers, contracts, Swagger. No arithmetic. |
| `Backhaul.Domain.Tests` | The parity suite. |
| `Backhaul.Api.Tests` | Endpoint behaviour, against the real pipeline. |

## Parity

`Backhaul.Domain` duplicates rules that already exist in `packages/domain` as
TypeScript. That duplication is the cost of the stack choice, recorded in
ADR-0005, and it is contained by a single mechanism:

`packages/domain` is the source of truth. `make fixtures` regenerates
`fixtures/parity.json` from it, and `ParityTests` asserts the C# side gives the
same answers — 106 cases covering the trip machine's complete edge set, its
refusal wording, pricing, demurrage, settlement, rounding, distances, track
cleaning and stall detection.

**If a parity case fails, the C# side is wrong until proven otherwise.**
Regenerating fixtures is part of changing a rule; skipping it fails these
tests, which is the point.

The suite earned its keep on its first run: TypeScript renders a timestamp as
`…T06:20:00.000Z` and .NET's `"O"` format renders it as `…T06:20:00.0000000+00:00`.
Both parse. Both are ISO 8601. A driver would have seen a different sentence
depending on which system answered. `Iso.Utc` and `IsoUtcConverter` exist
because of that.

## Who can see what

**Every endpoint except `/healthz` needs `Authorization: Bearer <token>`.**

Authorisation is a **filter on the query**, not a check in the controller. A
controller check protects the endpoint somebody remembered; the next search,
export or debugging route has to remember the same check or it quietly returns
rows it should not. `TripRepository` and `PositionRepository` take a
`Principal` and compose it into the query — there is no method on either that
returns a position without one, so forgetting is a compile error. See
[ADR-0008](../docs/adr/0008-authorisation-is-a-query-filter-not-a-controller-check.md).

| | |
|---|---|
| Sees a trip and its track | its driver, its carrier, its shipper |
| May add positions to it | its driver, and nobody else |
| Anyone else | `404`, not `403` |

The 404 is deliberate. The existence of a trip id is itself information and a
403 confirms it, so a caller probing ids learns nothing either way. The refusal
is logged server-side with the principal and the trip, because the cost of that
choice is that a genuine permissions bug looks like missing data.

Tokens are opaque 32-byte random values stored as a SHA-256 hash — a leaked
database should be a set of useless hashes rather than a set of working
credentials, and nothing anywhere needs to show a token back to anyone.

```bash
# Against a real database
dotnet run --project src/Backhaul.Api -- --issue-token driver <user-guid>
```

Issuing is a command, not an endpoint: an endpoint that mints credentials is
one somebody has to remember to protect, and getting that wrong is worse than
having no auth, because it looks protected.

On the in-memory store the server **seeds three tokens and prints them at
start-up**. That exists because the in-memory default and the token model are
otherwise contradictory — you cannot issue in one process and use in another
when the store dies with the process — and it never happens when a database is
configured.

**Not yet:** phone-plus-OTP (there is no SMS provider, and a fake login flow is
worse than an honest command), verification tiers, and rate limiting.

## The store

PostgreSQL when `ConnectionStrings:Backhaul` is set; in-memory when it is not.

In-memory is the default deliberately — a reviewer who has to provision
PostgreSQL before the Swagger page will answer is a reviewer who does not open
the Swagger page. It is also a lie about durability, and durability is the
ingest path's entire contract, so `/healthz` reports it:

```json
{ "status": "ok", "store": "in-memory", "durable": false }
```

## The ingest path

`POST /v1/tracking/batch` is the hot path and the only endpoint with a
correctness contract that cannot be relaxed:

- **It acknowledges only once the batch is committed.** The device deletes its
  local rows on that acknowledgement and on nothing else, so an early 200 does
  not make the endpoint fast — it destroys the evidence the product exists to
  keep.
- **The batch row and the samples commit together.** Written separately, a
  crash between them acknowledges a batch whose samples were never stored.
- **Duplicate delivery is expected.** A device that never received an
  acknowledgement retries; the batch id replays the original outcome, and
  individual samples deduplicate on their client-generated id, which is the
  primary key.
- **Samples are stored exactly as sent.** Fixes the phone could not vouch for
  are excluded when a track is *read*, where what was excluded is shown beside
  the figure it was excluded from. A server that quietly discards fixes
  destroys the evidence a driver needs to argue with their invoice.
- **There is no off-trip tracking.** The server rejects samples for a trip that
  is not under way, rather than trusting the client not to send them.

Verified rather than asserted: an acknowledged batch, its trip and its history
survive a process restart against real PostgreSQL, and replaying the batch
afterwards returns the original outcome and writes nothing.

## Not built yet

- **Auth.** No OTP, no JWT, no device binding. Every endpoint is open.
- **PostGIS.** The compose database has the extension; nothing in the schema
  has a geometry column. Radius matching over posted loads is the first thing
  that needs it, and that is phase 5.
- **The marketplace.** Loads, bids, awards and matching. The ranking engines
  exist in `packages/domain`; nothing here surfaces them.
- **Realtime.** The shipper map polls. WebSocket fan-out from a position cache
  is in the backend spec and is not here.
- **Bulk ingest.** Samples insert row by row through EF Core. The spec's Redis
  buffer and bulk `COPY` matter at roughly 850,000 samples a day; at pilot
  volume they would be a premature complication.
