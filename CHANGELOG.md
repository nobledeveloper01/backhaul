# Changelog

Everything here is what changed for someone *using* Backhaul. Internal
refactors that nobody outside can observe do not appear.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Shareable tracking links.** A trip can be followed by somebody with no
  account, through a link that expires after fourteen days and can be turned
  off at any time. A link shows where the truck is and when it should arrive —
  never a phone number, and never what the load is worth. Expired and revoked
  are different answers, because they need different sentences.
- **Waypoints and arrival.** Origins, destinations and checkpoints have their
  own arrival radius, so a truck queueing at a border post and a truck parked
  at the depot it was told to load at are told apart. Waiting time at the depot
  and the destination counts toward demurrage; time at a checkpoint does not.
- **Verification tiers.** Verified, Business and Trusted, earned from documents
  and a delivery record and never self-reported. An upheld incident costs one
  tier, not the whole record. Every profile shows exactly what is missing
  between it and the next tier up.
- **Document expiry warnings.** Thirty days before a licence or an insurance
  certificate lapses, rather than on the morning it does — a carrier who loses
  a tier mid-trip loses work already committed to.
- **Messages on the trip.** A thread the shipper, carrier and driver share,
  attached to the trip rather than to a phone. A message written in a dead zone
  keeps both times: when it was written and when it was received, and the
  thread reads in the order the conversation happened.
- **Incident reporting.** Breakdown, security, accident, detention, road and
  cargo, each with a sensible default severity so nobody has to classify their
  own emergency. A blocking incident stops the arrival estimate rather than
  showing one beside "broken down near Jebba".
- **Proof of delivery.** Two photographs, a signature, a name and the position
  the phone was in when it was captured. A capture more than a kilometre from
  the destination is flagged on the document, not refused — a market address is
  a district, not a gate.
- **Delivery exceptions.** Short, damaged or refused, recorded against the trip
  with their own photographs. A short delivery still settles; only a refusal
  does not.
- **Post-trip reviews.** Four yes-or-no facts each side answers about the
  other, reported as counts — "load ready on arrival: 9 of 11" — never as a
  star average. Nothing is shown until three trips have been answered for.
- **Trip and load search.** Filter by state, lateness, incidents and date, or
  search across reference, corridor, cargo, plate and driver. Plates match
  however they were written down. An empty result says which condition to relax.
- **Multi-leg chaining.** Return runs strung two and three legs deep, refusing
  any leg that would need more than 120 km of empty repositioning or a
  connection the truck could not physically make. The loads it passed over are
  shown too, each with the reason — a proposal you cannot argue with is a
  proposal nobody acts on.
- **Every one of the above now has a screen**, on the face that needs it: the
  shipper shares and reads the thread, the carrier sees verification and the
  chain, the driver reports and hands over. Switching tabs keeps your place, and
  tapping the tab you are already on takes you back to the top of it.

- **Trip lifecycle.** A trip moves through an explicit set of states — open,
  assigned, loading, in transit, arrived, delivered — with signal loss and
  stalls tracked as first-class states rather than gaps. Its history is
  append-only, so a delivery dispute is argued against a record neither party
  can edit.
- **Position cleaning.** Fixes the phone itself cannot vouch for are excluded
  from distance figures, and what was excluded is shown rather than discarded.
  A track that lost half its fixes reports that alongside the distance.
- **Adaptive tracking policy.** Sampling slows when the truck is stopped and
  slows further when the battery is low, because a driver whose phone dies is a
  trip with no evidence at all. The reason is shown on the driver's screen.
- **Stall and silence detection.** Twenty minutes without a fix is reported as
  no signal; forty-five minutes stationary away from a scheduled stop is
  reported as a stall. A truck parked at the depot it was told to load at is
  neither.
- **Indicative pricing.** A range, never a single figure, for what a truck
  costs over a road — marked indicative everywhere it appears.
- **Demurrage and settlement.** Four free hours at each end, then charged by
  the hour with part-hours rounded up. Commission is taken on the fare and
  never on demurrage.
- **ETA ranges.** An arrival window built from the trip's own pace, or from the
  truck class when there is not yet enough of a track — marked as an estimate
  when it is one, and refused with a reason when the evidence is too thin.
- **Return-load matching.** Available loads ranked for a carrier by what they
  pay, how far the truck runs empty to reach them, and how much of the run home
  they cover. Loads the truck cannot take are shown greyed with the reason
  rather than hidden.
