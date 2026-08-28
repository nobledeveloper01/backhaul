# Changelog

Everything here is what changed for someone *using* Backhaul. Internal
refactors that nobody outside can observe do not appear.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Winning a load now gives you a trip.** Accepting a bid marked the load
  awarded, took it off the board, and stopped. No trip was opened, so there was
  nothing to track, no delivery to capture, no escrow to release and nothing to
  count toward a carrier's record — a shipper and a carrier who agreed inside
  this product had to go and arrange the rest of it in a WhatsApp thread, which
  is the exact thing the tracking wedge exists to stop.

  Awarding opens the trip in the same transaction: both rows, or neither. The
  carrier is in the driver's slot, which for the owner-operators who are most
  of this market is simply true, and for a fleet is the carrier holding the
  trip until they hand it to a driver. The trip's id is derived from the load's
  rather than generated, so a retry on one bar of signal cannot produce a
  second trip for one load. See
  [ADR-0019](docs/adr/0019-an-awarded-load-becomes-a-trip-and-the-carrier-drives-until-they-say-otherwise.md).

- **The load board answers in 55 ms with ten thousand loads on it.** Measured
  through the whole request — routing, the store, the filter and the ranking —
  rather than around it, and reported on every run so a shrinking margin shows
  up before it goes. The phase gate is two seconds.

- **A driver can close a delivery with no signal at all.** The proof screen
  held its draft on the server and took the seal from it, so a driver at a
  market gate in Kano photographed the goods, took a signature, and had
  nothing — and the button that closes the delivery was waiting on an answer
  that was never coming. The comment explaining the design was right about
  durability and picked the wrong durable place.

  The delivery is now written to the phone first and sent afterwards, and
  **the driver seals it**: `seal()` is pure, lives in the domain, and needs
  nothing but the two photographs, the signature and the name in front of it.
  The server's timestamp becomes a countersignature — *when this platform first
  saw the evidence* — and both are kept, because a dispute wants the gap
  between them and a coverage hole explains it. The screen says so while it is
  waiting: **Signed off. Still on this phone only.** That is a queue depth, not
  an error; the driver has done their part.

  It is not a lost form. The earnings statement skips a delivered trip with no
  sealed proof and the escrow milestone never releases, so a delivery captured
  and lost is a driver who finished the run and is not paid. See
  [ADR-0018](docs/adr/0018-the-device-seals-a-delivery-and-the-server-countersigns.md).

- **A carrier could award themselves a Trusted badge in four taps.** The tier
  ladder read four booleans, and `PUT /v1/me/verification/{paper}` let the
  carrier write them. The endpoint's own comment was honest — *"Records that it
  exists, not that it is genuine. Verification is a human step"* — and the human
  step had never been built, so `tierOf` read a claim as evidence. It sat
  directly under a remark on the same table saying the record half is never
  written by the carrier.

  **A paper counts when somebody has looked at it.** Claiming one records the
  claim and shows it back — *Sent, waiting to be checked* — and buys nothing. A
  fourth role, **Reviewer**, is the only caller who can confirm it, and it is
  unreachable from any public path: first sign-in mints a driver, no endpoint
  changes a role, and a reviewer token exists only because ops issued one. A
  reviewer can confirm papers and see nothing else — no trip, no list, no bid.
  Withdrawing a claim withdraws the review with it.

  Every carrier is unverified until somebody reviews them, including anyone
  looking at a badge today. That is the cost and it is the point: a badge a
  carrier assigns to themselves is worse than no badge, because a shipper reads
  it as this platform saying something. See
  [ADR-0017](docs/adr/0017-a-tier-is-earned-from-evidence-the-carrier-cannot-write.md).

- **A shipper can ask for checked carriers, and the server enforces it.** A
  load carries a minimum tier — off by default, because a bar is a shipper
  narrowing their own market and on a thin corridor that can mean no bids at
  all. The bid endpoint refuses below it and says where the carrier stands, so
  the refusal has somewhere to go. The bidder's tier is computed at that moment
  from reviewed papers and a record counted from trips: there is nothing in the
  request that touches it, so there is nothing for a modified client to modify.

