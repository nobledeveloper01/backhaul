import { useMemo, useState } from 'react';
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
import { Text } from '../components/Text';
import { agoLabel, humanDuration } from '../components/PositionAge';
import { radius, space, target, type } from '../design/tokens';
import { useColours } from '../design/theme';
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

  const [messages, setMessages] = useState<readonly Message[]>(() => demoMessages(trip, now));
  const [draft, setDraft] = useState('');

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

  const send = () => {
    if (!attempt.ok) return;
    setMessages((was) => [...was, attempt.message]);
    setDraft('');
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
          Everyone on this trip sees these. They stay with the trip after it is
          delivered.
        </Text>

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
        {over > 0 ? (
          <Text variant="label" tone="exception">
            {over} over — keep it short, or call.
          </Text>
        ) : null}

        <View style={styles.composerRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message the driver and carrier"
            placeholderTextColor={colours.textSecondary}
            accessibilityLabel="Write a message"
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
            accessibilityLabel="Send"
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
            {agoLabel(now.getTime() - message.at.getTime())}
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
                Waiting for signal
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
            Written in a dead zone · arrived {humanDuration(held)} later
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
