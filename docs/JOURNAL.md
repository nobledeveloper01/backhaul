# Journal

What we did, and what surprised us. One entry per working session, newest
first. The surprises are the point — a journal of what went to plan is a
changelog with worse formatting.

---

## 2026-08-29 (night) — Records, and the third state that had to survive storage

**Did.** `ratings.ts` mirrored, six parity cases, a `ReviewEntity`, and two
routes: leave a review of a trip, and read somebody's record. 127 parity cases,
140 endpoint tests.

### What surprised us

**A boolean column per claim would have destroyed the feature.** The engine's
whole point is that an answer has three states — yes, no, and *not asked* —
because a shipper who never needed to phone the driver has not said the driver
was unreachable. A nullable boolean would work; four of them is four columns
that have to be kept in step with an enum. The row stores two comma-separated
lists instead, one of claims answered yes and one of claims answered no, and
anything in neither list was never asked. The test that matters asserts a
`(0, 0)` tally for the question that was skipped.

**A review hangs off the proof, not the state.** `delivered` is a claim
somebody made through the trip machine; the sealed proof of delivery is
evidence. Reviews are gated on the second, and a trip whose proof is still a
draft gets "there is nothing to review yet" rather than a 404 — the same
distinction the escrow milestones make, arrived at independently.

**A record is deliberately not principal-filtered.** Every other read in this
server composes a `Principal` into the query. This one does not, and the
repository says why in its own documentation: a record exists so a *stranger*
can decide whether to trade with somebody, and one only its subject can read is
not a record. What is filtered is the content — counts and questions, never
trip ids or note authors.

## 2026-08-29 (evening) — Deviation, and a rename that went too far

**Did.** `deviation.ts` mirrored, six parity cases and a route. 125 parity
cases, 133 endpoint tests.

The parity cases are named after the arguments the engine had with itself:
"three fixes is a coverage gap, not a course", "closed then turned". The second
is the one worth keeping — a truck that closed on the destination and then
turned around has deviated by the amount it has given back, and measuring from
the window's first fix would let the turn hide behind the progress before it.

### What surprised us

**A record name collided across two fixture groups, and the fix collided
wider.** `FixRow` already existed for the tracking fixtures. Renaming the new
one with a blind string replace changed all four declarations, including three
that were fine — and the compiler caught it immediately, which is the only
reason it is a footnote rather than an afternoon. Substituting on a type name
is a search-and-replace that wants a line number, not a pattern.

**The destination is a waypoint, not a field on the trip.** A trip carries
`Origin` and `Destination` as *names* — "Lagos", "Kano" — because that is what
a share page renders. There is no coordinate anywhere on the trip row, so the
deviation route reads the declared route and takes the last waypoint marked as
the destination. With no route it says there is nothing to be off, which is a
better answer than inventing a coordinate from a place name.

## 2026-08-29 (later) — The pack, served

**Did.** `dispute.ts` has a C# mirror, five parity cases and a route. The
repository reads six tables and turns each row into one piece of evidence;
`Dispute.Assemble` orders them and weighs them; nothing anywhere summarises or
judges. 124 parity cases, 128 endpoint tests.

The parity cases are written from the bug rather than from the specification:
"a continuously covered trip has no holes in it", "a signal-loss event does not
start the clock". Both of those were found by reading a rendered pack, and a
case named after the failure is a case somebody will not delete by accident.

### What surprised us

**Positions are the only row that is not one row per item.** A Lagos–Kano trip
is a couple of thousand fixes, and a pack with two thousand lines is a pack
nobody reads. Consecutive fixes are collapsed into runs — and the run has to
break at the same threshold the tracker uses to call a trip silent, or the
pack's idea of a gap and the tracker's would be two different numbers on the
same screen. `Tracker.SignalLostAfter` is the number in both places.

**`budget.ts` is on the list of engines with no route and should stay there.**
It answers "what is this tracking costing me in data", which is a question
about the phone in the driver's hand: the server does not know their tariff and
has no business guessing at it. That is now written into the roadmap as a
decision rather than sitting there looking like a gap.

## 2026-08-29 — Chains, shared trailers, and a database everybody was sharing

**Did.** `chaining.ts` and `consolidation.ts` have C# mirrors, parity cases and
routes: the best three-leg chain from a load and what is on the board, the
loads that could not join with the reason, and every pair of part-loads that
could share one truck. 123 parity cases, 122 endpoint tests.

### What surprised us

**Every `ApiFactory` in the process was talking to the same database.** EF's
in-memory provider keys a store by its *name*, and the name was the constant
`"backhaul"` — so booting a second application to get a clean load board gave
back the first one's loads. The chain test failed with two legs it had never
posted, from a test that had run before it.

That was two bugs wearing one coat. The obvious one is the test. The one worth
writing down is that the store's identity was a hard-coded string in
`AddBackhaulPersistence`, which made isolation impossible rather than merely
inconvenient; it is a parameter now, `ApiFactory` exposes it, and the three
tests whose subject is *a ranking over everything on the board* each ask for a
name of their own. Everything else keeps the cheap shared one — a fresh
database per test costs a boot each, and most tests do not care.

**A test that passes alone and fails in its class has not been fixed by being
run alone.** The first attempt scoped the assertions to the ids the test
posted, which is the right move for a *board listing* and the wrong one for a
*chain*: the chain's whole job is to pick from everything available, so
constraining what it may return would have tested a different function. The
isolation had to be real.