- **A shipper can track a truck the product never sold them.** This is the
  feature the whole thing is built on — *tracking is the wedge; matching is the
  business* — and it did not exist. Every trip arrived by post-a-load-take-a-bid,
  which is worth nothing until there is liquidity. **Track a trip** now sits at
  the top of the shipper's list: where it loads, where it unloads, and the two
  numbers you have been messaging all morning.

  The parties are **phone numbers**, because a number is what somebody who
  agreed a load on WhatsApp actually has. A number with no account behind it
  gets one, holding the number and nothing else until its owner signs in with
  that SIM — and the trips already naming them are simply there when they do.
  Your own slot comes from your token, so the form asks for the two parties you
  are not, and a number in your own slot that is not yours is refused rather
  than quietly overwritten.

  **There is no way to look a number up, and there never will be.** An endpoint
  that turns a phone number into an identity is a list of which drivers and
  carriers are running loads, for the price of one account. This one creates
  rather than answers, and it replies identically whether it found an account
  or made one — a test compares the two bodies with identifiers blanked, and if
  it ever fails the fix is to make the answers agree. Twenty trips an hour per
  account, because opening one can make two strangers' phones ring. See
  [ADR-0016](docs/adr/0016-a-phone-number-names-a-party-and-never-answers-a-question.md).

  Not yet built: the SMS that tells the driver. The gateway is there and the
  message is one call; what it should say to somebody who has never heard of
  this product and has just been named on somebody else's freight is not a
  plumbing question, and it is not being answered by accident.

- **A tracking link can be sent, not transcribed.** It was shown once and
  there was no way to use it but to read thirty-two characters off a 5" screen
  and retype them into WhatsApp — on the screen the product calls its wedge.
  **Send it** hands the invite to whatever the phone already uses, and it sends
  the sentence the preview is showing rather than a bare URL, so what the cargo
  owner receives is what the shipper read before sending. The link stays on
  screen either way, so a phone with nothing to share through loses nothing but
  the attempt.

- **A tracking link could be issued and destroyed in the same breath.** The
  card showing a new token rendered inside `query.state === 'ready'`, and
  issuing a link refreshed the list, and a refresh puts the query back to
  loading. So the token unmounted the moment it appeared — and if that refresh
  came back unreachable, which is one POST getting through on a bad stretch of
  road and then nothing, the only copy of a live capability was gone under a
  skeleton. The server keeps a hash; support cannot recover it; the card itself
  said this was the only showing. It renders from component state now, outside
  every gate on the page. Found by review, not by use.

- **The wired check was reporting zero findings on a directory with dead code
  in it.** Two blind spots, both since fixed and both proved by watching the
  gate change its answer. It ignored callers in a method's own file, so six
  parity-tested engines needed written excuses to pass — and a seventh excuse,
  on `Papers.Has`, said "nothing calls this and nothing ever has" about a
  method called eighty lines below it on the tier ladder. A gate that needs ten
  excuses to go green teaches people to write excuses, and then one of them is
  false. It also matched on bare method name, and twenty-three names in the
  server are declared on more than one type: three calls to one class's
  `ForAsync` were vouching for another class's, which had no callers at all.
  Ten exemptions are now three, the check names the owning type when the name
  is ambiguous, and `NotificationRepository.ForAsync` is deleted.

- **The documentation gate did not check ADRs.** It verified a fixed list of
  files was tracked by git — the rule that exists because a document was
  missing from GitHub for a day on a sibling project — and `docs/adr/` is not
  on a fixed list because it grows. Two ADRs sat on disk, unignored and
  un-added, while the gate passed and the changelog linked to one of them by
  path. It now checks every ADR, and it caught a third the same afternoon.

- **Two dead ends and a comment that was wrong.** In the walkthrough the
  delivery note said "you can hand this over once it is signed off" beside no
  way to sign anything off; it now says the walkthrough signs nothing off, in
  all four languages. A failed share link kept reporting the failure while the
  user retyped the label. And the note explaining a ref in the message thread
  described navigation this app does not do — corrected to say what is
  actually true and why the ref is still worth its keep.

