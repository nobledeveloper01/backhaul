import { StyleSheet, TextInput, View } from 'react-native';

import { Icon } from './Icon';
import { Press } from './Press';
import { radius, space, target, type } from '../design/tokens';
import { useColours } from '../design/theme';
import { useLanguage } from '../state/language';

interface Props {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly accessibilityLabel: string;
}

/**
 * One search field, used by both boards.
 *
 * The clear button only appears once there is something to clear. A permanent
 * ✕ inside an empty field is a control that does nothing nine times out of
 * ten, and it sits exactly where a thumb lands when reaching for the keyboard.
 */
export function SearchField({ value, onChange, placeholder, accessibilityLabel }: Props) {
  const { t } = useLanguage();
  const colours = useColours();

  return (
    <View
      style={[
        styles.field,
        { backgroundColor: colours.surfaceDim, borderColor: colours.outline },
      ]}
    >
      <Icon name="search" size="sm" colour={colours.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colours.textSecondary}
        accessibilityLabel={accessibilityLabel}
        autoCorrect={false}
        autoCapitalize="none"
        // `search` rather than `done`: it labels the return key for what it
        // does, and on Android it dismisses without submitting a form that
        // does not exist.
        returnKeyType="search"
        clearButtonMode="never"
        style={[
          styles.input,
          {
            color: colours.textPrimary,
            fontFamily: type.body.fontFamily,
            fontSize: type.body.fontSize,
          },
        ]}
      />
      {value.length > 0 ? (
        <Press
          onPress={() => onChange('')}
          accessibilityLabel={t('clear_the_search')}
          feedback="opacity"
          style={styles.clear}
        >
          <Icon name="close" size="sm" colour={colours.textSecondary} />
        </Press>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: target.standard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  input: { flex: 1, paddingVertical: space.sm },
  clear: {
    width: space.xl,
    height: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
