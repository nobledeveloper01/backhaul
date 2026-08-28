import { useMemo, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Icon, type IconName } from './components/Icon';
import { OfflineBanner } from './components/OfflineBanner';
import { Splash, SPLASH_FIELD } from './components/Splash';
import { Text } from './components/Text';
import { ThemeProvider, useColours, useTheme } from './design/theme';
import { radius, space, target } from './design/tokens';
import { AlertsScreen } from './screens/AlertsScreen';
import { BidsScreen } from './screens/BidsScreen';
import { CancelScreen } from './screens/CancelScreen';
import { ChainScreen } from './screens/ChainScreen';
import { DisputeScreen } from './screens/DisputeScreen';
import { DropsScreen } from './screens/DropsScreen';
import { DriverScreen } from './screens/DriverScreen';
import { DriverHistoryScreen } from './screens/DriverHistoryScreen';
import { FleetScreen } from './screens/FleetScreen';
import { FollowScreen } from './screens/FollowScreen';
import { IncidentScreen } from './screens/IncidentScreen';
import { LanesScreen } from './screens/LanesScreen';
import { LeviesScreen } from './screens/LeviesScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { PairsScreen } from './screens/PairsScreen';
import { PostLoadScreen } from './screens/PostLoadScreen';
import { ProofScreen } from './screens/ProofScreen';
import { ReturnLoadsScreen } from './screens/ReturnLoadsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { ShareScreen } from './screens/ShareScreen';
import { TripDetailScreen } from './screens/TripDetailScreen';
import { TripsScreen } from './screens/TripsScreen';
import { VehiclesScreen } from './screens/VehiclesScreen';
import { VerificationScreen } from './screens/VerificationScreen';
import { useStacks } from './nav/stack';
import { LanguageProvider, useLanguage } from './state/language';
import { useNotifications } from './state/notifications';
import { LanguageScreen } from './screens/LanguageScreen';
import { SessionProvider, useSession } from './state/session';
import { SignInScreen } from './screens/SignInScreen';
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
  /*
    This install registers for notifications as soon as somebody is signed in.

    Not when they open the alerts screen: a person who never opens it should
    still be told their truck has stalled, and the alerting path was built end
    to end except that nothing ever called `registerDevice`. See ADR-0013 for
    why a token is registered only when it is real.
  */
  const colours = useColours();
  const { isDark } = useTheme();
  const now = useMemo(demoNow, []);

  const insets = useSafeAreaInsets();
  const { face, current, push, pop, select } = useStacks();
  const { t, language, setLanguage } = useLanguage();
  const { api, who } = useSession();

  const deliverable = useNotifications(api, who?.userId ?? null);

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
            onDispute={() => push({ name: 'dispute', trip: current.trip })}
            onCancel={() => push({ name: 'cancel', trip: current.trip })}
            onDrops={() => push({ name: 'drops', trip: current.trip })}
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
        {current.name === 'dispute' ? <DisputeScreen trip={current.trip} onBack={pop} /> : null}
        {current.name === 'cancel' ? <CancelScreen trip={current.trip} onBack={pop} /> : null}
        {current.name === 'drops' ? <DropsScreen trip={current.trip} onBack={pop} /> : null}

        {current.name === 'loads' ? (
          <ReturnLoadsScreen
            onPost={() => push({ name: 'post' })}
            onChain={() => push({ name: 'chain' })}
            onLanes={() => push({ name: 'lanes' })}
            onPairs={() => push({ name: 'pairs' })}
          />
        ) : null}
        {current.name === 'post' ? <PostLoadScreen onBack={pop} /> : null}
        {current.name === 'chain' ? <ChainScreen onBack={pop} /> : null}
        {current.name === 'lanes' ? (
          <LanesScreen onBack={pop} onPost={() => push({ name: 'post' })} />
        ) : null}
        {current.name === 'pairs' ? <PairsScreen onBack={pop} /> : null}

        {current.name === 'fleet' ? (
          <FleetScreen
            onOpenBids={() => push({ name: 'bids' })}
            onOpenVerification={() => push({ name: 'verification' })}
            onOpenVehicles={() => push({ name: 'vehicles' })}
            onOpenAlerts={() => push({ name: 'alerts' })}
          />
        ) : null}
        {current.name === 'bids' ? <BidsScreen onBack={pop} /> : null}
        {current.name === 'verification' ? <VerificationScreen onBack={pop} /> : null}
        {current.name === 'vehicles' ? <VehiclesScreen onBack={pop} /> : null}
        {current.name === 'alerts' ? (
          <AlertsScreen onBack={pop} deliverable={deliverable} />
        ) : null}

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
            onLevies={() =>
              driverTrip !== undefined ? push({ name: 'levies', trip: driverTrip }) : undefined
            }
            onLanguage={() => push({ name: 'language' })}
          />
        ) : null}
        {current.name === 'history' ? <DriverHistoryScreen onBack={pop} /> : null}
        {current.name === 'driver-report' ? (
          <IncidentScreen trip={current.trip} onBack={pop} />
        ) : null}
        {current.name === 'driver-delivery' ? (
          <ProofScreen trip={current.trip} onBack={pop} />
        ) : null}
        {current.name === 'levies' ? <LeviesScreen trip={current.trip} onBack={pop} /> : null}
        {current.name === 'language' ? (
          <LanguageScreen
            current={language}
            onChoose={(next) => {
              setLanguage(next);
              pop();
            }}
            onBack={pop}
          />
        ) : null}
      </View>

      {/*
        In the layout, not over it. Absolutely positioned it covered whatever
        card happened to be at the bottom of the screen — and being offline is
        a fact about the whole app, so the app should make room for saying so.
      */}
      {/*
        No count here. This banner is on every face and only the driver's runs
        the capture loop, so the app shell has no honest number to put in it —
        it used to pass a literal 18, which is a specific claim about somebody's
        own evidence made by chrome that has never spoken to the queue. The
        driver's screen shows the real depth.
      */}
      <OfflineBanner online={online} queued={null} />

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
        {/*
          The tab bar is the one piece of chrome on every screen, so it is the
          first thing that has to speak the reader's language — a person who
          cannot find "Loads" cannot use the rest of what was translated.
        */}
        {(
          [
            ['shipper', 'trips', 'list'],
            ['loads', 'loads', 'swap'],
            ['fleet', 'fleet', 'truck'],
            ['driver', 'driver', 'wheel'],
          ] as const
        ).map(([value, phrase, icon]) => (
          <Tab
            key={value}
            label={t(phrase)}
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

/**
 * Signed in, or not.
 *
 * `ready` gates both: until storage has been read, showing the sign-in screen
 * would flash it at somebody who is already signed in, and showing the app
 * would flash it at somebody who is not. A frame of nothing is the honest
 * answer while the question is still open.
 *
 * The demo screens do not need a session — every figure they show comes from
 * `state/demo.ts` — so this is deliberately a *gate* rather than a rewiring of
 * the app: signing in is real, and what it unlocks is still the walkthrough.
 * The API client behind `useSession` is the one that will replace that, trip
 * by trip, as each endpoint lands.
 */
function Gate() {
  const { who, ready, api, signIn } = useSession();
  const { chosen, ready: languageReady, setLanguage } = useLanguage();

  /*
    The splash covers the frames of nothing.

    Storage has to answer before either screen can be shown — showing one
    early flashes the wrong one at somebody — and on the handsets this product
    is built for that answer, plus the cold start before it, is over a second.
    That second used to be a blank rectangle in whatever the theme's surface
    colour happened to be.

    It sits *over* the tree rather than instead of it, so the app mounts and
    settles behind it and there is nothing left to wait for when it leaves.
  */
  const [splashDone, setSplashDone] = useState(false);
  const settled = ready && languageReady;

  // A frame of nothing while storage answers. Showing either screen before
  // then flashes the wrong one at somebody.
  if (!settled) {
    return (
      // The splash's own field, not the theme's surface. The theme is not
      // known yet — the stored appearance is read from the same storage this
      // is waiting on — so `colours.surface` is white here even on a phone set
      // to dark, and the splash's fade-out revealed it for a few frames.
      <View style={[styles.root, { backgroundColor: SPLASH_FIELD }]}>
        {splashDone ? null : <Splash ready={false} onDone={() => setSplashDone(true)} />}
      </View>
    );
  }

  // Before the phone number, before anything. A sign-in screen in the wrong
  // language is the first thing a person cannot get past.
  const over = splashDone ? null : (
    <Splash ready={settled} onDone={() => setSplashDone(true)} />
  );

  if (!chosen) {
    return (
      <>
        <LanguageScreen onChoose={setLanguage} />
        {over}
      </>
    );
  }

  if (who === null) {
    return (
      <>
      <SignInScreen
        onRequestCode={async (phone) => {
          const result = await api.requestCode(phone);
          if (result.ok) return null;
          return result.failure.kind === 'unreachable'
            ? { kind: 'unreachable' }
            : {
                kind: 'refused',
                code: result.failure.code,
                sentence: result.failure.detail,
              };
        }}
        onVerify={async (phone, code) => {
          const result = await api.verifyCode(phone, code);
          if (!result.ok) {
            return result.failure.kind === 'unreachable'
              ? { kind: 'unreachable' }
              : {
                  kind: 'refused',
                  code: result.failure.code,
                  sentence: result.failure.detail,
                };
          }
          signIn(result.value);
          return null;
        }}
      />
      {over}
      </>
    );
  }

  return (
    <>
      <Shell />
      {over}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LanguageProvider>
          <SessionProvider>
            <Gate />
          </SessionProvider>
        </LanguageProvider>
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