**`PairLoad` needed a field neither route uses yet.** `search.ts` filters loads
by the shipper's trust tier, and `LoadSummary` — which `PairLoad` extends —
carries `shipperTier`. Rather than drop it from the mirror, both sides name it
and the controller passes a constant with a comment saying which route will
fill it in. The two shapes stay identical, so the day tier filtering lands it
is a one-line change rather than a schema argument.

## 2026-08-28 (late) — The board, and an integer division that changed the winner

**Did.** `matching.ts` has a C# mirror, parity cases and a route. A shipper
posts a load; a carrier sees the board ranked for their own truck and places
one offer; the shipper sees the offers ranked with the price and the record
side by side and accepts one. Two new tables — `LoadEntity` and `BidEntity` —
and ten endpoint tests around who may read what.

### What surprised us

**`long / 1000` is integer division, and it changed which bid won.** The
proximity term in `rankBids` divides metres by a thousand to get kilometres.
`Geo.Distance` returns `long`, `1000` is an `int`, and C# quietly truncated the
result to whole kilometres before it ever became a double — so a bid 119.4 km
from the pickup scored as though it were 119, and the second and third bids
swapped places. The parity fixtures caught it on the first run, which is the
entire argument for generating the expected order from TypeScript rather than
writing it out by hand.

**Every rounded figure in this engine ends up inside a sentence.** "1 km
further from base" against "2 km" is a parity failure, not a display detail,
because the sentence is asserted character for character. `Math.Round` with
away-from-zero disagrees with JavaScript on a negative half and `progressHome`
is negative for exactly the loads that go the wrong way — so the mirror has its
own `Round` that floors `x + 0.5`, with a comment saying which rule it is
copying and why.

**The board is the one table read by people it does not belong to, and saying
so was the design work.** ADR-0008 says every repository method composes a
principal into the query. A load board that only shows a carrier their own
loads is not a load board, so `BoardAsync` filters on *what is on offer* —
open, unexpired, unawarded — and the exception is written into the repository's
own documentation rather than left for somebody to notice. Writes are
principal-filtered as usual, and bids on a load are readable only by the
shipper who posted it: a carrier who could read the other bids would know
exactly what to undercut, which is the failure the ranking exists to prevent.

**A shared in-memory store makes an order-dependent test look like a passing
one.** Two of the board tests asserted on the whole board, which happens to be
right when they run first. Both now filter to the loads they posted. This repo
has been bitten by the same shape once already, in the rate-limit tests.

## 2026-08-28 (night) — Four engines get a route, and one of them argued

**Did.** Escrow, cancellation, the cost model and driver statements now have
somewhere to put their answer. Each got a C# mirror, parity cases in
`fixtures/parity.json` before the endpoint existed, and then the endpoint —
`GET /v1/trips/{id}/escrow`, `GET …/cancellation?by=`, `GET …/costs`, and
`GET /v1/me/earnings`. 119 parity cases and 107 endpoint tests, both green.

The one new table is `TripTermsEntity`: a trip had a driver, a carrier, a
shipper and a corridor, and nothing about what it was worth. It is optional,
and that is the point — a trip that is tracked and not traded is the wedge
working, so every money route answers that case with a sentence.

### What surprised us

**The second milestone was reading the wrong evidence, and a test caught it
before a carrier did.** The condition is "moving with positions arriving for
six hours", and the first implementation summed time spent in the `in_transit`,
`signal_lost` and `stalled` states. Two things wrong with that. An open stretch
was measured to the *last event* rather than to now, so a truck currently in
transit showed zero moving time forever and the milestone could never release
while the trip was running. And `signal_lost` is precisely the state where
positions are *not* arriving — counting it would have paid a carrier for the
stretch a shipper disputes.

It now sums the intervals between actual position samples, skipping any gap
longer than `Tracker.SignalLostAfter`. Same threshold the tracker uses to call
a trip silent, so there is one number and not two.

**A `Func` in a LINQ query is a runtime failure, not a compile error.** The
controller had its own `Owned(trip)` helper composed into `db.Trips.Any(...)`,
which EF cannot translate and reported as an exception on the first request.
The fix was not to inline the predicate: it was to move the write into the
repository, where ADR-0008 says the principal filter lives. A controller that
builds its own authorisation filter is a controller somebody will copy and get
slightly wrong.

**JavaScript and .NET disagree about rounding a negative half.**
`Math.round(-2.5)` is -2; `Math.Round(-2.5, AwayFromZero)` is -3. It does not
currently fire in `Advise` — the loss case returns before that line — but the
parity assertion on a loss-making offer would have been a coin flip, so it now
rounds the way the fixture generator did. Written down in both places rather
than fixed silently.

**`make server-run` was never listening where the repo said it was.**
`round-trip` says "expects a server on :5111" and `DEFAULT_BASE_URL` in the
mobile client agrees, but the target inherited 5063 from `launchSettings.json`
— so following the instruction produced a connection refused and no hint as to
why. The port is named in the Makefile now.

## 2026-08-28 (evening) — Four languages, and the helper that could not be told

**Did.** Hausa, Yorùbá, Igbo and English across the whole app, asked at the
first screen and saved on the phone. `packages/domain/src/language.ts` holds
four full tables grouped by screen; fifteen tests hold them to the same keys,
to no empty strings, to nothing that is an untranslated copy of the English,
and to keeping the letters that are letters — `ɓɗƙ` in Hausa, `ẹọṣ` in Yorùbá,
`ịọụ` in Igbo. A `LanguageScreen` renders before sign-in and again from the
driver screen, so the one place to change it is the place somebody would look.

