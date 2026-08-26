# Journal

What we did, and what surprised us. One entry per working session, newest
first. The surprises are the point — a journal of what went to plan is a
changelog with worse formatting.

---

## 2026-08-27 — The API client, a round trip that holds both wire formats to each other, and a persisted appearance

**Did.** Wrote the app's API client — a sealed result rather than exceptions,
because a driver offline for hours is a normal condition and not an error path.
Added `make round-trip`, which drives the running server through that client
and demands the two agree. Persisted the appearance preference. Started on
Android.

### What surprised us

**The round trip found nothing, and that is the point of having written it.**
Parity fixtures hold the two *domains* to the same answers; nothing was holding
the two *serialisers* to each other, and the last time these two spoke
different spellings of the same instant it took a fixture comparing refusal
wording character-for-character to notice. The check now runs the same position
fixes through the TypeScript domain and the C# server and compares: same fixes
kept and dropped, same distance to the metre, same observation.

**Node's type-stripping cannot erase a TypeScript parameter property.** The
client used constructor shorthand, which the round-trip script could not load —
stripping can delete a type but not *emit* an assignment. Anything in this
repository a script might import has to stay strip-compatible, which is a
constraint worth knowing before it is discovered at the point of use.

**React Native 0.87 generates a `compileSdkVersion` that does not exist.**
Build-tools 37 is published; the platform `android-37` is not, so `sdkmanager`
answers "Failed to find package" and Gradle answers "Failed to find target with
hash string 'android-37'" — which reads like a broken SDK install. Grid lost an
afternoon to the same message inside a Docker build. Pinned to 36, with the
reason written next to it in `build.gradle`.

**pnpm and Jest each ate a round on packaging, not on code.** `async-storage`
ships untranspiled ESM, so every test that touched the theme died on "Cannot
use import statement outside a module" pointing at a file nobody here wrote.

**The appearance preference was verified by killing the app.** Set dark,
terminate, relaunch — still dark. That is a thirty-second check and the only
kind that actually proves persistence.



## 2026-08-26 (evening) — Screens, and what looking at them found

**Did.** Built the React Native app: RN 0.87 on the New Architecture,
TypeScript under the same strict settings as the domain, consuming
`@backhaul/domain` directly. Three faces — the shipper's list and trip screen,
the carrier's ranked return loads, and the driver's one-screen-one-action face.
Design tokens, an icon set, an elevation scale, light and dark with a switcher.
ADR-0006 and ADR-0007. Eleven screenshots in the README, all taken from a
running app.

### What surprised us

**Almost every defect this session came from looking, not from testing.** The
suite was green throughout. What was wrong:

- The driver screen offered **"signal lost" and "stalled" as buttons** — asking
  a driver to self-report the thing the tracking exists to detect. That is a
  domain fact, not a UI slip, so `isSystemRaised` now lives in
  `packages/domain`, is mirrored in C#, and is in the parity fixtures.
- The trip history read **"signal lost · driver"**. Same root cause, one layer
  down: the demo attributed every event to the driver.
- The corridor reported **"33 stretches with no signal"** on a trip with one.
  The view was honest; the demo's fix cadence was two hours apart, which the
  tracking policy would never produce. The test that should have caught it
  asserted `toBeGreaterThan(0)` — true, and useless.
- Indicative prices were quoted as **"₦1,861,487 – ₦2,678,725"**. Every digit
  after the first three is precision the estimate does not have.
- **"Checking your position every 1 minutes."**
- **"Recording starts when you begin loading"** on a trip that had arrived.
- Content scrolled under the status bar with nothing behind it, so **"Agreed
  fare" printed through the clock**.
- A Swagger annotation said 200 where the endpoint returned 201.

**The first UI was flat, and the reason was structural.** Every screen built
its own `View` with the same padding, radius and hairline border inline — so
every card looked identical, nothing led the eye, and there were no icons at
all. One `Card` with three emphasis levels, one `Icon` set on a 24×24 grid at a
single stroke width, and an elevation scale with a separate dark form (a shadow
does nothing on a near-black background) fixed more than any amount of colour
adjustment would have.

**The generic design-system recommendation was wrong and worth ignoring.**
Asked for a dark, data-dense logistics product, the tool proposed Orbitron and
JetBrains Mono — a cyberpunk HUD. A driver in a cab and a shipper checking
cargo need neither. The structural advice (elevation, status colour, one
primary per screen) was good; the typography was not, and `DESIGN.md`'s palette
was already reasoned from the product.

**Accessibility text scaling broke exactly as it did on Grid.** At the largest
size the tab bar's three labels wrapped into each other and "Driver" ran off
the right edge, and the headline filled the entire display. Display type is now
capped and body text still scales without limit — body is what a low-vision
user actually needs bigger. The screenshot is in the README rather than a claim
that it works.

**The documentation gate timed out.** Its orphaned-screenshot check greps the
tree for each filename; the tree now contains `node_modules`, `Pods` and two
build directories. It searches `git ls-files` now — faster, and more correct,
because an untracked copy of a document is not documentation.

**pnpm 11 moved two settings and said nothing useful.** `node-linker` in
`.npmrc` is silently ignored; `onlyBuiltDependencies` in `package.json` is
silently ignored. Both live in `pnpm-workspace.yaml` now, which cost an hour of
Metro failing to resolve a workspace package.

### Still open

- **Android.** iOS only so far. The definition of done requires a physical
  Transsion handset.
- **No auth**, still, and it gates the phase 2 pilot.
- The theme preference does not survive a restart.
- The corridor is not a map, deliberately, and phase 2's gate is where that
  gets revisited.

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
