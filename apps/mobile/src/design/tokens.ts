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

export const type = {
  display: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8 },
  headline: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  /** The driver face default: read in a cab, in motion. */
  bodyDriver: { fontSize: 19, lineHeight: 28, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  /**
   * Section headings inside a card. Small, wide-tracked, upper-case.
   *
   * The scale had `label` doing this job as well as carrying metadata, so a
   * section heading and the text under it were the same weight and nothing led
   * the eye down the screen.
   */
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.9 },
} as const;

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
