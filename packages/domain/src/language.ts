/**
 * Backhaul in four languages.
 *
 * English, **Hausa**, **Yoruba** and **Igbo** — the three languages that,
 * with English, cover most of the people who will use this. Not a
 * localisation framework: four tables of the same shape, held to each other by
 * the type system and by tests.
 *
 * It began as the driver face alone, on the argument that the shipper and
 * fleet screens are dense, changing, and read by people who work in English
 * every day. That argument was overruled, and rightly: a cargo owner in
 * Onitsha is not obliged to work in English because their screen happens to be
 * denser than a driver's, and the product asking which language somebody wants
 * *before* it asks them anything else is the whole difference between an app
 * built for this market and one translated into it.
 *
 * ## Three rules that shape every line below
 *
 * 1. **No interpolation.** Word order differs between these four languages,
 *    and a template with a hole in it assumes it does not. Numbers, names and
 *    money are rendered *beside* a phrase, never inside one.
 * 2. **No fallback chain.** `Record<Phrase, string>` means a missing key is a
 *    compile error. A fallback would let a screen quietly show English to an
 *    Igbo reader, and nobody would ever find out.
 * 3. **The diacritics are the words.** Hausa's ɓ ɗ ƙ, Yoruba's ẹ ọ ṣ, Igbo's
 *    ị ọ ụ ṅ are not decoration — dropping them changes the word or destroys
 *    it. A product that writes a language carelessly is saying what it thinks
 *    of the people who read it.
 *
 * ## What has not happened
 *
 * **None of these three tables has been read by somebody who speaks the
 * language.** They are careful, they are consistent, and they are not a
 * substitute for a native speaker — Yoruba and Igbo are tonal, and this
 * orthography carries tone only partially. It ships behind a review, and that
 * review is a person rather than a task. `docs/ROADMAP.md` holds it open.
 */

export type Language = 'en' | 'ha' | 'yo' | 'ig';

/**
 * Every phrase, grouped by where it is read.
 *
 * Grouped rather than alphabetical so that "is this screen covered?" is a
 * question somebody can answer by looking. A new screen adds a block; a block
 * with nothing in it is visible.
 */
export type Phrase =
  // --- getting in -------------------------------------------------------
  | 'choose_language'
  | 'choose_language_detail'
  | 'continue'
  | 'your_phone_number'
  | 'we_will_send_a_code'
  | 'send_me_a_code'
  | 'sending'
  | 'enter_the_code'
  | 'sent_by_sms'
  | 'send_another_code'
  | 'change_number'
  | 'not_a_nigerian_number'

  // --- the four faces ---------------------------------------------------
  | 'trips'
  | 'loads'
  | 'fleet'
  | 'driver'

  // --- the shipper's list -----------------------------------------------
  | 'on_the_road'
  | 'search_trips'
  | 'all_moving'
  | 'needs_a_look'
  | 'no_trips_yet'
  | 'loading_state'
  | 'arrived_state'
  | 'delivered_state'
  | 'clear'

  // --- a trip -----------------------------------------------------------
  | 'where_it_is'
  | 'share'
  | 'messages'
  | 'report'
  | 'along_the_way'
  | 'ahead'
  | 'drops'
  | 'money_released'
  | 'what_is_owed'
  | 'history'
  | 'delivery_document'
  | 'what_the_record_shows'
  | 'call_this_trip_off'
  | 'distance_covered'
  | 'stops'
  | 'pace'
  | 'off_course'

  // --- sharing ----------------------------------------------------------
  | 'share_this_trip'
  | 'what_they_will_see'
  | 'where_it_is_only'
  | 'where_it_has_been_too'
  | 'never_shown'
  | 'turn_off'
  | 'the_message'
  | 'see_what_they_see'

  // --- the thread -------------------------------------------------------
  | 'write_a_message'
  | 'send'
  | 'waiting_for_signal'
  | 'sent'
  | 'everyone_sees_these'

  // --- the driver -------------------------------------------------------
  | 'your_trip'
  | 'tracking_on'
  | 'tracking_off'
  | 'no_signal'
  | 'signal_good'
  | 'saved_on_phone'
  | 'shared_until_trip_ends'
  | 'nothing_shared_yet'
  | 'recording_stopped'
  | 'battery'
  | 'checking_moving'
  | 'checking_stopped'
  | 'battery_saving'
  | 'i_have_loaded'
  | 'i_have_arrived'
  | 'hand_over'
  | 'report_problem'
  | 'money_on_the_road'
  | 'your_trips'
  | 'what_it_paid'
  | 'back_to_trip'
  | 'help_is_coming'

  // --- reporting a problem ----------------------------------------------
  | 'what_happened'
  | 'broken_down'
  | 'held_up'
  | 'road_blocked'
  | 'accident'
  | 'the_load'
  | 'security'
  | 'add_a_photo'
  | 'send_the_report'
  | 'reported'

  // --- handing over -----------------------------------------------------
  | 'proof_of_delivery'
  | 'take_photo'
  | 'ask_for_signature'
  | 'signed_for'
  | 'the_delivery_note'
  | 'hand_over_here'

  // --- money on the road ------------------------------------------------
  | 'this_trip'
  | 'add_what_you_paid'
  | 'left_of_advance'
  | 'you_are_owed'
  | 'where_it_went'
  | 'every_stop'

  // --- the load board ---------------------------------------------------
  | 'loads_going_your_way'
  | 'post_a_load'
  | 'search_loads'
  | 'best_fit'
  | 'not_for_this_truck'
  | 'share_a_trailer'
  | 'your_lanes'
  | 'chain_three_legs'
  | 'chain_this_trip'
  | 'drops_on_this_trip'
  | 'following_a_delivery'
  | 'bids'
  | 'cancelled'
  | 'cancel_this_trip'
  | 'keep_the_trip'
  | 'what_the_cargo_is'
  | 'weight_in_tonnes'
  | 'post_this_load'

  // --- the fleet --------------------------------------------------------
  | 'utilisation'
  | 'trucks_and_papers'
  | 'verification'
  | 'what_reaches_your_phone'
  | 'road_legal'
  | 'papers_expiring'
  | 'papers_lapsed'
  | 'papers_missing'

  // --- everywhere -------------------------------------------------------
  | 'back'
  | 'yes'
  | 'no'
  | 'didnt_come_up'
  | 'nothing_here'
  | 'try_again'
  | 'could_not_reach'

  // --- time, and the states of a truck ----------------------------------
  //
  // Rendered *beside* a number, never around one. "45 minutes ago" needs the
  // number in the middle of the sentence and the middle is in a different
  // place in each of these four languages, so the number is written first and
  // the words follow it.
  | 'just_now'
  | 'unit_minute'
  | 'unit_hour'
  | 'unit_day'
  | 'ago'
  | 'not_started'
  | 'moving'
  | 'stopped'
  | 'stalled'
  | 'no_data_yet'
  | 'need_a_look'
  | 'later'
  | 'there_now'
  | 'so_far'
  | 'stayed'
  | 'appearance_light'
  | 'appearance_dark'
  | 'appearance_auto'
  | 'settings';

