import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { space, target } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';

interface Props {
  readonly title: string;
  readonly onBack?: (() => void) | undefined;
}

/**
 * An opaque bar pinned above the scroll.
 *
 * It exists because of what a full-screen ScrollView looks like without one:
 * the content scrolls under the status bar with nothing behind it, so "Agreed
 * fare" ends up printed through the clock. Every iOS app scrolls content under
 * the status bar; the ones that look right have something opaque up there.
 *
 * Found by scrolling the screen, not by a test.
 */
export function ScreenHeader({ title, onBack }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  // Every back button in the app comes through here, which makes it the
  // cheapest place in the product to translate and the most-read.
  const { t } = useLanguage();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          backgroundColor: colours.surface,
          borderBottomColor: colours.outline,
        },
      ]}
    >
      <View style={styles.row}>
        {onBack !== undefined ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            hitSlop={space.md}
            style={styles.back}
          >
            <Text variant="body" tone="accent">
              ‹ {t('back')}
            </Text>
          </Pressable>
        ) : null}
        {/*
          Two lines and a capped scale, rather than one line and an ellipsis.
          At the largest accessibility size "Lagos → Kano" truncated to
          "Lagos →…", which loses the destination — the single most useful word
          on the screen. Capping the growth keeps the whole route legible.
        */}
        <Text
          variant="title"
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
          style={styles.title}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  row: {
    minHeight: target.standard,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  back: { justifyContent: 'center' },
  title: { flex: 1 },
});
