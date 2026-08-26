import { useMemo, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Icon, type IconName } from './components/Icon';
import { Text } from './components/Text';
import { ThemeProvider, useColours, useTheme } from './design/theme';
import { radius, space, target } from './design/tokens';
import { DriverScreen } from './screens/DriverScreen';
import { ReturnLoadsScreen } from './screens/ReturnLoadsScreen';
import { TripDetailScreen } from './screens/TripDetailScreen';
import { TripsScreen } from './screens/TripsScreen';
import { demoNow, type DemoTrip } from './state/demo';

/**
 * Three faces, one binary.
 *
 * A tab bar rather than a role switcher because this build is a portfolio
 * walkthrough: in the product a driver never sees the shipper's list and a
 * shipper never sees the driver's screen, and the two are different apps
 * wearing the same icon.
 */
type Face = 'shipper' | 'driver' | 'loads';

function Shell() {
  const colours = useColours();
  const { isDark } = useTheme();
  const now = useMemo(demoNow, []);

  const insets = useSafeAreaInsets();
  const [face, setFace] = useState<Face>('shipper');
  const [open, setOpen] = useState<DemoTrip | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: colours.surface }]}>
      {/* backgroundColor was Android-only and is gone in RN 0.87; the root
          View below paints the ground instead. */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.body}>
        {face === 'shipper' ? (
          open === null ? (
            <TripsScreen onOpen={setOpen} />
          ) : (
            <TripDetailScreen trip={open} now={now} onBack={() => setOpen(null)} />
          )
        ) : null}
        {face === 'driver' ? <DriverScreen /> : null}
        {face === 'loads' ? <ReturnLoadsScreen /> : null}
      </View>

      <View
        style={[
          styles.tabs,
          {
            backgroundColor: colours.surface,
            borderTopColor: colours.outline,
            paddingBottom: Math.max(insets.bottom, space.sm),
          },
        ]}
      >
        {(
          [
            ['shipper', 'Trips', 'list'],
            ['loads', 'Return loads', 'swap'],
            ['driver', 'Driver', 'wheel'],
          ] as const
        ).map(([value, label, icon]) => (
          <Tab
            key={value}
            label={label}
            icon={icon}
            active={face === value}
            onPress={() => {
              setFace(value);
              setOpen(null);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function Tab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const colours = useColours();
  const tint = active ? colours.accent : colours.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}
    >
      {/*
        A pill behind the active item rather than a hairline above it. The
        line version read as a stray progress bar pinned to the top edge of
        the bar, disconnected from the label it belonged to.
      */}
      <View
        style={[
          styles.tabPill,
          active ? { backgroundColor: colours.accentWash } : null,
        ]}
      >
        <Icon name={icon} size="md" colour={tint} />
      </View>
      {/*
        Label as well as icon, and never colour alone — but capped and pinned
        to one line. Uncapped, the three labels wrapped into each other at the
        largest text size and "Driver" ran off the right edge of the screen.
      */}
      <Text
        variant="label"
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={{ color: tint }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingTop: space.sm,
  },
  tab: {
    flex: 1,
    minHeight: target.standard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabPill: {
    paddingHorizontal: space.lg,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