- **An arrival time no longer appears beside an open breakdown.** The rule
  existed. `suppressesEta()` was written, tested, exported — and called by
  nothing, on either side. Two comments in `TripDetailScreen` said the screen
  honoured it. It did not, and neither did the follow screen or the fleet
  alerts, so a shipper could read "arrives 18:40" directly under "broken down
  near Jebba" and a share link could carry the same contradiction to a
  stranger.

  The fix is not three call sites remembering. `eta()` now takes the trip's
  incidents as a **required** argument and refuses before it measures anything,
  because a rule the caller has to remember is a rule three callers will
  forget — which is exactly what happened. It filters the open ones itself, so
  handing it the wrong list is not a way to get a confident estimate out of a
  stopped truck. A resolved breakdown does not cost a trip its estimate for the
  rest of its life, and a delaying incident does not either: the pace already
  carries a weighbridge queue.

- **The delivery note can be handed over.** Once the proof is sealed, the note
  the screen already renders goes out through the phone's own share sheet —
  WhatsApp, SMS, mail, a paste to the consignee's clerk. Plain text, not a PDF:
  it works offline, needs no dependency, and arrives on a 2 GB Transsion with
  400 MB free at the end of a Lagos–Kano run. The same lines the screen shows,
  asserted equal in a test, because two renderings of one document diverge and
  then a dispute has two versions of the truth. Before the seal the button is
  absent rather than dead, with the seal action one card above it. See
  [ADR-0015](docs/adr/0015-the-delivery-note-is-plain-text-and-the-seal-is-what-releases-it.md).

- **Three more things the app could do and never offered.** A shipper can now
  issue a tracking link from the share screen — shown once, in a card that says
  so, dismissed by hand and never recoverable. A message thread marks itself
  read when it has actually been fetched, not when the screen mounts, because
  marking a thread read on a phone that never loaded it clears a badge for a
  message nobody saw. And an open incident can be marked cleared from the trip
  screen, which is what now returns the arrival estimate above.

- **The wired check reads the server too.** `make wired-check` asks the one
  question no other gate asks — *does anything call this* — and it only asked
  it of the app. It now reads repository and domain methods in C# as well.
  Sixty-six repository methods, every one wired. Ten domain methods with no
  caller: six are in-file steps of a parity-tested entry point, two are
  deliberate, and two were real. One of those two is the ETA defect above.

- **1.3 MB of build output was in the repository.** 168 `.dex` files, compiled
  classes and Gradle transform caches from `packages/tracking-native`, and
  every `git status` for weeks reported a clean tree — because a tracked file
  is not an untracked file, and gitignore only stops things being added.

  The rule that should have caught them was `android/build/`, which contains a
  slash and is therefore anchored to the repository root. `apps/mobile` is
  covered by it; a second Android module is not. The patterns are unanchored
  now, and `make repo-check` fails the build if generated output is ever
  committed again — a gate, because the thing that failed here was somebody
  looking.

- **An icon, and a splash the app draws itself.** The launcher showed React
  Native's stock green robot and the iOS icon slot was empty. The launch screen
  said "BackhaulApp" in 36pt bold with **"Powered by React Native"** along the
  bottom — one is an Xcode target name and the other is an advertisement for a
  framework, and neither is for the person holding the phone.

  The mark is a truck with a left-pointing arrow knocked out of its cargo box:
  the load coming *back*, which is the whole product in one shape. Filled
  rather than stroked, because the app's own icon set is a 1.75px line family
  that disappears at 40px on a launcher, and a launcher is exactly where this
  has to survive a busy wallpaper on a 5" screen. No text — "Backhaul" at 40px
  is four grey pixels. `scripts/make-icons.py` draws every size both platforms
  want, so the day the accent changes the icon changes with it.

  The splash animates the same sentence: the truck arrives from the left and
  the arrow lands behind it. It never blocks — it leaves when the app is ready
  *and* the mark has been up long enough, so it is neither a flash on a fast
  phone nor a picture holding a ready app back on a slow one. Reduced motion
  gets the finished mark, held, rather than no splash at all.

  Getting the hand-over clean took four passes, and each one was one frame of
  the wrong colour: the storyboard's white, the window's white, React's root
  view's white, and the theme's surface showing through the splash's own
  fade-out — because the stored appearance is read from the same storage the
  splash is waiting on. A cold start is now the product's blue from the first
  frame to the last.