Also: the dev server now binds `:5111`, which is where `round-trip` and the
mobile client's `DEFAULT_BASE_URL` have always said it would be. It was
listening on 5063 from `launchSettings.json`, so following the instruction in
the `round-trip` target produced a connection refused and no hint as to why.

### What surprised us

**Three defects that only a rendered screen could show.** The suite was green
throughout, as it has been for every one of these.

*The sign-in screen printed a JavaScript error at a driver.* With no server
reachable, the refusal panel rendered `error.message` — "Network request
failed" — in English, under four lines of Yorùbá. Everywhere else the server's
own sentence is shown verbatim and that is right, because it knows things the
screen does not and the parity fixtures hold both sides to the same words. But
when the request never arrives there is no server and no sentence, and the
client was filling the hole with a string written for whoever wrote the fetch
call. The kind is now the fact and the screen writes the words.

*The language screen wrote English to somebody who had not chosen it yet.* The
footer said "You can change this later" under four rows that had each just gone
to the trouble of asking in their own language — because at first launch there
is no answer to "which language", and the fallback was English. It is now shown
only when reached from settings, where the language is known. Every row already
carries its own question, which is the whole job of that screen.

*"45 min ago" survived under a fully translated card.* `humanDuration` was a
plain function, and a plain function cannot see a React context, so nothing
stopped a screen from rendering an age it had never asked the language of. It
now takes the reader's words as an argument. The compiler found twenty-five
call sites across eight files in one pass, which is the entire argument for
making it impossible rather than remembering.

**Word order is the constraint, not vocabulary.** "Another code in 55s", "1 of
3 need a look", "No signal for 45 min" and "Arrived 20 min ago · stayed 3 h"
all put a number in the middle of a sentence, and the middle is somewhere
different in each of these four languages. Writing the count first and the
phrase after it — `45 ìṣẹ́jú sẹ́yìn`, `1/3 · nílò àyẹ̀wò` — gives each language
a sentence that is its own rather than English with the words swapped. The
phrase tables are tested to contain no `{}`, no `%s` and no `${` for that
reason: a hole in a phrase is an assumption about grammar that only holds in
the language it was written in.

**Every unit is abbreviated now, English included.** "1 h" rather than "1 hour".
That drops English's plural, which is a small loss, and drops the question of
how to pluralise in three languages that do not do it by suffix, which is not.

## 2026-08-28 (later) — The capture loop, and a way in

**Did.** The two things the roadmap said were missing and that nothing else
could substitute for.

**The native tracking loop**, as `packages/tracking-native`: an Android
foreground service writing to a SQLite queue, with a boot receiver and
OEM-restriction reporting; iOS background location writing to the same schema
through the same contract. Both compile, both autolink, and both are driven by
the policy in `@backhaul/domain` — the native side captures, stores and deletes
what it is told to delete, and decides nothing.

**Sign-in**, phone number and a six-digit code: `otp.ts` for the policy,
mirrored in C# and held to it by the parity fixtures, wording included;
`/v1/auth/request` and `/v1/auth/verify`; a session provider and a sign-in
screen the app is now gated behind.

### What surprised us

**The library had to be a package, not files in the app.** The first instinct
was a `.mm` beside `AppDelegate.swift` and a Kotlin file beside
`MainApplication.kt` — and both would have meant hand-editing
`project.pbxproj` and the app's `build.gradle` to add a source file, plus a
linker flag for `sqlite3` buried where nobody finds it when somebody else's
build breaks. Autolinking finds a library by its podspec and its Gradle module.
Everything about the layout follows from that.

**`s.platforms = { :ios => "16.0" }` failed `pod install` with a sentence about
CocoaPods.** *"Specs satisfying the dependency were found, but they required a
higher minimum deployment target."* React Native pins the app at 15.1; a
library that raises it reads as a CocoaPods problem rather than as a line in
its own podspec. `min_supported_versions` is the answer and it takes ten
minutes to find.

**`LocationManager`, not the fused provider.** The Android instinct is Play
Services. Many Transsion handsets — the ones that dominate the driver segment
this product is *for* — ship without Play Services at all, and a tracking
product that silently records nothing on those phones is worse than one that
never claimed to.

**`pausesLocationUpdatesAutomatically` is the iOS equivalent, and it is on by
default.** iOS pauses location updates when it decides the device is
stationary. A stationary truck's *duration* is what a demurrage claim is made
of. One property, and leaving it alone would have quietly broken the feature
the product bills for.

**A consumed sign-in code was still blocking the next one.** The sixty-second
resend cooldown read the newest challenge whether or not it had been used — so
a number that had recently signed in answered `429` where one that never had
answered `200`. That is a difference an outsider can measure, and it fell out
of a test that was trying to assert something else entirely. The cooldown now
applies only to an *outstanding* code.

**Two tests that fought a rate limit rather than testing anything.** Every test
in the API suite shares one client address, so the real limits — sixty share
requests an hour, twenty sign-ins — were spent by the fifteenth test and
everything after it failed at a distance with a `429` about nothing. The shared
factory raises them and says why; that the limits *work* is proven by a factory
of its own that sets them low enough to reach on purpose.

**The logging SMS sender is a hole, so the process refuses to open it.** It
writes sign-in codes to the log, which is right for a development store and
means anybody who can read the logs can sign in as anybody. `Program.cs` now
exits with a critical log line if a database is configured and no gateway is.