/**
 * English, and the source of meaning.
 *
 * Written first and kept plain, because every one of these is translated three
 * times and a sentence with an idiom in it becomes an idiom nobody uses.
 */
export const EN: Readonly<Record<Phrase, string>> = {
  choose_language: 'What language do you read?',
  choose_language_detail: 'You can change this later.',
  continue: 'Continue',
  your_phone_number: 'What is your phone number?',
  we_will_send_a_code: 'We will send you a code. There is no password to remember.',
  send_me_a_code: 'Send me a code',
  sending: 'Sending…',
  enter_the_code: 'Enter the code',
  sent_by_sms: 'Sent by SMS',
  send_another_code: 'Send another code',
  change_number: 'Change number',
  not_a_nigerian_number: 'That does not look like a Nigerian mobile number.',

  trips: 'Trips',
  loads: 'Loads',
  fleet: 'Fleet',
  driver: 'Driver',

  on_the_road: 'On the road',
  search_trips: 'Plate, town, cargo',
  all_moving: 'All moving as expected',
  needs_a_look: 'Needs a look',
  no_trips_yet: 'No trips yet',
  loading_state: 'Loading',
  arrived_state: 'Arrived',
  delivered_state: 'Delivered',
  clear: 'Clear',

  where_it_is: 'Where it is',
  share: 'Share',
  messages: 'Messages',
  report: 'Report',
  along_the_way: 'Along the way',
  ahead: 'Ahead',
  drops: 'Drops',
  money_released: 'Money released so far',
  what_is_owed: 'What is owed',
  history: 'History',
  delivery_document: 'Delivery document',
  what_the_record_shows: 'What the record shows',
  call_this_trip_off: 'Call this trip off',
  distance_covered: 'Distance covered',
  stops: 'Stops',
  pace: 'Pace',
  off_course: 'Off course',

  share_this_trip: 'Share this trip',
  what_they_will_see: 'What they will see',
  where_it_is_only: 'Where it is',
  where_it_has_been_too: 'Where it has been, too',
  never_shown: 'Never, whichever you choose',
  turn_off: 'Turn off',
  the_message: 'The message',
  see_what_they_see: 'See what they see',

  write_a_message: 'Write a message',
  send: 'Send',
  waiting_for_signal: 'Waiting for signal',
  sent: 'Sent',
  everyone_sees_these: 'Everyone on this trip sees these.',

  your_trip: 'Your trip',
  tracking_on: 'Recording your trip',
  tracking_off: 'Not recording',
  no_signal: 'No signal',
  signal_good: 'Signal is good',
  saved_on_phone: 'Saved on your phone until the signal comes back',
  shared_until_trip_ends: 'Shared with your carrier and the cargo owner, until this trip ends.',
  nothing_shared_yet: 'Nothing is being shared. Recording starts when you begin loading.',
  recording_stopped: 'Recording has stopped. Nothing more is being shared.',
  battery: 'Battery',
  checking_moving: 'Checking your position every minute — on the move.',
  checking_stopped: 'Checking every five minutes — the truck is not moving.',
  battery_saving: 'Saving battery — recording less often',
  i_have_loaded: "I've loaded",
  i_have_arrived: "I've arrived",
  hand_over: 'Hand over',
  report_problem: 'Report a problem',
  money_on_the_road: 'Money paid on the road',
  your_trips: 'Your trips',
  what_it_paid: 'What it paid',
  back_to_trip: 'Back to the trip',
  help_is_coming: 'Stay calm. Your carrier has been told.',

  what_happened: 'What happened?',
  broken_down: 'Broken down',
  held_up: 'Held up',
  road_blocked: 'Road blocked',
  accident: 'Accident',
  the_load: 'The load',
  security: 'Security',
  add_a_photo: 'Add a photo',
  send_the_report: 'Send the report',
  reported: 'Reported',

  proof_of_delivery: 'Proof of delivery',
  take_photo: 'Take a photo',
  ask_for_signature: 'Ask them to sign',
  signed_for: 'Signed for',
  the_delivery_note: 'The delivery note',
  hand_over_here: 'Hand over here',

  this_trip: 'This trip',
  add_what_you_paid: 'Add what you just paid',
  left_of_advance: 'Left of your advance',
  you_are_owed: 'You are owed',
  where_it_went: 'Where it went',
  every_stop: 'Every stop',

  loads_going_your_way: 'Loads going your way',
  post_a_load: 'Post a load',
  search_loads: 'Town or cargo',
  best_fit: 'Best fit',
  not_for_this_truck: 'Not for this truck',
  share_a_trailer: 'Share a trailer',
  your_lanes: 'Your lanes',
  chain_three_legs: 'Chain three legs',
  chain_this_trip: 'Chain this trip',
  drops_on_this_trip: 'Drops on this trip',
  following_a_delivery: 'Following a delivery',
  bids: 'Bids',
  cancelled: 'Cancelled',
  cancel_this_trip: 'Cancel this trip',
  keep_the_trip: 'Keep the trip',
  what_the_cargo_is: 'What the cargo is',
  weight_in_tonnes: 'Weight in tonnes',
  post_this_load: 'Post this load',

  utilisation: 'How well the trucks are used',
  trucks_and_papers: 'Trucks and papers',
  verification: 'Verification',
  what_reaches_your_phone: 'What reaches your phone',
  road_legal: 'Road legal',
  papers_expiring: 'Papers expiring',
  papers_lapsed: 'Papers lapsed',
  papers_missing: 'Papers missing',

  back: 'Back',
  yes: 'Yes',
  no: 'No',
  didnt_come_up: "Didn't come up",
  nothing_here: 'Nothing here yet',
  try_again: 'Try again',
  could_not_reach: 'Could not reach Backhaul. Check your line and try again.',

  just_now: 'just now',
  unit_minute: 'min',
  unit_hour: 'h',
  unit_day: 'd',
  ago: 'ago',
  not_started: 'Not started',
  moving: 'Moving',
  stopped: 'Stopped',
  stalled: 'Stalled',
  no_data_yet: 'No data yet',
  need_a_look: 'need a look',
  later: 'later',
  there_now: 'there now',
  so_far: 'so far',
  stayed: 'stayed',
  appearance_light: 'Light',
  appearance_dark: 'Dark',
  appearance_auto: 'Auto',
  settings: 'Settings',
} as const;