- **Alerts now have somewhere to go.** `alerts.ts` has decided who is told
  what, how loudly and how often since before there was any way to send one —
  exactly one kind is urgent, a push inside quiet hours is held rather than
  dropped, and the same thing is not said twice inside its own window. All of
  it parity-tested on both sides, and none of it running.

  A dispatcher runs it every five minutes: derive what is true, ask the policy,
  send what it says to send, and **record only that**. Recording only actual
  sends is what makes holding work — the condition is still true after six in
  the morning, still unsent, and goes out then. A loop that recorded holds
  would have turned "quiet hours" into "dropped".

  Quiet hours belong to the reader, so a phone registers its own UTC offset.
  The alerts *screen* can ask the client what hour it is; a loop running at
  three in the morning has nobody to ask, and assuming West Africa Time inside
  the server is how that breaks the first time somebody ships from Accra.

  Every person is a separate scope and a separate try: one shipper whose data
  makes the loop throw must not stop the driver in trouble two rows down from
  being told about.

  **Nothing reaches a phone yet, and that is credentials rather than code.**
  `IPushSender` has one implementation, which writes to the log and says on
  every line that it did not send — the same seam as the SMS sender, for the
  same reason. APNs wants a p8 key; FCM wants a service account. The app cannot
  register a device until it has a token to register, and that needs a native
  module this build does not have.

- **A proof of delivery was never actually sealed.** The screen ran the
  domain's `seal()` — which answers *is this enough* — and rendered "signed
  for" the moment it passed. `api.sealDelivery` was called by nothing. So a
  driver finished a handover, the screen said it was done, and the server's
  delivery had no seal on it: the earnings statement skips a delivered trip
  with no sealed proof, and the escrow milestone that depends on one never
  releases. The screen now shows the *server's* state and offers sealing as a
  deliberate action, because it is a one-way door.

- **Notifications are delivered, not just decided.** The policy, the
  dispatcher, the device registry, the sender seam and their tests were all
  built — and `registerDevice` was never called by anything. So there were no
  devices, the loop that runs every five minutes had nobody to tell, and the
  alerts screen said "Wakes you" beside each kind of alert on an install that
  had never registered for a notification in its life.

  The app registers on sign-in now — not when somebody opens a settings screen,
  because a person who never opens it should still be told their truck has
  stalled — and withdraws the registration on sign-out, because a phone in this
  market is handed between two drivers on alternate weeks.

  **It never registers a token it does not have.** A device row holding an
  invented string is a promise the platform cannot keep, and it fails in the
  worst direction: the dispatcher records the alert as sent, `repeatAfterMs`
  suppresses the retry, and the shipper is never told about the stall. Absent a
  push provider the app says so on the alerts screen instead, above the policy
  rather than in place of it — the policy is still what the product promises.
  ADR-0013 has the reasoning and what a provider would change.

- **The alerts screen was part English and used the wrong word for "off".** The
  audience beside every alert was `POLICY[kind].to.join(', ')` — the domain's
  own wire values, so `shipper, carrier · at most once every 6 h` on all four
  languages, which reads as finished because it is lower case and has a comma
  in it. And the card announcing that notifications cannot be delivered was
  headed "Not recording", which is about tracking.