**The route is the one thing on a trip that is replaced rather than appended
to.** Everything else here follows ADR-0003 — a correction is a new row and the
original survives. A route is a *plan*, though: it changes when a shipper adds
a drop, and versioning a plan means every screen choosing which version it
meant. What is evidence is where the truck actually went, and that lives in the
position table where nothing is ever replaced. Written down in the repository
rather than left to be inferred.

**Visits are computed, never stored.** A stored visit is a stored *opinion*
about a track. Recomputing means a corrected fix corrects the demurrage with
it — and it is why the parity fixtures now cover five tracks' worth of visits
to the millisecond.

**Two endpoint tests read as "the visits engine is broken".** They sent
positions to a trip that was still `open`, and the ingest endpoint rightly
refuses: there is no off-trip tracking and the server enforces it rather than
trusting the client. The failure surfaced as an empty visit list, which is the
symptom of a completely different bug.

**A delivery is the one record that is neither append-only nor replaceable.**
A driver adds a photograph, then a signature, then a name, over a few minutes
at a gate — versioning that produces four "deliveries" for one handover, and
refusing to let it change means the first photograph locks the record. The
answer is a **draft with a one-way door**: it moves freely until `seal`, and
never afterwards. Written down because it is the only place in the product that
works that way.

**Drops refuse reordering once one is signed for, and the route does not.**
Both are plans. The difference is that a half-unloaded trailer is a physical
fact — the last drop is at the front of the box — so reordering it is not a
plan change, it is a mistake.

**Flooring a negative overstated how long ago a paper lapsed.** Both sides
computed days as `floor((expiry − now) / a day)`, which is right for a date in
the future — 18.9 days left is "18 days left", the conservative way round — and
wrong for one in the past: a certificate that expired nine days and one second
ago floored to −10, and the screen said *"10 days out of date"*. Truncating
toward zero is right at both ends. Found by an endpoint test that pinned the
exact number and disagreed with itself by a millisecond.

**A duress endpoint that answers with a body is a duress endpoint with a
tell.** `204`, empty, whether or not anything was recorded — because a response
is a thing a screen can render, and the whole feature is that there is nothing
to render. The test asserts the body is zero bytes.

### Still open

- **Neither native implementation has run on a physical handset.** Phase 1's
  gates 2 and 3 — under 4% battery per hour, a 72-hour soak — are unchanged and
  unmovable without a device, ideally a Tecno or an Infinix.
- **No SMS gateway.** `ISmsSender` is the seam; Termii and Africa's Talking are
  the Nigerian options, and picking one is a contract rather than a commit.
- **The app is gated behind sign-in but still renders the demo.** Signing in is
  real; what it unlocks is the walkthrough. Replacing that is endpoint by
  endpoint, and 26 of the 30 features still have no server route.

---

## 2026-08-28 — Fifteen screens for the fifteen, and a pack that invented holes

**Did.** Surfaces for the second fifteen: trucks and papers, what reaches your
phone, the dispute pack, cancellation terms, drops, the checkpoint ledger, your
lanes, sharing a trailer — plus deviation and payment milestones on the trip,
the data cost and Hausa on the driver's screen, and the earnings statement on
their history.

### What surprised us

**The dispute pack reported fifty-one hours of missing evidence on a trip with
continuous coverage.** It was assembled from every twentieth position fix, so
consecutive items sat hours apart and the gap finder — which measured from one
item's instant to the next — read each of those as a hole. The pack said the
opposite of what the record held, on the one screen whose entire job is to be
trusted in an argument.

Three fixes, each found by looking at the render again:

1. **A run of fixes is an interval, not an instant.** `Evidence.until` now
   exists and the gap finder measures from where coverage *ended*. 51 hours
   became 35.
2. **A gap before the tracker started is not a gap.** A trip is open for a day
   before a truck loads — bids, messages, nothing moving. Counting that as
   missing evidence tells a shipper the record has holes when what it has is a
   beginning. 35 hours became 16.
3. **A `signal_lost` event is measured but is not coverage.** Bounding the
   window by "measured" items started the clock at the first signal loss,
   sixteen hours before any position existed. 16 hours became none — which is
   correct: the demo trip's real gap is two hours, under the three-hour
   threshold.

**And then `isThin` was measuring the wrong thing.** Once positions were
assembled into runs, a well-covered trip had *fewer* items than a badly covered
one, so counting items called two unbroken runs "not much here". It now
measures **covered time**, which is what the question was always about.

**`Press` swallowed layout styles — again, in a new way.** Last session's fix
lifted flex and width onto the `Pressable`. This session found the same class
of bug in the *content*: driver-face buttons truncating to "Ba da rahoton m…"
and "Police check…" because a single line was assumed. Hausa is longer than
English and "Police checkpoint" is longer than "Union".

**A summary that disagreed with the screen it opened.** The fleet entry said
"One truck cannot take work"; the screen it led to said two of four. It was
written by hand rather than counted.

**Two lanes, two filled buttons, and the wrong one leading.** The lanes screen
filtered rather than using `due()`, so "due tomorrow" sat above "five days
overdue" — and both had a primary button, which is a screen with none.

**"at most once every 0 h"** beside the duress alarm, whose repeat window is
five minutes. Everything was being rounded to hours.

**Hausa was a token gesture until it covered the tracking card.** The first
pass translated the buttons and left "Recording your location", "Signal is
good" and the battery sentence in English — which is to say, it translated
everything except the three lines a driver actually reads. The phrase table
grew by six; the carrier's *name* is deliberately dropped from the Hausa
sentence rather than interpolated, because word order differs and a template
with a hole in it assumes it does not.

