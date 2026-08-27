# Changelog

Everything here is what changed for someone *using* Backhaul. Internal
refactors that nobody outside can observe do not appear.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Course deviation, on the server.** A truck that has been getting further
  from its destination for ninety minutes, while moving, is going somewhere
  else — measured against the *closest* it has been inside that window, so a
  turn cannot hide behind the progress that preceded it.

  Not cross-track distance from a straight line. The Lagos–Kano road is up to
  90 km off that line for hours, and an alarm on every correct trip is an alarm
  nobody reads. When no route has been declared the answer is "there is nothing
  to be off" rather than a reassuring tick, and a dead zone answers "too few
  positions to say which way it is heading" rather than becoming an accusation.

- **The dispute pack, assembled by the server.** Everything the product has
  been careful about, in one document in time order: the append-only history,
  the position runs and the intervals they cover, the message written in a dead
  zone and delivered eleven hours later, the sealed proof, the share links.

  It adds nothing and it decides nothing. There is no verdict and no adjective
  — the counts and the hours are the whole of it, because a platform that
  adjudicates its own disputes is a platform both sides stop trusting. It does
  say when there is too little tracked time to argue from at all, which is a
  different statement and an honest one.

  Thousands of fixes become a handful of runs, broken where the tracker itself
  would call the trip silent, so the pack's idea of a gap and the tracker's are
  the same number.

- **Chaining and sharing a trailer, from the same board.** Three loads instead
  of one, chosen greedily by what each adds per kilometre *driven* — empty ones
  included, because a better-paid leg reached by 100 km of empty running is not
  the better leg. A chain never grows past three: by the third handover the
  first leg's timings have moved. The loads that could not join come back on
  their own route, each with which of the two things is wrong, because the
  distance is something a carrier might accept and the timing is not.

  And two part-loads going the same way are proposed as one run, fullest first,
  with what each shipper saves and what the carrier collects. Only loads that
  name a price can be paired — the discount is a share of what was offered, and
  a load open to bids has no figure to take a share of yet.

- **A load board, and bids on it.** A shipper posts a load; carriers see it
  ranked for their own truck and place one offer each; the shipper sees those
  offers ranked with the price and the record side by side, and accepts one.

  The ranking is the point. A load going the way the truck is already headed
  outranks a better-paid one going the wrong way — the asymmetry the product is
  named after — and **every load comes back scored, including the ones that
  cannot be taken**, greyed with the reason rather than hidden. A carrier who
  cannot see why the 30-tonne load is missing from their list assumes the app
  is broken.

  A carrier cannot read the other bids: they would know exactly what to
  undercut, and the ranking exists so the cheapest offer is not automatically
  the winning one. A new carrier is scored as *unknown* rather than as
  unreliable — a marketplace that never surfaces a new carrier never gets a
  second one. One live bid per carrier per load, and an awarded load leaves the
  board and stops taking both bids and amendments.

- **The money engines are served, not just tested.** Four routes that were
  walkthroughs are now answers from the server: the escrow release schedule for
  a trip, what cancelling it would cost right now, what the run costs against
  what it pays, and a driver's statement over a window. Each one has parity
  cases before it has an endpoint, wording included — a cancellation fee
  explained one way on a phone and another way on a server is a dispute the
  platform created itself.

  The second escrow milestone reads the **positions**, not the trip's state. Its
  condition says "moving with positions arriving", and a trip sitting in the
  `in_transit` state while sending nothing has not met it; a gap longer than the
  tracker's own silence threshold is not counted as covered time either, because
  crediting it would pay a carrier for exactly the stretch a shipper disputes.

  A trip can still have no commercial terms at all. That is tracking working as
  intended, and these routes say so in a sentence rather than answering with a
  schedule of zeroes.

