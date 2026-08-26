import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { mono, type as typeScale } from '../design/tokens';
import { useColours } from '../design/theme';

type Variant = keyof typeof typeScale;
type Tone = 'primary' | 'secondary' | 'accent' | 'moving' | 'stopped' | 'stale' | 'exception';

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
 */
const MAX_SCALE: Record<Variant, number | undefined> = {
  display: 1.5,
  headline: 1.6,
  title: 1.8,
  body: undefined,
  bodyDriver: undefined,
  label: undefined,
  overline: 1.6,
};

interface Props extends TextProps {
  readonly variant?: Variant;
  readonly tone?: Tone;
  /** Tabular figures, for anything that changes in place. */
  readonly tabular?: boolean;
}

/**
 * The only text component.
 *
 * Screens pick a variant and a tone; they do not pick a size or a hex. The
 * 200%-text-scaling requirement in the definition of done is only checkable if
 * there is one place that decides how big text is.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  tabular = false,
  style,
  ...rest
}: Props) {
  const colours = useColours();

  const toneColour: Record<Tone, string> = {
    primary: colours.textPrimary,
    secondary: colours.textSecondary,
    accent: colours.accent,
    moving: colours.moving,
    stopped: colours.stopped,
    stale: colours.stale,
    exception: colours.exception,
  };

  const base = typeScale[variant] as TextStyle;
  const cap = MAX_SCALE[variant];

  return (
    <RNText
      maxFontSizeMultiplier={cap}
      {...rest}
      style={[
        base,
        { color: toneColour[tone] },
        tabular ? { fontFamily: mono.fontFamily, fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}