**A language chosen on one screen is not a language.** The picker was state
inside `DriverScreen`, so a driver who chose Hausa saw Hausa there and English
the moment they opened the checkpoint ledger — the app agreeing to speak
somebody's language and then not doing it. It is a provider now, persisted like
the theme, because a language is a property of the person rather than of a
screen.

### Still open

- **The data-cost sentence is English only.** `describeCost` builds it in the
  domain and there is no Hausa for it. Half-translating it would be worse than
  leaving it, and doing it properly means the phrase table learning about
  numbers, which is the thing `language.ts` deliberately refuses.
- The two overlines on the driver screen — "YOUR TRIP", "BATTERY" — are still
  English. Small, and the test that caps the phrase table at 25 is doing its
  job of making that a decision rather than a drift.
- Nobody who speaks Hausa has read any of it.

---

## 2026-08-27 (very late) — Fifteen more, and three that argued back

**Did.** Fifteen further features, phased across 2–6 in
`docs/ROADMAP.md` (*The fifteen after that*). Twelve new engines: `deviation`,
`alerts`, `budget`, `vehicles`, `duress`, `cancellation`, `dispute`, `drops`,
`levies`, `escrow`, `costs`, `consolidation`, plus `language`, `earnings` and
`lanes`. The domain went from 317 tests to 526.

Also [ADR-0011](adr/0011-the-domain-is-one-flat-namespace-and-names-must-earn-it.md),
which the last session said would be written *"if it happens again"*. It
happened twice more.

### What surprised us

**The obvious implementation of deviation is wrong, and would have shipped.**
Cross-track distance from a line between origin and destination: draw the line,
measure how far the truck is from it, alarm past a threshold. The straight line
from Lagos to Kano runs through Kwara farmland — the road goes Ibadan, Ilorin,
Jebba, Mokwa, Tegina, Kaduna, and is up to 90 km off that line for hours at a
time. **The alarm would fire on every trip that went the right way.**

`deviation.ts` measures progress instead: distance-to-destination against the
smallest it has been in the last ninety minutes. That is true whatever road the
truck is on. It also has to measure from the *closest* point rather than the
window's first fix, or a turn hides behind whatever progress preceded it.

**Writing the data-cost engine disproved the feature.** The premise was that
drivers force-quit trackers because they eat data, so the app should show the
cost. The arithmetic says a day of tracking is **about fifteen kobo** — 1,440
samples at 180 bytes, plus batch overhead, at ₦350 a gigabyte. A three-day
Lagos–Kano run costs under a naira.

So the feature is not a warning, it is an answer: the number is on the driver's
screen because it is *reassuring*, and `worthMentioning` is a guard that never
fires today and starts firing if the payload or the price moves by an order of
magnitude. What it settled is that **battery, not data, is the price a driver
pays** — which is where `tracking.ts` was already spending its care.

**A duress alarm's success state is nothing at all.** No toast, no changed
screen, no sound, no haptic. Whoever is standing over the driver must not be
able to tell it happened, so `visibleConfirmation()` returns `null` — a
function whose only job is to make that testable and impossible for a screen to
disagree with while somebody makes an empty state friendlier.

The same reasoning ran through the rest of it: the follow window overrides the
battery policy (conserving battery to finish a trip assumes the trip is still
happening); nobody is dispatched automatically (a platform that dispatches a
response on a signal it cannot verify is a platform that gets used to dispatch
responses); and time alone never clears the signal.

**The cost model checks the pricing engine.** `costs.test.ts` asserts that
`quote()`'s own midpoint leaves a carrier a real margin on a Lagos–Kano round
trip *after* a full empty return leg. Two engines written weeks apart, one of
them from a mistake about tonne-kilometres, now hold each other to a number a
haulier would recognise.

**A paper lapsing mid-trip does not stop the truck.** The first version of
`vehicles.ts` had a `mustStop` that returned true for a lapsed certificate. It
does not make the cargo safer by the side of the road: it strands a driver 800
km from home for an administrative failure in an office. It now blocks the
*next* assignment, which is where the pressure belongs, and `mustStopMidTrip()`
returns `false` with the reasoning attached.

**Two more name collisions, one of them eleven minutes after the ADR.**
`Conditions` (escrow vs tracking) and `MINIMUM_TRIPS_FOR_RATE` (earnings vs
trust). Both generic enough that two engines wanted them; both caught by `tsc`
at the barrel in seconds. ADR-0011 keeps the flat namespace and writes down the
rule the five renames actually taught: *a name that could belong to any engine
belongs to none*.

### Still open

- **None of the fifteen has a screen yet.** Same position as last time and the
  same lesson: green tests say nothing about whether a feature is usable.
- `consolidation.ts` proposes pairs but nothing agrees them. Two shippers
  consenting to share a truck is a negotiation, and a negotiation needs a
  surface.
- The Hausa in `language.ts` is eighteen phrases written carefully and **read
  by nobody who speaks it**. It ships behind a review by somebody who does, and
  that is a person rather than a task.

---

## 2026-08-27 (late) — The one route with no token on it

**Did.** Served the share link. `GET /v1/share/{token}` is the first and only
unauthenticated route in the product, and everything about why — why the token
*is* the authorisation, why the scope is stored rather than requested, why
contact details and money are typed `false` rather than filtered — is in
[ADR-0010](adr/0010-a-share-link-is-a-capability-and-its-endpoint-is-public.md).

Issuing and revoking stay authenticated, behind the same filter that decides
who may read the trip. Eleven endpoint tests, and the round-trip script now
follows a real link over HTTP with no credentials at all.