/**
 * Hausa. Boko orthography — what a phone keyboard produces and what a driver
 * reads on a road sign. The hooked letters ɓ, ɗ and ƙ are kept: dropping them
 * is the difference between two different words.
 */
export const HA: Readonly<Record<Phrase, string>> = {
  choose_language: 'Wane harshe kake karantawa?',
  choose_language_detail: 'Za ka iya canza wannan daga baya.',
  continue: 'Ci gaba',
  your_phone_number: 'Menene lambar wayarka?',
  we_will_send_a_code: 'Za mu aika maka lamba. Babu kalmar sirri da za ka tuna.',
  send_me_a_code: 'Aiko min da lamba',
  sending: 'Ana aikawa…',
  enter_the_code: 'Shigar da lambar',
  sent_by_sms: 'An aika ta SMS',
  send_another_code: 'Aika wata lamba',
  change_number: 'Canza lamba',
  not_a_nigerian_number: 'Wannan bai yi kama da lambar wayar Najeriya ba.',

  trips: 'Tafiye-tafiye',
  loads: 'Kaya',
  fleet: 'Motoci',
  driver: 'Direba',

  on_the_road: 'A kan hanya',
  search_trips: 'Lamba, gari, kaya',
  all_moving: 'Duk suna tafiya kamar yadda ake tsammani',
  needs_a_look: 'Yana buƙatar kulawa',
  no_trips_yet: 'Babu tafiya tukuna',
  loading_state: 'Ana loda',
  arrived_state: 'Ya iso',
  delivered_state: 'An mika',
  clear: 'Share',

  where_it_is: 'Inda yake',
  share: 'Raba',
  messages: 'Saƙonni',
  report: 'Rahoto',
  along_the_way: 'A kan hanya',
  ahead: 'Gaba',
  drops: 'Wuraren saukewa',
  money_released: 'Kuɗin da aka fitar',
  what_is_owed: 'Abin da ake bin ka',
  history: 'Tarihi',
  delivery_document: 'Takardar mikawa',
  what_the_record_shows: 'Abin da tarihin ya nuna',
  call_this_trip_off: 'Soke wannan tafiya',
  distance_covered: 'Nisan da aka yi',
  stops: 'Tsayawa',
  pace: 'Gudu',
  off_course: 'Ya bar hanya',

  share_this_trip: 'Raba wannan tafiya',
  what_they_will_see: 'Abin da za su gani',
  where_it_is_only: 'Inda yake',
  where_it_has_been_too: 'Da inda ya wuce',
  never_shown: 'Ba za a taɓa nuna ba, ko wanne ka zaɓa',
  turn_off: 'Kashe',
  the_message: 'Saƙon',
  see_what_they_see: 'Duba abin da za su gani',

  write_a_message: 'Rubuta saƙo',
  send: 'Aika',
  waiting_for_signal: 'Ana jiran sigina',
  sent: 'An aika',
  everyone_sees_these: 'Duk wanda ke wannan tafiya yana ganin waɗannan.',

  your_trip: 'Tafiyarka',
  tracking_on: 'Ana yin rikodin tafiyarka',
  tracking_off: 'Ba a yin rikodi',
  no_signal: 'Babu sigina',
  signal_good: 'Siginar tana da kyau',
  saved_on_phone: 'An ajiye a wayarka har sai siginar ta dawo',
  shared_until_trip_ends: 'Ana raba da mai motar da mai kaya, har sai tafiyar ta ƙare.',
  nothing_shared_yet: "Ba a raba komai. Rikodi zai fara sa'ad da ka fara loda.",
  recording_stopped: 'An dakatar da rikodi. Ba a ƙara raba komai.',
  battery: 'Baturi',
  checking_moving: 'Ana duba inda kake kowane minti — kana tafiya.',
  checking_stopped: 'Ana duba kowane minti biyar — motar ba ta tafiya.',
  battery_saving: 'Ana adana baturi — ana rikodi da wuya',
  i_have_loaded: 'Na yi loda',
  i_have_arrived: 'Na iso',
  hand_over: 'Mika kaya',
  report_problem: 'Ba da rahoton matsala',
  money_on_the_road: 'Kuɗin da aka biya a kan hanya',
  your_trips: 'Tafiye-tafiyenka',
  what_it_paid: 'Abin da aka biya',
  back_to_trip: 'Koma ga tafiya',
  help_is_coming: 'Ka kwantar da hankalinka. An sanar da mai motar.',

  what_happened: 'Me ya faru?',
  broken_down: 'Mota ta lalace',
  held_up: 'An tsare',
  road_blocked: 'An toshe hanya',
  accident: 'Hatsari',
  the_load: 'Kayan',
  security: 'Tsaro',
  add_a_photo: 'Ƙara hoto',
  send_the_report: 'Aika rahoton',
  reported: 'An ba da rahoto',

  proof_of_delivery: 'Shaidar mikawa',
  take_photo: 'Ɗauki hoto',
  ask_for_signature: 'Nemi ya sa hannu',
  signed_for: 'An sa hannu',
  the_delivery_note: 'Takardar mikawa',
  hand_over_here: 'Mika kaya a nan',

  this_trip: 'Wannan tafiya',
  add_what_you_paid: 'Ƙara abin da ka biya',
  left_of_advance: 'Sauran kuɗin da aka ba ka',
  you_are_owed: 'Ana bin ka',
  where_it_went: 'Inda kuɗin suka tafi',
  every_stop: 'Kowane tsayawa',

  loads_going_your_way: 'Kayan da ke tafiya hanyarka',
  post_a_load: 'Sanya kaya',
  search_loads: 'Gari ko kaya',
  best_fit: 'Mafi dacewa',
  not_for_this_truck: 'Ba na wannan motar ba',
  share_a_trailer: 'Raba tirela',
  your_lanes: 'Hanyoyinka',
  chain_three_legs: 'Haɗa tafiye-tafiye uku',
  chain_this_trip: 'Haɗa wannan tafiya',
  drops_on_this_trip: 'Inda ake saukewa a wannan tafiya',
  following_a_delivery: 'Bin kaya',
  bids: 'Farashin da aka bayar',
  cancelled: 'An soke',
  cancel_this_trip: 'Soke wannan tafiya',
  keep_the_trip: 'Bar tafiyar kamar yadda take',
  what_the_cargo_is: 'Wane irin kaya ne',
  weight_in_tonnes: 'Nauyi a tan',
  post_this_load: 'Sanya wannan kaya',

  utilisation: 'Yadda ake amfani da motocin',
  trucks_and_papers: 'Motoci da takardu',
  verification: 'Tabbatarwa',
  what_reaches_your_phone: 'Abin da ke isa wayarka',
  road_legal: 'Ya cika sharuɗɗan hanya',
  papers_expiring: 'Takardu na ƙarewa',
  papers_lapsed: 'Takardu sun ƙare',
  papers_missing: 'Babu wasu takardu',

  back: 'Koma',
  yes: 'Eh',
  no: "A'a",
  didnt_come_up: 'Bai taso ba',
  nothing_here: 'Babu komai a nan tukuna',
  try_again: 'Sake gwadawa',
  could_not_reach: 'Ba a iya kaiwa ga Backhaul ba. Duba layinka ka sake gwadawa.',

  just_now: 'yanzu-yanzu',
  unit_minute: 'minti',
  unit_hour: 'awa',
  unit_day: 'kwana',
  ago: 'da ya wuce',
  not_started: 'Bai fara ba',
  moving: 'Yana tafiya',
  stopped: 'Ya tsaya',
  stalled: 'Ya daɗe a tsaye',
  no_data_yet: 'Babu bayani tukuna',
  need_a_look: 'na buƙatar dubawa',
  later: 'daga baya',
  there_now: 'yana can yanzu',
  so_far: 'ya zuwa yanzu',
  stayed: 'ya jima',
  appearance_light: 'Haske',
  appearance_dark: 'Duhu',
  appearance_auto: 'Kai tsaye',
  settings: 'Saituna',
} as const;

