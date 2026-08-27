import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { motion, radius, space } from '../design/tokens';
import { useColours } from '../design/theme';

const ENTER = Easing.bezier(...motion.enter);

interface Props {
  readonly lines?: number;
  readonly style?: ViewStyle | undefined;
}

/**
 * A placeholder with the shape of what is coming.
 *
 * A spinner says "something is happening". A skeleton says "a card with a
 * title and two lines is happening", which is the difference between waiting
 * and waiting *for something* — and it means the layout does not jump when the
 * content lands.
 *
 * A slow pulse, not a shimmer sweep: a sweep is a gradient animation running
 * every frame, and this ships to handsets with 2 GB of memory.
 */
export function Skeleton({ lines = 3, style }: Props) {
  const colours = useColours();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.8,
          duration: 700,
          easing: ENTER,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          easing: ENTER,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[styles.card, { backgroundColor: colours.surfaceRaised, borderColor: colours.outline }, style]}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.line,
            {
              backgroundColor: colours.surfaceDim,
              opacity: pulse,
              // Varying widths, so it reads as text rather than as a table.
              width: i === 0 ? '60%' : i === lines - 1 ? '40%' : '90%',
              height: i === 0 ? 18 : 12,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: space.md,
  },
  line: { borderRadius: radius.sm },
});
