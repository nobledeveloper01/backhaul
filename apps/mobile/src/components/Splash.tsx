import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { motion, space } from '../design/tokens';

interface Props {
  /** Called once the splash has finished leaving. */
  readonly onDone: () => void;
  /** Whether the app behind it is ready to be shown. */
  readonly ready: boolean;
}

/**
 * The accent, written out because this draws before the theme is chosen.
 *
 * Exported so the frame *behind* the splash can use it too. It was the theme's
 * surface, which is white until the stored appearance has been read — so the
 * splash's own fade-out revealed a white rectangle for a few frames on a dark
 * phone. Only visible on a screenshot taken during the departure.
 */
export const SPLASH_FIELD = '#1A4FA0';
const FIELD = SPLASH_FIELD;

/**
 * The first thing anybody sees.
 *
 * It takes over from the native launch screen — the same blue, the same mark,
 * in the same place — so the hand-over is invisible and the two read as one
 * thing rather than as two loads. The native one cannot animate; this one can,
 * and what it animates is the product's own sentence.
 *
 * **The truck drives in from the left and the arrow arrives behind it.** That
 * is the whole business in one gesture: the load coming *back*. It is not
 * decoration — a splash that spins a logo says nothing, and this one is on
 * screen for the second the app takes to start on the handsets it is built
 * for, which is long enough for a person to read one idea.
 *
 * **It never blocks.** The animation runs while the app starts behind it, and
 * it leaves as soon as both are done — whichever finishes last. A splash that
 * holds a ready app back for the sake of its own timing is an app that is
 * slower than it needs to be, on phones that are slow enough already.
 *
 * **Reduced motion is honoured.** Somebody who has asked their phone to stop
 * animating things gets the mark, held, and then the app.
 */
export function Splash({ onDone, ready }: Props) {
  // One driver for the whole sequence: every piece below reads a slice of it,
  // so nothing can drift out of step with anything else.
  const run = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(0)).current;

  // When this splash appeared. The dwell below is measured from it, so a phone
  // that starts fast still shows the mark rather than flashing it.
  const shownAt = useRef(Date.now()).current;
  const finished = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((still) => {
      if (cancelled) return;

      Animated.timing(run, {
        toValue: 1,
        // Snapped to its end for somebody who asked their phone to stop
        // animating things — they get the finished mark, held for the dwell
        // below rather than skipped. The first version cut the duration to a
        // millisecond and called that "held", which made the whole splash
        // 300 ms on any device with the setting on.
        duration: still ? 0 : ARRIVE_MS,
        easing: ARRIVE_CURVE,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      cancelled = true;
    };
  }, [run]);

  /*
    Leaves when the app is ready and the mark has been up long enough.

    Both, not either. Leaving the moment the app is ready makes the splash a
    flash on a fast phone, which reads as a glitch rather than as a start;
    waiting for the full animation on a slow one holds a ready app behind a
    picture. `DWELL_MS` is the floor and the app is the ceiling.
  */
  useEffect(() => {
    if (!ready || finished.current) return undefined;

    const waited = Date.now() - shownAt;
    const timer = setTimeout(() => {
      if (finished.current) return;
      finished.current = true;

      Animated.timing(leave, {
        toValue: 1,
        duration: motion.slow,
        easing: LEAVE_CURVE,
        useNativeDriver: true,
      }).start(onDone);
    }, Math.max(0, DWELL_MS - waited));

    return () => clearTimeout(timer);
  }, [ready, leave, onDone, shownAt]);

  // The truck comes in from the left and settles. `out(cubic)` on the driver
  // means it arrives fast and stops gently, which is what a heavy thing does.
  const truckX = run.interpolate({ inputRange: [0, 1], outputRange: [-140, 0] });

  // The arrow lands after the truck has stopped, in the second half of the
  // run — the load arriving *after* the truck is the sentence being told.
  const arrowIn = run.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0, 1],
  });
  const arrowX = arrowIn.interpolate({ inputRange: [0, 1], outputRange: [34, 0] });

  const wordsIn = run.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] });

  return (
    <Animated.View
      // Not announced. A screen reader user gets the app itself a moment
      // later, and a splash that speaks is a splash that has to be dismissed.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.field,
        {
          opacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [
            { scale: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
          ],
        },
      ]}
    >
      <View style={styles.mark}>
        <Animated.View style={{ transform: [{ translateX: arrowX }], opacity: arrowIn }}>
          <Icon name="swap" size="lg" colour="#FFFFFF" />
        </Animated.View>

        <Animated.View style={{ transform: [{ translateX: truckX }] }}>
          <Icon name="truck" size="lg" colour="#FFFFFF" />
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: wordsIn }}>
        <Text variant="headline" style={styles.word}>
          Backhaul
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/*
  The curves, as beziers rather than as `Easing.out(Easing.cubic)`.

  Same shapes — ease-out-cubic and ease-in-cubic — written as calls because
  passing `Easing.cubic` hands a method around unbound, which lint objects to
  and which is a real hazard the day that method reads `this`.

  Out for the arrival and in for the departure: a heavy thing arrives fast and
  settles, and leaves by gathering speed. The reverse pair is what makes motion
  feel like paper.
*/
const ARRIVE_CURVE = Easing.bezier(0.33, 1, 0.68, 1);
const LEAVE_CURVE = Easing.bezier(0.32, 0, 0.67, 0);

/**
 * How long the arrival takes.
 *
 * Longer than any other motion in the product — `motion.slow` is 320 ms and is
 * the cap for a screen transition — because this one is not a transition. It
 * is the only moment the app has to say what it is for, and it is covering a
 * cold start that takes longer than this on the handsets that matter.
 */
const ARRIVE_MS = 900;

/**
 * The least time the mark is on screen.
 *
 * Longer than the arrival, so the finished mark is held for a beat before it
 * leaves — a splash that departs on the frame it completes reads as an
 * interruption. It is also the floor for somebody with reduced motion on,
 * where there is no arrival to watch.
 *
 * It costs nothing on the handsets this product is built for: a cold start
 * there is longer than this, so the app is the thing being waited for and this
 * number never comes into it.
 */
const DWELL_MS = 1_150;

const styles = StyleSheet.create({
  field: {
    backgroundColor: FIELD,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    // Above everything, including the offline banner and the tab bar.
    zIndex: 100,
  },
  mark: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  word: { color: '#FFFFFF' },
});
