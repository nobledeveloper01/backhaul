import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

import { motion } from '../design/tokens';

const ENTER = Easing.bezier(...motion.enter);

interface Props {
  readonly children: ReactNode;
  /** Position in the list, for the stagger. */
  readonly index?: number;
}

/**
 * Content arriving, rather than appearing.
 *
 * A short fade and a small rise, staggered by position. The stagger is capped:
 * beyond about six items the delay stops reading as rhythm and starts reading
 * as the app being slow, so the seventh row arrives with the sixth.
 *
 * Transform and opacity only — both run off the main thread, which matters on
 * the 2 GB handsets this product targets.
 */
export function Appear({ children, index = 0 }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.base,
      delay: Math.min(index, 6) * motion.stagger,
      easing: ENTER,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index]);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            // From below: a thing entering from underneath reads as arriving,
            // where one dropping from above reads as falling.
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
