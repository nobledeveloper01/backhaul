/**
 * The driver face, in Hausa.
 *
 * Hausa is the working language of the northern corridors this product is
 * built around, and the driver face is the one surface where the reader had no
 * say in what they are using. A shipper chose this app; a driver was handed a
 * phone.
 *
 * Only the **driver's** strings are here, and that is the whole design. The
 * shipper and fleet screens are dense, changing, and read by people who work
 * in English every day; translating them would double the copy surface and
 * halve the rate at which either version improves. The driver face is twenty
 * sentences that barely change.
 *
 * The strings live in the domain rather than in a screen for one reason:
 * **`en` and `ha` must be the same shape, and a missing key must be a compile
 * error rather than a blank on a phone in a cab.** `Record<Phrase, string>`
 * does that; a JSON file loaded at runtime does not.
 */

export type Language = 'en' | 'ha';

export type Phrase =
  | 'tracking_on'
  | 'tracking_off'
  | 'no_signal'
  | 'saved_on_phone'
  | 'battery_saving'
  | 'i_have_loaded'
  | 'i_have_arrived'
  | 'hand_over'
  | 'report_problem'
  | 'take_photo'
  | 'ask_for_signature'
  | 'sent'
  | 'waiting_for_signal'
  | 'your_trips'
  | 'what_it_paid'
  | 'money_on_the_road'
  | 'back_to_trip'
  | 'help_is_coming';

/**
 * English, and the source of truth for meaning.
 *
 * Written first and kept plain: every one of these is translated, and a
 * sentence with an idiom in it translates into an idiom nobody uses.
 */
export const EN: Readonly<Record<Phrase, string>> = {
  tracking_on: 'Recording your trip',
  tracking_off: 'Not recording',
  no_signal: 'No signal — still recording',
  saved_on_phone: 'Saved on your phone until the signal comes back',
  battery_saving: 'Saving battery — recording less often',
  i_have_loaded: "I've loaded",
  i_have_arrived: "I've arrived",
  hand_over: 'Hand over',
  report_problem: 'Report a problem',
  take_photo: 'Take a photo',
  ask_for_signature: 'Ask them to sign',
  sent: 'Sent',
  waiting_for_signal: 'Waiting for signal',
  your_trips: 'Your trips',
  what_it_paid: 'What it paid',
  money_on_the_road: 'Money paid on the road',
  back_to_trip: 'Back to the trip',
  help_is_coming: 'Stay calm. Your carrier has been told.',
} as const;

/**
 * Hausa.
 *
 * Boko orthography, which is what a phone keyboard produces and what a driver
 * reads on a road sign. The hooked letters (ɓ, ɗ, ƙ) are kept — dropping them
 * is the difference between two different words, and a product that writes a
 * language carelessly is a product that says what it thinks of its readers.
 */
export const HA: Readonly<Record<Phrase, string>> = {
  tracking_on: 'Ana yin rikodin tafiyarka',
  tracking_off: 'Ba a yin rikodi',
  no_signal: 'Babu siginar — har yanzu ana yin rikodi',
  saved_on_phone: 'An ajiye a wayarka har sai siginar ta dawo',
  battery_saving: 'Ana adana baturi — ana rikodi da wuya',
  i_have_loaded: 'Na yi loda',
  i_have_arrived: 'Na iso',
  hand_over: 'Mika kaya',
  report_problem: 'Ba da rahoton matsala',
  take_photo: 'Ɗauki hoto',
  ask_for_signature: 'Nemi ya sa hannu',
  sent: 'An aika',
  waiting_for_signal: 'Ana jiran sigina',
  your_trips: 'Tafiye-tafiyenka',
  what_it_paid: 'Abin da aka biya',
  money_on_the_road: 'Kuɗin da aka biya a kan hanya',
  back_to_trip: 'Koma ga tafiya',
  help_is_coming: 'Ka kwantar da hankalinka. An sanar da mai motar.',
} as const;

const TABLES: Readonly<Record<Language, Readonly<Record<Phrase, string>>>> = {
  en: EN,
  ha: HA,
} as const;

/**
 * A phrase, in a language.
 *
 * No fallback chain and no interpolation. A fallback chain means a screen can
 * silently render English to a Hausa reader and nobody finds out; the type
 * means it cannot happen. Interpolation is absent because word order differs
 * between these two languages and a template with a hole in it assumes it does
 * not — numbers are rendered beside a phrase, never inside one.
 */
export function say(language: Language, phrase: Phrase): string {
  return TABLES[language][phrase];
}

/**
 * Every phrase, for a screen that wants them all at once.
 *
 * Cheaper than eighteen calls and, more usefully, it is the thing a test can
 * hold both tables against.
 */
export function phrases(language: Language): Readonly<Record<Phrase, string>> {
  return TABLES[language];
}

/** What the language is called, in itself. Never "Hausa (Nigeria)". */
export function describeLanguage(language: Language): string {
  return language === 'ha' ? 'Hausa' : 'English';
}

/**
 * The languages a driver may pick.
 *
 * A list rather than a device-locale lookup: a phone bought second-hand is set
 * to whatever the last owner had, and the driver face is the one screen where
 * guessing wrong costs somebody their ability to use the app at all.
 */
export const LANGUAGES: readonly Language[] = ['en', 'ha'];