Trips gained an origin and a destination on the way. The share page needed to
say what the trip *was*, and the server could not: it held three party ids, a
state machine and a pile of coordinates, and nothing that named a road.

### What surprised us

**This route bends ADR-0008 and had to say so.** That ADR returns 404 for an
unauthorised read, because the existence of a trip id is information and a 403
confirms it. A share token is 32 bytes of randomness, so anybody holding one
that parses already has the capability the answer would confirm — and telling
them *why* it stopped working is the difference between "your link ran out" and
"somebody cut you off", which are different phone calls to a haulier who did
nothing wrong. **410 for revoked and expired, 404 for a token nobody issued.**
Writing the ADR was what turned that from an inconsistency into a decision.

**There is now exactly one unfiltered path to a position row, and it takes a
`ResolvedShare` rather than a `Guid`.** A trip id on its own cannot open that
door; only something a share lookup produced can. Same for the corridor
lookup. It is a small thing and it is the difference between an exception and
a hole.

**A revoke that worked reported failure.** `204 No Content` has no body, and
`response.json()` on an empty one throws *"Unexpected end of JSON input"* — so
the client's one generic success path turned a successful revoke into an
`unreachable` failure. A successful call reporting failure is worse than the
reverse: the caller retries something that already happened, and here that
means telling somebody their link was turned off, twice. Caught by the
round-trip script, not by a unit test, because every unit test had a body.

**The refusal wording is now asserted character-for-character in three
places** — the domain's tests, the endpoint tests and the round trip. Copy is
a rule like any other, and a holder who reads one sentence in the app and a
different one on the web has found a seam.

**A value import broke CI where a type import never had.** The client's default
share window is `DEFAULT_SHARE_DAYS` from the domain — a policy belongs in one
place — and that made `client.ts` import a *value* for the first time. Node's
type stripping erases type imports and needs nothing; a value import resolves
to `packages/domain/dist/index.js`, which a clean checkout does not have. It
passed locally on a leftover `dist` and failed in CI, which is the correct way
round for that class of mistake to be found.

**Two tests that passed only in one order were one test.** The rate-limit
suite split the "a flood is refused" and "and the rest of the API still works"
claims into two `[Fact]`s sharing one application — and a fixed-window limiter
is per-application state, so whichever ran second found the budget spent. Merged
into one test that makes both claims in sequence.

### Still open

- **Rate limiting is now in place** — sixty an hour per address on the public
  route, and a test that proves it fires. What is *not* in place is anything in
  front of the process: behind a proxy, `RemoteIpAddress` is the proxy, and the
  partition collapses to one bucket for everybody. That is a deployment
  concern and it is not solved by this code.
- The mobile app's share screen still reads from `state/product.ts` rather
  than the API. Wiring it is a phase 2 task and needs auth on the device
  first.

---

## 2026-08-27 (night) — Fifteen screens, and what looking at them found

**Did.** Gave the fifteen features their surfaces: share links with scope,
expiry and revocation; the public follow page the wedge depends on; a trip
thread; waypoints and chargeable waiting on the trip; incident reporting at
driver size; proof of delivery and the delivery note; post-trip reviews;
verification and papers; load-board filters; and the three-leg chain proposal.

Replaced the navigation while doing it. `App` was a `face` plus one boolean per
screen — fine at four screens, a five-way `if` ladder at fifteen. It is now one
stack per face (`nav/stack.ts`), so switching tabs keeps your place and tapping
the tab you are on gets you out.

### What surprised us

**`Press` was silently swallowing every layout style it was given.** The
animation has to be on the view carrying the background and the border, or a
press scales the label and leaves the box behind — so the caller's `style` went
on a *child* of the `Pressable`. Which meant `flex: 1` landed one level too
deep: three buttons meant to share a row equally came out three different
widths, sized by how long each word was. Lifting the layout properties onto the
`Pressable` fixed it, and then broke it twice more:

- adding `flexGrow: 1` to the inner view so it would fill turned a small dashed
  pill into one the height of the screen;
- leaving `width: '48%'` in *both* places applied it twice — 48% of 48% — and a
  grid of six report buttons came out a fifth of the screen wide with every
  label truncated.

The working version destructures the layout props out of the style rather than
copying them. Three visual bugs from one component's contract being unstated;
it is now stated, in the file.

**"0.3 hours".** A twenty-minute stop at the depot, rendered by
`plural(ms / 3_600_000, 'hour')`. Nobody has ever said that out loud.
`humanDuration` existed and was not being used. It said it twice — once on the
waypoint row and once in the summary sentence under it.

**A sentence naming a place the truck had never been.** "waiting at the depot
and the market" was written flat, on a trip that had only reached the depot.
The screen was inventing evidence for a demurrage claim.

**"Due by 23:48; arriving between 03:08 and 03:08."** A truck flagged as late
while arriving, apparently, five hours early. Both times were right and both
were missing the day — the arrival was tomorrow. A bare clock is unambiguous
only within one day, and nothing on a Lagos–Kano run is. Times on the fleet
screen now carry today/tomorrow/the date, and a zero-width range says
"arriving 03:08" rather than "between 03:08 and 03:08".

**A cargo report that said nothing would change.** The incident screen
explained the severity and stopped there, so a cargo report — which puts the
trip under dispute — read as "recorded against the trip, nothing else changes".
Severity and dispute are two different answers and the screen was only giving
one.

**"open · driver".** A driver posting their own cargo. `walk()` attributed
every non-system event to the driver; shippers post loads and accept bids.