- **Four languages, chosen before anything else.** Hausa, Yorùbá, Igbo and
  English. The question is the first screen in the app — before the phone
  number, because a sign-in screen in the wrong language is the first thing a
  person cannot get past — and every option is written in its own language,
  with the question itself asked in that language on the row. The choice is
  saved on the phone and can be changed from the driver screen.

  Nothing is a template. A phrase never contains a number or a name, because
  the middle of a sentence is in a different place in each of these four
  languages: counts, times and plates are rendered *beside* the words. The
  duration helper takes the reader's words as an argument rather than reaching
  for them, so a screen that renders an age without having asked what language
  it is in no longer compiles — that was how "45 min ago" ended up underneath
  four lines of Yorùbá.

  There is no fallback chain. A missing phrase is a build error, never quietly
  English.

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
- **Every one of the fifteen above now has a screen**, on the face that needs
  it: deviation and payment milestones on the trip, the dispute pack and
  cancellation terms behind it, trucks and papers and the alert policy on the
  fleet, drops and the checkpoint ledger for the driver, lanes and trailer
  sharing on the load board.
- **The capture loop is real.** An Android foreground service and iOS
  background location, both writing to a native SQLite queue that survives the
  app being killed and the phone rebooting. The notification says who can see
  the driver rather than apologising for existing, and the app reports when the
  operating system is throttling it instead of quietly recording nothing.
- **Sign-in codes go through a gateway we host.** An Apache-2.0 Android SMS
  gateway, its server half in `compose.yaml` and its sending half a spare phone
  with a Nigerian SIM — no aggregator account to open before a pilot can send
  its first code, and codes that arrive from an ordinary mobile number rather
  than a shortcode. Which gateway is configuration, not code.
- **Verification, the truck registry and the duress alarm are served.** A tier
  is computed on every read and never stored, so a carrier is the same thing on
  their own screen and on a shipper's. The fleet lists the worst truck first. An
  alarm answers with nothing at all — no body, no status anybody can read —
  because whoever is standing over the driver must not be able to tell.
- **Proof of delivery, drops and the checkpoint ledger are served.** A
  delivery is a draft while a driver is filling it in at a gate and evidence
  the moment it is sealed — and the seal runs the same rule the app runs, so
  nobody is told one thing by their phone and another by the server. Drops
  cannot be reordered once one has been signed for. The levy ledger goes
  negative when a driver is out of pocket, because that is the number they
  care about.
- **Messages, incidents and routes are served.** The thread on a trip, in the
  order the conversation happened and carrying both times — when a message was
  written and when the server took it. Incidents with the kind's own default
  severity, because a driver at a roadside should not have to classify their
  own emergency. And a route, with the visits and the chargeable waiting
  computed from the track rather than stored, so a corrected fix corrects the
  demurrage with it.
- **Signing in.** A phone number and a six-digit code — no password, because a
  password is a thing to forget on a phone two drivers share on alternate
  weeks. The number is understood however it is written and shown back the way
  it is said out loud, so `0803 123 4567` and `+2348031234567` are one account.
  A wrong code says how many tries are left; a used one says so rather than
  saying "wrong".
- **Route deviation.** A truck that has been getting further from its
  destination for ninety minutes, while moving, is reported. Not measured
  against a straight line between origin and destination — the road is nowhere
  near it — so a legitimate diversion no longer looks like a wrong turn.
- **One alert policy for the whole product.** Who is told, how often the same
  condition may repeat, and what is allowed to interrupt a person at 3am.
  Exactly one kind of alert overrides quiet hours; everything else waits and
  arrives as one overnight summary rather than four buzzes in a minute.
- **What the tracking costs in data**, on the driver's own screen: a day of
  recording is about fifteen kobo, and the figure is there because a driver who
  can see why their phone is doing something leaves it alone.
- **A vehicle registry.** Licence, roadworthiness, insurance and haulage
  permit, each with its own expiry. A truck whose papers have lapsed cannot be
  assigned to a new trip; one whose papers lapse *during* a trip is never
  stranded by the side of the road for it.
- **A silent duress alarm for drivers.** It shows nothing, sounds nothing and
  changes nothing on screen. The truck is tracked every thirty seconds for half
  an hour regardless of battery policy, and the carrier is told first — they
  are the ones who will make a phone call in the next minute.