- **An app.** Three faces in one binary: a shipper's trip list and trip screen,
  a carrier's ranked return loads, and a driver screen that is one screen with
  one action. Light and dark, with a switcher; light by default.
- **A corridor view.** Where the truck is along its route, drawn to scale, with
  the stretches that had no signal marked in the position they happened.
- **An API client in the app**, with a sealed result rather than exceptions: a
  driver offline for hours is a normal condition, not an error path, and a
  failed upload says so plainly so the phone keeps its rows.
- **An API.** Trips can be opened and moved through their lifecycle, positions
  submitted in batches, a cleaned track read back, and indicative prices and
  settlement statements requested. Documented at `/swagger`, generated from the
  code rather than written beside it.
- **Bid ranking.** Offers ranked for a shipper on price, record and proximity,
  with the record shown beside the price so the shipper can overrule the order.
  A new carrier ranks as unknown, not as bad.

### Added

- **A fleet screen.** Utilisation — the share of kilometres that were paid for
  — and what one more loaded return leg would be worth at the fleet's own
  realised rate. Plus what needs a person, derived from the tracking rather
  than from a flag somebody set.
- **Bid ranking, on screen.** Price, record and proximity, with the record
  beside the price so a shipper can overrule the order. A new carrier ranks as
  unknown, not as bad.
- **Posting a load**, with the indicative range updating as you type and the
  truck class derived from the weight rather than chosen.
- **Stops.** Every stop on a trip, with its duration and how many positions it
  is made of — what a demurrage claim is actually made of.
- **A pace chart**, door to door, with the stretches that had no signal drawn
  as gaps rather than interpolated across.
- **A driver's own record**: past trips, what they paid, and which arrived on
  time — the same figures a shipper sees.
- **An offline banner** that says nothing is being lost, because that is the
  only question a driver has when the bars go.
- **Store-and-forward for positions.** A fix leaves the phone only when the
  server has acknowledged that exact fix — not when a batch was sent, not when
  a response arrived, and not when a batch containing it was acknowledged in
  part. A driver offline for four hours loses nothing.

### Security

- **Every endpoint except `/healthz` now needs a bearer token**, and a trip is
  visible only to its driver, its carrier and its shipper. Anyone else is told
  it does not exist rather than that they may not see it — the existence of a
  trip id is itself information.
- **Only a trip's driver can add positions to it.** A carrier watching the
  truck and a shipper watching their goods can both read the track; neither can
  write to it, because a position history a second party can append to is not
  evidence of anything.
- Tokens are stored as a SHA-256 hash. The value itself exists once, when it is
  issued, and is never shown again.

### Changed

- The appearance choice now survives a restart.
- The app builds and runs on Android.
- CI runs every gate and builds both platforms on every push.

### Fixed

- The driver screen offered "signal lost" and "stalled" as buttons. Both are
  observations the tracker raises; offering them asked a driver to self-report
  the thing the tracking exists to detect.
- A trip's history attributed a lost signal to the driver rather than the
  system.
- Indicative price ranges were quoted to the naira — "₦1,861,487 – ₦2,678,725"
  — which is arithmetic pretending to be a quote. They now round to ₦5,000.
- At the largest accessibility text size the tab bar's labels wrapped into each
  other and ran off the screen, and the headline filled the display.
- "Recording starts when you begin loading" was shown on trips that had already
  arrived.
- On screens without a header, content scrolled under the status bar with
  nothing behind it, printing the summary line through the clock.
- A twenty-minute wait at a depot was shown as "0.3 hours", and the summary
  under it named a place the truck had not reached.
- A truck was flagged as late while "arriving between 03:08 and 03:08" — both
  times correct, neither carrying the day it fell on. Times on the fleet screen
  now say today, tomorrow or the date, and a range with no width reads as a
  single time.
- A cargo report said "nothing else changes" while putting the trip under
  dispute.
- Trip histories showed a driver posting their own cargo, and an owner-driver's
  name printed twice.
- The chain proposal explained a rejected load against the wrong leg of the
  chain, refusing a load in the town the truck was standing in.
- At the largest accessibility text size the trip header lost its destination
  to an ellipsis, the three trip actions read "Sh…", "M…" and "Re…", and the
  corridor's own labels broke across three lines.

### Notes

- The API has **no authentication yet**. Anyone who knows a trip id can post
  positions to it. It is not exposed anywhere and must not be until phase 3.
- The API defaults to an **in-memory store**, which loses everything on
  restart. `/healthz` reports which store is in use and whether it is durable.
