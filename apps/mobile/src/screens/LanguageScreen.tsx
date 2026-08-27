import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LANGUAGES, describeLanguage, say, type Language } from '@backhaul/domain';

import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Text } from '../components/Text';
import { radius, space, target } from '../design/tokens';
import { useColours } from '../design/theme';

interface Props {
  readonly onChoose: (language: Language) => void;
  /** Set when this is reached from settings rather than at first launch. */
  readonly current?: Language | undefined;
  readonly onBack?: (() => void) | undefined;
}

/**
 * The very first screen.
 *
 * Before the phone number, before anything. A sign-in screen in the wrong
 * language is the first thing a person cannot get past, and asking afterwards
 * means the one screen everybody must use is the one screen nobody could
 * choose the language of.
 *
 * **Every option is written in its own language, and its own words are the
 * only words on it.** "Hausa (Nigeria)" is a database row; `Hausa` is what
 * somebody is looking for. The question above each option is written in that
 * language too — so a person who reads no English can still tell which row is
 * theirs, and a person who reads only English is not left guessing either.
 *
 * English is last on purpose. Putting it first makes the other three look like
 * an afterthought bolted on for somebody else.
 */
export function LanguageScreen({ onChoose, current, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { backgroundColor: colours.surface }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.head}>
          <Icon name="truck" size="lg" colour={colours.accent} />
          <Text variant="headline">Backhaul</Text>
        </View>

        {LANGUAGES.map((language) => {
          const selected = current === language;

          return (
            <Press
              key={language}
              onPress={() => onChoose(language)}
              accessibilityLabel={describeLanguage(language)}
              accessibilityHint={say(language, 'choose_language')}
              feedback="opacity"
              style={[
                styles.option,
                {
                  backgroundColor: selected ? colours.accentWash : colours.surfaceRaised,
                  borderColor: selected ? colours.accent : colours.outline,
                },
              ]}
            >
              <View style={styles.flex}>
                <Text variant="title" tone={selected ? 'accent' : 'primary'}>
                  {describeLanguage(language)}
                </Text>
                {/*
                  The question, asked in the language of the row it is on. A
                  person who reads no English can still tell which one is
                  theirs — which is the entire job of this screen.
                */}
                <Text variant="body" tone="secondary">
                  {say(language, 'choose_language')}
                </Text>
              </View>

              <Icon
                name={selected ? 'check' : 'chevron-right'}
                size="md"
                colour={selected ? colours.accent : colours.outline}
              />
            </Press>
          );
        })}

        {/*
          Only once there is a language to write it in.

          At first launch there is no answer to `current`, so this line was
          rendering in English under four rows that had each just gone to the
          trouble of asking in their own language. It says "you can change this
          later", which is worth nothing to somebody who cannot read it — and
          every row already carries its own question, which is the whole job of
          this screen. Reached from settings, the language is known and the
          reassurance lands.
        */}
        {current !== undefined ? (
          <Text variant="label" tone="secondary" style={styles.footer}>
            {say(current, 'choose_language_detail')}
          </Text>
        ) : null}

        {onBack !== undefined ? (
          <Press
            onPress={onBack}
            accessibilityLabel={say(current ?? 'en', 'back')}
            feedback="opacity"
            style={[styles.back, { borderColor: colours.outline }]}
          >
            <Text variant="label" tone="secondary">
              {say(current ?? 'en', 'back')}
            </Text>
          </Press>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    // Driver-sized, on every face. This screen is read by somebody who has
    // just been handed a phone, in whatever light they happen to be in.
    minHeight: target.driver + space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  footer: { marginTop: space.md, textAlign: 'center' },
  back: {
    alignSelf: 'center',
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