**"Tunde Adeyemi · Tunde Adeyemi".** An owner-driver is one person, and most of
this market is owner-drivers. Printing the name twice reads as a bug rather
than as a one-truck business.

**A chain proposal arguing against itself.** Rejected loads were compared with
the *last* leg of the chain, so a load in Kano the truck was standing next to
was refused with "841 km empty from Lagos to Kano" — the right arithmetic asked
at the wrong point. Each rejected load is now tested against every leg taken,
and says either which leg out-earned it or the shortest reposition that was
still too far.

**The 200% pass caught four things a test could not.** At the largest
accessibility size the header truncated "Lagos → Kano" to "Lagos →…", losing
the destination; the three trip actions became "Sh…", "M…", "Re…"; the corridor
labels broke "764 of 841 km" across three lines; and the search placeholder ran
off the edge. Capping growth on chrome — headers, axis labels, button labels —
and letting body text grow uncapped is the trade that keeps a screen both
scalable and legible.

**Two accent cards is no accent card.** The load board had an accent-washed
chain proposal directly above the accent-washed best-fit load. One primary per
screen is a rule that only bites when you add the second thing months later.

### Still open

- **A share link still has no server route.** `sharing.ts` decides what a
  holder may see and nothing serves it. The endpoint has to be
  unauthenticated by design, which makes it the most exposed surface in the
  product, and it should not be written casually.
- **The README screenshots predate all fifteen screens.** `make screenshots`
  regenerates them; the doc gate only blocks on *orphans*, so this is a warning
  nobody would hit.
- **None of this has been on an Android device**, let alone a Transsion one.
  Phase 1's two hardware gates are still the long pole.

---

## 2026-08-27 (later) — Fifteen more, phased before they were built

**Did.** Specified fifteen further features and then split them across four
phases before writing a line of screen code. Nine new domain engines, all pure
and all tested ahead of the surfaces that will use them: `sharing.ts` (scoped,
expiring, revocable tracking links), `waypoints.ts` (geofenced arrival and
chargeable waiting), `trust.ts` (verification tiers), `messages.ts` (a thread
attached to the trip), `incidents.ts` (reports from the road), `pod.ts` (proof
of delivery), `ratings.ts` (post-trip reviews), `search.ts` (trip and load
filtering) and `chaining.ts` (multi-leg return runs). The domain suite went from
177 tests to 317.

The phasing is in `docs/ROADMAP.md` under *The next fifteen*. Three features
moved **forward** — shareable links, reverse discovery and multi-leg chaining,
all previously parked in phases 6 and 7 — because each turned out to be
load-bearing for an earlier phase rather than a nicety on top of it. A wedge
with no shareable link has nobody to show the truck to.

### What surprised us

**A five-star rating would have been the wrong feature, and it took writing it
to see why.** The obvious build is stars and an average. But a 4.2 compresses
"arrived late twice" and "damaged the load" into the same number, and on a
two-sided market the average drifts upward until everyone is 4.8 and it carries
no information. `ratings.ts` asks four yes-or-no questions instead and reports
counts — "loaded on time: 9 of 11". The denominator is the part that matters,
and a percentage throws it away: *2 of 2* and *34 of 34* are the same fraction
and not the same evidence.

**A missing answer is not a no.** The first tally counted every unanswered
claim as a failure, which quietly punished a shipper for never having needed to
call the driver. Answers are now `Partial`, and `asked` is its own count.

**One incident should not end a career.** The first tier ladder zeroed a carrier
on any upheld incident. Somebody whose truck was robbed is not thereby
untrustworthy, and a system that treats one bad trip as terminal is one carriers
will lie to. An incident now drops exactly one tier, floored at unverified.

**Requiring a photograph of a hijack.** `needsPhoto` originally covered every
incident kind. Nobody photographs an armed robbery, so the effect would have
been that the report which matters most is the one that cannot be filed.
Security is exempt; cargo and accident are not.

**A departure measured to the last fix inside is a demurrage error.** Waiting
time at a depot is money. Measuring a visit from arrival to the *last fix
inside the fence* silently discards the gap between that fix and the first one
outside — up to a full sampling interval, and at the 15-minute stopped cadence
that is fifteen minutes of chargeable time per visit. Measured to the first fix
outside instead.

**Two more export collisions.** `Leg` was already taken by `utilisation.ts` and
`fits` by `pricing.ts`; `chaining.ts` claimed both. The barrel file caught it,
the same way it caught `CAPACITY` last time. Renamed to `ChainLeg` and
`canFollow`. Three collisions in one flat namespace is a pattern, not bad luck —
worth an ADR if it happens again.

**Node's type stripping cannot parse an apostrophe inside a single-quoted test
name.** `'never shows a state's underscore'` failed as
`ERR_INVALID_TYPESCRIPT_SYNTAX` — a message that points at TypeScript when the
problem is a quote.

### Still open

- **No screens for any of the fifteen.** Same position as after the first
  domain session, and the same lesson applies: the engines being green says
  nothing about whether the features are usable. Screens next, in phase order.
- **A share link needs a server route to be worth anything.** `sharing.ts`
  decides what a holder may see; nothing yet serves it, and the endpoint has to
  be unauthenticated by design, which makes it the most exposed surface in the
  product.
- **`chaining.ts` is greedy, not optimal.** Deliberate — an optimal search over
  a load pool is a travelling-salesman problem and a carrier is looking at a
  few dozen loads — but it will occasionally propose a worse chain than a human
  would. Worth revisiting only once there is a real pool to test against.

