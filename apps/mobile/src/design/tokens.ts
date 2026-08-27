/**
 * The design tokens from `DESIGN.md`, and nothing else.
 *
 * No screen defines a colour, a size or a spacing of its own. When one does,
 * the system has two sources of truth and the second one wins wherever nobody
 * is looking.
 */

export const palette = {
  light: {
    surface: '#FFFFFF',
    surfaceDim: '#F2F4F7',
    outline: '#D8DDE4',
    textPrimary: '#0C1119',
    textSecondary: '#5A6675',
    accent: '#1A4FA0',
    onAccent: '#FFFFFF',
    /** A wash of the accent, for the one card that should lead the eye. */
    accentWash: '#EAF0FA',
    /** Washes for each status, so a chip reads at a glance without shouting. */
    movingWash: '#E6F4EC',
    stoppedWash: '#FAF0E1',
    staleWash: '#EDEFF2',
    exceptionWash: '#FBEAE8',
    /** One step above `surface`, for a card that must sit on top of another. */
    surfaceRaised: '#FFFFFF',
    moving: '#1B7F4B',
    stopped: '#B4690E',
    /** Grey, never red. A coverage gap is not the driver's fault. */
    stale: '#6E7B8A',
    exception: '#B0281F',
    verifiedTier: '#1A4FA0',
    businessTier: '#1B7F4B',
    trustedTier: '#9A6B12',
  },
  dark: {
    surface: '#0C0F14',
    surfaceDim: '#151A21',
    outline: '#252D37',
    textPrimary: '#EBEFF4',
    textSecondary: '#9BA7B5',
    accent: '#5B93E0',
    onAccent: '#08111F',
    accentWash: '#16233A',
    movingWash: '#13291F',
    stoppedWash: '#2A2113',
    staleWash: '#1B2028',
    exceptionWash: '#2E1917',
    surfaceRaised: '#1A212B',
    moving: '#4FBF84',
    stopped: '#E0A44A',
    stale: '#8A96A5',
    exception: '#E8695E',
    verifiedTier: '#5B93E0',
    businessTier: '#4FBF84',
    trustedTier: '#D6A93F',
  },
} as const;

/**
 * The shape of a palette, not one particular palette.
 *
 * `as const` pins every value to its own string literal, which makes the dark
 * palette unassignable to the light one — correct about the values and useless
 * as a type. What a component needs to know is that a palette has these keys
 * and they are colours.
 */
export type Colours = Readonly<Record<keyof (typeof palette)['light'], string>>;

/**
 * Inter, bundled.
 *
 * Not the system face. iOS gets SF Pro and Android gets Roboto, so the same
 * screen has different metrics on each platform and neither is the one the
 * spacing was set against — and on the Transsion handsets that dominate the
 * driver segment, "the system face" is whatever the OEM shipped.
 *
 * Bundling one face makes the product look the same everywhere, which is the
 * difference between an app that was designed and an app that was assembled.
 *
 * **Weights are named, not numbered.** React Native maps `fontWeight` onto a
 * family's available faces inconsistently across platforms; naming the exact
 * file removes the guess. `fontWeight` is left off entirely for the same
 * reason — set alongside a named face it produces synthetic bolding on
 * Android, which looks like a rendering fault.
 */
export const family = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const;

export const type = {
  display: { fontSize: 36, lineHeight: 42, fontFamily: family.bold, letterSpacing: -0.9 },
  headline: { fontSize: 28, lineHeight: 34, fontFamily: family.bold, letterSpacing: -0.6 },
  title: { fontSize: 19, lineHeight: 25, fontFamily: family.semibold, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontFamily: family.regular, letterSpacing: -0.1 },
  /** The driver face default: read in a cab, in motion. */
  bodyDriver: { fontSize: 19, lineHeight: 28, fontFamily: family.regular, letterSpacing: -0.1 },
  label: { fontSize: 14, lineHeight: 20, fontFamily: family.medium, letterSpacing: 0 },
  /**
   * Section headings inside a card. Small, wide-tracked, upper-case.
   *
   * The scale had `label` doing this job as well as carrying metadata, so a
   * section heading and the text under it were the same weight and nothing led
   * the eye down the screen.
   */
  overline: { fontSize: 12, lineHeight: 16, fontFamily: family.bold, letterSpacing: 0.9 },
} as const;

