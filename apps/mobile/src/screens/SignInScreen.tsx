import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CODE_LENGTH, RESEND_AFTER_MS, formatPhone, normalisePhone } from '@backhaul/domain';

import { useLanguage } from '../state/language';
import { refusalWords } from '../state/words';

import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Text } from '../components/Text';
import { radius, space, target, type } from '../design/tokens';
import { useColours } from '../design/theme';

/**
 * What came back.
 *
 * `null` worked. A string is **the server's own sentence**, written to be read
 * by a driver and held to the parity fixtures — it is shown verbatim.
 * `'unreachable'` is the case where there is no sentence, because there was no
 * server: this screen writes that one itself, in the reader's language.
 */
export type Answer =
  | null
  | {
      readonly kind: 'refused';
      /** The server's machine-readable reason, where it named one. */
      readonly code: string | null;
      /** Its own sentence — English, and the fallback for an unknown code. */
      readonly sentence: string;
    }
  | { readonly kind: 'unreachable' };

interface Props {
  readonly onRequestCode: (phone: string) => Promise<Answer>;
  readonly onVerify: (phone: string, code: string) => Promise<Answer>;
}

type Step = 'phone' | 'code';

/**
 * The first screen anybody sees.
 *
 * A phone number and a code, because that is the only sign-in this market
 * supports: a driver has a number and often no email address, and a password
 * is a thing to forget on a device shared between two drivers on alternate
 * weeks.
 *
 * Two decisions carry the screen. The number is **normalised as it is typed**
 * and echoed back the way it is said out loud, so somebody who writes
 * `+234 803` and somebody who writes `0803` both see `0803 123 4567` and know
 * they are signing into the same thing. And the resend is a **countdown**
 * rather than a disabled button: somebody whose SMS has not arrived needs to
 * know they are waiting rather than that something is broken.
 */