- **Cancellation terms both sides can read.** Free within two hours of a bid
  being accepted and before the truck moves; priced after that, by stage, with
  the sentence that explains the figure attached to it.
- **The dispute pack.** Everything the trip recorded, in the order it happened,
  each item marked as measured by the tracker, attested by a person, or
  attested late. It adds nothing and decides nothing.
- **Multi-drop trips.** One truck, several deliveries, in the order the trailer
  was loaded. The trip finishes on the last signature rather than on arriving
  at the last address, and drops made out of order are recorded rather than
  refused.
- **The checkpoint ledger.** What a driver actually paid on the road, by kind
  and by trip, reconciled against their advance — including when it goes
  negative, which is the number they care about. Enough trips on a corridor and
  it becomes the median cost of running that lane.
- **Payment milestones.** Thirty per cent on loading, twenty on the road, forty
  on proof of delivery, ten held for a week. Every condition is one the platform
  can verify from evidence it already holds — delivery releases on the *proof*,
  not on somebody saying the trip is done.
- **A carrier's own cost model.** Diesel at today's price, running cost per
  kilometre, what the road took, and what is left. It will tell a carrier to
  walk away from a load, with the figure in litres.
- **Part-load consolidation.** Two half-loads on one trailer when the pickups
  are within 50 km, the deliveries within 80, and the pair actually fills the
  truck. Both shippers pay less than a full truck; the carrier collects more
  than one fare.
- **Hausa on the driver's screens.** Eighteen phrases, the working language of
  the northern corridors, on the one face whose reader had no say in what they
  are using.
- **A driver earnings statement.** Trips, kilometres, what was paid, what is
  still owed, and what a kilometre earned — a figure nobody has been able to
  give a driver before. Unpaid trips oldest first, because that is the one to
  ask about.
- **Recurring lanes.** The same run, named and saved, with what it has actually
  gone for. A price a quarter either side of the lane's own median is remarked
  on once — never blocked.
- **The share link is served.** `GET /v1/share/{token}` needs no account and no
  token of its own — that is the point — and answers with exactly what the
  link's stored scope allows. Issuing and revoking are authenticated and open
  only to somebody already on the trip. A link that was turned off says so; one
  that lapsed says that instead; one nobody issued is simply not found.
- **The public share route is rate limited** — sixty requests an hour per
  address, partitioned so that one caller flooding it cannot take the feature
  away from every cargo owner watching a delivery.
- **A trip now carries its corridor.** Origin and destination as names, so the
  API can say what a trip *is* rather than only where its truck has been.
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
- A vehicle document that expired nine days ago was reported as ten days out of
  date.
- The dispute pack reported fifty-one hours of missing evidence on a trip whose
  coverage was continuous. It was reading each position sample as an instant
  rather than a run, counting the quiet before the truck loaded as a hole, and
  treating a signal-loss event as though it were coverage.
- The fleet screen said "one truck cannot take work" above a list of two.
- A saved lane due tomorrow was listed above one five days overdue, and both
  carried the same call to action.
- The driver's language applied to one screen and not to the rest of their
  face; it is now remembered across the app, like the light or dark choice.
- The driver's buttons truncated in Hausa — "Ba da rahoton m…" — and the
  checkpoint buttons truncated in English.
- Revoking a share link reported a failure on a revoke that had succeeded: the
  client could not parse the empty body of a `204`, and would have told
  somebody their link was turned off twice.
- At the largest accessibility text size the trip header lost its destination
  to an ellipsis, the three trip actions read "Sh…", "M…" and "Re…", and the
  corridor's own labels broke across three lines.

### Notes

- The API has **no authentication yet**. Anyone who knows a trip id can post
  positions to it. It is not exposed anywhere and must not be until phase 3.
- The API defaults to an **in-memory store**, which loses everything on
  restart. `/healthz` reports which store is in use and whether it is durable.