/**
 * Yoruba.
 *
 * The underdots are the letters — ẹ, ọ and ṣ are distinct from e, o and s, and
 * writing them as the bare Latin letter produces a different word or none.
 * Tone marks are carried where they change the word rather than the emphasis;
 * this is the pragmatic orthography of Nigerian signage and print, and a
 * native reviewer may well want more of them.
 */
export const YO: Readonly<Record<Phrase, string>> = {
  choose_language: 'Èdè wo ni o ń kà?',
  choose_language_detail: 'O lè yí èyí padà nígbà mìíràn.',
  continue: 'Tẹ̀síwájú',
  your_phone_number: 'Kí ni nọ́mbà fóònù rẹ?',
  we_will_send_a_code: 'A ó fi kóòdù ránṣẹ́ sí ọ. Kò sí ọ̀rọ̀ ìpamọ́ láti rántí.',
  send_me_a_code: 'Fi kóòdù ránṣẹ́ sí mi',
  sending: 'Ń fi ránṣẹ́…',
  enter_the_code: 'Tẹ kóòdù náà',
  sent_by_sms: 'A fi ránṣẹ́ nípasẹ̀ SMS',
  send_another_code: 'Fi kóòdù mìíràn ránṣẹ́',
  change_number: 'Yí nọ́mbà padà',
  not_a_nigerian_number: 'Èyí kò dà bí nọ́mbà fóònù Nàìjíríà.',

  trips: 'Ìrìnàjò',
  loads: 'Ẹrù',
  fleet: 'Ọkọ̀',
  driver: 'Awakọ̀',

  on_the_road: 'Ní ojú ọ̀nà',
  search_trips: 'Nọ́mbà, ìlú, ẹrù',
  all_moving: 'Gbogbo wọn ń lọ bí a ti retí',
  needs_a_look: 'Ó nílò àfiyèsí',
  no_trips_yet: 'Kò sí ìrìnàjò síbẹ̀',
  loading_state: 'Ń kó ẹrù',
  arrived_state: 'Ó ti dé',
  delivered_state: 'A ti fi jíṣẹ́',
  clear: 'Nù ú',

  where_it_is: 'Ibi tí ó wà',
  share: 'Pín',
  messages: 'Iṣẹ́',
  report: 'Ìròyìn',
  along_the_way: 'Ní ojú ọ̀nà',
  ahead: 'Níwájú',
  drops: 'Ibi ìsọ̀kalẹ̀',
  money_released: 'Owó tí a ti tú sílẹ̀',
  what_is_owed: 'Ohun tí a jẹ ọ',
  history: 'Ìtàn',
  delivery_document: 'Ìwé ìfijíṣẹ́',
  what_the_record_shows: 'Ohun tí àkọsílẹ̀ fihàn',
  call_this_trip_off: 'Fagilé ìrìnàjò yìí',
  distance_covered: 'Ìjìnnà tí a ti rìn',
  stops: 'Ìdúró',
  pace: 'Ìyára',
  off_course: 'Ó ti kúrò ní ọ̀nà',

  share_this_trip: 'Pín ìrìnàjò yìí',
  what_they_will_see: 'Ohun tí wọn yóò rí',
  where_it_is_only: 'Ibi tí ó wà',
  where_it_has_been_too: 'Àti ibi tí ó ti kọjá',
  never_shown: 'A kì yóò fihàn láé, èyíkéyìí tí o bá yàn',
  turn_off: 'Pa á',
  the_message: 'Iṣẹ́ náà',
  see_what_they_see: 'Wo ohun tí wọn yóò rí',

  write_a_message: 'Kọ iṣẹ́',
  send: 'Fi ránṣẹ́',
  waiting_for_signal: 'Ń dúró de sìgnál',
  sent: 'A ti fi ránṣẹ́',
  everyone_sees_these: 'Gbogbo ẹni tí ó wà nínú ìrìnàjò yìí ni ó rí wọn.',

  your_trip: 'Ìrìnàjò rẹ',
  tracking_on: 'À ń ṣe àkọsílẹ̀ ìrìnàjò rẹ',
  tracking_off: 'A kò ṣe àkọsílẹ̀',
  no_signal: 'Kò sí sìgnál',
  signal_good: 'Sìgnál dára',
  saved_on_phone: 'A pamọ́ sí fóònù rẹ títí sìgnál yóò fi padà',
  shared_until_trip_ends:
    'À ń pín pẹ̀lú olówó ọkọ̀ àti olówó ẹrù, títí ìrìnàjò yìí yóò fi parí.',
  nothing_shared_yet: 'A kò pín ohunkóhun. Àkọsílẹ̀ yóò bẹ̀rẹ̀ nígbà tí o bá bẹ̀rẹ̀ ìkó ẹrù.',
  recording_stopped: 'Àkọsílẹ̀ ti dúró. A kò tún pín ohunkóhun.',
  battery: 'Bátìrì',
  checking_moving: 'À ń wo ibi tí o wà ní ìṣẹ́jú kọ̀ọ̀kan — o ń lọ.',
  checking_stopped: 'À ń wò ní gbogbo ìṣẹ́jú márùn-ún — ọkọ̀ kò lọ.',
  battery_saving: 'À ń pa bátìrì mọ́ — à ń ṣe àkọsílẹ̀ díẹ̀díẹ̀',
  i_have_loaded: 'Mo ti kó ẹrù',
  i_have_arrived: 'Mo ti dé',
  hand_over: 'Fi ẹrù lé wọn lọ́wọ́',
  report_problem: 'Ròyìn ìṣòro',
  money_on_the_road: 'Owó tí a ná ní ojú ọ̀nà',
  your_trips: 'Àwọn ìrìnàjò rẹ',
  what_it_paid: 'Ohun tí ó san',
  back_to_trip: 'Padà sí ìrìnàjò',
  help_is_coming: 'Fara balẹ̀. A ti sọ fún olówó ọkọ̀ rẹ.',

  what_happened: 'Kí ló ṣẹlẹ̀?',
  broken_down: 'Ọkọ̀ ti bàjẹ́',
  held_up: 'A dá wa dúró',
  road_blocked: 'Ọ̀nà ti dí',
  accident: 'Ìjàmbá',
  the_load: 'Ẹrù náà',
  security: 'Ààbò',
  add_a_photo: 'Fi àwòrán kún un',
  send_the_report: 'Fi ìròyìn náà ránṣẹ́',
  reported: 'A ti ròyìn',

  proof_of_delivery: 'Ẹ̀rí ìfijíṣẹ́',
  take_photo: 'Ya àwòrán',
  ask_for_signature: 'Bèèrè kí ó fọwọ́ sí i',
  signed_for: 'A ti fọwọ́ sí i',
  the_delivery_note: 'Ìwé ìfijíṣẹ́',
  hand_over_here: 'Fi ẹrù lé wọn lọ́wọ́ níbí',

  this_trip: 'Ìrìnàjò yìí',
  add_what_you_paid: 'Fi ohun tí o ṣẹ̀ṣẹ̀ san kún un',
  left_of_advance: 'Ìyókù owó tí a fún ọ',
  you_are_owed: 'A jẹ ọ',
  where_it_went: 'Ibi tí owó náà lọ',
  every_stop: 'Gbogbo ìdúró',

  loads_going_your_way: 'Ẹrù tí ń lọ ọ̀nà rẹ',
  post_a_load: 'Fi ẹrù sí',
  search_loads: 'Ìlú tàbí ẹrù',
  best_fit: 'Ó bá a mu jùlọ',
  not_for_this_truck: 'Kì í ṣe fún ọkọ̀ yìí',
  share_a_trailer: 'Pín tirela',
  your_lanes: 'Àwọn ọ̀nà rẹ',
  chain_three_legs: 'So ìrìn mẹ́ta pọ̀',
  chain_this_trip: 'So ìrìn yìí pọ̀',
  drops_on_this_trip: 'Àwọn ibi ìsọ̀kalẹ̀ nínú ìrìn yìí',
  following_a_delivery: 'Ìtọ́pinpin ẹrù',
  bids: 'Owó tí wọ́n gbé kalẹ̀',
  cancelled: 'A ti fagilé',
  cancel_this_trip: 'Fagilé ìrìn yìí',
  keep_the_trip: 'Fi ìrìn náà sílẹ̀ bó ṣe wà',
  what_the_cargo_is: 'Kín ni ẹrù náà',
  weight_in_tonnes: 'Ìwúwo ní tọ́ọ̀nù',
  post_this_load: 'Gbé ẹrù yìí kalẹ̀',

  utilisation: 'Bí a ṣe ń lo àwọn ọkọ̀',
  trucks_and_papers: 'Ọkọ̀ àti ìwé',
  verification: 'Ìfẹsẹ̀múlẹ̀',
  what_reaches_your_phone: 'Ohun tí ó dé fóònù rẹ',
  road_legal: 'Ó bá òfin ojú ọ̀nà mu',
  papers_expiring: 'Ìwé ń parí',
  papers_lapsed: 'Ìwé ti parí',
  papers_missing: 'Àwọn ìwé kò sí',

  back: 'Padà',
  yes: 'Bẹ́ẹ̀ ni',
  no: 'Bẹ́ẹ̀ kọ́',
  didnt_come_up: 'Kò wáyé',
  nothing_here: 'Kò sí nǹkan níbí síbẹ̀',
  try_again: 'Gbìyànjú lẹ́ẹ̀kan si',
  could_not_reach: 'A kò lè dé ọ̀dọ̀ Backhaul. Yẹ ìsopọ̀ rẹ wò kí o sì tún gbìyànjú.',

  just_now: 'ìṣẹ́jú yìí',
  unit_minute: 'ìṣẹ́jú',
  unit_hour: 'wákàtí',
  unit_day: 'ọjọ́',
  ago: 'sẹ́yìn',
  not_started: 'Kò tíì bẹ̀rẹ̀',
  moving: 'Ó ń lọ',
  stopped: 'Ó dúró',
  stalled: 'Ó dúró pẹ́',
  no_data_yet: 'Kò sí ìròyìn síbẹ̀',
  need_a_look: 'nílò àyẹ̀wò',
  later: 'lẹ́yìn náà',
  there_now: 'ó wà níbẹ̀ báyìí',
  so_far: 'títí di ìsinsìnyí',
  stayed: 'ó lo àkókò',
  appearance_light: 'Ìmọ́lẹ̀',
  appearance_dark: 'Òkùnkùn',
  appearance_auto: 'Fúnra rẹ̀',
  settings: 'Ètò',
} as const;

