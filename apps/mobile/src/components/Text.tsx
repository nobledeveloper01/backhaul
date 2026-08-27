import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { MAX_SCALE, mono, type as typeScale } from '../design/tokens';
import { useColours } from '../design/theme';

type Variant = keyof typeof typeScale;
type Tone = 'primary' | 'secondary' | 'accent' | 'moving' | 'stopped' | 'stale' | 'exception';

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