export function SignInScreen({ onRequestCode, onVerify }: Props) {
  const colours = useColours();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>('phone');
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Answer>(null);
  const [resendIn, setResendIn] = useState(0);

  const phone = useMemo(() => normalisePhone(typed), [typed]);

  // The countdown. Cleared on unmount and on reaching zero, because a timer
  // left running behind a signed-in app is a wakeup a second for as long as
  // the process lives.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setInterval(() => {
      setResendIn((was) => Math.max(0, was - 1_000));
    }, 1_000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const ask = async () => {
    if (phone === null || busy) return;
    setBusy(true);
    setRefusal(null);

    const failed = await onRequestCode(phone);
    setBusy(false);

    if (failed !== null) {
      setRefusal(failed);
      return;
    }

    setStep('code');
    setResendIn(RESEND_AFTER_MS);
  };

  const verify = async (entered: string) => {
    if (phone === null || busy) return;
    setBusy(true);
    setRefusal(null);

    const failed = await onVerify(phone, entered);
    setBusy(false);

    if (failed !== null) {
      setRefusal(failed);
      // Cleared on a refusal. Leaving six wrong digits in the field means the
      // next attempt starts with a backspace, and the server is counting.
      setCode('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colours.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Icon name="truck" size="lg" colour={colours.accent} />
          <Text variant="headline">Backhaul</Text>
        </View>

        {step === 'phone' ? (
          <>
            <Text variant="title">{t('your_phone_number')}</Text>
            <Text variant="body" tone="secondary">
              {t('we_will_send_a_code')}
            </Text>

            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="0803 123 4567"
              placeholderTextColor={colours.textSecondary}
              accessibilityLabel={t('your_phone_number')}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              autoFocus
              style={[
                styles.field,
                {
                  color: colours.textPrimary,
                  backgroundColor: colours.surfaceDim,
                  borderColor:
                    phone === null && typed.length > 3 ? colours.stopped : colours.outline,
                  fontFamily: type.bodyDriver.fontFamily,
                  fontSize: type.bodyDriver.fontSize,
                },
              ]}
            />

            {/*
              Echoed back normalised, as it is said out loud. Somebody who
              typed `+234 803` and somebody who typed `0803` both see the same
              thing and know they are signing into the same account.
            */}
            {phone !== null ? (
              <View style={styles.confirm}>
                <Icon name="check" size="sm" colour={colours.moving} />
                <Text variant="body" tone="moving">
                  {formatPhone(phone)}
                </Text>
              </View>
            ) : typed.length > 3 ? (
              <Text variant="label" tone="stopped">
                {t('not_a_nigerian_number')}
              </Text>
            ) : null}

            <Press
              onPress={() => void ask()}
              disabled={phone === null || busy}
              accessibilityLabel={t('send_me_a_code')}
              style={[styles.primary, { backgroundColor: colours.accent }]}
            >
              <Text variant="title" style={{ color: colours.onAccent }}>
                {busy ? t('sending') : t('send_me_a_code')}
              </Text>
            </Press>
          </>
        ) : (
          <>
            <Text variant="title">{t('enter_the_code')}</Text>
            {/*
              The number is rendered *beside* the phrase rather than inside
              it. Word order differs between these four languages, and a
              template with a hole in it assumes it does not.
            */}
            <Text variant="body" tone="secondary">
              {phone === null ? typed : formatPhone(phone)} · {t('sent_by_sms')}
            </Text>

            <TextInput
              value={code}
              onChangeText={(next) => {
                const digits = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
                setCode(digits);
                // Submits itself at six digits. Asking somebody to type six
                // numbers and then find a button is one step too many on a
                // screen they are on because they want to be somewhere else.
                if (digits.length === CODE_LENGTH) void verify(digits);
              }}
              placeholder="123456"
              placeholderTextColor={colours.textSecondary}
              accessibilityLabel={t('enter_the_code')}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              autoFocus
              style={[
                styles.field,
                styles.codeField,
                {
                  color: colours.textPrimary,
                  backgroundColor: colours.surfaceDim,
                  borderColor: refusal === null ? colours.outline : colours.exception,
                },
              ]}
            />

            <View style={styles.resendRow}>
              {resendIn > 0 ? (
                // The count first, then the action it becomes, in the same
                // shape as the phone number above. "Another code in 55s" needs
                // a hole in the middle of a sentence, and word order differs
                // across the four languages — so the number sits beside the
                // phrase rather than inside it.
                <Text variant="label" tone="secondary">
                  {Math.ceil(resendIn / 1_000)}s · {t('send_another_code')}
                </Text>
              ) : (
                <Press
                  onPress={() => void ask()}
                  accessibilityLabel={t('send_another_code')}
                  feedback="opacity"
                  style={styles.resend}
                >
                  <Text variant="label" tone="accent">
                    {t('send_another_code')}
                  </Text>
                </Press>
              )}

              <Press
                onPress={() => {
                  setStep('phone');
                  setCode('');
                  setRefusal(null);
                }}
                accessibilityLabel={t('change_number')}
                feedback="opacity"
                style={styles.resend}
              >
                <Text variant="label" tone="secondary">
                  {t('change_number')}
                </Text>
              </Press>
            </View>
          </>
        )}

        {/*
          The server's reason, in the reader's words.

          It knows things this screen cannot — how many tries are left, whether
          the code was already used — and it names each of them with a code as
          well as a sentence. The code is what this renders from; `otp.ts` holds
          both implementations to the same *English* sentence through the parity
          fixtures, and English is one language out of the four this is read in.

          A code the app has not seen falls back to the server's own words. That
          is English, and it is honest: true words in the wrong language beat a
          guess, and it is visible in a way "something went wrong" would not be.

          The one exception is the case where there is no sentence because
          there was no server. That used to render `error.message`, which put
          "Network request failed" in front of somebody reading Yorùbá: English,
          written for whoever wrote the fetch call, and no use to the person
          holding the phone. The kind is the fact; the words are this screen's.
        */}
        {refusal !== null ? (
          <View style={[styles.refusal, { backgroundColor: colours.exceptionWash }]}>
            <Icon name="alert" size="sm" colour={colours.exception} />
            <Text variant="body" tone="exception" style={styles.flex}>
              {refusal.kind === 'unreachable'
                ? t('could_not_reach')
                : refusalWords(refusal.code, refusal.sentence, t)}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  field: {
    minHeight: target.driver,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: space.lg,
  },
  codeField: {
    fontSize: 32,
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primary: {
    minHeight: target.driver,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: space.sm,
  },
  resend: { paddingVertical: space.sm },
  refusal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
});