---

## 2026-08-27 — Fifteen things the product did not have, and a real typeface

**Did.** Widened the product and sharpened the design. Two new domain engines
(stop detection, fleet utilisation), five new screens — fleet, ranked bids,
posting a load, a driver's own record, and the offline state — plus a pace
chart, a stops list, staggered list entrances, skeletons, empty states, a
press primitive, and Inter bundled on both platforms.

### What surprised us

**The pace chart was right and the data was wrong.** It reported five km/h for
the last leg of a Lagos–Kano run, which looked like a broken chart. The demo's
last leg spanned twenty-six hours for two hundred kilometres. Every leg is now
timed at 45–55 km/h door to door, which is what a loaded trailer actually
makes on that corridor — and the chart is the reason the bad data was visible
at all.

**A cadence test caught a helper lying to the engine.** After retiming the
demo, one leg was 110 minutes, which `leg()` divides into 15.7-minute steps —
a spacing the tracking policy would never produce. The test that asserts fixes
arrive at a plausible cadence rejected it. Spans are multiples of the cadence
now.

**A stop-detection test failed because of the test, not the code.** The helper
that generates "moving" fixes started every run at the same coordinates, so a
run following a stop at those coordinates had its first fix absorbed into the
stop and a two-hour wait measured 125 minutes.

**Pluralisation has now been got wrong three times** — "every 1 minutes", "1
completed trip", "1 hours stopped" — always by writing the number and the noun
into the same template literal. There is one `plural()` helper now, with a
test that names all three.

**"just now ago".** `humanDuration` returns a duration; most take "ago" and the
smallest bucket does not.

**Two seven-figure naira amounts and a dash do not fit on a phone** at 36pt.
The indicative range was truncating mid-figure on the post-a-load screen.
Stacked now.

**The offline banner covered whatever card was at the bottom of the screen.**
It was absolutely positioned. Being offline is a fact about the whole app, so
the app makes room for saying so — it is in the layout now.

**A tick in a warning colour is worse than either alone.** The bids screen
showed a checkmark beside "33% on time", tinted amber. It reads as an
endorsement with a caveat rather than as a caution.

**Bundling a font is three separate build systems.** `react-native-asset`
writes `UIAppFonts` into Info.plist and copies into `android/app/src/main/assets/fonts`,
and neither takes effect without a native rebuild. Then the RN CLI failed with
a CocoaPods version mismatch, and building by hand with `-derivedDataPath build`
deleted React Native's codegen output — which lives in `ios/build/generated`,
under the same directory. The error, `Build input file cannot be found:
RCTThirdPartyComponentsProvider.mm`, says nothing about any of that.



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

**Authorisation went in as a query filter, and the compiler did the work.**
Adding a `Principal` parameter to the repositories produced eight compile
errors in two controllers — every single place that reads a trip or a position,
enumerated, with no chance of missing one. A controller guard would have
compiled fine and protected only what somebody remembered. That is the whole
argument of ADR-0008 and it was pleasant to watch it happen.

**A stale assembly bit twice in one session.** `dotnet ef migrations add`
writes source; running `bin/Debug/…dll` afterwards runs the *old* one, so the
new table simply is not there and the error is `relation "AccessTokens" does
not exist` — which reads like a broken migration rather than a build you did
not do. It happened once with the first migration and again with the second.

**EF Core threw `PendingModelChangesWarning` while `ef migrations
has-pending-model-changes` said there were none.** Two migrations, no
deployment anywhere, so the honest fix was one clean migration rather than
carrying a phantom mismatch forward.

**Android took four attempts, and none of the errors said what was wrong.**
React Native's generated Gradle files assume the app is not in a workspace, so
`../node_modules` should be `../../../node_modules` — the failure is "Included
build ... does not exist". Then `compileSdkVersion = 37` names a platform that
has not shipped, which fails as "Failed to find target with hash string
'android-37'" and reads like a broken SDK install. Then `avdmanager` computes
its SDK from its own directory with `pwd -P`, so a symlink from the SDK to the
Homebrew copy resolves *back* to Homebrew and it reports "Valid system image
paths are: null" with the images sitting right there. Then the emulator wanted
12 GB of userdata on a machine with 22 GB free.

All four are in `docs/TOOLCHAIN.md`, which exists because none of them is
findable from the message it produces.

**A clever fix was worse than two literals.** Resolving `node_modules` by
walking up seemed obviously better than hard-coded `../../../`. Gradle requires
`plugins {}` to be the first statement after `pluginManagement {}`, so the
search had to live inside that block — and from there `includeBuild` failed to
register the composite, leaving "No included builds contain this plugin", which
points at the plugin rather than the path. Reverted to literals that fail
loudly.

**The status bar bug was still there, on the screens I had not scrolled.** I
fixed it on the trip screen with a header and thought it was done. The first
Android run had "1 of 3 need a look" printed through the clock, because the
list has no header. One opaque strip in `App.tsx` now covers every screen that
does not have one.

**Phase 0's exit gate went green.** CI runs the gates, the domain, app and
server tests, the round trip against a real server, and builds both platforms
— 1m16s for everything that does not need a native toolchain, 12–14 minutes for
the two that do. Written, pushed, and *watched*, because a workflow that has
never run is a workflow that does not work.

### Still open

- **Android on real hardware.** The emulator proves it compiles and runs; it
  proves nothing about OEM battery management or a 2 GB device.
- **Sign-in.** Tokens exist and gate everything; obtaining one still means
  running a command. Phase 3.
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