/**
 * Igbo.
 *
 * The dotted letters ị, ọ and ụ are distinct vowels, and ṅ is a distinct
 * consonant; writing any of them undotted produces a different word. Tone is
 * carried only where it disambiguates, which is the ordinary convention in
 * Nigerian print — and, as with Yoruba, a native reviewer may want more.
 */
export const IG: Readonly<Record<Phrase, string>> = {
  choose_language: 'Olee asụsụ ị na-agụ?',
  choose_language_detail: 'Ị nwere ike ịgbanwe nke a ma emesịa.',
  continue: 'Gaa n’ihu',
  your_phone_number: 'Gịnị bụ nọmba ekwentị gị?',
  we_will_send_a_code: 'Anyị ga-ezitere gị koodu. Ọ dịghị paswọọdụ ị ga-echeta.',
  send_me_a_code: 'Zitere m koodu',
  sending: 'Na-eziga…',
  enter_the_code: 'Tinye koodu ahụ',
  sent_by_sms: 'E zitere ya site na SMS',
  send_another_code: 'Zitere koodu ọzọ',
  change_number: 'Gbanwee nọmba',
  not_a_nigerian_number: 'Nke a adịghị ka nọmba ekwentị Naịjirịa.',

  trips: 'Njem',
  loads: 'Ibu',
  fleet: 'Ụgbọ',
  driver: 'Ọkwọ ụgbọ',

  on_the_road: 'N’okporo ụzọ',
  search_trips: 'Nọmba, obodo, ibu',
  all_moving: 'Ha niile na-aga dị ka e chere',
  needs_a_look: 'Ọ chọrọ nlebara anya',
  no_trips_yet: 'Enweghị njem ugbu a',
  loading_state: 'Na-ebu ibu',
  arrived_state: 'Ọ ruola',
  delivered_state: 'E nyefeela ya',
  clear: 'Hichapụ',

  where_it_is: 'Ebe ọ nọ',
  share: 'Kesaa',
  messages: 'Ozi',
  report: 'Kọọ',
  along_the_way: 'N’okporo ụzọ',
  ahead: "N'ihu",
  drops: 'Ebe nnyefe',
  money_released: 'Ego ewepụtala',
  what_is_owed: 'Ihe a ji gị',
  history: 'Akụkọ',
  delivery_document: 'Akwụkwọ nnyefe',
  what_the_record_shows: 'Ihe ndekọ na-egosi',
  call_this_trip_off: 'Kagbuo njem a',
  distance_covered: 'Ogologo ụzọ e jeworo',
  stops: 'Nkwụsị',
  pace: 'Ọsọ',
  off_course: 'Ọ hapụla ụzọ',

  share_this_trip: 'Kesaa njem a',
  what_they_will_see: 'Ihe ha ga-ahụ',
  where_it_is_only: 'Ebe ọ nọ',
  where_it_has_been_too: 'Na ebe ọ gafeworo',
  never_shown: 'A gaghị egosi ya mgbe ọ bụla, nke ọ bụla ị họrọ',
  turn_off: 'Gbanyụọ',
  the_message: 'Ozi ahụ',
  see_what_they_see: 'Lee ihe ha ga-ahụ',

  write_a_message: 'Dee ozi',
  send: 'Zipu',
  waiting_for_signal: 'Na-echere signal',
  sent: 'E zipụla',
  everyone_sees_these: 'Onye ọ bụla nọ na njem a na-ahụ ha.',

  your_trip: 'Njem gị',
  tracking_on: 'Anyị na-edekọ njem gị',
  tracking_off: 'Anyị anaghị edekọ',
  no_signal: 'Enweghị signal',
  signal_good: 'Signal dị mma',
  saved_on_phone: 'E chekwara ya na ekwentị gị ruo mgbe signal ga-alọta',
  shared_until_trip_ends: 'Anyị na-ekesa ya na onye nwe ụgbọ na onye nwe ibu, ruo mgbe njem a ga-akwụsị.',
  nothing_shared_yet: 'Anyị anaghị ekesa ihe ọ bụla. Ndekọ ga-amalite mgbe ị malitere ibu ibu.',
  recording_stopped: 'Ndekọ akwụsịla. Anyị anaghị ekesakwa ihe ọ bụla.',
  battery: 'Batrị',
  checking_moving: 'Anyị na-elele ebe ị nọ kwa nkeji — ị na-aga.',
  checking_stopped: 'Anyị na-elele kwa nkeji ise — ụgbọ anaghị aga.',
  battery_saving: 'Anyị na-echekwa batrị — anyị na-edekọ obere',
  i_have_loaded: 'Ebugoro m ibu',
  i_have_arrived: 'Erutela m',
  hand_over: 'Nyefee ibu',
  report_problem: 'Kọọ nsogbu',
  money_on_the_road: 'Ego a kwụrụ n’okporo ụzọ',
  your_trips: 'Njem gị niile',
  what_it_paid: 'Ihe ọ kwụrụ',
  back_to_trip: 'Laghachi na njem',
  help_is_coming: 'Dajụọ. A gwala onye nwe ụgbọ gị.',

  what_happened: 'Gịnị mere?',
  broken_down: 'Ụgbọ mebiri',
  held_up: 'E jidere anyị',
  road_blocked: 'E mechiela ụzọ',
  accident: 'Ihe mberede',
  the_load: 'Ibu ahụ',
  security: 'Nchekwa',
  add_a_photo: 'Tinye foto',
  send_the_report: 'Zipu akụkọ ahụ',
  reported: 'A kọọla ya',

  proof_of_delivery: 'Ihe àmà nnyefe',
  take_photo: 'See foto',
  ask_for_signature: 'Rịọ ka ọ bịanye aka',
  signed_for: 'A bịanyere aka',
  the_delivery_note: 'Akwụkwọ nnyefe',
  hand_over_here: 'Nyefee ibu ebe a',

  this_trip: 'Njem a',
  add_what_you_paid: 'Tinye ihe ị kwụrụ',
  left_of_advance: 'Ihe fọdụrụ n’ego e nyere gị',
  you_are_owed: 'A ji gị ego',
  where_it_went: 'Ebe ego ahụ gara',
  every_stop: 'Nkwụsị ọ bụla',

  loads_going_your_way: 'Ibu na-aga ụzọ gị',
  post_a_load: 'Tinye ibu',
  search_loads: 'Obodo ma ọ bụ ibu',
  best_fit: 'Kacha dabara',
  not_for_this_truck: 'Ọ bụghị maka ụgbọ a',
  share_a_trailer: 'Kesaa tirela',
  your_lanes: 'Ụzọ gị niile',
  chain_three_legs: 'Jikọta njem atọ',
  chain_this_trip: 'Jikọta njem a',
  drops_on_this_trip: 'Ebe ndị a ga-atụtụ na njem a',
  following_a_delivery: 'Ịsochi ngwaahịa',
  bids: 'Ọnụahịa e nyere',
  cancelled: 'Akagbuola ya',
  cancel_this_trip: 'Kagbuo njem a',
  keep_the_trip: 'Hapụ njem a ka ọ dị',
  what_the_cargo_is: 'Ihe ngwaahịa ahụ bụ',
  weight_in_tonnes: 'Ịdị arọ na tọn',
  post_this_load: 'Bipụta ngwaahịa a',

  utilisation: 'Otú e si eji ụgbọ ndị ahụ',
  trucks_and_papers: 'Ụgbọ na akwụkwọ',
  verification: 'Nkwenye',
  what_reaches_your_phone: 'Ihe na-eru ekwentị gị',
  road_legal: 'Ọ kwadoro maka okporo ụzọ',
  papers_expiring: 'Akwụkwọ na-agwụ',
  papers_lapsed: 'Akwụkwọ agwụla',
  papers_missing: 'Akwụkwọ ụfọdụ adịghị',

  back: 'Laghachi',
  yes: 'Ee',
  no: 'Mba',
  didnt_come_up: 'O bilighị',
  nothing_here: 'Ọ dịghị ihe dị ebe a ugbu a',
  try_again: 'Nwaa ọzọ',
  could_not_reach: 'Enweghị ike iru Backhaul. Lelee njikọ gị ma nwaa ọzọ.',

  just_now: 'ugbu a',
  unit_minute: 'nkeji',
  unit_hour: 'awa',
  unit_day: 'ụbọchị',
  ago: 'gara aga',
  not_started: 'Amalitebeghị',
  moving: 'Ọ na-aga',
  stopped: 'Ọ kwụsịrị',
  stalled: 'Ọ kwụsịrị ogologo oge',
  no_data_yet: 'Ozi adịbeghị',
  need_a_look: 'chọrọ nlele',
  later: 'mgbe e mesịrị',
  there_now: 'ọ nọ ebe ahụ ugbu a',
  so_far: 'ruo ugbu a',
  stayed: 'ọ nọrọ',
  appearance_light: 'Ìhè',
  appearance_dark: 'Ọchịchịrị',
  appearance_auto: 'Onwe ya',
  settings: 'Ntọala',
} as const;