- **An icon, a launch screen, and a splash the app draws itself.** There was no
  icon — an empty asset catalogue on iOS and React Native's stock green robot
  on Android — and the launch screen said "BackhaulApp" in 36 pt over "Powered
  by React Native", on white. An Xcode target name, an advertisement for a
  framework, and a white flash before a blue app.

  The mark is a truck with the load coming *back* through it, filled rather
  than stroked because the app's own line family disappears at 40 px on a
  launcher with a photograph behind it. `scripts/make-icons.py` draws it from
  the same accent the app uses, at every density both platforms ask for, so the
  icon cannot drift from the product.

  The system's launch screen and the app's own splash are the same blue with
  the same mark in the same place, so the hand-over is invisible. The splash
  leaves when the app is ready *and* the mark has been up long enough to be
  seen — a splash that departs on the frame it completes reads as a glitch, and
  somebody who has asked their phone to stop animating gets the finished mark
  held rather than skipped.

  Two white flashes went with it: one on iOS where the frame behind the splash
  used the theme's surface before the stored appearance had been read, and one
  on Android where the window reverted to the platform default between the
  launch theme and the first React frame.

- **Every Android screenshot was taken on a screen smaller than any real
  phone.** The emulator was 320×640 dp; a Tecno Spark — the class of handset
  this product is built for — is 360×800. Type at its designed size therefore
  filled more of the screen than it ever would on a driver's phone, and the
  README described that as "a useful proxy" for exactly the handsets it was
  under-representing. Re-shot at the real geometry.

- **The app called itself "BackhaulApp".** On both home screens. That is the
  React Native template's project name, which still has to match the registered
  component — so the component keeps it and the two labels a person reads do
  not.

- **The capture loop is connected.** `Tracker` was written and tested,
  `permissions.ts` was written and tested, the Android foreground service and
  the iOS location manager were both built — and nothing in the app ever called
  `start()`. The driver's screen said "we are recording your trip" over a loop
  that had never been asked to begin, and the queue depth under it was the
  literal number 18, passed as a prop from the app shell.

  It runs now, from the trip machine rather than from a button: `shouldTrack`
  already decides when a trip is being recorded, on both sides of the wire and
  under the parity fixtures, and a second answer to that question on one screen
  is a second thing to get wrong. Location is asked for before capture starts,
  the cadence comes back from the policy that chose it, and the next turn is
  scheduled on that cadence rather than on a fixed timer quietly overruling it.

  What the driver sees is now measured rather than assumed: the real interval,
  the real reason, and the real number of fixes still on the phone — with
  nothing at all when nothing is waiting, because "0 waiting to send" is a
  sentence about a problem they do not have.

  **A refusal reaches the screen rather than the log.** Location denied,
  location blocked and a handset that cannot record at all are three different
  situations with three different ways forward, and each gets a card with the
  way forward on it. A phone throttling the service — the Transsion case
  ADR-0002 is about — says so too, and says the stronger of the two truths it
  covers, because on iOS the same state means either a revoked authorisation
  or Low Power Mode and only one of those merely causes gaps.

  The app shell stopped claiming a queue depth it has never had. Only the
  driver face runs the loop, so only the driver face has a number.


- **Every screen reads the server.** The app was a complete face over a
  walkthrough: real screens, real words, and figures that came from a fixture
  file. All sixty-two routes are wired now — trips and their history, the
  cleaned fixes behind the map, messages, incidents, waypoints, drops, the
  checkpoint ledger, proof of delivery, the dispute pack, deviation, escrow,
  cancellation, costs, terms, earnings, alerts, verification, vehicles, lanes,
  records, the load board and its bids, chains, trailer pairs and the quote.

  Five states rather than one, because "nothing here" is five different facts
  and only one of them is about the data: still loading, could not reach the
  server, the server refused, there is genuinely nothing, and a filter is
  hiding it. A screen that renders all five as an empty list is a screen that
  tells a shipper their trucks are idle when the phone is simply on a bad cell.

  The walkthrough did not go. It is what a driver sees before their first trip
  exists, and it is **labelled as the walkthrough on every screen a person
  reaches it from directly** — the trips list, the driver screen and the fleet
  figure. A demonstration somebody cannot tell from their own data is worse
  than no demonstration, and the driver screen had been putting the words
  "your trip" over somebody else's. Four screens stay local on purpose and say so in their own
  source: the alerts screen explains the notification policy rather than
  reporting alerts, the follow screen is the preview of what a link-holder sees
  and therefore holds no token by design, the language screen is a device
  preference, and sign-in takes its callbacks from the shell around it.

  Two wire mismatches came out of this that no unit test could have caught,
  because the client's tests mock the server and the parity fixtures hold the
  two *domains* rather than the two *serialisers*: posting a levy returns the
  levy and not the ledger, and the quote route names its fields `low`/`mid`/
  `high` where every other money route suffixes `Kobo`. Both surfaced on the
  first run of a round-trip script that drives every client method against a
  live server, and it runs as a gate now.

