import { useMemo, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Icon, type IconName } from './components/Icon';
import { OfflineBanner } from './components/OfflineBanner';
import { Text } from './components/Text';
import { ThemeProvider, useColours, useTheme } from './design/theme';
import { radius, space, target } from './design/tokens';
import { BidsScreen } from './screens/BidsScreen';
import { ChainScreen } from './screens/ChainScreen';
import { DriverScreen } from './screens/DriverScreen';
import { DriverHistoryScreen } from './screens/DriverHistoryScreen';
import { FleetScreen } from './screens/FleetScreen';
import { FollowScreen } from './screens/FollowScreen';
import { IncidentScreen } from './screens/IncidentScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { PostLoadScreen } from './screens/PostLoadScreen';
import { ProofScreen } from './screens/ProofScreen';
import { ReturnLoadsScreen } from './screens/ReturnLoadsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ShareScreen } from './screens/ShareScreen';
import { TripDetailScreen } from './screens/TripDetailScreen';
import { TripsScreen } from './screens/TripsScreen';
import { VerificationScreen } from './screens/VerificationScreen';
import { useStacks } from './nav/stack';
import { demoNow, demoTrips } from './state/demo';

/**
 * Four faces, one binary.
 *
 * A tab bar rather than a role switcher because this build is a portfolio
 * walkthrough: in the product a driver never sees the shipper's list and a
 * shipper never sees the driver's screen, and the two are different apps
 * wearing the same icon.
 *
 * Each face keeps its own stack (`nav/stack.ts`), so switching tabs does not
 * lose your place and tapping the tab you are already on gets you out. This
 * replaced a `face` plus one boolean per screen, which was fine at four screens
 * and unreadable at fifteen.
 */
function Shell() {
  const colours = useColours();
  const { isDark } = useTheme();
  const now = useMemo(demoNow, []);

  const insets = useSafeAreaInsets();
  const { face, current, push, pop, select } = useStacks();

  /*
    The driver face is one trip, not a list — a driver has exactly one load on
    board. The first demo trip is that trip, and the report and hand-over
    screens need it.
  */
  const driverTrip = useMemo(() => demoTrips(now)[0], [now]);

  /**
   * Connectivity, faked.
   *
   * Real connectivity needs `@react-native-community/netinfo`, another native
   * dependency and another CocoaPods cycle. What matters for the design is
   * that the offline state is *authored* — a driver spends hours in it — so it
   * is wired to something a reviewer can toggle rather than left unbuilt.
   */
  const [online, setOnline] = useState(true);

  return (
    <View style={[styles.root, { backgroundColor: colours.surface }]}>
      {/* backgroundColor was Android-only and is gone in RN 0.87; the root
          View below paints the ground instead. */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/*
        An opaque strip behind the status bar.
        
        Scrolling content under the status bar is normal; doing it with nothing
        behind it is not, and "1 of 3 need a look" printed through the clock on
        the first Android run. The trip screen already had a header solving
        this for itself — this covers the screens that do not have one, in one
        place rather than three.
      */}
      <View
        pointerEvents="none"
        style={[styles.statusScrim, { height: insets.top, backgroundColor: colours.surface }]}
      />

      <View style={styles.body}>
        {current.name === 'trips' ? (
          <TripsScreen onOpen={(trip) => push({ name: 'trip', trip })} />
        ) : null}
        {current.name === 'trip' ? (
          <TripDetailScreen
            trip={current.trip}
            now={now}
            onBack={pop}
            onShare={() => push({ name: 'share', trip: current.trip })}
            onMessages={() => push({ name: 'messages', trip: current.trip })}
            onReport={() => push({ name: 'incident', trip: current.trip })}
            onProof={() => push({ name: 'pod', trip: current.trip })}
          />
        ) : null}
        {current.name === 'share' ? (
          <ShareScreen
            trip={current.trip}
            onBack={pop}
            onPreview={() => push({ name: 'follow', trip: current.trip })}
          />
        ) : null}
        {current.name === 'follow' ? (
          <FollowScreen trip={current.trip} onBack={pop} />
        ) : null}
        {current.name === 'messages' ? (
          <MessagesScreen trip={current.trip} onBack={pop} />
        ) : null}
        {current.name === 'incident' ? (
          <IncidentScreen trip={current.trip} onBack={pop} />
        ) : null}
        {current.name === 'pod' ? (
          <ProofScreen
            trip={current.trip}
            onBack={pop}
            onReview={() => push({ name: 'review', trip: current.trip })}
          />
        ) : null}
        {current.name === 'review' ? <ReviewScreen trip={current.trip} onBack={pop} /> : null}

        {current.name === 'loads' ? (
          <ReturnLoadsScreen
            onPost={() => push({ name: 'post' })}
            onChain={() => push({ name: 'chain' })}
          />
        ) : null}
        {current.name === 'post' ? <PostLoadScreen onBack={pop} /> : null}
        {current.name === 'chain' ? <ChainScreen onBack={pop} /> : null}

        {current.name === 'fleet' ? (
          <FleetScreen
            onOpenBids={() => push({ name: 'bids' })}
            onOpenVerification={() => push({ name: 'verification' })}
          />
        ) : null}
        {current.name === 'bids' ? <BidsScreen onBack={pop} /> : null}
        {current.name === 'verification' ? <VerificationScreen onBack={pop} /> : null}

        {current.name === 'driver' ? (
          <DriverScreen
            online={online}
            onToggleConnection={() => setOnline((was) => !was)}
            onOpenHistory={() => push({ name: 'history' })}
            onReport={() =>
              driverTrip !== undefined ? push({ name: 'driver-report', trip: driverTrip }) : undefined
            }
            onDeliver={() =>
              driverTrip !== undefined
                ? push({ name: 'driver-delivery', trip: driverTrip })
                : undefined
            }
          />
        ) : null}
        {current.name === 'history' ? <DriverHistoryScreen onBack={pop} /> : null}
        {current.name === 'driver-report' ? (
          <IncidentScreen trip={current.trip} onBack={pop} />
        ) : null}
        {current.name === 'driver-delivery' ? (
          <ProofScreen trip={current.trip} onBack={pop} />
        ) : null}
      </View>

      {/*
        In the layout, not over it. Absolutely positioned it covered whatever
        card happened to be at the bottom of the screen — and being offline is
        a fact about the whole app, so the app should make room for saying so.
      */}
      <OfflineBanner online={online} queued={18} />

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
            ['loads', 'Loads', 'swap'],
            ['fleet', 'Fleet', 'truck'],
            ['driver', 'Driver', 'wheel'],
          ] as const
        ).map(([value, label, icon]) => (
          <Tab
            key={value}
            label={label}
            icon={icon}
            active={face === value}
            onPress={() => select(value)}
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
  statusScrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
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
