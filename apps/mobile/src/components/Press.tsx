import { useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from 'react-native';

import { motion } from '../design/tokens';

// Built once. `Easing.bezier` allocates, and a press should not.
const ENTER = Easing.bezier(...motion.enter);
const EXIT = Easing.bezier(...motion.exit);

interface Props {
  readonly children: ReactNode;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string | undefined;
  /**
   * `scale` shrinks the whole thing; `opacity` dims it.
   *
   * A list row must use `opacity`: a scaling row nudges its neighbours and the
   * list twitches under the thumb. Anything with space around it can scale.
   */
  readonly feedback?: 'scale' | 'opacity';
  readonly disabled?: boolean | undefined;
  /**
   * Extra touch area outside the visual bounds.
   *
   * For controls whose *drawn* size is deliberately smaller than the 48 dp
   * minimum — a filter chip in a row of six, a clear button inside a field.
   * The rule is about what a thumb can hit, not about what is painted.
   */
  readonly hitSlop?: number | undefined;
  readonly style?: ViewStyle | ViewStyle[] | undefined;
}

/**
 * A pressable that reacts.
 *
 * Feedback within ~100 ms of the touch, which is the threshold below which a
 * tap feels like it did nothing. The animation is on `transform` and `opacity`
 * only — both run off the main thread, which matters on the 2 GB handsets this
 * product targets.
 */
export function Press({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  feedback = 'scale',
  disabled = false,
  hitSlop,
  style,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  const animate = (to: number) => {
    Animated.timing(progress, {
      toValue: to,
      // Release is faster than press: a control that lingers on the way back
      // feels like the app is still thinking about it.
      duration: to === 1 ? motion.fast : Math.round(motion.fast * 0.7),
      easing: to === 1 ? ENTER : EXIT,
      useNativeDriver: true,
    }).start();
  };

  const animated =
    feedback === 'scale'
      ? {
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, motion.pressScale],
              }),
            },
          ],
        }
      : {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.7],
          }),
        };

  /*
    Layout lives on the Pressable; everything visual lives on the animated view
    inside it.

    The scale animation has to be on the view that carries the background and
    the border, or a press scales the label and leaves the box behind. But that
    view is a *child*, so `flex: 1` written by a caller was landing one level
    too deep: three buttons meant to share a row equally came out as three
    different widths, sized by how long each word was. Same for `width: '48%'`
    on the incident tiles.

    So the layout properties are lifted out and put where they can work. This
    is the whole reason `Press` takes a style at all rather than being wrapped
    in a `View` by every caller.
  */
  const { flex, flexGrow, flexShrink, flexBasis, width, alignSelf, ...visual } =
    StyleSheet.flatten(style) ?? {};

  // Lifted out of the visual style, not copied from it. Left in both places,
  // `width: '48%'` applied twice — 48% of 48% — and a grid of six report
  // buttons came out a fifth of the screen wide with every label truncated.
  const layout: ViewStyle = { flex, flexGrow, flexShrink, flexBasis, width, alignSelf };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animate(1)}
      onPressOut={() => animate(0)}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={[layout, disabled ? styles.disabled : null]}
    >
      {/*
        No sizing of its own. A Pressable lays its children out with
        `align-items: stretch`, so once the flex lives on the Pressable the box
        fills it for free. An explicit `flexGrow: 1` here — added to "make it
        fill" — turned a small dashed pill into one the height of the screen.
      */}
      <Animated.View style={[animated, visual]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 0.4, not 0.6: a disabled control should be unmistakably out of reach, and
  // the halfway version reads as "loading".
  disabled: { opacity: 0.4 },
});