- **Alerts, and search that finds the thing.** What reaches a phone is decided
  by one policy table both sides hold: exactly one kind is urgent — a driver in
  trouble — and a push inside quiet hours is *held* and summarised in one
  sentence at dawn rather than dropped, because the condition is still true in
  the morning. Alerts are derived on every read, never stored: a stored alert
  is a stored copy of a condition, and a copy that drifts tells a shipper a
  truck is stalled while they watch it move.

  Searching is case-, accent- and punctuation-insensitive, because three people
  write the same plate as `LSR-482-XA`, `lsr 482 xa` and `lsr482xa`. The load
  board filters before it ranks. And when a filter finds nothing, the sentence
  names the narrowest condition — the useful next action is to relax *that one*.

### Fixed

- **Every load claimed its shipper was Verified.** The API filled the shipper's
  standing with the literal string `"verified"` from two places, each under a
  comment saying the real thing was one line away. It was not one line away: it
  was a decision nobody had taken. `trust.ts` is carrier-shaped — a licence,
  goods-in-transit cover, punctuality — and none of that is what makes a
  shipper worth working for, which is whether they pay and whether they pay on
  time.

  A shipper's standing is null now, the load board's tier filter is served, and
  asking for Trusted shippers comes back empty. That is the truthful answer;
  the alternative is a whole board wearing a badge nobody earned. What a
  shipper ladder would actually require is written down as F10 rather than
  guessed at.

- **Every carrier was 100% on time.** The server counted a delivered trip as a
  trip delivered on time, because the promised arrival did not exist in the
  schema — and the comment saying so was honest and three lines long and had
  been true for a while. What it produced: a carrier walked up the trust ladder
  to Trusted on document count alone, and the reliability term in the bid
  ranking was the same number for every bidder, which is the same as having no
  term at all. It is the number a shipper picks a carrier on.

  A trip's terms now carry **when the shipper was promised it**, and a
  delivered trip counts towards punctuality only if it had a promise *and* a
  sealed delivery. Missing either, it is unjudged — not late, not on time, and
  in neither half of the fraction, because a trip that was tracked and never
  traded has no deadline to have kept and counting it either way is a lie.

  Judged on the handover rather than on the paperwork: a driver who arrives at
  five and seals the proof at seven, because the storekeeper had gone to find a
  pen, was on time.

  **No evidence is not a perfect score, and it is not a bad one either.** A
  tier naming a punctuality bar cannot be earned without five judged trips, and
  a carrier short of that is told they need trips with an agreed delivery date
  rather than accused of missing deadlines nobody set. On the load board they
  fall through to the neutral prior instead of scoring zero — and the sentence
  under their bid says "12 completed trips, none with an agreed delivery date"
  rather than "New to Backhaul — 12 completed trips", which is a sentence a
  shipper could see was wrong.

  Two things fell out of this. `CarrierProfileEntity` had three columns for
  these counts and nothing ever wrote them, so a carrier's own verification
  screen read three zeroes while the bid ranking counted for real; both now
  read from one place. And the incident count is explicitly zero, with the
  reason written down: there is no upholding in this product and there is not
  going to be one, and counting *raised* incidents would drop a carrier's tier
  every time a driver reported a robbery — an incentive to stay quiet, in a
  product whose evidence depends on drivers speaking up.

