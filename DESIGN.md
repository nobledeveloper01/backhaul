# Design system

Read this before any visual or interaction decision. Colour, type, spacing and
target sizes are defined here and deviations need explicit approval.

Full rationale lives in the UX design document; this is the operative
reference and the tokens are the source of truth in
`packages/design-tokens`.

---

## Three faces, one binary

| Face | Wants | Default type | Target size |
|---|---|---|---|
| **Driver** | To be left alone | `bodyDriver` — 19/28 | **64 dp** |
| **Shipper** | A map and an ETA | `body` — 16/24 | 48 dp |
| **Fleet** | Utilisation | `body` — 16/24 | 48 dp |

The driver face is not the shipper face with bigger text. It is a different
product for a different person with different motivation: the driver did not
choose this app, is paid whether or not they use it, and is reading it in a
moving cab, possibly wearing gloves, on a mounted phone. **Driver screen time
is the enemy.** Every interaction the driver has to perform is a cost, and the
right number of them per trip is close to zero.

---

## The four rules that are easy to break by accident

### 1. Show the age of everything

A position from 40 minutes ago is not a position now. Every position, ETA and
status carries its age, and past 30 minutes the age is what is emphasised —
not the value.

This is the same rule Grid enforces about measured versus modelled, arrived at
for the same reason: a figure shown with more confidence than its provenance
supports is worse than no figure. `Eta.isModelled` and `CleanedTrack`'s fix
quality both exist to be rendered, not just computed.

### 2. Stale is grey, never red

`stale` is `#6E7B8A`, deliberately not an alarm colour. A gap in coverage is a
fact about Nigerian network infrastructure, not a fault of the driver, and
colouring it as an alarm trains shippers to distrust drivers for something
nobody controls.

The copy follows the colour: *"No signal since 3:40pm. This stretch of the
Lagos–Ibadan road often has none."* Never blame the driver for the network.

### 3. Ranges, not false precision

ETAs are ranges. Rates are bands. A single number reads as a promise, and
neither the road nor the diesel price will keep it. `quote()` returns
`low`/`mid`/`high` and `eta()` returns `earliest`/`expected`/`latest` because
the domain refuses to hand a screen a single figure it could render as one.

### 4. Tracking is consented, visible and bounded

The driver can always see what is being shared and with whom, and the sharing
stops when the trip does. `shouldTrack()` returns false for every terminal
state, and that is a product rule before it is a battery optimisation.

---

## Depth

Two elevation scales, because a shadow does nothing on a near-black background.
In light a card lifts with a shadow; in dark it lifts by being a lighter
surface. Same token name in both, so no screen has to know which theme it is in.

| Token | Light | Dark | Use |
|---|---|---|---|
| `flat` | no shadow | no shadow | Supporting detail inside a card |
| `raised` | 3 dp, 6% | `surfaceRaised` | The card being read |
| `lifted` | 8 dp, 10% | `surfaceRaised` | The driver's action button |

One `accent` card per screen, and only one. More than one primary is none.

## Icons

Drawn in `src/components/Icon.tsx`, on a 24×24 grid at 1.75 stroke with round
caps. **No emoji, ever** — an emoji is font-dependent, renders differently on
every handset in the driver segment, and cannot be themed. Mixed stroke weights
are the clearest tell of an interface assembled rather than designed.

Three sizes, as tokens: `sm` (16) for inline glyphs, `md` (20) for controls,
`lg` (28) for the driver face where a glance has to land.

## Appearance

**Light by default**, with a labelled three-state control — light, dark, or
follow the phone. This is read in Nigerian daylight far more often than in the
dark. See ADR-0007.

The control names the current mode in words as well as an icon. An icon-only
theme toggle is the textbook case of shape and colour carrying meaning alone.

It lives on the shipper face and nowhere else: the driver face has one job.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `surface` | `#FFFFFF` | `#0C0F14` | Background |
| `surfaceDim` | `#F2F4F7` | `#151A21` | Cards |
| `outline` | `#D8DDE4` | `#252D37` | Dividers |
| `textPrimary` | `#0C1119` | `#EBEFF4` | Body |
| `textSecondary` | `#5A6675` | `#9BA7B5` | Labels |
| `accent` | `#1A4FA0` | `#5B93E0` | Primary action |
| `moving` | `#1B7F4B` | `#4FBF84` | Truck in motion |
| `stopped` | `#B4690E` | `#E0A44A` | Stationary beyond threshold |
| `stale` | `#6E7B8A` | `#8A96A5` | Position older than 30 min |
| `exception` | `#B0281F` | `#E8695E` | Damage, incident, deviation |
| `verifiedTier` | `#1A4FA0` | `#5B93E0` | Verified badge |
| `businessTier` | `#1B7F4B` | `#4FBF84` | Business badge |
| `trustedTier` | `#9A6B12` | `#D6A93F` | Trusted badge |

