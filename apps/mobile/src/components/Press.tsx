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

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animate(1)}
      onPressOut={() => animate(0)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={disabled ? styles.disabled : undefined}
    >
      <Animated.View style={[animated, style]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 0.4, not 0.6: a disabled control should be unmistakably out of reach, and
  // the halfway version reads as "loading".
  disabled: { opacity: 0.4 },
});