- **Nineteen screens said "nothing here" when they meant "we could not ask".**
  The helper that tells those apart was written, documented and used by exactly
  one screen. Everywhere else the line was `query.state === 'ready' ?
  query.value : []` — one line, obviously correct, and a lie on three of the
  four outcomes.

  What it produced, with the server unreachable: the fleet screen said
  **"Nothing needs you"** about a fleet it had not seen, above a trucks row
  reading "0 · trucks can take work". The trips list said **"0 · all moving"**
  in green with a tick, directly above "we cannot reach the server". The load
  board said "nothing on the board for that" and explained which of the
  carrier's own filters was to blame. The verification screen showed the
  walkthrough's documents as somebody's own tier. And the dispute pack — the
  document written to settle an argument — reported zero of everything and
  **"0% of the trip is covered by tracking"**.

  Every screen now renders the answer it actually got, and every one of those
  answers has a way forward: a retry that re-reads, and on a trip screen one
  that re-reads the whole trip rather than whichever card the button sat under.
  The driver's walkthrough label distinguishes the two admissions too — "the
  server has none for you" is a claim about the server, and a phone that never
  reached it has not earned that sentence.

- **The one check that catches wire mismatches only ran when somebody
  remembered.** `make round-trip` wanted a server running in another shell and
  a driver token copied out of its log by hand, so it was a thing you did
  rather than a thing that happened. It starts its own server now, reads the
  token that server seeds, stops it again, and runs as the last step of
  `make ci`. Both defects it has ever caught were found on a first run, which
  is the argument for it running every time.

- **Icons beside text floated in the middle of it.** Twenty-three rows across
  fifteen screens centred a small icon against a whole paragraph, so a line
  that wrapped left the icon hanging in the gap between lines two and three
  instead of sitting beside the first word. Visible at the *default* text size
  on the driver screen's data-cost line, and unmissable at 235%: Yorùbá and
  Igbo run longer than English and the driver face is set at `bodyDriver`
  before the reader's own scaling is applied, so most rows wrap eventually.

  An icon now says which text it sits beside and works out the offset from how
  tall that line actually is at the reader's own setting — including the cap,
  because a display heading stops growing at 150% and an icon that assumed 310%
  would sit a long way from it.

- **The fleet screen was showing an invented number as your own.** Utilisation
  — the fraction of a fleet's kilometres that are paid for, which is the figure
  this product exists to move — came from the walkthrough's legs on every
  render, under the heading "Your fleet" and with no mark on it. So did what
  one more loaded return leg would be worth. A carrier reading either as their
  own would act on it.

  It says it is the walkthrough now, in their own language. Serving it for real
  is a decision rather than a task: a loaded leg is a trip and the server can
  measure it from the cleaned track, but the *empty* running is the gap between
  two trips, where tracking is off and there is nothing to measure. An estimate
  there would be a number presented as a measurement, which this product does
  not do. ADR-0012 has the three ways out and why the route waits.

- **The sweep said zero untranslated strings three times, and was wrong three
  times.** Each gap was the *shape* of the text rather than the text. It saw
  strings alone on a line and props holding two words or more — so
  `overline="Utilisation"` walked past it, and so did `<Text>Your fleet</Text>`,
  which is never alone on its line. Then `{count} trips completed`, where the
  string is not the line. Then `{held ? 'On file' : 'Not uploaded'}`, where the
  braces get blanked before anything looks inside them. And the middot, which
  this product separates every fact with and which was missing from the
  character class.

  Roughly a hundred strings across twenty-one screens were still English on
  every language, including thirty-odd `accessibilityLabel`s — read aloud, and
  on some screens the only English left. All of them are translated. Numbers
  and names sit beside their phrase rather than inside it, which is what the
  four tables have required from the start and what a template with a hole in
  it quietly assumes away.

  The domain was writing prose too. `nextStep()` returns "a government ID" and
  "5 more completed trips" because that is what the server says and what the
  parity fixtures pin — the verification screen now renders those from the
  enum and the count, the way the levy kinds and paper names already were.

  Proper nouns are listed in the sweep, because Lagos is Lagos in all four
  languages, and the one branch that is English on purpose carries a comment
  saying why rather than being silently exempt.

