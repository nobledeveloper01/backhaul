# Backhaul

Truck load matching and freight visibility for Nigerian road logistics.

Read `docs/00-PRODUCT-STATEMENT.md` for why this exists, `docs/ROADMAP.md` for
what phase the project is in and what its exit gate is, and `docs/adr/` for the
decisions that are already settled. `PHASE` holds the current phase number.

The one sentence that decides most arguments:

> **Tracking is the wedge; matching is the business.**

Tracking is worth paying for with one truck and no other user on the platform.
Matching is worth nothing until there is liquidity, and the liquidity is a
by-product of the tracking. A change that makes tracking worse in order to make
matching better has the trade backwards.

## Design system

Read `DESIGN.md` before any visual or interaction decision.

Two rules from it are load-bearing and easy to break by accident:

- **Show the age of everything, and stale is grey.** A gap in coverage is a
  fact about Nigerian network infrastructure, not the driver's fault. Colouring
  it as an alarm trains shippers to distrust drivers for something nobody
  controls.
- **The driver face is a different product, not bigger text.** 64 dp targets,
  `bodyDriver` type, and as close to zero required interactions per trip as the
  feature allows. The driver did not choose this app.

## The six things that are never traded

These outrank convenience, deadline and elegance. A change that weakens one is
wrong regardless of what it delivers.

1. **The domain imports nothing from the platform.** No React, no React Native,
   no database, no map, no clock, no randomness. Enforced by lint; see
   ADR-0001. `scripts/boundary-check.sh` proves the rule still fires.
2. **A trip history is append-only.** No update path, no delete path. A
   correction is a new event and the original survives. See ADR-0003.
3. **The tracking loop is native, and capture continues when the network
   does not.** `shouldTrack` is true for `signal_lost` on purpose: stopping
   capture when the signal drops loses precisely the stretch of road nobody can
   account for afterwards. See ADR-0002.
4. **Money is integer kobo, displayed in whole naira.** Every line of a
   settlement is rounded to the naira before it is shown, so the lines add up
   on screen as well as in the arithmetic. See ADR-0004.
5. **Unknown is a first-class answer.** `observe()` returns `unknown` and
   `eta()` returns a refusal with a reason. A sealed result rather than a
   nullable one, so no screen can render "arriving null" or reassure a shipper
   on the strength of nothing.
6. **No estimate is presented as a measurement.** `isModelled`, `isIndicative`
   and fix quality are computed so they can be *rendered*. If a screen drops
   them, the screen is wrong.

## Working on this repo

- `make ci` is the gate. `make gates` runs the blocking ones alone.
- **Node 22.18 or newer.** The domain package runs its tests through Node's own
  type stripping — no build step, no loader, no jest. Source imports carry the
  `.ts` extension for that reason, and `rewriteRelativeImportExtensions` turns
  them into `.js` on the way out.
- **Every engine takes `now: Date` as an argument.** Lint enforces it. An
  engine that reads the clock cannot be replayed against a trip that has
  already happened, which is exactly what a dispute requires.
- **Thresholds are wide on purpose, and the comment says why.** Twenty minutes
  before silence is reported; forty-five before a stall. A shipper pinged for
  every fifteen-minute coverage gap on a northern corridor stops reading the
  pings, and then the alert that matters is one of forty they ignored that day.
  Do not tighten these without a reason better than "it feels slow".
- **Movement must clear the combined accuracy of both fixes.** Two ±90 m fixes
  of a parked truck sit 180 m apart. Counted as travel, an overnight stop
  invents kilometres onto a per-kilometre rate.
- **A rejected position fix is never the baseline for the next one.** It was,
  once, and a single cell-tower fix could eat an entire leg.
- **Prices are per kilometre of truck, not per tonne-kilometre.** The first
  model was tonne-km — correct arithmetic, green tests, and it quoted ₦398,400
  for a Lagos–Kano trailer run that goes for over two million. Test pricing
  against real corridors, not against what the formula produces.
- ADRs live in `docs/adr/`. **Write one for any non-obvious decision, before
  the code that depends on it.** `make adr T="the decision"`.

## Documentation pipeline

Four documents move as the work moves. `scripts/doc-check.sh` runs in
pre-commit and in CI.

| Document | Answers | Updated |
|---|---|---|
| `docs/JOURNAL.md` | What did we do, and what surprised us? | Every working session — `make journal T="..."` |
| `CHANGELOG.md` | What changed for someone using this? | Every user-visible change, under `[Unreleased]` |
| `docs/adr/` | Why is it built this way? | When a non-obvious decision is made — `make adr T="..."` |
| `docs/ROADMAP.md` + `PHASE` | Where are we, and what finishes this phase? | When a phase's exit gate goes green |

The gate blocks on a document that is missing, malformed, **or present on disk
and not in git** — `docs/*` is an allow-list and forgetting to add a file makes
`git add` a silent no-op and the commit message a lie. It happened on Grid; a
document was absent from GitHub for a day while every commit reported success.

It also blocks on a screenshot that no document references, and warns when code
has moved and the journal has not. **The warning is the one that matters** — it
is the difference between a project that is documented and a project that has
documentation.

## Repository hygiene

At the end of every phase, before the last commit:

- `make clean` — build output, caches, native artefacts.
- Remove scripts and documents that were scaffolding rather than product. If it
  was useful once and will not be useful again, it does not belong on GitHub.
- `git status` should be clean and `make doc-check` green. If `git status` is
  clean *and* a file you expected to ship is missing from `git ls-files`, that
  is the allow-list bug above, not a clean tree.

## Definition of done

- [ ] Acceptance criteria met and demonstrated on a device
- [ ] Tests written; the domain package still lints clean under the boundary
      rule and `scripts/boundary-check.sh` still passes
- [ ] Works fully offline where the FRD requires it
- [ ] Verified on physical iOS **and** physical Android
- [ ] Verified on a reference low-end Transsion handset
- [ ] Light and dark both authored
- [ ] 200% text scaling without truncation — check it, do not assume it
- [ ] Screen-reader labelled; colour never the sole carrier of meaning
- [ ] Every error path has a forward path — no dead ends
- [ ] No update or delete path introduced on a trip event
- [ ] Copy reviewed against the voice rules in `DESIGN.md`
- [ ] ADR written for any non-obvious decision
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] `make ci` green
