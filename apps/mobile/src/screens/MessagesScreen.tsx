import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MAX_MESSAGE_CHARS,
  compose,
  delayed,
  thread,
  type Message,
  type Party,
} from '@backhaul/domain';

import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScreenHeader } from '../components/ScreenHeader';
import { Unready } from '../components/Unready';
import { Text } from '../components/Text';
import { agoLabel, humanDuration } from '../components/PositionAge';
import { radius, space, target, type } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';
import { useSession } from '../state/session';
import { useTripData } from '../state/server';
import { map } from '../api/client';
import { demoNow, type DemoTrip } from '../state/demo';
import { demoMessages } from '../state/product';

interface Props {
  readonly trip: DemoTrip;
  readonly onBack: () => void;
}

/** Who this device is. In the product it comes from the session. */
const ME: Party = 'shipper';

/**
 * The conversation, attached to the trip.
 *
 * Today this happens in a WhatsApp group with forty other messages in it, and
 * when a delivery is argued about the argument is reconstructed from a phone
 * that has since been sold. Here it is part of the trip, and it is part of the
 * dispute pack.
 *
 * The screen's one hard job is being honest about **time**: a message written
 * in a dead zone and delivered eleven hours later has to show both, or it
 * misrepresents whoever wrote it.
 */
export function MessagesScreen({ trip, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const now = useMemo(demoNow, []);
  const { t } = useLanguage();

  const { api } = useSession();

  const { query, refresh } = useTripData(
    trip.live,
    async () =>
      map(await api.messages(trip.id), (rows) =>
        rows.map<Message>((row) => ({
          id: row.id,
          tripId: trip.id,
          from: row.from as Party,
          body: row.body,
          at: row.at,
          receivedAt: row.receivedAt,
          readBy: row.readBy as readonly Party[],
        })),
      ),
    () => demoMessages(trip, now),
    [api, trip.id, now],
  );

  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState(false);
  const [unmarked, setUnmarked] = useState(false);

  /*
    Which trip this device has already told the server it has read.

    The id rather than a flag. Today a flag would do — `App.tsx` renders this
    screen only while the route is `messages`, and the stack pops back to the
    trip before another thread can open, so it always remounts. The id costs
    nothing and does not depend on that staying true: the day this screen is
    reached from a second list without unmounting, a flag would leave the
    second trip's thread marked read by the first one's receipt, and the bug
    would be a badge cleared for a message nobody saw.
  */
  const marked = useRef<string | null>(null);

  /*
    Read means read *on a screen*, so this waits for the messages.

    The receipt is what clears the unread count for everyone else on the trip.
    Sending it when the component mounts would clear it on a phone that never
    managed to fetch the thread — the badge goes quiet and the message has been
    seen by nobody.
  */
  const markRead = useCallback(() => {
    if (!trip.live || marked.current === trip.id) return;

    marked.current = trip.id;
    setUnmarked(false);

    void api.markRead(trip.id, ME).then((result) => {
      if (result.ok) return;
      // Cleared so the retry below can try again. Failing silently leaves the
      // rest of the trip being pinged about a message that has been read.
      marked.current = null;
      setUnmarked(true);
    });
  }, [api, trip.id, trip.live]);

  useEffect(() => {
    if (query.state === 'ready') markRead();
  }, [query.state, markRead]);

  const messages = query.state === 'ready' ? query.value : [];
  const ordered = useMemo(() => thread(messages), [messages]);

  const attempt = compose({
    id: `${trip.id}-${messages.length}`,
    tripId: trip.id,
    from: ME,
    body: draft,
    at: now,
    parties: ['shipper', 'carrier', 'driver'],
    tripFinished: false,
  });

  /*
    Cleared on the way out, not on the way back.

    A driver who has just typed a message on a bad connection should see it
    leave the box; leaving the text in place until the server answers reads as
    the app having ignored them, and they type it again. If the send fails the
    thread reloads without it and the failure is said out loud.
  */
  const send = () => {
    if (!attempt.ok) return;

    setDraft('');
    setFailed(false);

    if (!trip.live) {
      refresh();
      return;
    }

    void api
      .sendMessage(trip.id, {
        id: attempt.message.id,
        from: attempt.message.from,
        body: attempt.message.body,
        at: attempt.message.at,
      })
      .then((result) => {
        if (result.ok) refresh();
        else setFailed(true);
      });
  };

  const over = draft.trim().length - MAX_MESSAGE_CHARS;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title={`${trip.originName} → ${trip.destinationName}`} onBack={onBack} />

      <ScrollView contentContainerStyle={styles.thread}>
        <Text variant="label" tone="secondary" style={styles.lede}>
          {t('everyone_sees_these')}
        </Text>

        {/*
          Four answers, not two. A thread that cannot be loaded is not an empty
          thread — the messages are there and this phone cannot see them.

          Was written out here, correctly, and with no way forward: three
          sentences and nothing to press. `Unready` carries the retry.
        */}
        <Unready query={query} onRetry={refresh} />

        {ordered.map((message) => (
          <Bubble key={message.id} message={message} now={now} />
        ))}
      </ScrollView>

      <View
        style={[
          styles.composer,
          {
            backgroundColor: colours.surface,
            borderTopColor: colours.outline,
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        {failed ? (
          <Text variant="label" tone="exception">
            {t('not_sent_yet')}
          </Text>
        ) : null}

        {/*
          Grey rather than red, and beside a way to fix it. Nothing the reader
          did failed and nothing they wrote was lost — the thread is read and
          the rest of the trip has not been told yet.
        */}
        {unmarked ? (
          <View style={styles.unmarked}>
            <Text variant="label" tone="secondary" style={styles.flex}>
              {t('still_marked_unread')}
            </Text>
            <Press
              onPress={markRead}
              accessibilityLabel={t('try_again')}
              feedback="opacity"
              hitSlop={space.sm}
              style={[styles.retry, { borderColor: colours.outline }]}
            >
              <Text variant="label" tone="accent">
                {t('try_again')}
              </Text>
            </Press>
          </View>
        ) : null}

        {over > 0 ? (
          <Text variant="label" tone="exception">
            {over} {t('over_keep_it_short')}
          </Text>
        ) : null}

        <View style={styles.composerRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('write_a_message')}
            placeholderTextColor={colours.textSecondary}
            accessibilityLabel={t('write_a_message')}
            multiline
            style={[
              styles.input,
              {
                color: colours.textPrimary,
                backgroundColor: colours.surfaceDim,
                borderColor: colours.outline,
                fontFamily: type.body.fontFamily,
                fontSize: type.body.fontSize,
              },
            ]}
          />
          <Press
            onPress={send}
            disabled={!attempt.ok}
            accessibilityLabel={t('send')}
            style={[styles.send, { backgroundColor: colours.accent }]}
          >
            <Icon name="chevron-right" size="md" colour={colours.onAccent} />
          </Press>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, now }: { message: Message; now: Date }) {
  const colours = useColours();
  const { t } = useLanguage();
  const mine = message.from === ME;
  const held = delayed(message);
  const pending = message.receivedAt === null;

  return (
    <View style={[styles.bubbleRow, mine ? styles.mine : styles.theirs]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? colours.accentWash : colours.surfaceDim,
            borderColor: mine ? colours.accent : colours.outline,
          },
        ]}
      >
        {!mine ? (
          <Text variant="overline" tone="secondary">
            {message.from.toUpperCase()}
          </Text>
        ) : null}

        <Text variant="body">{message.body}</Text>

        <View style={styles.bubbleFooter}>
          <Text variant="label" tone="secondary">
            {agoLabel(now.getTime() - message.at.getTime(), t)}
          </Text>

          {/*
            "Sent" is a claim, and until the server has the message it is not
            true. A driver who believes a message went out and learns days
            later that it did not was misled by the screen, not the network.
          */}
          {pending ? (
            <View style={styles.pending}>
              <Icon name="clock" size="sm" colour={colours.stale} />
              <Text variant="label" tone="stale">
                {t('waiting_for_signal')}
              </Text>
            </View>
          ) : null}
        </View>

        {/*
          The gap between writing and arriving, said out loud. Without it a
          shipper reads "at the weighbridge" stamped two hours ago and concludes
          nobody told them for two hours.
        */}
        {held !== null ? (
          <Text variant="label" tone="secondary" style={styles.held}>
            {t('written_in_a_dead_zone')} {humanDuration(held, t)} {t('later')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  unmarked: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  retry: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  thread: { padding: space.lg, gap: space.md },
  lede: { marginBottom: space.sm },
  bubbleRow: { flexDirection: 'row' },
  mine: { justifyContent: 'flex-end' },
  theirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '86%',
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: space.xs,
  },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  held: { marginTop: space.xs },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1,
    minHeight: target.standard,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  send: {
    width: target.standard,
    height: target.standard,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