Colour never carries meaning alone. Every state that has a colour also has a
label or an icon, because the map is read in sunlight through a windscreen.

---

## Typography

**Inter, bundled** — not the system face.

iOS gets SF Pro and Android gets Roboto, so the same screen has different
metrics on each and neither is the one the spacing was set against. On the
Transsion handsets that dominate the driver segment, "the system face" is
whatever the OEM shipped. Bundling one face is the difference between an app
that was designed and one that was assembled.

Four static weights are linked (`assets/fonts`, via `react-native.config.js`).
**Weights are named, not numbered:** React Native maps `fontWeight` onto a
family's faces inconsistently across platforms, and setting it alongside a
named face produces synthetic bolding on Android that looks like a rendering
fault. `fontFamily: family.semibold`, never `fontWeight: '600'`.

`Menlo`, tabular, for figures that change in place — times, settlement columns,
distances mid-trip. **Not** for a figure with a unit after it: Menlo sets a
full space before the unit, and "764  km" was shipped twice before that was
noticed.

| Style | Size / Line | Use |
|---|---|---|
| `display` | 34 / 40 | The ETA; the rate on a bid |
| `headline` | 26 / 32 | Screen titles |
| `title` | 19 / 25 | Card titles |
| `body` | 16 / 24 | Default |
| `bodyDriver` | 19 / 28 | Driver face default |
| `label` | 14 / 20 | Metadata |
| `mono` | 16 / 22 tabular | Plates, rates, weights |

Tabular figures are not a nicety. A rate that shifts horizontally as its digits
change is a rate that looks like it is being edited while you read it.

---

## Motion

One set of durations and two curves, so everything moves at the same rhythm.
Mixed timings are the same tell as mixed stroke widths.

| Token | ms | Used for |
|---|---|---|
| `fast` | 140 | A press, a tint, a chip |
| `base` | 220 | A card, a sheet, a banner |
| `slow` | 320 | A screen transition, and nothing longer |
| `stagger` | 40 | Per item as a list arrives, capped at six |

Exits run at about 70% of the entrance: a thing leaving should get out of the
way, and a slow exit reads as the app hesitating.

**Transform and opacity only.** Both run off the main thread, which matters on
a 2 GB handset. A list row uses opacity rather than scale — a scaling row
nudges its neighbours and the whole list twitches under the thumb.

## Voice

Plain and operational. Say what happened and what it means for the reader.

- **Never blame the driver for the network.** "No signal since 3:40pm", not
  "the driver has not reported".
- **A refusal explains what would fix it.** Every `unknown` result in the
  domain carries a `detail` sentence written to be rendered directly. "Only 2
  positions so far. An estimate from this truck's own pace needs 4."
- **Say the figure is an estimate where it is one**, in the same breath as the
  figure — not in a footnote.
- **No exclamation marks.** Nothing in freight is exciting to the person
  reading about it at 11pm.

---

## Definition of done for anything visual

- [ ] Light and dark both authored
- [ ] 200% text scaling without truncation — **check it, do not assume it**.
      Display type is capped (`MAX_SCALE` in `Text.tsx`) and body text is not:
      body is what a low-vision user needs bigger, and a 36 pt hero at 310% is
      112 pt and fills a screen. Icons beside wrapping text are top-aligned, or
      they float in the gap between lines two and three
- [ ] Every card is a `Card`, every glyph an `Icon`, every colour a token —
      no screen defines its own padding, radius, border or hex
- [ ] Screen-reader labelled; colour never the sole carrier of meaning
- [ ] Every error path has a forward path — no dead ends
- [ ] Driver-face targets at 64 dp, shipper and fleet at 48 dp
- [ ] Verified on a physical low-end Android (Tecno or Infinix, 2 GB RAM)
- [ ] Copy read against the voice rules above