- **The verification badge came from the server and the evidence under it came
  from a fixture.** The tier was read from the API; the trip counts beside it
  were the walkthrough's, on every render. Two facts about the same carrier,
  from two places, either able to be right while the other was wrong. And the
  fleet screen summarised the same thing in a hard-coded English sentence —
  "One document short of Trusted · a licence expires in 18 days" — one card
  above a comment warning that a summary which disagrees with the thing it
  summarises is worse than no summary.

- **A shipper posting a load started with "Cement" already in the box.** English
  on a Yorùbá screen, and a shipper who did not notice posted a cement load.
  The field is empty and the Post button already refuses an empty cargo.

- **A token the server had forgotten left the app stuck.** A 401 sat on the
  trips screen showing the server's own English sentence with a Try again button
  that sent the same dead token. It signs the session out now and returns to
  sign-in, which is the only forward path from a token nobody recognises. It
  happens for real: a token expires after ninety days, and a demonstration
  server keeps its tokens in memory and forgets them when it restarts.

- **The server's refusals arrived in English.** Every "no" from the API carries
  a machine-readable code as well as a sentence, and the client was throwing the
  code away and rendering the sentence. The sentence is English on purpose — it
  is what an API consumer reads and what the parity fixtures hold both
  implementations to, character for character — so a screen now renders from the
  code and keeps the sentence as the fallback for a code it has not seen. True
  English beats a guess, and it is visible in a way "something went wrong" is
  not.

  The share routes' codes are namespaced for the same reason: a sign-in code
  that expired and a share link that ran out were both `expired`, which would
  have shown one wrong sentence on one screen in one language.

- **Screens were still half in English.** The headings and buttons had been
  translated and the body copy had not, so a Yorùbá reader met four lines of
  Yorùbá and then a paragraph of English underneath. All 138 remaining strings
  are translated, and a sweep script keeps the count honest.

  Two layers under that were worse. The domain's own labels — levy kinds, paper
  names, trust tiers, incident kinds, alert kinds, cadences, review questions —
  were rendered straight from `packages/domain`, which writes in English because
  that is what the server says and what the parity fixtures pin. The enum now
  crosses that boundary and the words do not: one exhaustive map per enum, so
  adding a levy kind is a compile error until it has four translations.

  And the domain composes several sentences with the numbers already inside
  them — the line under a ranked load, whether a fare is worth taking, how far
  through the drops a truck is, what a dispute pack contains. The engine still
  decides what to say; the app now decides how, from the same figures, with the
  count first and the phrase after.

- **A filtered trip list said "All trips".** `isFiltering` counted a date range
  and the sentence above the results did not, so a shipper who narrowed to
  "since Monday" read "All trips" above a list that was plainly not all of
  them — the exact ten minutes of confusion that sentence exists to prevent.
  The dates are in it now.

- **Lanes: the runs a shipper makes again.** A named route with a cadence, and
  the price history behind it. What it typically goes for is the **median of
  the last six** — never the average of everything, because a lane's price
  drifts and one panic-priced trip during a fuel shortage would drag a mean for
  a year. Below three runs there is no typical price at all.

  A lane that is coming round sorts to the top with two days of warning, so a
  shipper posts before the day rather than on it. Ad-hoc lanes never appear
  there: a list that prompts about something with no schedule is a list that
  prompts about everything. A price a quarter either way of the usual one gets a
  sentence rather than a refusal.

- **Records, not stars.** After a delivery is proved, the shipper and the
  carrier each answer four yes-or-no questions about the other, and what a
  stranger reads is how often each was true — with the denominator, because
  "2 of 2" and "34 of 34" are the same fraction and not the same evidence.

  A question left unanswered stays unanswered all the way through the database
  and back: somebody who never needed to phone the driver has not said the
  driver was unreachable. Below three answers nothing is shown at all — a
  single bad trip must not read as a pattern to somebody who has no way to
  outrun it. Reviews close a week after delivery, are amendable until then, and
  hang off the sealed proof rather than off anybody's claim that the trip
  finished.

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