const TABLES: Readonly<Record<Language, Readonly<Record<Phrase, string>>>> = {
  en: EN,
  ha: HA,
  yo: YO,
  ig: IG,
} as const;

/**
 * A phrase, in a language.
 *
 * No fallback and no interpolation, for the reasons at the top of this file.
 */
export function say(language: Language, phrase: Phrase): string {
  return TABLES[language][phrase];
}

/** Every phrase at once, for a screen that wants them all. */
export function phrases(language: Language): Readonly<Record<Phrase, string>> {
  return TABLES[language];
}

/**
 * What each language is called, in itself.
 *
 * Never "Yoruba (Nigeria)" and never an English exonym. A person picking their
 * language should find it written the way they write it.
 */
export function describeLanguage(language: Language): string {
  switch (language) {
    case 'ha':
      return 'Hausa';
    case 'yo':
      return 'Yorùbá';
    case 'ig':
      return 'Igbo';
    case 'en':
      return 'English';
  }
}

/**
 * The languages on offer, English last.
 *
 * Deliberately not alphabetical and deliberately not English-first: this list
 * is read by somebody who has just opened the app, and putting English at the
 * top makes the other three look like an afterthought bolted on for them.
 */
export const LANGUAGES: readonly Language[] = ['ha', 'yo', 'ig', 'en'];

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ha' || value === 'yo' || value === 'ig';
}
