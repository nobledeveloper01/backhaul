# Journal

What we did, and what surprised us. One entry per working session, newest
first. The surprises are the point — a journal of what went to plan is a
changelog with worse formatting.

---

## 2026-08-26 (later) — The server, chosen three times

**Did.** Built the API: ASP.NET Core on .NET 9, EF Core against PostgreSQL,
Swagger generated from the controllers' own XML comments. Trips, the ingest
path, cleaned tracks, pricing and settlement. 106 parity cases and 16 endpoint
tests, all green. ADR-0005. Docker build and a compose file with real Postgres.

Verified against a real database rather than asserted: an acknowledged batch,
its trip and its history survive a process restart, and replaying that batch
afterwards returns the original outcome and writes nothing.

### What surprised us

**The stack was chosen, reversed, and chosen again — and the reversal was the
useful part.** .NET went in first. Then NestJS, because the technical design
picked Node for one stated reason: the server could import `packages/domain`
and run the trip machine, ETA and match ranking *identically* to the device.
NestJS delivered that, end to end, and it worked. Then back to .NET.

Having built both is what makes the trade legible instead of theoretical. The
Node server had one implementation of every rule. The .NET server has two, and
the whole question is whether the second one can be made to fail loudly rather
than drift quietly. ADR-0005 is that argument, and the parity fixtures are the
answer.

**The parity suite earned its keep on its first run.** The refusal message for
a back-dated event embeds a timestamp. TypeScript's `toISOString()` writes
`2026-03-04T06:20:00.000Z`. .NET's round-trip `"O"` format writes
`2026-03-04T06:20:00.0000000+00:00`. Both parse. Both are ISO 8601. Nothing
would ever have failed — a driver would just have seen a subtly different
sentence depending on which system answered. It was caught because the fixture
compares the wording character for character, which felt excessive when it was
written.

The same bug was then sitting in every response body: `+00:00` from the JSON
serialiser, `Z` from the domain's own messages. **Found by reading a response,
not by a test** — the same way Grid's allocation bug surfaced. `IsoUtcConverter`
fixes it and a test now pins it.

**A Swagger annotation was lying, and only calling the endpoint revealed it.**
In the NestJS build, `POST /trips/:id/events` was documented as returning 200
and actually returned Nest's default 201. Nothing was broken; the generated
contract was simply wrong about the API it described, which is worse than no
contract because it is trusted.

**Every NuGet package resolved to the .NET 10 line** against `net9.0` projects
and failed to restore — five projects, five failures, one confusing message
each. `Directory.Packages.props` now pins centrally, so there is one place to
move rather than five that can disagree.

**zsh does not word-split unquoted parameters.** A test loop that worked out to
`set -- $triple` passed each whole triple as a single argument, so three trip
events silently did nothing and the next request failed with an unrelated 422.
Two minutes of confusion about the API, none of which was the API's fault.

### Still open

- **No auth.** Anyone who knows a trip id can post positions to it. This gates
  phase 2's pilot, and it has no phase of its own in the roadmap — it needs
  one.
- Samples insert row by row through EF Core. The backend spec's Redis buffer
  and bulk `COPY` matter at ~850,000 samples a day; at pilot volume they would
  be a premature complication.
- PostGIS is in the compose image and nothing uses it. The first geometry
  column arrives with load search, in phase 5.
- Still no screens. Nothing in this product has been looked at by a person.

---

## 2026-08-26 — The domain, before any screen

**Did.** Stood up the monorepo (pnpm workspaces, Turborepo, TypeScript strict
with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`) and wrote
`packages/domain` end to end: the trip state machine, position cleaning, the
tracking policy, money, pricing and settlement, the ETA model, and the matching
engine. 136 tests, all green. ADRs 0001–0004. The purity boundary is a lint
rule and `scripts/boundary-check.sh` proves the rule still fires.

Engines before screens, deliberately, and further ahead of the roadmap than it
looks: the trip machine belongs to phase 2 and the matching engine to phase 5,
but both are pure arithmetic that can be written and tested now, without a
device, and having them settled makes the app layer thin.

### What surprised us

**The pricing model was wrong, and only a real route showed it.** Rates were
per tonne-kilometre — how freight is costed in most of the world, and not how
anybody in Nigerian haulage talks. The arithmetic was clean, the tests were
green, and it quoted **₦398,400 for a Lagos–Kano trailer run** that goes for
something over two million naira. Nothing in the code looked wrong. What caught
it was a test that asserted a range a haulier would recognise, against a real
830 km corridor, rather than a range the formula would produce. Rewritten to
price the truck against the road, with tonnage deciding only which truck.

**Bid ranking handed every load to the cheapest bidder.** Price was scored by
position within the spread of bids received. With two bids of ₦1,800,000 and
₦2,000,000, the dearer one scored *zero* on price — as though it were
infinitely expensive — because it happened to be the top of a two-bid range.
So a carrier with 2 on-time trips out of 6 beat one with 39 out of 40, which is
the exact failure the ranking exists to prevent. Now a proportional premium
over the cheapest bid, which keeps what the spread version was reaching for —
₦50,000 apart is a lot on a city run and nothing on a Kano haul — without
letting the sample size set the sensitivity.

**A dropped position fix used to take the rest of the leg with it.** The
cleaner rejected a cell-tower fix that snapped 800 km across the country, then
compared the *next* good fix against the bad one, decided that was an
implausible jump too, and kept going. One bad reading could eat an entire leg.
A rejected fix is no longer used as the baseline for the next.

**Banning the `Date` global was too blunt.** The rule that stops an engine
reading the clock also caught `new Date(now.getTime() + ms)` — which is
literally how you project an arrival. Narrowed to the two shapes that actually
read the clock: argless `new Date()` and `Date.now()`.

**A parked truck can drift into movement.** Two fixes of a stationary truck,
each accurate to ±90 m, can sit 180 m apart. Counted as travel, an overnight
stop invents kilometres onto a per-kilometre rate. Movement now has to clear
the combined uncertainty of both fixes before it counts as movement at all.

### Still open

- The ETA model here is the **fallback tier only**. The technical design calls
  for corridor segmentation with empirical transit-time distributions from
  Backhaul's own completed trips. There are no completed trips yet, so building
  that now would be a model fitted to nothing. Tracked in the backlog.
- The escalation of a stall to a shipper alert is defined but not wired to
  anything, because there is no notification layer yet.
- No screens. Nothing here has been looked at, and Grid's clearest lesson is
  that the worst defects are invisible to a green test suite and surface only
  from looking at rendered output.