export type Variant = keyof typeof type;

/**
 * How far each variant is allowed to grow.
 *
 * Body text is what a low-vision user actually needs scaled, so it has no cap.
 * A 36pt hero at 310% is 112pt and eats a whole screen — at maximum text size
 * the words "Loads going your way" filled the display and pushed every load
 * off it. Capping display type is not a refusal to scale; it is scaling the
 * thing that carries the meaning rather than the thing that carries the
 * emphasis.
 *
 * Checked on a device at the largest size, not assumed. It was broken the
 * first time anybody looked, on this project as on the last one.
 *
 * It lives beside the scale rather than inside `Text` because it is a property
 * of the scale: an icon deciding where to sit beside a line has to know how
 * tall that line actually got, and there is one answer to that.
 */
export const MAX_SCALE: Record<Variant, number | undefined> = {
  display: 1.5,
  headline: 1.6,
  title: 1.8,
  body: undefined,
  bodyDriver: undefined,
  label: undefined,
  overline: 1.6,
};

/** How tall one line of a variant actually is, at the reader's own setting. */
export function lineHeightAt(variant: Variant, fontScale: number): number {
  const cap = MAX_SCALE[variant];
  return type[variant].lineHeight * (cap === undefined ? fontScale : Math.min(fontScale, cap));
}

/**
 * Tabular figures, for anything that changes in place.
 *
 * A rate that shifts horizontally as its digits change is a rate that looks
 * like it is being edited while you read it.
 */
export const mono = {
  fontFamily: 'Menlo',
  fontVariant: ['tabular-nums'] as const,
};

/** 4pt scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = { sm: 6, md: 10, lg: 16, xl: 20, pill: 999 } as const;

/**
 * Elevation.
 *
 * Two scales, because a shadow does nothing on a near-black background. In
 * light the card lifts with a shadow; in dark it lifts by being a lighter
 * surface with a slightly stronger border. The same token name in both, so no
 * screen has to know which theme it is in.
 *
 * Everything was one flat `surfaceDim` rectangle with a hairline border before
 * this, and nothing on any screen led the eye anywhere.
 */
/**
 * The shape of an elevation scale, not one particular scale.
 *
 * Same reason as `Colours`: `as const` pins the dark scale's empty objects to
 * their own types, and the two stop being interchangeable.
 */
export type Elevation = Readonly<Record<'flat' | 'raised' | 'lifted', object>>;

export const elevation: Readonly<Record<'light' | 'dark', Elevation>> = {
  light: {
    flat: {},
    raised: {
      shadowColor: '#0C1119',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    lifted: {
      shadowColor: '#0C1119',
      shadowOpacity: 0.1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
  },
  dark: {
    flat: {},
    raised: {},
    lifted: {},
  },
};

/**
 * Minimum touch targets.
 *
 * The driver number is not a rounding-up of the shipper one. A driver may be
 * wearing gloves, the phone may be mounted, and the cab is moving.
 */
export const target = { standard: 48, driver: 64 } as const;

/**
 * Motion.
 *
 * One set of durations and one easing family, so everything in the product
 * moves at the same rhythm. Mixed timings are the same tell as mixed stroke
 * widths: they read as an interface assembled from parts rather than designed.
 *
 * Exits are shorter than entrances — around 70% — because a thing leaving
 * should get out of the way, and a slow exit feels like the app hesitating.
 */
export const motion = {
  /** A press, a tint, a chip appearing. */
  fast: 140,
  /** The default: a card expanding, a sheet arriving. */
  base: 220,
  /** A screen transition, and nothing longer. */
  slow: 320,
  /** Per-item delay when a list arrives. Beyond ~50ms it reads as slow. */
  stagger: 40,
  /**
   * How far a pressable shrinks.
   *
   * Applied only to things with room around them. A list row uses opacity
   * instead: a scaling row nudges its neighbours and the whole list twitches
   * under the thumb.
   */
  pressScale: 0.97,

  /**
   * The two curves, as bezier control points.
   *
   * `enter` decelerates into place — fast at first, settling. `exit` does the
   * opposite. Written as points rather than `Easing.out(Easing.quad)` because
   * that passes an unbound method reference around, and because naming the
   * curve is the point: everything in the product should move on these two and
   * nothing else.
   */
  enter: [0.2, 0, 0, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
} as const;
