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
  | 'who_is_it_for'
  | 'make_a_link'
  | 'making_the_link'
  | 'link_not_made'
  | 'the_new_link'
  | 'shown_once_send_it_now'
  | 'send_the_link'
  | 'could_not_send_the_link'
  | 'hide_the_link'
  | 'walkthrough_makes_no_links'
  | 'walkthrough_signs_nothing_off'
  | 'still_marked_unread'
  | 'mark_it_cleared'
  | 'clearing_it'
  | 'not_cleared'
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
  | 'hand_over_the_note'
  | 'hand_over_once_signed_off'
  | 'could_not_hand_it_over'

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
  | 'seal_the_proof'
  | 'not_notifying'
  | 'at_most_once_every'
  | 'role_shipper'
  | 'role_carrier'
  | 'role_driver'
  | 'push_not_configured'
  | 'push_refused'
  | 'no_position_to_rank_from'
  | 'location_blocked'
  | 'location_denied'
  | 'notifications_missing'
  | 'tracking_not_available'
  | 'phone_is_holding_back'
  | 'open_settings'
  | 'allow_location'
  | 'waiting_to_send'
  | 'walkthrough_unreached'
  | 'and_word'
  | 'needs_a_note'
  | 'it_is_still_there'
  | 'the_server_said_no'
  | 'reading'
  | 'told_and_under_dispute'
  | 'told_keep_driving'
  | 'eta_stops_showing'
  | 'eta_stays_delay_visible'
  | 'recorded_against_the_trip'
  | 'late'
  | 'alert_held'
  | 'alert_not_sent'
  | 'alert_wakes_you'
  | 'alert_notifies'
  | 'alert_in_the_app'
  | 'simulate_losing_signal'
  | 'simulate_regaining_signal'
  | 'link_turned_off'
  | 'link_expired'
  | 'ask_for_a_new_one'
  | 'links_stop_working'
  | 'signature'
  | 'still_settles_note'
  | 'nothing_owed_for_handover'
  | 'selected_tap_to_remove'
  | 'tap_to_filter_by_this'
  | 'on_file'
  | 'not_uploaded'
  | 'document_identity'
  | 'document_licence'
  | 'document_registration'
  | 'document_insurance'
  | 'more_completed_trips'
  | 'on_time_delivery'
  | 'still_aboard'
  | 'added_for_extra_stops'
  | 'first_drop_is_delivery'
  | 'delivered_out_of_order'
  | 'hand_over_at'
  | 'km_by_road'
  | 'too_heavy_for_any_truck'
  | 'smallest_truck_that_carries_it'
  | 'trips_completed'
  | 'too_few_for_on_time'
  | 'on_time'
  | 'days_ago_expired'
  | 'expires_in_days'
  | 'warned_days_ahead'
  | 'nothing_is_owed'
  | 'is_owed_and_both_can_see'
  | 'as_the_shipper'
  | 'as_the_carrier'
  | 'hours_of_the_bid_being_accepted'
  | 'one_sms_and_it_says_who'
  | 'days_unless_you_turn_it_off'
  | 'under_a_day_left'
  | 'one_day_left'
  | 'does_not_expire'
  | 'turned_off'
  | 'expired'
  | 'position_and_full_track'
  | 'position_only'
  | 'turn_off_the_link_for'
  | 'km_of_empty_repositioning'
  | 'of_the_trip_is_covered'
  | 'between'
  | 'and'
  | 'asks_what_it_was_for'
  | 'over_keep_it_short'
  | 'written_in_a_dead_zone'
  | 'of_the_truck_is_refused'
  | 'km_from_the_destination'
  | 'metres_out'
  | 'at_the_destination'
  | 'the_destination'
  | 'all_trucks_can_take_work'
  | 'cannot_be_given_a_new_trip'
  | 'no_signal_still_recording'
  | 'positions_saved_waiting'
  | 'quiet_between'
  | 'held_is_not_dropped'
  | 'still_to_come'
  | 'demo_showing_link'
  | 'of_count'
  | 'add_a_photo_this_one_needs_it'
  | 'photos_added'
  | 'under_answers'
  | 'answers'
  | 'optional'
  | 'track_a_trip'
  | 'arranged_anywhere'
  | 'where_it_loads'
  | 'where_it_unloads'
  | 'the_drivers_number'
  | 'the_carriers_number'
  | 'the_shippers_number'
  | 'who_is_on_it'
  | 'what_it_is_carrying'
  | 'start_tracking_it'
  | 'starting_to_track'
  | 'could_not_start_tracking'
  | 'not_a_number_this_can_reach'
  | 'it_is_on_your_list_now'
  | 'walkthrough_opens_no_trips'
  | 'add_a_note'
  | 'the_route'
  | 'the_cargo'
  | 'handover'
  | 'what_went_wrong'
  | 'and_also'
  | 'expiring'
  | 'your_fleet'
  | 'walkthrough_figures'
  | 'km_loaded'
  | 'km_empty'
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
  | 'no_name_yet'
  | 'answer_one_to_send'
  | 'answers_word'
  | 'how_did_they_do_title'
  | 'review_sent'
  | 'posting'
  | 'posted'
  | 'not_posted'
  | 'of_the_trailer_used'
  | 'was_word'
  | 'of_the_km_paid_for'
  | 'more_than_running_home_empty'
  | 'km_empty_across_the_chain'
  | 'loads_where_last_dropped'
  | 'km_empty_to_get_there'
  | 'already_carrying_this'
  | 'nothing_to_chain'
  | 'recommended'
  | 'cheapest'
  | 'completed_trips'
  | 'carriers_have_bid'
  | 'at_the_pickup_now'
  | 'km_from_the_pickup'
  | 'award'
  | 'no_bids_yet'
  | 'no_loads_posted'
  | 'of_that_is_your_own_money'
  | 'usually'
  | 'after_three_runs'
  | 'runs_word'
  | 'post_lane'
  | 'trucks_can_take_work'
  | 'cannot_be_given_a_trip'
  | 'on_file_tap_to_remove'
  | 'tap_to_upload'
  | 'by_a_person'
  | 'sending_the_report'
  | 'report_not_sent'
  | 'could_not_load'
  | 'not_sent_yet'
  | 'cannot_reach_the_server'
  | 'your_trips_are_still_there'
  | 'loading_your_trips'
  | 'showing_the_walkthrough'
  | 'refusal_not_a_number'
  | 'refusal_too_many'
  | 'refusal_too_soon'
  | 'refusal_unknown'
  | 'refusal_expired'
  | 'refusal_exhausted'
  | 'refusal_used'
  | 'refusal_wrong'
  | 'refusal_no_photos'
  | 'refusal_no_signature'
  | 'refusal_no_name'
  | 'refusal_needs_photo'
  | 'refusal_not_allowed'
  | 'refusal_terminal'
  | 'refusal_out_of_order'
  | 'refusal_revoked'
  | 'refusal_link_expired'
  | 'refusal_unknown_link'
  | 'refusal_unhandled'
  | 'blocker_too_heavy'
  | 'blocker_wrong_class'
  | 'blocker_expired'
  | 'blocker_cannot_reach'
  | 'km_empty_to_pickup'
  | 'of_the_run_home'
  | 'further_from_base'
  | 'neither_toward_nor_away'
  | 'going_rate'
  | 'indicative'
  | 'over_what_the_run_costs'
  | 'loses_money'
  | 'covers_the_trip_only'
  | 'no_drops_on_this_trip'
  | 'all_drops_signed_for'
  | 'signed_for_next'
  | 'loaded_pct'
  | 'a_kilometre_driven'
  | 'legs_this_month'
  | 'of_data_so_far'
  | 'of_your_airtime'
  | 'under_one_naira'
  | 'about_a_month_at_this_rate'
  | 'no_loads_at_that_price'
  | 'no_loads_for_that_truck'
  | 'no_loads_ready_by_then'
  | 'no_loads_from_that_level'
  | 'nothing_matching'
  | 'no_loads_right_now'
  | 'days_overdue'
  | 'due_today'
  | 'due_tomorrow'
  | 'due_in_days'
  | 'items_measured_by_tracker'
  | 'reported_late_count'
  | 'hours_with_nothing'
  | 'nothing_recorded_on_trip'
  | 'days_out_of_date'
  | 'never_uploaded'
  | 'days_left'
  | 'to_reach'
  | 'levy_police'
  | 'levy_state_revenue'
  | 'levy_union'
  | 'levy_weighbridge'
  | 'levy_park'
  | 'levy_ferry'
  | 'levy_other'
  | 'paper_licence'
  | 'paper_roadworthiness'
  | 'paper_insurance'
  | 'paper_permit'
  | 'tier_unverified'
  | 'tier_verified'
  | 'tier_business'
  | 'tier_trusted'
  | 'truck_pickup'
  | 'truck_canter'
  | 'truck_15t'
  | 'truck_30t'
  | 'truck_lowbed'
  | 'standing_retired'
  | 'exception_short'
  | 'exception_damaged'
  | 'exception_refused'
  | 'alert_signal_lost'
  | 'alert_stalled'
  | 'alert_deviating'
  | 'alert_late'
  | 'alert_incident'
  | 'alert_duress'
  | 'alert_delivered'
  | 'alert_bid_received'
  | 'alert_link_expiring'
  | 'cadence_weekly'
  | 'cadence_fortnightly'
  | 'cadence_monthly'
  | 'cadence_ad_hoc'
  | 'ask_arrived_to_load'
  | 'ask_reachable'
  | 'ask_cargo_intact'
  | 'ask_no_extras'
  | 'claim_arrived_to_load'
  | 'claim_reachable'
  | 'claim_cargo_intact'
  | 'claim_no_extras'
  | 'where_the_truck_is_up_to'
  | 'every_drop_signed_note'
  | 'out_of_order_card'
  | 'out_of_order_note'
  | 'hand_over_here_button'
  | 'back_to_the_trip'
  | 'what_this_does'
  | 'puts_under_dispute'
  | 'no_need_to_type_where'
  | 'anything_to_add'
  | 'coming_round_again'
  | 'two_days_warning_note'
  | 'how_often'
  | 'lane_post_hint'
  | 'post_this_run'
  | 'no_pairs_on_the_board'
  | 'nothing_fits_together'
  | 'pairs_note'
  | 'you_collect'
  | 'wont_fit_together'
  | 'what_is_it'
  | 'how_heavy_in_tonnes'
  | 'what_it_should_cost'
  | 'indicative_only'
  | 'two_photos_note'
  | 'where_it_was_captured'
  | 'one_version_note'
  | 'say_how_the_carrier_did'
  | 'how_did_they_do'
  | 'alerts_lede'
  | 'at_what_time'
  | 'in_the_morning'
  | 'one_line_not_four_buzzes'
  | 'top_of_the_ladder'
  | 'nothing_left_to_prove'
  | 'tier_note'
  | 'if_you_take_all_three'
  | 'the_chain'
  | 'passed_over'
  | 'four_questions_note'
  | 'what_other_shippers_see'
  | 'send_the_review'
  | 'bids_note'
  | 'assigns_the_load'
  | 'spent_more_note'
  | 'lane_middle_note'
  | 'lapsed_paper_note'
  | 'every_paper_in_date'
  | 'the_pack'
  | 'measured_word'
  | 'reported_word'
  | 'reported_late_word'
  | 'by_the_tracker'
  | 'hours_after_the_fact'
  | 'not_much_here'
  | 'nothing_recorded'
  | 'hole_note'
  | 'in_the_order_it_happened'
  | 'one_more_return_leg'
  | 'return_leg_note'
  | 'see_bids'
  | 'see_who_is_bidding'
  | 'verification_hint'
  | 'vehicles_hint'
  | 'alerts_hint'
  | 'one_thing_wakes_you'
  | 'needs_a_look_head'
  | 'nothing_needs_you'
  | 'good_morning_note'
  | 'the_trip_is_cancelled'
  | 'what_it_costs'
  | 'left_of_the_fare'
  | 'counts_against_record'
  | 'incident_costs_one_tier'
  | 'finished'
  | 'this_trip_is_done'
  | 'im_on_the_road'
  | 'none_on_the_road_now'
  | 'trips_word'
  | 'on_time_word'
  | 'oldest_unpaid_waiting'
  | 'delivered_lower'
  | 'this_month'
  | 'what_you_are_owed'
  | 'oldest_unpaid_note'
  | 'every_trip_settled'
  | 'not_paid_yet'
  | 'no_trips_yet_history'
  | 'history_empty_detail'
  | 'on_time_note'
  | 'battery_low_note'
  | 'hand_over_and_sign'
  | 'past_trips_and_earnings'
  | 'nothing_more_to_do'
  | 'delivered_word'
  | 'accept_this_trip'
  | 'record_detail'
  | 'cancel_detail'
  | 'open_delivery_document'
  | 'delivery_document_detail'
  | 'search_trips_label'
  | 'nothing_matches_that'
  | 'already_got_a_truck'
  | 'opens_the_trip'
  | 'show_next_link'
  | 'what_this_link_shows'
  | 'where_it_is_and_arrival'
  | 'link_does_not_expire'
  | 'link_stops_today'
  | 'link_stops_in_days'
  | 'sending_something_yourself'
  | 'track_any_truck'
  | 'position_and_arrival_only'
  | 'adds_the_full_track'
  | 'where_the_truck_is_now'
  | 'when_it_should_arrive'
  | 'everywhere_it_has_been'
  | 'what_the_track_dropped'
  | 'anybodys_phone_number'
  | 'what_the_load_is_worth'
  | 'links_on_this_trip'
  | 'they_stop_seeing_it'
  | 'post'
  | 'clear_the_filter'
  | 'loaded_the_whole_way'
  | 'clear_the_search'
  | 'opens_to_bids'
  | 'search_the_board'
  | 'a_million_and_up'
  | 'trailer_only'
  | 'ready_today'
  | 'chain_note'
  | 'two_part_loads_one_run'
  | 'runs_you_make_again'
  | 'nothing_on_the_board_for_that'
  | 'ranking_note'
  | 'your_trailer_is_free'
  | 'stayed'
  | 'appearance_light'
  | 'appearance_dark'
  | 'appearance_auto'
  | 'arrival'
  | 'not_enough_to_say_yet'
  | 'estimated'
  | 'to_go'
  | 'no_signal_stretches'
  | 'day_sunday'
  | 'day_monday'
  | 'day_tuesday'
  | 'day_wednesday'
  | 'day_thursday'
  | 'day_friday'
  | 'day_saturday'
  | 'next'
  | 'everything_released'
  | 'condition_advance'
  | 'condition_in_transit'
  | 'condition_delivered'
  | 'condition_retention'
  | 'on_loading'
  | 'on_delivery'
  | 'held_back'
  | 'agreed_fare'
  | 'demurrage'
  | 'commission'
  | 'advance_paid'
  | 'due_to_carrier'
  | 'now'
  | 'no_usable_positions_yet'
  | 'usable'
  | 'dropped_imprecise'
  | 'dropped_out_of_order'
  | 'dropped_jump'
  | 'deviation_note'
  | 'waiting_note'
  | 'still_ahead_note'
  | 'every_point_reached'
  | 'pace_note'
  | 'stops_note'
  | 'stops_overline'
  | 'pace_over_the_trip'
  | 'peak'
  | 'shaded_no_signal'
  | 'positions_all_usable'
  | 'positions'
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
  who_is_it_for: "Who is it for?",
  make_a_link: "Make a link",
  making_the_link: "Making the link…",
  link_not_made: "The link was not made. Try again.",
  the_new_link: "The new link",
  shown_once_send_it_now: "This is the only time this link is shown. Send it now — it cannot be shown again.",
  send_the_link: "Send it",
  could_not_send_the_link: "It did not go out. The link is still above — try again.",
  hide_the_link: "Hide it",
  walkthrough_makes_no_links: "The walkthrough cannot make a real link. The ones below are examples.",
  walkthrough_signs_nothing_off: "The walkthrough cannot sign anything off, so there is nothing to hand over here.",
  still_marked_unread: "Still marked unread for everyone else.",
  mark_it_cleared: "Mark it cleared",
  clearing_it: "Clearing…",
  not_cleared: "It is still open. Try again.",
  seal_the_proof: "Sign this off",
  not_notifying: "Not notifying",
  at_most_once_every: "at most once every",
  role_shipper: "shipper",
  role_carrier: "carrier",
  role_driver: "driver",
  push_not_configured: "This build cannot receive notifications. The alerts below are what it would send.",
  push_refused: "Notifications are off for Backhaul, so nothing below will reach this phone.",
  no_position_to_rank_from: "No truck has reported yet, so this is not sorted by distance.",
  location_blocked: "Location is switched off for Backhaul. Your trip is not being recorded — turn it on in Settings.",
  location_denied: "Backhaul needs your location to record this trip. Nothing is recorded until you allow it.",
  notifications_missing: "Without a notification, your phone may stop the recording in the background. Your trip may end up with gaps.",
  tracking_not_available: "This phone cannot record a trip. Ask the office for a phone that can.",
  phone_is_holding_back: "Your phone is stopping Backhaul recording properly. Check location and battery settings.",
  open_settings: "Open Settings",
  allow_location: "Allow location",
  waiting_to_send: "waiting to send",
  walkthrough_unreached: "This is the walkthrough. We could not reach the server to look for yours.",
  and_word: "and",
  needs_a_note: "needs a note",
  it_is_still_there: "It is still there. This phone cannot see it right now.",
  the_server_said_no: "The server would not answer",
  reading: "Reading",
  told_and_under_dispute: "The shipper and the carrier have been told, and the trip is now under dispute.",
  told_keep_driving: "The shipper and the carrier have been told. Keep driving when you can.",
  eta_stops_showing: "The arrival estimate stops showing until this clears — an estimate beside a stopped truck is a contradiction.",
  eta_stays_delay_visible: "The arrival estimate stays, and the delay is on the trip for everyone to see.",
  recorded_against_the_trip: "Recorded against the trip, where everyone on it can see it.",
  late: "Late",
  alert_held: "Held",
  alert_not_sent: "Not sent",
  alert_wakes_you: "Wakes you",
  alert_notifies: "Notifies",
  alert_in_the_app: "In the app",
  simulate_losing_signal: "Pretend the signal is gone",
  simulate_regaining_signal: "Pretend the signal is back",
  link_turned_off: "This link was turned off",
  link_expired: "This link has expired",
  ask_for_a_new_one: "Ask whoever sent it for a new one.",
  links_stop_working: "Links stop working after a couple of weeks, so a truck’s position does not stay public for ever. Ask whoever sent it for a new one.",
  signature: "Signature",
  still_settles_note: "This trip still settles. A shortage is argued separately — holding the whole payment punishes the carrier for a discrepancy that is usually the loading end’s.",
  nothing_owed_for_handover: "Nothing was handed over, so nothing is owed for the handover.",
  selected_tap_to_remove: "Selected. Tap to remove",
  tap_to_filter_by_this: "Tap to filter by this",
  on_file: 'On file',
  not_uploaded: 'Not uploaded',
  document_identity: 'Government ID',
  document_licence: "Driver's licence",
  document_registration: 'Company registration',
  document_insurance: 'Goods-in-transit cover',
  more_completed_trips: 'more completed trips',
  on_time_delivery: 'on-time delivery',
  still_aboard: 'still aboard',
  added_for_extra_stops: 'added for the extra stops',
  first_drop_is_delivery: 'The first drop is the delivery; each one after it is a detour, a wait and a second set of papers.',
  delivered_out_of_order: 'was delivered while an earlier drop was still aboard.',
  hand_over_at: 'Hand over at',
  km_by_road: 'km by road',
  too_heavy_for_any_truck: 'tonnes is the most any truck here carries in one load. Split it, or post it as two.',
  smallest_truck_that_carries_it: 'is the smallest truck that carries it.',
  trips_completed: 'trips completed',
  too_few_for_on_time: 'too few for an on-time figure',
  on_time: 'on time',
  days_ago_expired: 'days since it expired',
  expires_in_days: 'days until it expires',
  warned_days_ahead: 'days of warning rather than a message on the morning it lapses — losing a tier mid-trip loses work already committed to.',
  nothing_is_owed: 'Nothing is owed either way.',
  is_owed_and_both_can_see: 'is owed, and both sides can see why.',
  as_the_shipper: 'As the shipper',
  as_the_carrier: 'As the carrier',
  hours_of_the_bid_being_accepted: 'hours of the bid being accepted',
  one_sms_and_it_says_who: 'characters — one SMS, and it says who it is from. A bare link from an unknown number gets deleted.',
  days_unless_you_turn_it_off: 'days, unless you turn it off sooner.',
  under_a_day_left: 'Under a day left',
  one_day_left: '1 day left',
  does_not_expire: 'Does not expire',
  turned_off: 'Turned off',
  expired: 'Expired',
  position_and_full_track: 'Position and full track',
  position_only: 'Position only',
  turn_off_the_link_for: 'Turn off the link for',
  km_of_empty_repositioning: 'km of empty repositioning is the most that is ever proposed. Past that the fuel and the day are rarely covered by the leg they are spent reaching.',
  of_the_trip_is_covered: 'of the trip is covered by tracking.',
  between: 'between',
  and: 'and',
  asks_what_it_was_for: 'asks what it was for — not to question it, but because that is the entry the office queries a week later.',
  over_keep_it_short: 'over — keep it short, or call.',
  written_in_a_dead_zone: 'Written in a dead zone · arrived',
  of_the_truck_is_refused: 'of the truck is refused even when it would physically fit: two shippers, two sets of paperwork and two chances of a delay, for a trailer that is still mostly air.',
  km_from_the_destination: 'km from where it was going. Recorded on the document.',
  metres_out: 'm out',
  at_the_destination: 'At',
  the_destination: 'the destination',
  all_trucks_can_take_work: 'trucks, and every one can take work',
  cannot_be_given_a_new_trip: 'cannot be given a new trip',
  no_signal_still_recording: 'No signal. Your position is still being recorded.',
  positions_saved_waiting: 'positions saved, waiting to send.',
  quiet_between: 'Quiet between',
  held_is_not_dropped: 'Anything held is not dropped — it arrives in the morning as one line.',
  still_to_come: 'still to come',
  demo_showing_link: 'Walkthrough · showing link',
  of_count: 'of',
  add_a_photo_this_one_needs_it: 'Add a photo — this one needs it',
  photos_added: 'added',
  under_answers: 'Under',
  answers: 'answers',
  optional: 'Optional',
  track_a_trip: "Track a trip",
  arranged_anywhere: "For a load you agreed somewhere else. No board, no bids — just the truck, followed from here.",
  where_it_loads: "Where it loads",
  where_it_unloads: "Where it unloads",
  the_drivers_number: "The driver's number",
  the_carriers_number: "The carrier's number",
  the_shippers_number: "The shipper's number",
  who_is_on_it: "Who is on it",
  what_it_is_carrying: "What it is carrying",
  start_tracking_it: "Start tracking it",
  starting_to_track: "Starting…",
  could_not_start_tracking: "The trip was not opened. Nothing was sent to anybody. Try again.",
  not_a_number_this_can_reach: "That is not a number this can reach.",
  it_is_on_your_list_now: "It is on your list of trips now.",
  walkthrough_opens_no_trips: "The walkthrough cannot open a real trip. Sign in to open one.",
  add_a_note: 'Add a note',
  the_route: 'Route',
  the_cargo: 'Cargo',
  handover: 'Handover',
  what_went_wrong: 'Exception',
  and_also: 'Also',
  expiring: 'Expiring',
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

  hand_over_the_note: 'Hand over the note',
  hand_over_once_signed_off: 'You can hand this over once it is signed off.',
  could_not_hand_it_over: 'It did not go out. Try again.',

  utilisation: 'How well the trucks are used',
  your_fleet: 'Your fleet',
  walkthrough_figures: 'Walkthrough figures. Your own are not worked out yet.',
  km_loaded: 'Loaded',
  km_empty: 'Empty',
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
  no_name_yet: "No name yet",
  answer_one_to_send: "Answer one to send",
  answers_word: "answers",
  how_did_they_do_title: "How did they do?",
  review_sent: "Sent",
  posting: "Posting…",
  posted: "Posted",
  not_posted: "Not posted. Try again.",
  of_the_trailer_used: "of the trailer used",
  was_word: "was",
  of_the_km_paid_for: "of the kilometres paid for",
  more_than_running_home_empty: "more than running home empty",
  km_empty_across_the_chain: "km empty across the whole chain.",
  loads_where_last_dropped: "Loads where the last one dropped",
  km_empty_to_get_there: "km empty to get there",
  already_carrying_this: "already carrying this",
  nothing_to_chain: "Nothing to chain from yet",
  recommended: "Recommended",
  cheapest: "Cheapest",
  completed_trips: "completed trips",
  carriers_have_bid: "carriers have bid",
  at_the_pickup_now: "At the pickup now",
  km_from_the_pickup: "km from the pickup",
  award: "Award",
  no_bids_yet: "No bids yet",
  no_loads_posted: "You have not posted a load yet.",
  of_that_is_your_own_money: "of that is your own money, spent on the road.",
  usually: "Usually",
  after_three_runs: "after three runs",
  runs_word: "runs",
  post_lane: "Post this lane",
  trucks_can_take_work: "trucks can take work",
  cannot_be_given_a_trip: "cannot be given a new trip",
  on_file_tap_to_remove: "On file. Tap to remove",
  tap_to_upload: "Tap to upload",
  by_a_person: "by a person",
  sending_the_report: "Sending…",
  report_not_sent: "Not sent. It is saved here — try again.",
  could_not_load: "Could not load this",
  not_sent_yet: "Not sent. Try again.",
  cannot_reach_the_server: "Cannot reach Backhaul",
  your_trips_are_still_there: "Your trips are still there. This phone cannot see them right now.",
  loading_your_trips: "Loading your trips…",
  showing_the_walkthrough: "This is the walkthrough, not your trips. The server has none for you.",
  refusal_not_a_number: "That does not look like a Nigerian mobile number.",
  refusal_too_many: "Too many codes asked for. Try again later.",
  refusal_too_soon: "A code was just sent. Wait before asking for another.",
  refusal_unknown: "No code was asked for on this number.",
  refusal_expired: "That code has expired. Ask for another.",
  refusal_exhausted: "Too many wrong tries. Ask for a new code.",
  refusal_used: "That code has already been used.",
  refusal_wrong: "That code is not right.",
  refusal_no_photos: "One more photograph is needed.",
  refusal_no_signature: "A signature is needed.",
  refusal_no_name: "The name of whoever signed is needed.",
  refusal_needs_photo: "This kind of report needs a photograph.",
  refusal_not_allowed: "A trip cannot go that way from where it is.",
  refusal_terminal: "This trip is finished and cannot change.",
  refusal_out_of_order: "That is dated before something already recorded.",
  refusal_revoked: "This link was turned off.",
  refusal_link_expired: "This link has run out.",
  refusal_unknown_link: "This is not a link we issued.",
  refusal_unhandled: "The server said no, and this app does not have words for the reason yet.",
  blocker_too_heavy: "Heavier than your truck carries.",
  blocker_wrong_class: "The shipper asked for a different class of truck.",
  blocker_expired: "This load has expired.",
  blocker_cannot_reach: "Too far to run empty to.",
  km_empty_to_pickup: "km empty to the pickup",
  of_the_run_home: "km of the run home it covers",
  further_from_base: "km further from base",
  neither_toward_nor_away: "neither toward base nor away from it",
  going_rate: "Going rate",
  indicative: "indicative",
  over_what_the_run_costs: "over what the run costs.",
  loses_money: "This loses money: the diesel and the running cost come to more than the fare.",
  covers_the_trip_only: "It covers the trip, but not enough to put anything back into the truck.",
  no_drops_on_this_trip: "No drops on this trip.",
  all_drops_signed_for: "drops, all signed for.",
  signed_for_next: "signed for · next",
  loaded_pct: "loaded",
  a_kilometre_driven: "a kilometre driven",
  legs_this_month: "legs this month",
  of_data_so_far: "of data so far",
  of_your_airtime: "of your airtime.",
  under_one_naira: "under ₦1",
  about_a_month_at_this_rate: "a month at this rate.",
  no_loads_at_that_price: "No loads at that price. Try a lower figure.",
  no_loads_for_that_truck: "No loads for that truck. Try another class.",
  no_loads_ready_by_then: "No loads ready by then. Try a later date.",
  no_loads_from_that_level: "No loads from shippers at that level yet.",
  nothing_matching: "Nothing matching",
  no_loads_right_now: "No loads on the board right now.",
  days_overdue: "days overdue",
  due_today: "Due today",
  due_tomorrow: "Due tomorrow",
  due_in_days: "days to go",
  items_measured_by_tracker: "items, of them measured by the tracker",
  reported_late_count: "reported late",
  hours_with_nothing: "hours with nothing recorded",
  nothing_recorded_on_trip: "Nothing recorded on this trip.",
  days_out_of_date: "days out of date",
  never_uploaded: "never uploaded",
  days_left: "days left",
  to_reach: "To reach",
  levy_police: "Police checkpoint",
  levy_state_revenue: "State revenue",
  levy_union: "Union",
  levy_weighbridge: "Weighbridge",
  levy_park: "Park levy",
  levy_ferry: "Ferry",
  levy_other: "Other",
  paper_licence: "Vehicle licence",
  paper_roadworthiness: "Roadworthiness",
  paper_insurance: "Insurance",
  paper_permit: "Haulage permit",
  tier_unverified: "Not verified",
  tier_verified: "Verified",
  tier_business: "Business",
  tier_trusted: "Trusted",
  truck_pickup: "Pickup",
  truck_canter: "Canter",
  truck_15t: "15 t truck",
  truck_30t: "30 t trailer",
  truck_lowbed: "Lowbed",
  standing_retired: "Retired",
  exception_short: "Short on delivery",
  exception_damaged: "Damaged on delivery",
  exception_refused: "Refused on delivery",
  alert_signal_lost: "no signal",
  alert_stalled: "a truck not moving",
  alert_deviating: "a truck off course",
  alert_late: "a delivery running late",
  alert_incident: "a problem reported",
  alert_duress: "a driver in trouble",
  alert_delivered: "a delivery signed for",
  alert_bid_received: "a new bid",
  alert_link_expiring: "a tracking link about to expire",
  cadence_weekly: "Every week",
  cadence_fortnightly: "Every two weeks",
  cadence_monthly: "Every month",
  cadence_ad_hoc: "When needed",
  ask_arrived_to_load: "Did the truck arrive when it said it would?",
  ask_reachable: "Could you reach the driver during the trip?",
  ask_cargo_intact: "Did the goods arrive in the condition they left in?",
  ask_no_extras: "Was the agreed price the price you paid?",
  claim_arrived_to_load: "Arrived to load on time",
  claim_reachable: "Reachable on the road",
  claim_cargo_intact: "Goods arrived intact",
  claim_no_extras: "No charges beyond the quote",
  where_the_truck_is_up_to: "Where the truck is up to",
  every_drop_signed_note: "Every drop is signed for, so the trip can close. Arriving at the last address would not have been enough.",
  out_of_order_card: "Out of order",
  out_of_order_note: "Recorded, not refused. A consignee who was closed is a real thing — but everybody reading this afterwards assumes the order loaded.",
  hand_over_here_button: "Hand over here",
  back_to_the_trip: "Back to the trip",
  what_this_does: "What this does",
  puts_under_dispute: "This one also puts the trip under dispute, so a person looks at it rather than an alert going into a list.",
  no_need_to_type_where: "You do not have to type where you are.",
  anything_to_add: "Anything to add",
  coming_round_again: "Coming round again",
  two_days_warning_note: "Two days of warning, so a load is posted before the day rather than on it — a load posted the morning it must move goes to whoever is nearest rather than to whoever is best.",
  how_often: "How often",
  lane_post_hint: "Opens it to bids with this lane\'s details already filled in",
  post_this_run: "Post this run",
  no_pairs_on_the_board: "No pairs on the board",
  nothing_fits_together: "Nothing here fits together on one trailer today.",
  pairs_note: "You collect more than one fare for one run. Nobody is doing anybody a favour, which is why it works.",
  you_collect: "You collect",
  wont_fit_together: "Won\'t fit together",
  what_is_it: "What is it",
  how_heavy_in_tonnes: "How heavy, in tonnes",
  what_it_should_cost: "What it should cost",
  indicative_only: "Indicative only. Rates move with diesel, with the season, and with which way the truck is already going.",
  two_photos_note: "The goods, and where you are. Two is the fewest that make a delivery arguable — one photograph of a pallet could have been taken anywhere.",
  where_it_was_captured: "Where it was captured",
  one_version_note: "The same lines go into the PDF and the dispute pack. There is one version of this document, not three.",
  say_how_the_carrier_did: "Say how the carrier did",
  how_did_they_do: "How did they do?",
  alerts_lede: "Six engines can each produce something worth knowing. None of them decides whether to interrupt you — this does, in one place.",
  at_what_time: "At what time?",
  in_the_morning: "In the morning",
  one_line_not_four_buzzes: "One line rather than four buzzes in a minute, which reads as a malfunction rather than as a summary.",
  top_of_the_ladder: "Top of the ladder",
  nothing_left_to_prove: "Nothing left to prove. An upheld incident would cost one tier — not the whole record.",
  tier_note: "A tier is never something a carrier types in. It comes out of these papers and a delivery record neither side can edit.",
  if_you_take_all_three: "If you take all three",
  the_chain: "The chain",
  passed_over: "Passed over",
  four_questions_note: "Four questions, and you can skip any of them. Nothing here is a score — what other shippers see is how often each was true.",
  what_other_shippers_see: "What other shippers will see",
  send_the_review: "Send the review",
  bids_note: "Ranked on price against the cheapest offer, the carrier\'s record, and how far they are from the pickup. A carrier with no history ranks as unknown, not as bad.",
  assigns_the_load: "Assigns the load to this carrier",
  spent_more_note: "You have spent more than you were given. That is the number this screen exists for.",
  lane_middle_note: "Once enough trips have run this corridor, the middle of these totals is what the lane actually costs — the number a carrier needs to price it and has never had.",
  lapsed_paper_note: "A paper that lapses while a truck is on the road never strands it. It blocks the next trip instead — the pressure belongs on the office, not on a driver eight hundred kilometres from home.",
  every_paper_in_date: "Every paper in date",
  the_pack: "The pack",
  measured_word: "Measured",
  reported_word: "Reported",
  reported_late_word: "Reported late",
  by_the_tracker: "by the tracker",
  hours_after_the_fact: "hours after the fact",
  not_much_here: "There is not much here. That is a fact about the trip, not about either party\'s case.",
  nothing_recorded: "Nothing recorded",
  hole_note: "A hole in the record is the thing both sides will point at, so it is named rather than left to be noticed.",
  in_the_order_it_happened: "In the order it happened",
  one_more_return_leg: "One more return leg",
  return_leg_note: "What filling one of those empty runs would have earned, at your own realised rate.",
  see_bids: "See bids on a posted load",
  see_who_is_bidding: "See who is bidding",
  verification_hint: "What this carrier has proved, and what is left",
  vehicles_hint: "Licence, roadworthiness, insurance and permit, per truck",
  alerts_hint: "Who is told what, and what is allowed to wake you",
  one_thing_wakes_you: "One thing wakes you at 3am. Everything else waits until six.",
  needs_a_look_head: "Needs a look",
  nothing_needs_you: "Nothing needs you",
  good_morning_note: "Every truck is moving and reporting. This is what a good morning looks like.",
  the_trip_is_cancelled: "The trip is cancelled",
  what_it_costs: "What it costs",
  left_of_the_fare: "Left of the fare",
  counts_against_record: "Counts against the carrier\'s record as an incident",
  incident_costs_one_tier: "An incident costs one tier, not the record. Somebody who lets a shipper down should be harder to book, not unbookable.",
  finished: "Finished",
  this_trip_is_done: "This trip is done.",
  im_on_the_road: "I\'m on the road",
  none_on_the_road_now: "none on the road right now.",
  trips_word: "trips",
  on_time_word: "on time",
  oldest_unpaid_waiting: "the oldest unpaid trip has been waiting.",
  delivered_lower: "delivered",
  this_month: "This month",
  what_you_are_owed: "What you are owed",
  oldest_unpaid_note: "It is at the top of the list below, because that is the one to ask about.",
  every_trip_settled: "Every trip has been settled.",
  not_paid_yet: "Not paid yet",
  no_trips_yet_history: "No trips yet",
  history_empty_detail: "Your completed trips and what they paid will show up here.",
  on_time_note: "On-time is measured from tracked arrivals, not from anybody’s report — including yours.",
  battery_low_note: "Your battery is low, so Backhaul is checking less often to help the phone last the trip.",
  hand_over_and_sign: "Hand over and sign",
  past_trips_and_earnings: "Your past trips and earnings",
  nothing_more_to_do: "Nothing more to do, and nothing is being shared any more.",
  delivered_word: "Delivered",
  accept_this_trip: "Accept this trip",
  record_detail: "Everything this trip recorded, in the order it happened",
  cancel_detail: "Shows what cancelling costs before anything happens",
  open_delivery_document: "Open the delivery document",
  delivery_document_detail: "Photographs, signature and where it was captured",
  search_trips_label: "Search trips",
  nothing_matches_that: "Nothing matches that",
  already_got_a_truck: "Already got a truck on the road? Track it in a minute, even if you arranged it somewhere else.",
  opens_the_trip: "Opens the trip",
  show_next_link: "Show the next link\'s state",
  what_this_link_shows: "What this link shows",
  where_it_is_and_arrival: "Where the truck is, and when it should arrive",
  link_does_not_expire: "This link does not expire.",
  link_stops_today: "This link stops working today.",
  link_stops_in_days: "days until this link stops working.",
  sending_something_yourself: "Sending something yourself?",
  track_any_truck: "Track any truck this way, even one you arranged somewhere else. Nothing to install for the person watching.",
  position_and_arrival_only: "Position and arrival, nothing else.",
  adds_the_full_track: "Adds the full track and what the tracker dropped from it.",
  where_the_truck_is_now: "Where the truck is now",
  when_it_should_arrive: "When it should arrive",
  everywhere_it_has_been: "Everywhere it has been",
  what_the_track_dropped: "What the track dropped, and why",
  anybodys_phone_number: "Anybody\'s phone number",
  what_the_load_is_worth: "What the load is worth",
  links_on_this_trip: "Links on this trip",
  they_stop_seeing_it: "They stop being able to see this trip",
  post: "Post",
  clear_the_filter: "Clear the filter",
  loaded_the_whole_way: "Loaded the whole way",
  clear_the_search: "Clear the search",
  opens_to_bids: "Opens it to bids from verified carriers",
  search_the_board: "Search the load board",
  a_million_and_up: "₦1m and up",
  trailer_only: "Trailer only",
  ready_today: "Ready today",
  chain_note: "Strings return loads together so the truck never runs empty",
  two_part_loads_one_run: "Two part-loads, one run",
  runs_you_make_again: "Runs you make again",
  nothing_on_the_board_for_that: "Nothing on the board for that",
  ranking_note: "Ranked on what the trip pays, how far you run empty to reach it, and how much of the run home it covers.",
  your_trailer_is_free: "A leg you run empty is diesel, tyres and a day paid for by nothing.",
  stayed: 'stayed',
  appearance_light: 'Light',
  appearance_dark: 'Dark',
  appearance_auto: 'Auto',
  arrival: 'Arrival',
  not_enough_to_say_yet: 'Not enough to say yet',
  estimated: 'Estimated',
  to_go: 'to go',
  no_signal_stretches: 'with no signal, marked in grey',
  day_sunday: 'Sunday',
  day_monday: 'Monday',
  day_tuesday: 'Tuesday',
  day_wednesday: 'Wednesday',
  day_thursday: 'Thursday',
  day_friday: 'Friday',
  day_saturday: 'Saturday',
  next: "Next",
  everything_released: "Everything has been released.",
  condition_advance: "The truck reached the depot and loading started.",
  condition_in_transit: "The trip has been moving with positions arriving for six hours.",
  condition_delivered: "Proof of delivery captured: photographs, a signature and a name.",
  condition_retention: "Seven days after delivery with no exception raised.",
  on_loading: "On loading",
  on_delivery: "On delivery",
  held_back: "Held back",
  agreed_fare: "Agreed fare",
  demurrage: "Demurrage",
  commission: "Backhaul commission",
  advance_paid: "Advance already paid",
  due_to_carrier: "Due to carrier",
  now: "now",
  no_usable_positions_yet: "No usable positions yet.",
  usable: "usable.",
  dropped_imprecise: "the phone could not say where it was",
  dropped_out_of_order: "dated before the position before it",
  dropped_jump: "a jump no truck could make",
  deviation_note: "Measured as distance to the destination, not as distance from a line. The Lagos–Kano road is up to 90 km off that line for hours, and an alarm on every correct trip is an alarm nobody reads.",
  waiting_note: "the part a demurrage claim is made of. Time at the weighbridge is not counted.",
  still_ahead_note: "still ahead. Arrival is measured against each place’s own radius, not one distance for the whole trip.",
  every_point_reached: "Every point on the route was reached.",
  pace_note: "Door to door, including every stop. Not the speedometer — a trailer that cruises at 80 and spends nine hours at checkpoints makes about 35 over the day, and it is the second number an arrival is built from.",
  stops_note: "stopped in total. This is what a demurrage claim is made of.",
  stops_overline: "Stops",
  pace_over_the_trip: "Pace over the trip",
  peak: "peak",
  shaded_no_signal: "Shaded where there was no signal",
  positions_all_usable: "positions, all of them usable.",
  positions: "positions",
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
  who_is_it_for: "Ga wa ne?",
  make_a_link: "Ƙirƙiri hanyar haɗi",
  making_the_link: "Ana ƙirƙirawa…",
  link_not_made: "Ba a ƙirƙiri hanyar haɗi ba. Ka sake gwadawa.",
  the_new_link: "Sabuwar hanyar haɗi",
  shown_once_send_it_now: "Wannan shi ne lokaci ɗaya tak da za a nuna wannan hanyar haɗi. Ka aika da ita yanzu — ba za a ƙara nuna ta ba.",
  send_the_link: "Aika shi",
  could_not_send_the_link: "Bai fita ba. Hanyar haɗi na nan sama — sake gwadawa.",
  hide_the_link: "Ɓoye ta",
  walkthrough_makes_no_links: "Nuni ba zai iya ƙirƙirar hanyar haɗi ta gaskiya ba. Waɗanda ke ƙasa misalai ne.",
  walkthrough_signs_nothing_off: "Nuni ba zai iya sa hannu a kan komai ba, don haka babu abin da za a mika a nan.",
  still_marked_unread: "Har yanzu ana nuna ba a karanta ba ga sauran mutane.",
  mark_it_cleared: "Nuna an warware shi",
  clearing_it: "Ana warwarewa…",
  not_cleared: "Har yanzu a buɗe yake. Ka sake gwadawa.",
  seal_the_proof: "Kammala wannan",
  not_notifying: "Ba a sanarwa",
  at_most_once_every: "sau ɗaya kawai a kowane",
  role_shipper: "mai kaya",
  role_carrier: "mai mota",
  role_driver: "direba",
  push_not_configured: "Wannan sigar ba za ta iya karɓar sanarwa ba. Sanarwar da ke ƙasa ita ce abin da za a aika.",
  push_refused: "An kashe sanarwa don Backhaul, don haka babu abin da zai isa wannan wayar.",
  no_position_to_rank_from: "Babu motar da ta ba da rahoto tukuna, don haka ba a jera wannan ta nisa ba.",
  location_blocked: "An kashe wurin zama don Backhaul. Ba a rubuta tafiyarka ba — ka kunna shi a cikin Saituna.",
  location_denied: "Backhaul na buƙatar wurin da kake don rubuta wannan tafiyar. Ba a rubuta komai sai ka yarda.",
  notifications_missing: "Idan babu sanarwa, wayarka na iya dakatar da rubutun a baya. Tafiyarka na iya samun gibi.",
  tracking_not_available: "Wannan wayar ba za ta iya rubuta tafiya ba. Ka tambayi ofishi wayar da za ta iya.",
  phone_is_holding_back: "Wayarka na hana Backhaul yin rubutu yadda ya kamata. Ka duba saitunan wuri da baturi.",
  open_settings: "Buɗe Saituna",
  allow_location: "Yarda da wurin zama",
  waiting_to_send: "suna jiran a aika",
  walkthrough_unreached: "Wannan nuni ne kawai. Ba mu iya isa ga uwar garken don neman naka ba.",
  and_word: "da",
  needs_a_note: "yana buƙatar bayani",
  it_is_still_there: "Yana nan. Wannan wayar ba ta iya ganinsa a yanzu ba.",
  the_server_said_no: "Uwar garke ba ta amsa ba",
  reading: "Ana karantawa",
  told_and_under_dispute: "An sanar da mai kaya da mai mota, kuma yanzu ana jayayya kan tafiyar.",
  told_keep_driving: "An sanar da mai kaya da mai mota. Ka ci gaba da tuƙi idan za ka iya.",
  eta_stops_showing: "Ba za a nuna hasashen lokacin isowa ba sai wannan ya wuce — hasashe kusa da mota da ta tsaya ya saɓa wa juna.",
  eta_stays_delay_visible: "Hasashen lokacin isowa na nan, kuma jinkirin na kan tafiyar don kowa ya gani.",
  recorded_against_the_trip: "An rubuta shi a kan tafiyar, inda duk wanda ke cikinta ke iya ganinsa.",
  late: "Ya makara",
  alert_held: "An riƙe",
  alert_not_sent: "Ba a aika ba",
  alert_wakes_you: "Yana tayar da kai",
  alert_notifies: "Yana sanarwa",
  alert_in_the_app: "A cikin manhajar",
  simulate_losing_signal: "Yi kamar siginar ta ɓace",
  simulate_regaining_signal: "Yi kamar siginar ta dawo",
  link_turned_off: "An kashe wannan hanyar haɗi",
  link_expired: "Wannan hanyar haɗi ta ƙare",
  ask_for_a_new_one: "Ka tambayi wanda ya aiko da shi sabo.",
  links_stop_working: "Hanyoyin haɗi na daina aiki bayan makonni biyu, don kada wurin mota ya kasance a bayyane har abada. Ka tambayi wanda ya aiko da shi sabo.",
  signature: "Sa hannu",
  still_settles_note: "Har yanzu za a biya wannan tafiyar. Ana jayayya kan ƙarancin kaya daban — riƙe dukan kuɗin na hukunta mai mota kan bambancin da yawanci na wurin lodin ne.",
  nothing_owed_for_handover: "Ba a mika komai ba, don haka ba a bin kowa komai kan mikawar.",
  selected_tap_to_remove: "An zaɓa. Danna don cirewa",
  tap_to_filter_by_this: "Danna don tace da wannan",
  on_file: 'Yana nan',
  not_uploaded: 'Ba a saka ba',
  document_identity: 'Katin shaida na gwamnati',
  document_licence: 'Lasisin tuƙi',
  document_registration: 'Rajistar kamfani',
  document_insurance: 'Inshorar kaya kan hanya',
  more_completed_trips: 'ƙarin tafiye-tafiyen da aka kammala',
  on_time_delivery: 'isar da kaya a kan lokaci',
  still_aboard: 'na nan a mota',
  added_for_extra_stops: 'an ƙara don ƙarin tsayawa',
  first_drop_is_delivery: 'Sauka ta farko ita ce isar da kaya; kowace bayanta karkata ce, jira da wasu takardu na biyu.',
  delivered_out_of_order: 'an isar da shi alhali wata sauka ta farko na nan a mota.',
  hand_over_at: 'Mika kaya a',
  km_by_road: 'kilomita ta hanya',
  too_heavy_for_any_truck: 'tan ne mafi yawa da kowace mota a nan ke ɗauka a lodi ɗaya. Ka raba shi, ko ka sanya shi biyu.',
  smallest_truck_that_carries_it: 'ita ce mota mafi ƙanƙanta da ke ɗaukarsa.',
  trips_completed: 'tafiye-tafiyen da aka kammala',
  too_few_for_on_time: 'sun yi kaɗan don a nuna lokacin isowa',
  on_time: 'a kan lokaci',
  days_ago_expired: 'kwanaki tun da ya ƙare',
  expires_in_days: 'kwanaki kafin ya ƙare',
  warned_days_ahead: 'kwanakin gargaɗi maimakon saƙo a safiyar ranar da ya ƙare — rasa matsayi tsakiyar tafiya na rasa aikin da aka riga aka amince da shi.',
  nothing_is_owed: 'Ba wanda ke bin kowa.',
  is_owed_and_both_can_see: 'ake bin, kuma bangarorin biyu na iya ganin dalili.',
  as_the_shipper: 'A matsayin mai kaya',
  as_the_carrier: 'A matsayin mai mota',
  hours_of_the_bid_being_accepted: 'awanni na karɓar tayin',
  one_sms_and_it_says_who: 'haruffa — SMS ɗaya, kuma yana faɗin wanda ya aiko. Hanyar da babu bayani daga lambar da ba a sani ba ana gogewa.',
  days_unless_you_turn_it_off: 'kwanaki, sai dai idan ka kashe shi da wuri.',
  under_a_day_left: 'Bai kai rana ɗaya ba',
  one_day_left: 'Rana 1 ce ta rage',
  does_not_expire: 'Ba ya ƙarewa',
  turned_off: 'An kashe',
  expired: 'Ya ƙare',
  position_and_full_track: 'Wuri da duk hanyar da aka bi',
  position_only: 'Wuri kaɗai',
  turn_off_the_link_for: 'Kashe hanyar haɗi ta',
  km_of_empty_repositioning: 'kilomita na tafiya babu kaya shi ne mafi yawa da ake taɓa bayarwa. Sama da haka, man fetur da ranar da aka kashe ba safai tafiyar ke biyansu ba.',
  of_the_trip_is_covered: 'na tafiyar ne aka rufe da bin diddigi.',
  between: 'tsakanin',
  and: 'da',
  asks_what_it_was_for: 'ana tambayar abin da aka yi shi — ba don a shakketa ba, sai don shi ne shigarwar da ofishi ke tambaya bayan mako guda.',
  over_keep_it_short: 'sun wuce — ka taƙaita, ko ka kira.',
  written_in_a_dead_zone: 'An rubuta inda babu siginar · ya iso',
  of_the_truck_is_refused: 'na motar ana ƙin sa ko da zai shiga: masu kaya biyu, takardu iri biyu da damar jinkiri biyu, don tirela da yawancinta iska ce.',
  km_from_the_destination: 'kilomita daga inda za a je. An rubuta shi a takardar.',
  metres_out: 'm nesa',
  at_the_destination: 'A',
  the_destination: 'inda za a je',
  all_trucks_can_take_work: 'motoci, kuma kowacce na iya karɓar aiki',
  cannot_be_given_a_new_trip: 'ba za a iya ba su sabuwar tafiya ba',
  no_signal_still_recording: 'Babu siginar. Ana ci gaba da rubuta wurin da kake.',
  positions_saved_waiting: 'wuraren da aka ajiye, suna jiran a aika.',
  quiet_between: 'Shiru tsakanin',
  held_is_not_dropped: 'Duk abin da aka riƙe ba a jefar da shi — yana zuwa da safe a matsayin layi ɗaya.',
  still_to_come: 'sauran zuwa',
  demo_showing_link: 'Nuni · ana nuna hanyar haɗi',
  of_count: 'daga cikin',
  add_a_photo_this_one_needs_it: 'Ƙara hoto — wannan na buƙatarsa',
  photos_added: 'an ƙara',
  under_answers: 'Ƙasa da',
  answers: 'amsoshi',
  optional: 'Na zaɓi',
  track_a_trip: "Bi diddigin tafiya",
  arranged_anywhere: "Don kaya da ka yarda a wani wuri. Ba allo, ba tayi — motar kawai, ana bi daga nan.",
  where_it_loads: "Inda ake ɗaukar kaya",
  where_it_unloads: "Inda ake saukar da kaya",
  the_drivers_number: "Lambar direba",
  the_carriers_number: "Lambar mai mota",
  the_shippers_number: "Lambar mai kaya",
  who_is_on_it: "Waye ke kanta",
  what_it_is_carrying: "Abin da take ɗauke da shi",
  start_tracking_it: "Fara bi",
  starting_to_track: "Ana farawa…",
  could_not_start_tracking: "Ba a buɗe tafiyar ba. Ba a aika wa kowa ba. Sake gwadawa.",
  not_a_number_this_can_reach: "Wannan ba lamba ce da za a iya kaiwa ba.",
  it_is_on_your_list_now: "Yanzu tana cikin jerin tafiye-tafiyenka.",
  walkthrough_opens_no_trips: "Nuni ba zai iya buɗe tafiya ta gaskiya ba. Shiga don buɗe ɗaya.",
  add_a_note: 'Ƙara bayani',
  the_route: 'Hanya',
  the_cargo: 'Kaya',
  handover: 'Mika kaya',
  what_went_wrong: 'Abin da bai yi ba',
  and_also: 'Haka kuma',
  expiring: 'Na ƙarewa',
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

  hand_over_the_note: 'Mika takardar',
  hand_over_once_signed_off: 'Za ka iya mika wannan bayan an kammala shi.',
  could_not_hand_it_over: 'Bai fita ba. Sake gwadawa.',

  utilisation: 'Yadda ake amfani da motocin',
  your_fleet: 'Motocinka',
  walkthrough_figures: 'Lambobin nuni ne. Ba a lissafa naka ba tukuna.',
  km_loaded: 'Da kaya',
  km_empty: 'Babu kaya',
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
  no_name_yet: "Babu suna tukuna",
  answer_one_to_send: "Amsa ɗaya kafin ka aika",
  answers_word: "amsoshi",
  how_did_they_do_title: "Yaya suka yi?",
  review_sent: "An aika",
  posting: "Ana sanyawa…",
  posted: "An sanya",
  not_posted: "Ba a sanya ba. Ka sake gwadawa.",
  of_the_trailer_used: "na motar da aka yi amfani da shi",
  was_word: "ya kasance",
  of_the_km_paid_for: "na kilomitocin da aka biya",
  more_than_running_home_empty: "fiye da komawa gida babu kaya",
  km_empty_across_the_chain: "kilomita babu kaya a duk jerin tafiye-tafiyen.",
  loads_where_last_dropped: "Ana ɗauka inda aka sauke na ƙarshe",
  km_empty_to_get_there: "kilomita babu kaya kafin a isa can",
  already_carrying_this: "ta riga ta ɗauki wannan",
  nothing_to_chain: "Babu abin da za a fara jerin da shi tukuna",
  recommended: "An ba da shawara",
  cheapest: "Mafi arha",
  completed_trips: "tafiye-tafiyen da aka kammala",
  carriers_have_bid: "masu jigilar kaya sun bayar da farashi",
  at_the_pickup_now: "Yana wurin ɗaukar kaya yanzu",
  km_from_the_pickup: "kilomita daga wurin ɗaukar kaya",
  award: "Ba shi aikin",
  no_bids_yet: "Ba a bayar da farashi tukuna ba",
  no_loads_posted: "Ba ka sanya kaya ba tukuna.",
  of_that_is_your_own_money: "daga cikin haka kuɗinka ne, da ka kashe a kan hanya.",
  usually: "Yawanci",
  after_three_runs: "bayan tafiye-tafiye uku",
  runs_word: "tafiye-tafiye",
  post_lane: "Sanya wannan hanya",
  trucks_can_take_work: "motoci na iya ɗaukar aiki",
  cannot_be_given_a_trip: "ba za a iya ba su sabuwar tafiya ba",
  on_file_tap_to_remove: "Yana cikin fayil. Danna don cirewa",
  tap_to_upload: "Danna don ɗorawa",
  by_a_person: "daga mutum",
  sending_the_report: "Ana aikawa…",
  report_not_sent: "Ba a aika ba. An ajiye shi a nan — ka sake gwadawa.",
  could_not_load: "Ba a iya ɗauko wannan ba",
  not_sent_yet: "Ba a aika ba. Ka sake gwadawa.",
  cannot_reach_the_server: "Ba a iya kaiwa ga Backhaul ba",
  your_trips_are_still_there: "Tafiye-tafiyenka na nan. Wannan wayar ba ta iya ganin su a yanzu ba.",
  loading_your_trips: "Ana ɗauko tafiye-tafiyenka…",
  showing_the_walkthrough: "Wannan nuni ne kawai, ba tafiye-tafiyenka ba. Uwar garken ba ta da naka.",
  refusal_not_a_number: "Wannan bai yi kama da lambar wayar Najeriya ba.",
  refusal_too_many: "An nemi lambobi da yawa. Ka sake gwadawa daga baya.",
  refusal_too_soon: "An aika lamba yanzu-yanzu. Ka jira kafin ka nemi wata.",
  refusal_unknown: "Ba a nemi lamba a kan wannan lambar waya ba.",
  refusal_expired: "Wannan lambar ta ƙare. Ka nemi wata.",
  refusal_exhausted: "An yi kuskure sau da yawa. Ka nemi sabuwar lamba.",
  refusal_used: "An riga an yi amfani da wannan lambar.",
  refusal_wrong: "Wannan lambar ba daidai ba ce.",
  refusal_no_photos: "Ana buƙatar ƙarin hoto ɗaya.",
  refusal_no_signature: "Ana buƙatar sa hannu.",
  refusal_no_name: "Ana buƙatar sunan wanda ya sa hannu.",
  refusal_needs_photo: "Wannan irin rahoton yana buƙatar hoto.",
  refusal_not_allowed: "Tafiya ba za ta iya tafiya haka daga inda take ba.",
  refusal_terminal: "An gama wannan tafiya, ba za ta sake canzawa ba.",
  refusal_out_of_order: "Kwanan watan sa ya gabaci abin da aka riga aka rubuta.",
  refusal_revoked: "An kashe wannan hanyar bibiya.",
  refusal_link_expired: "Wannan hanyar bibiya ta ƙare.",
  refusal_unknown_link: "Wannan ba hanyar bibiya da muka bayar ba ce.",
  refusal_unhandled: "Uwar garken ta ƙi, wannan manhajar kuma ba ta da kalmomin dalilin tukuna.",
  blocker_too_heavy: "Ya fi nauyin da motarka ke ɗauka.",
  blocker_wrong_class: "Mai kayan ya nemi wani nau’in mota daban.",
  blocker_expired: "Wannan kayan ya wuce lokaci.",
  blocker_cannot_reach: "Ya yi nisa da za a tafi babu kaya.",
  km_empty_to_pickup: "kilomita babu kaya zuwa inda za a ɗauka",
  of_the_run_home: "kilomita na hanyar dawowa gida da yake rufewa",
  further_from_base: "kilomita nesa da sansanin",
  neither_toward_nor_away: "ba zuwa sansanin ba, ba nesa da shi ba",
  going_rate: "Farashin da ake yi",
  indicative: "ƙiyasi",
  over_what_the_run_costs: "fiye da kuɗin tafiyar.",
  loses_money: "Wannan yana asara: man dizal da kuɗin gudanarwa sun fi kuɗin da za a biya.",
  covers_the_trip_only: "Yana biyan kuɗin tafiyar, amma bai isa a mayar da komai cikin motar ba.",
  no_drops_on_this_trip: "Babu wuraren saukewa a wannan tafiya.",
  all_drops_signed_for: "wuraren saukewa, an sa hannu a kan duka.",
  signed_for_next: "an sa hannu · na gaba",
  loaded_pct: "da kaya",
  a_kilometre_driven: "ga kowace kilomita da aka tafi",
  legs_this_month: "tafiye-tafiye wannan wata",
  of_data_so_far: "na bayanai ya zuwa yanzu",
  of_your_airtime: "na katinka.",
  under_one_naira: "ƙasa da ₦1",
  about_a_month_at_this_rate: "a wata bisa wannan yanayin.",
  no_loads_at_that_price: "Babu kaya a kan wannan farashin. Gwada ƙaramin adadi.",
  no_loads_for_that_truck: "Babu kaya ga wannan motar. Gwada wani nau’i.",
  no_loads_ready_by_then: "Babu kayan da zai shirya kafin lokacin. Gwada wani kwanan wata na baya.",
  no_loads_from_that_level: "Babu kaya daga masu kaya na wannan matakin tukuna.",
  nothing_matching: "Babu abin da ya dace da",
  no_loads_right_now: "Babu kaya a kan allon a yanzu.",
  days_overdue: "kwana da suka wuce lokaci",
  due_today: "Yau ne",
  due_tomorrow: "Gobe ne",
  due_in_days: "kwana suka rage",
  items_measured_by_tracker: "abubuwa, waɗanda na’urar bibiya ta auna",
  reported_late_count: "an bayar da rahoto a makare",
  hours_with_nothing: "sa’o’i da ba a rubuta komai ba",
  nothing_recorded_on_trip: "Ba a rubuta komai a wannan tafiya ba.",
  days_out_of_date: "kwana da suka wuce",
  never_uploaded: "ba a taɓa ɗora ba",
  days_left: "kwana suka rage",
  to_reach: "Don kaiwa",
  levy_police: "Shingen ‘yan sanda",
  levy_state_revenue: "Kuɗin haraji na jiha",
  levy_union: "Ƙungiya",
  levy_weighbridge: "Ma’aunin nauyi",
  levy_park: "Kuɗin tashar mota",
  levy_ferry: "Jirgin ruwa",
  levy_other: "Wani",
  paper_licence: "Lasisin mota",
  paper_roadworthiness: "Takardar shaidar hanya",
  paper_insurance: "Inshora",
  paper_permit: "Izinin jigilar kaya",
  tier_unverified: "Ba a tabbatar ba",
  tier_verified: "An tabbatar",
  tier_business: "Kasuwanci",
  tier_trusted: "Amintacce",
  truck_pickup: "Ƙaramar mota",
  truck_canter: "Kanta",
  truck_15t: "Mota ta tan 15",
  truck_30t: "Babbar mota ta tan 30",
  truck_lowbed: "Loobed",
  standing_retired: "An yi ritaya da ita",
  exception_short: "Kaya sun yi ƙasa",
  exception_damaged: "Kaya sun lalace",
  exception_refused: "An ƙi karɓa",
  alert_signal_lost: "babu sigina",
  alert_stalled: "mota da ba ta tafiya",
  alert_deviating: "mota da ta bar hanya",
  alert_late: "kaya da ke jinkiri",
  alert_incident: "matsalar da aka bayar da rahoto",
  alert_duress: "direba cikin haɗari",
  alert_delivered: "kaya da aka sa hannu a kai",
  alert_bid_received: "sabon farashi",
  alert_link_expiring: "hanyar bibiya da ke gab da ƙarewa",
  cadence_weekly: "Kowane mako",
  cadence_fortnightly: "Kowane mako biyu",
  cadence_monthly: "Kowane wata",
  cadence_ad_hoc: "Lokacin da ake buƙata",
  ask_arrived_to_load: "Motar ta iso lokacin da ta ce za ta iso?",
  ask_reachable: "Ka iya tuntuɓar direban lokacin tafiyar?",
  ask_cargo_intact: "Kayan sun iso kamar yadda suka bar wurin?",
  ask_no_extras: "Farashin da aka amince shi ne ka biya?",
  claim_arrived_to_load: "Ya iso ɗaukar kaya kan lokaci",
  claim_reachable: "Ana iya tuntuɓarsa a kan hanya",
  claim_cargo_intact: "Kayan sun iso lafiya",
  claim_no_extras: "Babu ƙarin kuɗi fiye da farashin",
  where_the_truck_is_up_to: "Inda motar ta kai",
  every_drop_signed_note: "An sa hannu a kan kowane sauke, don haka tafiyar za ta iya rufewa. Isa adireshin ƙarshe kaɗai bai isa ba.",
  out_of_order_card: "Ba bisa tsari ba",
  out_of_order_note: "An rubuta shi, ba a ƙi shi ba. Mai karɓa da ya rufe shago abu ne na gaskiya — amma duk wanda zai karanta wannan daga baya yana tsammanin tsarin ɗaukar kayan.",
  hand_over_here_button: "Mika kaya a nan",
  back_to_the_trip: "Koma ga tafiyar",
  what_this_does: "Abin da wannan ke yi",
  puts_under_dispute: "Wannan kuma yana sa tafiyar cikin sabani, don mutum ya duba ta maimakon sanarwa ta shiga cikin jeri.",
  no_need_to_type_where: "Ba sai ka rubuta inda kake ba.",
  anything_to_add: "Wani abin ƙarawa",
  coming_round_again: "Yana zuwa kuma",
  two_days_warning_note: "Gargaɗin kwana biyu, don a sanya kaya kafin ranar maimakon a ranar — kayan da aka sanya safiyar ranar da ya kamata ya tafi yana zuwa ga wanda ya fi kusa, ba ga wanda ya fi kyau ba.",
  how_often: "Sau nawa",
  lane_post_hint: "Yana buɗe shi ga farashi tare da bayanan wannan hanya an riga an cika",
  post_this_run: "Sanya wannan tafiya",
  no_pairs_on_the_board: "Babu kaya biyu da za su haɗu a allon",
  nothing_fits_together: "Babu abin da zai haɗu a babbar mota ɗaya yau.",
  pairs_note: "Kana karɓar kuɗi fiye da ɗaya don tafiya ɗaya. Ba wanda ke yi wa kowa alheri, shi ya sa yake aiki.",
  you_collect: "Kai za ka karɓa",
  wont_fit_together: "Ba za su haɗu ba",
  what_is_it: "Wane kaya ne",
  how_heavy_in_tonnes: "Nauyinsa, a tan",
  what_it_should_cost: "Abin da ya kamata ya ci",
  indicative_only: "Ƙiyasi ne kawai. Farashi na canzawa da man dizal, da lokacin shekara, da kuma inda motar ta riga ta nufa.",
  two_photos_note: "Kayan, da inda kake. Biyu shi ne mafi ƙaranci da zai sa isar da kaya ta tabbata — hoto ɗaya na kaya ana iya ɗauka ko’ina.",
  where_it_was_captured: "Inda aka ɗauka",
  one_version_note: "Layukan nan su ne suke shiga PDF da tarin shaidun sabani. Akwai nau’i ɗaya na wannan takarda, ba uku ba.",
  say_how_the_carrier_did: "Faɗi yadda mai jigilar ya yi",
  how_did_they_do: "Yaya suka yi?",
  alerts_lede: "Injina shida na iya samar da abin da ya cancanci sani. Babu ɗaya daga cikinsu da ke yanke shawarar katse ka — wannan ne ke yi, a wuri ɗaya.",
  at_what_time: "A wane lokaci?",
  in_the_morning: "Da safe",
  one_line_not_four_buzzes: "Layi ɗaya maimakon ƙara huɗu cikin minti ɗaya, wanda yake kama da lalacewa maimakon taƙaitawa.",
  top_of_the_ladder: "Saman matakin",
  nothing_left_to_prove: "Babu sauran abin tabbatarwa. Matsalar da aka tabbatar za ta rage mataki ɗaya — ba dukan tarihin ba.",
  tier_note: "Mataki ba abin da mai jigilar kaya ke rubutawa ba ne. Yana fitowa daga waɗannan takardu da tarihin isar da kaya wanda babu bangaren da zai iya sauyawa.",
  if_you_take_all_three: "Idan ka ɗauki dukkan uku",
  the_chain: "Jerin tafiye-tafiyen",
  passed_over: "An tsallake su",
  four_questions_note: "Tambayoyi huɗu, kuma za ka iya tsallake kowanne. Babu maki a nan — abin da sauran masu kaya ke gani shi ne sau nawa kowanne ya kasance gaskiya.",
  what_other_shippers_see: "Abin da sauran masu kaya za su gani",
  send_the_review: "Aika kimantawar",
  bids_note: "An jera su bisa farashi idan aka kwatanta da mafi arha, tarihin mai jigilar, da nisansu daga inda za a ɗauki kayan. Mai jigilar da ba shi da tarihi ana jera shi a matsayin wanda ba a sani ba, ba mara kyau ba.",
  assigns_the_load: "Yana ba wannan mai jigilar kayan",
  spent_more_note: "Ka kashe fiye da abin da aka ba ka. Wannan shi ne lambar da wannan shafi yake nan don ita.",
  lane_middle_note: "Da zarar isassun tafiye-tafiye sun bi wannan hanya, tsakiyar waɗannan jimlar ita ce ainihin kuɗin hanyar — lambar da mai jigilar kaya ke buƙata don sa farashi kuma bai taɓa samu ba.",
  lapsed_paper_note: "Takardar da ta ƙare yayin da mota take kan hanya ba ta taɓa barin ta a hanya ba. Tana hana tafiya ta gaba maimakon haka — matsin lamba na ofis ne, ba na direban da yake nisan kilomita ɗari takwas daga gida ba.",
  every_paper_in_date: "Duk takardun suna kan lokaci",
  the_pack: "Tarin shaidu",
  measured_word: "An auna",
  reported_word: "An bayar da rahoto",
  reported_late_word: "An bayar da rahoto a makare",
  by_the_tracker: "daga na’urar bibiya",
  hours_after_the_fact: "sa’o’i bayan abin ya faru",
  not_much_here: "Babu abu da yawa a nan. Wannan gaskiya ce game da tafiyar, ba game da hujjar kowanne bangare ba.",
  nothing_recorded: "Ba a rubuta komai ba",
  hole_note: "Rami a cikin bayanan shi ne abin da bangarorin biyu za su nuna, don haka an ambace shi maimakon a bar shi a gano shi.",
  in_the_order_it_happened: "Bisa tsarin yadda ya faru",
  one_more_return_leg: "Ƙarin tafiyar dawowa ɗaya",
  return_leg_note: "Abin da cika ɗaya daga cikin waɗannan tafiye-tafiye marasa kaya zai samu, bisa farashin da ka riga ka samu.",
  see_bids: "Duba farashin da aka bayar kan kayan da aka sanya",
  see_who_is_bidding: "Duba wanda ke bayar da farashi",
  verification_hint: "Abin da mai jigilar ya tabbatar, da abin da ya rage",
  vehicles_hint: "Lasisi, takardar shaidar hanya, inshora da izini, ga kowace mota",
  alerts_hint: "Wa ake gaya wa me, da abin da aka yarda ya tashe ka",
  one_thing_wakes_you: "Abu ɗaya ne kawai zai tashe ka da ƙarfe uku na dare. Sauran duk suna jira har ƙarfe shida.",
  needs_a_look_head: "Na buƙatar dubawa",
  nothing_needs_you: "Babu abin da ke buƙatar ka",
  good_morning_note: "Kowace mota tana tafiya tana kuma aika bayanai. Haka safiya mai kyau take.",
  the_trip_is_cancelled: "An soke tafiyar",
  what_it_costs: "Abin da zai ci",
  left_of_the_fare: "Abin da ya rage a cikin kuɗin",
  counts_against_record: "Ana ƙirga shi a kan tarihin mai jigilar a matsayin matsala",
  incident_costs_one_tier: "Matsala tana rage mataki ɗaya, ba dukan tarihin ba. Wanda ya bar mai kaya a baya ya kamata a wahala wajen ɗaukarsa, ba a hana shi gaba ɗaya ba.",
  finished: "An gama",
  this_trip_is_done: "An gama wannan tafiya.",
  im_on_the_road: "Ina kan hanya",
  none_on_the_road_now: "babu wanda ke kan hanya a yanzu.",
  trips_word: "tafiye-tafiye",
  on_time_word: "kan lokaci",
  oldest_unpaid_waiting: "tafiya mafi tsufa da ba a biya ba tana jira.",
  delivered_lower: "an kai",
  this_month: "Wannan wata",
  what_you_are_owed: "Abin da ake bin ka",
  oldest_unpaid_note: "Yana saman jerin da ke ƙasa, domin shi ne wanda ya kamata ka tambaya a kai.",
  every_trip_settled: "An biya kowace tafiya.",
  not_paid_yet: "Ba a biya ba tukuna",
  no_trips_yet_history: "Babu tafiye-tafiye tukuna",
  history_empty_detail: "Tafiye-tafiyen da ka kammala da abin da suka biya za su bayyana a nan.",
  on_time_note: "Ana auna zuwa kan lokaci daga isowar da aka bi diddiginta, ba daga rahoton kowa ba — har da naka.",
  battery_low_note: "Batirinka ya yi ƙasa, don haka Backhaul yana rage yawan dubawa don wayar ta kai ƙarshen tafiya.",
  hand_over_and_sign: "Mika kayan a kuma sa hannu",
  past_trips_and_earnings: "Tafiye-tafiyenka na baya da abin da ka samu",
  nothing_more_to_do: "Babu sauran abin yi, kuma ba a ƙara raba komai.",
  delivered_word: "An kai",
  accept_this_trip: "Karɓi wannan tafiya",
  record_detail: "Duk abin da wannan tafiya ta rubuta, bisa yadda ya faru",
  cancel_detail: "Yana nuna kuɗin sokewa kafin komai ya faru",
  open_delivery_document: "Buɗe takardar isar da kaya",
  delivery_document_detail: "Hotuna, sa hannu da inda aka ɗauka",
  search_trips_label: "Bincika tafiye-tafiye",
  nothing_matches_that: "Babu abin da ya dace da haka",
  already_got_a_truck: "Ka riga ka na da mota a kan hanya? Ka fara bin ta cikin minti ɗaya, ko da wani wuri ka shirya ta.",
  opens_the_trip: "Yana buɗe tafiyar",
  show_next_link: "Nuna yanayin hanyar bibiya ta gaba",
  what_this_link_shows: "Abin da wannan hanyar bibiya ke nunawa",
  where_it_is_and_arrival: "Inda motar take, da lokacin da ya kamata ta iso",
  link_does_not_expire: "Wannan hanyar bibiya ba ta ƙarewa.",
  link_stops_today: "Wannan hanyar bibiya za ta daina aiki yau.",
  link_stops_in_days: "kwana kafin wannan hanyar bibiya ta daina aiki.",
  sending_something_yourself: "Kai ma kana da abin da za ka aika?",
  track_any_truck: "Za ka iya bin duk wata mota haka, ko wadda ka shirya wani wuri. Wanda ke kallo ba sai ya sauke komai ba.",
  position_and_arrival_only: "Inda take da lokacin isowa kawai.",
  adds_the_full_track: "Yana ƙara duk hanyar da abin da na’urar bin diddigi ya jefar daga ciki.",
  where_the_truck_is_now: "Inda motar take yanzu",
  when_it_should_arrive: "Lokacin da ya kamata ta iso",
  everywhere_it_has_been: "Duk inda ta wuce",
  what_the_track_dropped: "Abin da aka jefar daga hanyar, da dalilin sa",
  anybodys_phone_number: "Lambar wayar kowa",
  what_the_load_is_worth: "Darajar kayan",
  links_on_this_trip: "Hanyoyin bibiya na wannan tafiya",
  they_stop_seeing_it: "Ba za su ƙara ganin wannan tafiya ba",
  post: "Sanya",
  clear_the_filter: "Share tacewa",
  loaded_the_whole_way: "Da kaya duk hanya",
  clear_the_search: "Share binciken",
  opens_to_bids: "Yana buɗe shi ga farashin masu jigilar da aka tabbatar",
  search_the_board: "Bincika allon kaya",
  a_million_and_up: "₦1m zuwa sama",
  trailer_only: "Babbar mota kaɗai",
  ready_today: "A shirye yau",
  chain_note: "Yana haɗa kayan dawowa waje ɗaya don motar kada ta taɓa tafiya babu kaya",
  two_part_loads_one_run: "Kaya biyu marasa cika, tafiya ɗaya",
  runs_you_make_again: "Tafiye-tafiyen da ka saba yi",
  nothing_on_the_board_for_that: "Babu abin da ke kan allon don haka",
  ranking_note: "An jera su bisa abin da tafiyar ke biya, nisan da za ka yi babu kaya kafin ka kai ga kayan, da kuma yawan hanyar dawowa da yake rufewa.",
  your_trailer_is_free: "Tafiyar da ka yi babu kaya man fetur ne, tayoyi da ranar aiki da ba a biya ba.",
  stayed: 'ya jima',
  appearance_light: 'Haske',
  appearance_dark: 'Duhu',
  appearance_auto: 'Kai tsaye',
  arrival: 'Isowa',
  not_enough_to_say_yet: 'Bayanai ba su isa a faɗi ba tukuna',
  estimated: 'Ƙiyasi',
  to_go: 'suka rage',
  no_signal_stretches: 'ba tare da sigina ba, an nuna su da launin toka',
  day_sunday: 'Lahadi',
  day_monday: 'Litinin',
  day_tuesday: 'Talata',
  day_wednesday: 'Laraba',
  day_thursday: 'Alhamis',
  day_friday: 'Jumaʼa',
  day_saturday: 'Asabar',
  next: "Na gaba",
  everything_released: "An saki kuɗin gaba ɗaya.",
  condition_advance: "Motar ta isa ma’ajiyar kuma an fara ɗaukar kaya.",
  condition_in_transit: "Tafiyar tana ci gaba, wurare kuma suna zuwa har sa’o’i shida.",
  condition_delivered: "An ɗauki tabbacin isar da kaya: hotuna, sa hannu da suna.",
  condition_retention: "Kwana bakwai bayan isar da kaya ba tare da wani ƙorafi ba.",
  on_loading: "Lokacin ɗaukar kaya",
  on_delivery: "Lokacin isar da kaya",
  held_back: "An riƙe",
  agreed_fare: "Kuɗin da aka amince",
  demurrage: "Kuɗin jinkiri",
  commission: "Kwamitin Backhaul",
  advance_paid: "Kuɗin gaba da aka riga aka biya",
  due_to_carrier: "Abin da ya kamata a biya mai jigilar",
  now: "yanzu",
  no_usable_positions_yet: "Babu wurin da za a iya amfani da shi tukuna.",
  usable: "ana iya amfani da su.",
  dropped_imprecise: "wayar ba ta iya faɗin inda take ba",
  dropped_out_of_order: "kwanan wata ya gabaci wurin da ya zo gabansa",
  dropped_jump: "tsalle da babu motar da za ta iya yi",
  deviation_note: "An auna shi da nisan da ya rage zuwa inda za a je, ba da nisansa daga layi miƙaƙƙe ba. Hanyar Legas zuwa Kano na iya yin nisan kilomita 90 daga wannan layi na sa’o’i, kuma ƙara da ke kara a kowace tafiya daidai ƙara ce da ba a karanta.",
  waiting_note: "shi ne abin da ake yin buƙatar kuɗin jinkiri da shi. Ba a ƙirga lokacin ma’aunin nauyi.",
  still_ahead_note: "sun rage. Ana auna isowa da faɗin kowane wuri na kansa, ba da nisa ɗaya ga dukan tafiyar ba.",
  every_point_reached: "An isa kowane wuri da ke kan hanyar.",
  pace_note: "Daga ƙofa zuwa ƙofa, tare da kowane tsayawa. Ba mizanin gudu ba — mota mai tafiya 80 da ke ƙarasa sa’o’i tara a shingayen bincike takan yi kusan 35 a ranar, kuma lamba ta biyu ce ake gina isowa da ita.",
  stops_note: "aka tsaya gaba ɗaya. Wannan ne ake yin buƙatar kuɗin jinkiri da shi.",
  stops_overline: "Tsayawa",
  pace_over_the_trip: "Gudun tafiya gaba ɗaya",
  peak: "mafi girma",
  shaded_no_signal: "An yi inuwa inda babu sigina",
  positions_all_usable: "wurare, dukkansu ana iya amfani da su.",
  positions: "wurare",
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
  who_is_it_for: "Fún ta ni?",
  make_a_link: "Ṣe ọ̀nà asopọ̀",
  making_the_link: "Ń ṣe é…",
  link_not_made: "A kò ṣe ọ̀nà asopọ̀ náà. Tún gbìyànjú.",
  the_new_link: "Ọ̀nà asopọ̀ tuntun",
  shown_once_send_it_now: "Ìgbà kan ṣoṣo nìyí tí a ó fi ọ̀nà asopọ̀ yìí hàn. Fi í ránṣẹ́ ní báyìí — a kò lè fi hàn mọ́.",
  send_the_link: "Fi ránṣẹ́",
  could_not_send_the_link: "Kò jáde. Ọ̀nà asopọ̀ ṣì wà lókè — gbìyànjú lẹ́ẹ̀kansi.",
  hide_the_link: "Fi pamọ́",
  walkthrough_makes_no_links: "Àpẹẹrẹ kò lè ṣe ọ̀nà asopọ̀ gidi. Àwọn tí ó wà nísàlẹ̀ kì í ṣe gidi.",
  walkthrough_signs_nothing_off: "Àpẹẹrẹ kò lè fọwọ́sí ohunkóhun, nítorí náà kò sí ohun tí a lè fi lọ́wọ́ níbí.",
  still_marked_unread: "Ó ṣì wà ní àìkà fún àwọn yòókù.",
  mark_it_cleared: "Sàmì sí i pé ó ti yanjú",
  clearing_it: "Ń yanjú rẹ̀…",
  not_cleared: "Ó ṣì wà ní ṣíṣí. Tún gbìyànjú.",
  seal_the_proof: "Fọwọ́ sí i pé ó parí",
  not_notifying: "A kò ń kìlọ̀",
  at_most_once_every: "ẹ̀ẹ̀kan ṣoṣo ní gbogbo",
  role_shipper: "olówó ẹrù",
  role_carrier: "olówó ọkọ̀",
  role_driver: "awakọ̀",
  push_not_configured: "Ẹ̀dà yìí kò lè gba ìkìlọ̀. Àwọn ìkìlọ̀ ìsàlẹ̀ ni ohun tí yóò fi ránṣẹ́.",
  push_refused: "A ti pa ìkìlọ̀ fún Backhaul, nítorí náà kò sí ohun tí yóò dé fóònù yìí.",
  no_position_to_rank_from: "Kò sí ọkọ̀ tí ó ti ròyìn síbẹ̀, nítorí náà a kò to èyí ní ìbámu pẹ̀lú ìjìnnà.",
  location_blocked: "A ti pa ipò ibi fún Backhaul. A kò ń kọ ìrìn rẹ sílẹ̀ — tan án nínú Ètò.",
  location_denied: "Backhaul nílò ibi tí o wà láti kọ ìrìn yìí sílẹ̀. A kò ní kọ ohunkóhun títí tí o fi gbà.",
  notifications_missing: "Láìsí ìkìlọ̀, fóònù rẹ lè dá àkọsílẹ̀ dúró lẹ́yìn ìpìlẹ̀. Ìrìn rẹ lè ní àwọn àlàfo.",
  tracking_not_available: "Fóònù yìí kò lè kọ ìrìn sílẹ̀. Béèrè lọ́wọ́ ọ́fíìsì fún fóònù tí ó lè ṣe é.",
  phone_is_holding_back: "Fóònù rẹ ń dí Backhaul lọ́wọ́ láti kọ sílẹ̀ dáadáa. Yẹ ètò ipò àti bátìrì wò.",
  open_settings: "Ṣí Ètò",
  allow_location: "Gba ipò ibi láàyè",
  waiting_to_send: "wọ́n ń dúró láti fi ránṣẹ́",
  walkthrough_unreached: "Àpẹẹrẹ ni èyí. A kò lè dé ọ̀dọ̀ sáfà láti wá tìrẹ.",
  and_word: "àti",
  needs_a_note: "ó nílò àkọsílẹ̀",
  it_is_still_there: "Ó ṣì wà níbẹ̀. Fóònù yìí kò lè rí i ní àkókò yìí.",
  the_server_said_no: "Sáfà kò dáhùn",
  reading: "À ń kà á",
  told_and_under_dispute: "A ti sọ fún olówó ẹrù àti olówó ọkọ̀, ìjà sì ti wà lórí ìrìn náà.",
  told_keep_driving: "A ti sọ fún olówó ẹrù àti olówó ọkọ̀. Máa wakọ̀ nígbà tí o bá lè ṣe.",
  eta_stops_showing: "A kò ní fi àkókò ìdé tí a fojú bù hàn títí èyí yóò fi kúrò — àfojúbù lẹ́gbẹ̀ẹ́ ọkọ̀ tí ó dúró jẹ́ ìtakora.",
  eta_stays_delay_visible: "Àkókò ìdé tí a fojú bù ṣì wà, ìdádúró náà sì wà lórí ìrìn fún gbogbo ènìyàn láti rí.",
  recorded_against_the_trip: "A kọ ọ́ sí ìrìn náà, níbi tí gbogbo ẹni tí ó wà nínú rẹ̀ lè rí i.",
  late: "Ó pẹ́",
  alert_held: "A dá a dúró",
  alert_not_sent: "A kò fi ránṣẹ́",
  alert_wakes_you: "Ó jí ọ",
  alert_notifies: "Ó ń kìlọ̀",
  alert_in_the_app: "Nínú áàpù náà",
  simulate_losing_signal: "Ṣe bí ẹni pé sìgnál kò sí",
  simulate_regaining_signal: "Ṣe bí ẹni pé sìgnál ti padà",
  link_turned_off: "A ti pa ọ̀nà asopọ̀ yìí",
  link_expired: "Ọ̀nà asopọ̀ yìí ti parí",
  ask_for_a_new_one: "Béèrè lọ́wọ́ ẹni tí ó fi ránṣẹ́ fún ọ̀kan tuntun.",
  links_stop_working: "Àwọn ọ̀nà asopọ̀ ń dá iṣẹ́ dúró lẹ́yìn ọ̀sẹ̀ díẹ̀, kí ibi tí ọkọ̀ wà má bàa wà ní gbangba títí láé. Béèrè lọ́wọ́ ẹni tí ó fi ránṣẹ́ fún ọ̀kan tuntun.",
  signature: "Ìfọwọ́sí",
  still_settles_note: "A ó ṣì san owó ìrìn yìí. A ó jiyàn nípa àìtó ẹrù lọ́tọ̀ — dídá gbogbo owó dúró ń jẹ olówó ọkọ̀ níyà fún ìyàtọ̀ tí ó sábà máa ń jẹ́ ti ibi ìkó ẹrù.",
  nothing_owed_for_handover: "A kò fi ohunkóhun lélẹ̀, nítorí náà kò sí owó tí a jẹ lórí ìfilélẹ̀ náà.",
  selected_tap_to_remove: "A ti yàn án. Tẹ̀ ẹ́ láti yọ ọ́ kúrò",
  tap_to_filter_by_this: "Tẹ̀ ẹ́ láti ṣàyẹ̀wò pẹ̀lú èyí",
  on_file: 'Ó wà nínú ìwé',
  not_uploaded: 'A kò tí ì fi sí i',
  document_identity: 'Ìwé ìdánimọ̀ ìjọba',
  document_licence: 'Ìwé àṣẹ awakọ̀',
  document_registration: 'Ìforúkọsílẹ̀ ilé-iṣẹ́',
  document_insurance: 'Ìdábòbò ẹrù lójú ọ̀nà',
  more_completed_trips: 'ìrìn tí a parí sí i',
  on_time_delivery: 'ìfilélẹ̀ ẹrù ní àkókò',
  still_aboard: 'ó ṣì wà nínú ọkọ̀',
  added_for_extra_stops: 'a fi kún un fún àwọn ìdúró àfikún',
  first_drop_is_delivery: 'Ìdúró àkọ́kọ́ ni ìfilélẹ̀ ẹrù; olúkúlùkù tí ó tẹ̀lé e jẹ́ ìyapa ọ̀nà, ìdúró àti ìwé mìíràn.',
  delivered_out_of_order: 'ni a fi lélẹ̀ nígbà tí ìdúró àkọ́kọ́ ṣì wà nínú ọkọ̀.',
  hand_over_at: 'Fi ẹrù lélẹ̀ ní',
  km_by_road: 'kílómítà ní ojú ọ̀nà',
  too_heavy_for_any_truck: 'tọ́ọ̀nù ni ẹrù tí ó pọ̀ jùlọ tí ọkọ̀ kankan níbí lè gbé lẹ́ẹ̀kan. Pín in, tàbí gbé e kalẹ̀ bí méjì.',
  smallest_truck_that_carries_it: 'ni ọkọ̀ tí ó kéré jùlọ tí ó lè gbé e.',
  trips_completed: 'ìrìn tí a ti parí',
  too_few_for_on_time: 'wọ́n kéré jù láti fi hàn bí àkókò ṣe rí',
  on_time: 'ní àkókò',
  days_ago_expired: 'ọjọ́ láti ìgbà tí ó ti parí',
  expires_in_days: 'ọjọ́ kí ó tó parí',
  warned_days_ahead: 'ọjọ́ ìkìlọ̀ dípò ìránṣẹ́ ní òwúrọ̀ ọjọ́ tí ó parí — pípàdánù ipò láàrin ìrìn ń pàdánù iṣẹ́ tí a ti gbà tẹ́lẹ̀.',
  nothing_is_owed: 'Kò sí owó tí ẹnikẹ́ni jẹ.',
  is_owed_and_both_can_see: 'ni a jẹ, àwọn ẹgbẹ́ méjèèjì sì lè rí ìdí rẹ̀.',
  as_the_shipper: 'Bí olówó ẹrù',
  as_the_carrier: 'Bí olówó ọkọ̀',
  hours_of_the_bid_being_accepted: 'wákàtí tí a gba ìdíyelé',
  one_sms_and_it_says_who: 'àwọn lẹ́tà — SMS kan, ó sì sọ ẹni tí ó ti wá. Ọ̀nà asopọ̀ tí kò ní àlàyé láti ọ̀dọ̀ nọ́mbà àìmọ̀ ni a ń pa rẹ́.',
  days_unless_you_turn_it_off: 'ọjọ́, àyàfi tí o bá pa á ṣáájú.',
  under_a_day_left: 'Kò tó ọjọ́ kan',
  one_day_left: 'Ọjọ́ 1 ló kù',
  does_not_expire: 'Kò ní parí',
  turned_off: 'A ti pa á',
  expired: 'Ó ti parí',
  position_and_full_track: 'Ibi tí ó wà àti gbogbo ọ̀nà tí ó gbà',
  position_only: 'Ibi tí ó wà nìkan',
  turn_off_the_link_for: 'Pa ọ̀nà asopọ̀ fún',
  km_of_empty_repositioning: 'kílómítà ìrìn òfìfo ni èyí tí ó pọ̀ jùlọ tí a ń dábàá rí. Ju bẹ́ẹ̀ lọ, epo àti ọjọ́ tí a ná kì í sábà bá owó ìrìn náà mu.',
  of_the_trip_is_covered: 'nínú ìrìn náà ni àtẹ̀lé fi bò.',
  between: 'láàrin',
  and: 'àti',
  asks_what_it_was_for: 'ni a ó béèrè ohun tí ó jẹ́ fún — kì í ṣe láti ṣiyèméjì, ṣùgbọ́n nítorí pé èyí ni àkọsílẹ̀ tí ọ́fíìsì ń béèrè lẹ́yìn ọ̀sẹ̀ kan.',
  over_keep_it_short: 'ó ju bẹ́ẹ̀ lọ — sọ ọ́ ní ṣókí, tàbí pè.',
  written_in_a_dead_zone: 'A kọ ọ́ níbi tí kò sí sìgnál · ó dé',
  of_the_truck_is_refused: 'nínú ọkọ̀ ni a ń kọ̀ bí ó tilẹ̀ jẹ́ pé yóò bá a mu: olówó ẹrù méjì, ìwé méjì àti àǹfààní ìdádúró méjì, fún tirela tí ó ṣì jẹ́ afẹ́fẹ́ púpọ̀ jùlọ.',
  km_from_the_destination: 'kílómítà sí ibi tí ó ń lọ. A kọ ọ́ sínú ìwé náà.',
  metres_out: 'm sí i',
  at_the_destination: 'Ní',
  the_destination: 'ibi tí ó ń lọ',
  all_trucks_can_take_work: 'ọkọ̀, olúkúlùkù sì lè gba iṣẹ́',
  cannot_be_given_a_new_trip: 'ni a kò lè fún ní ìrìn tuntun',
  no_signal_still_recording: 'Kò sí sìgnál. À ń kọ ibi tí o wà síbẹ̀.',
  positions_saved_waiting: 'àwọn ibi tí a fi pamọ́, wọ́n ń dúró láti fi ránṣẹ́.',
  quiet_between: 'Ìdákẹ́ láàrin',
  held_is_not_dropped: 'Ohunkóhun tí a dá dúró ni a kò sọnù — ó dé ní òwúrọ̀ gẹ́gẹ́ bí ìlà kan.',
  still_to_come: 'ó ṣì ń bọ̀',
  demo_showing_link: 'Àpẹẹrẹ · à ń fi ọ̀nà asopọ̀ hàn',
  of_count: 'nínú',
  add_a_photo_this_one_needs_it: 'Fi fọ́tò kún un — èyí nílò rẹ̀',
  photos_added: 'a fi kún un',
  under_answers: 'Kò tó',
  answers: 'ìdáhùn',
  optional: 'Kò dandan',
  track_a_trip: "Tọpa ìrìn àjò",
  arranged_anywhere: "Fún ẹrù tí o ti gbà níbòmíràn. Kò sí pátákó, kò sí ìdíyelé — ọkọ̀ nìkan, tí a ń tọ̀ láti ibí.",
  where_it_loads: "Ibi tí a ti kó o",
  where_it_unloads: "Ibi tí a ó ti sọ ọ́ kalẹ̀",
  the_drivers_number: "Nọ́mbà awakọ̀",
  the_carriers_number: "Nọ́mbà onítọ̀ọ̀kọ̀",
  the_shippers_number: "Nọ́mbà oníṣòwò",
  who_is_on_it: "Ta ló wà nínú rẹ̀",
  what_it_is_carrying: "Ohun tí ó ń gbé",
  start_tracking_it: "Bẹ̀rẹ̀ sí tọ̀ ọ́",
  starting_to_track: "Ń bẹ̀rẹ̀…",
  could_not_start_tracking: "A kò ṣí ìrìn àjò náà. A kò fi ohunkóhun ránṣẹ́ sí ẹnikẹ́ni. Gbìyànjú lẹ́ẹ̀kansi.",
  not_a_number_this_can_reach: "Ìyẹn kì í ṣe nọ́mbà tí èyí lè dé.",
  it_is_on_your_list_now: "Ó ti wà nínú àkójọ ìrìn àjò rẹ báyìí.",
  walkthrough_opens_no_trips: "Àpẹẹrẹ kò lè ṣí ìrìn àjò gidi. Wọlé láti ṣí ọ̀kan.",
  add_a_note: 'Fi àkọsílẹ̀ kún un',
  the_route: 'Ọ̀nà',
  the_cargo: 'Ẹrù',
  handover: 'Ìfilélẹ̀ ẹrù',
  what_went_wrong: 'Ohun tí kò lọ dáadáa',
  and_also: 'Bákan náà',
  expiring: 'Ń parí',
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

  hand_over_the_note: 'Fi ìwé náà lé wọn lọ́wọ́',
  hand_over_once_signed_off: 'O lè fi èyí lé wọn lọ́wọ́ lẹ́yìn tí a bá ti fọwọ́ sí i pé ó parí.',
  could_not_hand_it_over: 'Kò jáde. Gbìyànjú lẹ́ẹ̀kan si.',

  utilisation: 'Bí a ṣe ń lo àwọn ọkọ̀',
  your_fleet: 'Àwọn ọkọ̀ rẹ',
  walkthrough_figures: 'Àwọn nọ́mbà àpẹẹrẹ ni. A kò tí ì ṣírò tìrẹ.',
  km_loaded: 'Pẹ̀lú ẹrù',
  km_empty: 'Òfìfo',
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
  no_name_yet: "Kò sí orúkọ síbẹ̀",
  answer_one_to_send: "Dáhùn ọ̀kan kí o tó fi ránṣẹ́",
  answers_word: "ìdáhùn",
  how_did_they_do_title: "Báwo ni wọ́n ṣe ṣe é?",
  review_sent: "A fi ránṣẹ́",
  posting: "À ń gbé e kalẹ̀…",
  posted: "A ti gbé e kalẹ̀",
  not_posted: "A kò gbé e kalẹ̀. Tún gbìyànjú.",
  of_the_trailer_used: "nínú ọkọ̀ tí a lò",
  was_word: "ó jẹ́",
  of_the_km_paid_for: "nínú àwọn kílómítà tí a san fún",
  more_than_running_home_empty: "ju kíkó òfìfo padà sí ilé lọ",
  km_empty_across_the_chain: "kílómítà ní òfìfo ní gbogbo ìsopọ̀ náà.",
  loads_where_last_dropped: "Ó kó ẹrù níbi tí a ti sọ èyí tó kọjá kalẹ̀",
  km_empty_to_get_there: "kílómítà ní òfìfo kí ó tó dé ibẹ̀",
  already_carrying_this: "ó ti ń gbé èyí lọ́wọ́",
  nothing_to_chain: "Kò tíì sí ohun tí a lè bẹ̀rẹ̀ ìsopọ̀ láti ọ̀dọ̀ rẹ̀",
  recommended: "A dábàá rẹ̀",
  cheapest: "Ó tọ́ jùlọ",
  completed_trips: "ìrìn tí a ti parí",
  carriers_have_bid: "àwọn awakọ̀ ti gbé owó kalẹ̀",
  at_the_pickup_now: "Ó wà ní ibi ìkó ẹrù báyìí",
  km_from_the_pickup: "kílómítà sí ibi ìkó ẹrù",
  award: "Fún un ní iṣẹ́ náà",
  no_bids_yet: "A kò tíì gbé owó kankan kalẹ̀",
  no_loads_posted: "O kò tíì gbé ẹrù kankan kalẹ̀.",
  of_that_is_your_own_money: "nínú ìyẹn jẹ́ owó tìrẹ, tí o ná lójú ọ̀nà.",
  usually: "Ní gbogbogbò",
  after_three_runs: "lẹ́yìn ìrìn mẹ́ta",
  runs_word: "ìrìn",
  post_lane: "Gbé ọ̀nà yìí kalẹ̀",
  trucks_can_take_work: "ọkọ̀ lè gba iṣẹ́",
  cannot_be_given_a_trip: "a kò lè fún wọn ní ìrìn tuntun",
  on_file_tap_to_remove: "Ó wà nínú fáìlì. Tẹ̀ láti yọ kúrò",
  tap_to_upload: "Tẹ̀ láti gbé e sókè",
  by_a_person: "láti ọwọ́ ènìyàn",
  sending_the_report: "À ń fi ránṣẹ́…",
  report_not_sent: "A kò fi ránṣẹ́. A tọ́jú rẹ̀ síbí — tún gbìyànjú.",
  could_not_load: "A kò lè mú èyí wá",
  not_sent_yet: "A kò fi ránṣẹ́. Tún gbìyànjú.",
  cannot_reach_the_server: "A kò lè dé ọ̀dọ̀ Backhaul",
  your_trips_are_still_there: "Àwọn ìrìn rẹ ṣì wà. Fóònù yìí kò lè rí wọn báyìí.",
  loading_your_trips: "À ń mú àwọn ìrìn rẹ wá…",
  showing_the_walkthrough: "Àpẹẹrẹ ni èyí, kì í ṣe àwọn ìrìn rẹ. Sáfà kò ní tìrẹ.",
  refusal_not_a_number: "Èyí kò dà bí nọ́mbà fóònù Nàìjíríà.",
  refusal_too_many: "A ti béèrè fún kóòdù púpọ̀ jù. Tún gbìyànjú lẹ́yìn náà.",
  refusal_too_soon: "A ṣẹ̀ṣẹ̀ fi kóòdù ránṣẹ́. Dúró kí o tó béèrè fún òmíràn.",
  refusal_unknown: "A kò béèrè fún kóòdù lórí nọ́mbà yìí.",
  refusal_expired: "Kóòdù yẹn ti parí. Béèrè fún òmíràn.",
  refusal_exhausted: "A ti ṣàṣìṣe lọ́pọ̀ ìgbà. Béèrè fún kóòdù tuntun.",
  refusal_used: "A ti lo kóòdù yẹn tẹ́lẹ̀.",
  refusal_wrong: "Kóòdù yẹn kò tọ́.",
  refusal_no_photos: "A nílò àwòrán kan sí i.",
  refusal_no_signature: "A nílò ìfọwọ́sí.",
  refusal_no_name: "A nílò orúkọ ẹni tí ó fọwọ́sí.",
  refusal_needs_photo: "Irú ìròyìn yìí nílò àwòrán.",
  refusal_not_allowed: "Ìrìn kò lè lọ bẹ́ẹ̀ láti ibi tí ó wà.",
  refusal_terminal: "Ìrìn yìí ti parí, kò sì lè yí padà.",
  refusal_out_of_order: "Ọjọ́ rẹ̀ ṣáájú ohun tí a ti kọ sílẹ̀ tẹ́lẹ̀.",
  refusal_revoked: "A ti pa ọ̀nà ìtọ́pinpin yìí.",
  refusal_link_expired: "Ọ̀nà ìtọ́pinpin yìí ti parí.",
  refusal_unknown_link: "Èyí kì í ṣe ọ̀nà ìtọ́pinpin tí a fúnni.",
  refusal_unhandled: "Sáfà náà kọ̀, ohun èlò yìí kò sì ní ọ̀rọ̀ fún ìdí rẹ̀ síbẹ̀.",
  blocker_too_heavy: "Ó wúwo ju èyí tí ọkọ̀ rẹ lè gbé lọ.",
  blocker_wrong_class: "Onílẹ̀rù béèrè fún irú ọkọ̀ mìíràn.",
  blocker_expired: "Ẹrù yìí ti kọjá àkókò.",
  blocker_cannot_reach: "Ó jìnnà jù láti rìn ní òfìfo dé ibẹ̀.",
  km_empty_to_pickup: "kílómítà ní òfìfo sí ibi ìkó ẹrù",
  of_the_run_home: "kílómítà ọ̀nà ìpadàbọ̀ ilé tí ó bò",
  further_from_base: "kílómítà jìnnà sí ibùdó",
  neither_toward_nor_away: "kì í ṣe sí ibùdó, kì í sì í ṣe kúrò níbẹ̀",
  going_rate: "Owó tí ó ń lọ",
  indicative: "ìdíwọ̀n",
  over_what_the_run_costs: "ju owó tí ìrìn náà ń ná lọ.",
  loses_money: "Èyí ń pàdánù owó: epo dísẹ́ẹ̀lì àti owó ìtọ́jú ju owó tí wọ́n máa san lọ.",
  covers_the_trip_only: "Ó bo owó ìrìn náà, ṣùgbọ́n kò tó láti fi ohunkóhun padà sínú ọkọ̀.",
  no_drops_on_this_trip: "Kò sí ibi ìsọ̀kalẹ̀ nínú ìrìn yìí.",
  all_drops_signed_for: "ibi ìsọ̀kalẹ̀, a fọwọ́sí gbogbo rẹ̀.",
  signed_for_next: "a fọwọ́sí · èkejì",
  loaded_pct: "pẹ̀lú ẹrù",
  a_kilometre_driven: "fún kílómítà kọ̀ọ̀kan tí a rìn",
  legs_this_month: "ìrìn ní oṣù yìí",
  of_data_so_far: "ti dátà títí di ìsinsìnyí",
  of_your_airtime: "nínú káàdì rẹ.",
  under_one_naira: "kò tó ₦1",
  about_a_month_at_this_rate: "ní oṣù kan ní iye yìí.",
  no_loads_at_that_price: "Kò sí ẹrù ní iye yẹn. Gbìyànjú iye tó kéré.",
  no_loads_for_that_truck: "Kò sí ẹrù fún ọkọ̀ yẹn. Gbìyànjú irú mìíràn.",
  no_loads_ready_by_then: "Kò sí ẹrù tí yóò ṣetán ní àkókò yẹn. Gbìyànjú ọjọ́ tó tẹ̀lé.",
  no_loads_from_that_level: "Kò tíì sí ẹrù láti ọ̀dọ̀ àwọn onílẹ̀rù ní ipò yẹn.",
  nothing_matching: "Kò sí ohun tí ó bá",
  no_loads_right_now: "Kò sí ẹrù lórí pátákó báyìí.",
  days_overdue: "ọjọ́ tí ó ti kọjá àkókò",
  due_today: "Lónìí ni",
  due_tomorrow: "Ọ̀la ni",
  due_in_days: "ọjọ́ ló kù",
  items_measured_by_tracker: "nǹkan, nínú wọn ni ẹ̀rọ ìtọ́pinpin wọ̀n",
  reported_late_count: "a ròyìn wọn pẹ́",
  hours_with_nothing: "wákàtí tí a kò kọ nǹkan sílẹ̀",
  nothing_recorded_on_trip: "A kò kọ nǹkan sílẹ̀ nínú ìrìn yìí.",
  days_out_of_date: "ọjọ́ tí ó ti kọjá",
  never_uploaded: "a kò gbé e sókè rí",
  days_left: "ọjọ́ ló kù",
  to_reach: "Láti dé",
  levy_police: "Ibi ìdánwò ọlọ́pàá",
  levy_state_revenue: "Owó orí ìpínlẹ̀",
  levy_union: "Ẹgbẹ́ awakọ̀",
  levy_weighbridge: "Ibi ìwọ̀n ọkọ̀",
  levy_park: "Owó ibùdó ọkọ̀",
  levy_ferry: "Ọkọ̀ ojú omi",
  levy_other: "Òmíràn",
  paper_licence: "Ìwé àṣẹ ọkọ̀",
  paper_roadworthiness: "Ìwé ìtọ́jú ọkọ̀",
  paper_insurance: "Ìdánilójú",
  paper_permit: "Ìgbàláàyè gbígbé ẹrù",
  tier_unverified: "A kò fọwọ́sí i",
  tier_verified: "A fọwọ́sí i",
  tier_business: "Òwò",
  tier_trusted: "A gbẹ́kẹ̀lé e",
  truck_pickup: "Ọkọ̀ kékeré",
  truck_canter: "Kánta",
  truck_15t: "Ọkọ̀ tọ́ọ̀nù 15",
  truck_30t: "Ọkọ̀ ńlá tọ́ọ̀nù 30",
  truck_lowbed: "Lóóbẹ́dì",
  standing_retired: "A ti fẹ̀yìn tì í",
  exception_short: "Ẹrù kò pé",
  exception_damaged: "Ẹrù bàjẹ́",
  exception_refused: "Wọ́n kọ̀ láti gbà á",
  alert_signal_lost: "kò sí sìgínàlì",
  alert_stalled: "ọkọ̀ tí kò ń lọ",
  alert_deviating: "ọkọ̀ tí ó ṣáko lọ",
  alert_late: "ìfiránṣẹ́ tí ó ń pẹ́",
  alert_incident: "ìṣòro tí a ròyìn",
  alert_duress: "awakọ̀ tí ó wà nínú ewu",
  alert_delivered: "ìfiránṣẹ́ tí a fọwọ́sí",
  alert_bid_received: "owó tuntun tí wọ́n gbé kalẹ̀",
  alert_link_expiring: "ọ̀nà ìtọ́pinpin tí ó fẹ́ parí",
  cadence_weekly: "Ní ọ̀sẹ̀ kọ̀ọ̀kan",
  cadence_fortnightly: "Ní ọ̀sẹ̀ méjì kọ̀ọ̀kan",
  cadence_monthly: "Ní oṣù kọ̀ọ̀kan",
  cadence_ad_hoc: "Nígbà tí a bá nílò rẹ̀",
  ask_arrived_to_load: "Ṣé ọkọ̀ náà dé nígbà tí ó sọ pé òun máa dé?",
  ask_reachable: "Ṣé o lè kàn sí awakọ̀ nígbà ìrìn náà?",
  ask_cargo_intact: "Ṣé ẹrù náà dé bí ó ṣe kúrò?",
  ask_no_extras: "Owó tí a fọwọ́sí ni o san?",
  claim_arrived_to_load: "Ó dé ìkó ẹrù ní àkókò",
  claim_reachable: "A lè kàn sí i lójú ọ̀nà",
  claim_cargo_intact: "Ẹrù dé láìbàjẹ́",
  claim_no_extras: "Kò sí owó mìíràn ju èyí tí a sọ lọ",
  where_the_truck_is_up_to: "Ibi tí ọkọ̀ ti dé",
  every_drop_signed_note: "A fọwọ́sí gbogbo ìsọ̀kalẹ̀, nítorí náà ìrìn náà lè parí. Dídé àdírẹ́sì ìkẹyìn nìkan kò tó.",
  out_of_order_card: "Kò bá ìtòlẹ́sẹẹsẹ mu",
  out_of_order_note: "A kọ ọ́ sílẹ̀, a kò kọ̀ ọ́. Olùgbà tí ó ti tì ilé rẹ̀ jẹ́ nǹkan gidi — ṣùgbọ́n gbogbo ẹni tí yóò kà á lẹ́yìn náà rò pé ìtòlẹ́sẹẹsẹ ìkó ẹrù ni.",
  hand_over_here_button: "Fi ẹrù lélẹ̀ níbí",
  back_to_the_trip: "Padà sí ìrìn náà",
  what_this_does: "Ohun tí èyí ń ṣe",
  puts_under_dispute: "Èyí náà máa fi ìrìn náà sábẹ́ àríyànjiyàn, kí ènìyàn lè wò ó dípò kí ìkìlọ̀ wọlé sínú àkọsílẹ̀.",
  no_need_to_type_where: "O kò ní láti tẹ ibi tí o wà.",
  anything_to_add: "Ohunkóhun láti fikún",
  coming_round_again: "Ó ń padà bọ̀ lẹ́ẹ̀kan si",
  two_days_warning_note: "Ìkìlọ̀ ọjọ́ méjì, kí a lè gbé ẹrù kalẹ̀ ṣáájú ọjọ́ náà dípò ní ọjọ́ náà — ẹrù tí a gbé kalẹ̀ ní òwúrọ̀ ọjọ́ tí ó gbọ́dọ̀ lọ máa tọ ẹni tí ó sún mọ́ọ́n jù, kì í ṣe ẹni tí ó dára jù.",
  how_often: "Bí ó ṣe máa ń wáyé tó",
  lane_post_hint: "Ó ṣí i sílẹ̀ fún owó pẹ̀lú àwọn àlàyé ọ̀nà yìí tí a ti kún tẹ́lẹ̀",
  post_this_run: "Gbé ìrìn yìí kalẹ̀",
  no_pairs_on_the_board: "Kò sí ẹrù méjì tí wọ́n bá ara wọn mu lórí pátákó",
  nothing_fits_together: "Kò sí ohun tí ó bá ara rẹ̀ mu lórí ọkọ̀ kan lónìí.",
  pairs_note: "O ń gba owó ju ọ̀kan lọ fún ìrìn kan. Kò sí ẹni tí ń ṣe oore fún ẹnikẹ́ni, ìdí nìyẹn tí ó fi ń ṣiṣẹ́.",
  you_collect: "Ìwọ á gbà",
  wont_fit_together: "Wọn kò ní bá ara wọn mu",
  what_is_it: "Kín ni",
  how_heavy_in_tonnes: "Ìwúwo rẹ̀, ní tọ́ọ̀nù",
  what_it_should_cost: "Iye tí ó yẹ kí ó ná",
  indicative_only: "Ìdíwọ̀n nìkan ni. Owó ń yí padà pẹ̀lú epo dísẹ́ẹ̀lì, pẹ̀lú àkókò ọdún, àti pẹ̀lú ọ̀nà tí ọkọ̀ ti ń lọ.",
  two_photos_note: "Ẹrù náà, àti ibi tí o wà. Méjì ni ó kéré jù tí ó lè jẹ́ kí ìfiránṣẹ́ jẹ́ ẹ̀rí — àwòrán kan ṣoṣo ti ẹrù lè jẹ́ èyí tí a yà níbikíbi.",
  where_it_was_captured: "Ibi tí a ti kó o",
  one_version_note: "Àwọn ìlà kan náà ni ó wọ inú PDF àti inú ìdìpọ̀ ẹ̀rí. Ẹ̀dà kan ṣoṣo ni ìwé yìí ní, kì í ṣe mẹ́ta.",
  say_how_the_carrier_did: "Sọ bí ẹni tí ń gbé ẹrù ṣe ṣe é",
  how_did_they_do: "Báwo ni wọ́n ṣe ṣe é?",
  alerts_lede: "Ẹ̀rọ mẹ́fà lè mú ohun tí ó tọ́ láti mọ̀ jáde. Kò sí ọ̀kan nínú wọn tí ó pinnu bóyá kí a dá ọ dúró — èyí ni ó ń ṣe é, ní ibi kan.",
  at_what_time: "Ní àkókò wo?",
  in_the_morning: "Ní òwúrọ̀",
  one_line_not_four_buzzes: "Ìlà kan dípò ìdún mẹ́rin nínú ìṣẹ́jú kan, èyí tí ó dà bí àbùkù dípò àkótán.",
  top_of_the_ladder: "Orí àkàbà",
  nothing_left_to_prove: "Kò sí ohun mìíràn láti fi hàn. Ìṣẹ̀lẹ̀ tí a fọwọ́sí á dín ipò kan kù — kì í ṣe gbogbo àkọsílẹ̀.",
  tier_note: "Ipò kì í ṣe ohun tí ẹni tí ń gbé ẹrù ń tẹ̀ wọlé. Ó ń jáde láti inú àwọn ìwé wọ̀nyí àti àkọsílẹ̀ ìfiránṣẹ́ tí ẹgbẹ́ kankan kò lè yí padà.",
  if_you_take_all_three: "Bí o bá gba gbogbo mẹ́tẹ̀ẹ̀ta",
  the_chain: "Ìsopọ̀ ìrìn náà",
  passed_over: "A kọjá wọn",
  four_questions_note: "Ìbéèrè mẹ́rin, o sì lè fo èyíkéyìí nínú wọn. Kò sí àmì-ẹ̀yẹ níbí — ohun tí àwọn onílẹ̀rù mìíràn rí ni iye ìgbà tí ọ̀kọ̀ọ̀kan jẹ́ òtítọ́.",
  what_other_shippers_see: "Ohun tí àwọn onílẹ̀rù mìíràn yóò rí",
  send_the_review: "Fi àyẹ̀wò náà ránṣẹ́",
  bids_note: "A tò wọ́n lórí owó ní ìfiwéra pẹ̀lú èyí tí ó tọ́ jù, àkọsílẹ̀ ẹni tí ń gbé ẹrù, àti ìjìnnà wọn sí ibi ìkó ẹrù. Ẹni tí kò ní àkọsílẹ̀ wà ní ipò aláìmọ̀, kì í ṣe ipò búburú.",
  assigns_the_load: "Ó fi ẹrù náà lé ẹni tí ń gbé ẹrù yìí lọ́wọ́",
  spent_more_note: "O ti ná ju ohun tí a fún ọ lọ. Ìyẹn ni nọ́mbà tí ojú ìwé yìí wà fún.",
  lane_middle_note: "Nígbà tí ìrìn tó bá ti kọjá ọ̀nà yìí, àárín àwọn àpapọ̀ wọ̀nyí ni iye tí ọ̀nà náà ń ná ní ti gidi — nọ́mbà tí ẹni tí ń gbé ẹrù nílò láti dá owó rẹ̀ tí kò sì tíì ní rí.",
  lapsed_paper_note: "Ìwé tí ó bá parí nígbà tí ọkọ̀ wà lójú ọ̀nà kì í dá a dúró. Ó ń dí ìrìn tó tẹ̀lé lọ́wọ́ dípò — ọ́fíìsì ni ẹrù náà wà lórí, kì í ṣe awakọ̀ tí ó jìnnà sí ilé ní kílómítà ẹgbẹ̀rin.",
  every_paper_in_date: "Gbogbo ìwé wà ní àkókò",
  the_pack: "Ìdìpọ̀ ẹ̀rí",
  measured_word: "A wọ̀n ọ́n",
  reported_word: "A ròyìn rẹ̀",
  reported_late_word: "A ròyìn rẹ̀ pẹ́",
  by_the_tracker: "láti ọwọ́ ẹ̀rọ ìtọ́pinpin",
  hours_after_the_fact: "wákàtí lẹ́yìn tí ó ṣẹlẹ̀",
  not_much_here: "Kò sí nǹkan púpọ̀ níbí. Òdodo ni ìyẹn nípa ìrìn náà, kì í ṣe nípa ẹ̀sùn ẹnikẹ́ni.",
  nothing_recorded: "A kò kọ nǹkan sílẹ̀",
  hole_note: "Ihò nínú àkọsílẹ̀ ni ohun tí ẹgbẹ́ méjèèjì yóò tọ́ka sí, nítorí náà a dárúkọ rẹ̀ dípò kí a fi sílẹ̀ kí ẹnìkan rí i.",
  in_the_order_it_happened: "Ní ọ̀nà tí ó ṣẹlẹ̀",
  one_more_return_leg: "Ìrìn ìpadàbọ̀ kan sí i",
  return_leg_note: "Ohun tí kíkún ọ̀kan nínú àwọn ìrìn òfìfo wọ̀nyẹn ìbá ti rí, ní iye tí ìwọ fúnra rẹ ti rí.",
  see_bids: "Wo owó tí wọ́n gbé kalẹ̀ lórí ẹrù tí a fi sílẹ̀",
  see_who_is_bidding: "Wo ẹni tí ń gbé owó kalẹ̀",
  verification_hint: "Ohun tí ẹni tí ń gbé ẹrù ti fi hàn, àti ohun tí ó kù",
  vehicles_hint: "Ìwé àṣẹ, ìwé ojú ọ̀nà, ìdánilójú àti ìgbàláàyè, fún ọkọ̀ kọ̀ọ̀kan",
  alerts_hint: "Ta ni a ń sọ fún kí ni, àti ohun tí a gbà láàyè láti jí ọ",
  one_thing_wakes_you: "Ohun kan ṣoṣo ló máa jí ọ ní aago mẹ́ta òru. Gbogbo ìyókù á dúró títí di aago mẹ́fà.",
  needs_a_look_head: "Ó nílò àyẹ̀wò",
  nothing_needs_you: "Kò sí ohun tí ó nílò rẹ",
  good_morning_note: "Gbogbo ọkọ̀ ń lọ, wọ́n sì ń fi ìròyìn ránṣẹ́. Bẹ́ẹ̀ ni òwúrọ̀ tó dára ń rí.",
  the_trip_is_cancelled: "A ti fagilé ìrìn náà",
  what_it_costs: "Iye tí ó máa ná",
  left_of_the_fare: "Ohun tí ó kù nínú owó náà",
  counts_against_record: "A ó kà á sí ìṣẹ̀lẹ̀ lórí àkọsílẹ̀ ẹni tí ń gbé ẹrù",
  incident_costs_one_tier: "Ìṣẹ̀lẹ̀ kan a máa dín ipò kan kù, kì í ṣe gbogbo àkọsílẹ̀. Ẹni tí ó tan onílẹ̀rù jẹ́ gbọ́dọ̀ ṣòro láti gbà síṣẹ́, kì í ṣe pé kò ṣeé gbà rárá.",
  finished: "Ó ti parí",
  this_trip_is_done: "Ìrìn yìí ti parí.",
  im_on_the_road: "Mo wà lójú ọ̀nà",
  none_on_the_road_now: "kò sí ọ̀kan lójú ọ̀nà báyìí.",
  trips_word: "ìrìn",
  on_time_word: "ní àkókò",
  oldest_unpaid_waiting: "ìrìn tí ó ti pẹ́ jù láìsan ti ń dúró.",
  delivered_lower: "a fi ránṣẹ́",
  this_month: "Oṣù yìí",
  what_you_are_owed: "Ohun tí wọ́n jẹ ọ",
  oldest_unpaid_note: "Ó wà lókè àkọsílẹ̀ tí ó wà nísàlẹ̀, nítorí ìyẹn ni èyí tí o gbọ́dọ̀ bèèrè nípa rẹ̀.",
  every_trip_settled: "A ti san gbogbo ìrìn.",
  not_paid_yet: "A kò tíì san án",
  no_trips_yet_history: "Kò sí ìrìn kankan síbẹ̀",
  history_empty_detail: "Àwọn ìrìn tí o ti parí àti ohun tí wọ́n san yóò hàn níbí.",
  on_time_note: "A ń wọn ìdé lákòókò láti inú ìdé tí a tọ́pinpin, kì í ṣe láti inú ìròyìn ẹnikẹ́ni — títí kan tìrẹ.",
  battery_low_note: "Bátìrì rẹ ti dínkù, nítorí náà Backhaul ń dín ìgbà tí ó ń yẹ̀wò kù kí fóònù lè pé ìrìn náà.",
  hand_over_and_sign: "Fi ẹrù lé wọn lọ́wọ́ kí wọ́n sì fọwọ́sí",
  past_trips_and_earnings: "Àwọn ìrìn rẹ àtijọ́ àti owó tí o rí",
  nothing_more_to_do: "Kò sí ohun mìíràn láti ṣe, a kò sì ń pín ohunkóhun mọ́.",
  delivered_word: "A ti fi ránṣẹ́",
  accept_this_trip: "Gba ìrìn yìí",
  record_detail: "Gbogbo ohun tí ìrìn yìí kọ sílẹ̀, ní ọ̀nà tí ó ṣẹlẹ̀",
  cancel_detail: "Ó fi owó ìfagilé hàn kí ohunkóhun tó ṣẹlẹ̀",
  open_delivery_document: "Ṣí ìwé ìfiránṣẹ́",
  delivery_document_detail: "Àwòrán, ìfọwọ́sí àti ibi tí a ti kó wọn",
  search_trips_label: "Wá àwọn ìrìn",
  nothing_matches_that: "Kò sí ohun tí ó bá ìyẹn mu",
  already_got_a_truck: "Ṣé o ti ní ọkọ̀ lójú ọ̀nà? Bẹ̀rẹ̀ sí í tọ́ ọ ní ìṣẹ́jú kan, kódà bí o bá ṣètò rẹ̀ níbòmíràn.",
  opens_the_trip: "Ó ṣí ìrìn náà",
  show_next_link: "Fi ipò ọ̀nà ìtọ́pinpin tó tẹ̀lé hàn",
  what_this_link_shows: "Ohun tí ọ̀nà ìtọ́pinpin yìí ń fihàn",
  where_it_is_and_arrival: "Ibi tí ọkọ̀ wà, àti àkókò tí ó yẹ kí ó dé",
  link_does_not_expire: "Ọ̀nà ìtọ́pinpin yìí kì í parí.",
  link_stops_today: "Ọ̀nà ìtọ́pinpin yìí máa dáwọ́ dúró lónìí.",
  link_stops_in_days: "ọjọ́ kí ọ̀nà ìtọ́pinpin yìí tó dáwọ́ dúró.",
  sending_something_yourself: "Ṣé ìwọ náà ní ohun tí o fẹ́ fi ránṣẹ́?",
  track_any_truck: "O lè tọ́ ọkọ̀ èyíkéyìí bẹ́ẹ̀, kódà èyí tí o ṣètò níbòmíràn. Ẹni tí ń wò kò ní láti fi ohunkóhun sórí fóònù.",
  position_and_arrival_only: "Ibi tí ó wà àti àkókò ìdé nìkan.",
  adds_the_full_track: "Ó fi gbogbo ọ̀nà náà kún un àti ohun tí ẹ̀rọ ìtọ́pinpin sọ nù nínú rẹ̀.",
  where_the_truck_is_now: "Ibi tí ọkọ̀ wà báyìí",
  when_it_should_arrive: "Àkókò tí ó yẹ kí ó dé",
  everywhere_it_has_been: "Gbogbo ibi tí ó ti kọjá",
  what_the_track_dropped: "Ohun tí a sọ nù nínú ọ̀nà náà, àti ìdí rẹ̀",
  anybodys_phone_number: "Nọ́mbà fóònù ẹnikẹ́ni",
  what_the_load_is_worth: "Iye tí ẹrù náà tọ́",
  links_on_this_trip: "Àwọn ọ̀nà ìtọ́pinpin ìrìn yìí",
  they_stop_seeing_it: "Wọn kò ní lè rí ìrìn yìí mọ́",
  post: "Gbé kalẹ̀",
  clear_the_filter: "Pa àyẹ̀wò rẹ́",
  loaded_the_whole_way: "Pẹ̀lú ẹrù ní gbogbo ọ̀nà",
  clear_the_search: "Pa ìwáàrí rẹ́",
  opens_to_bids: "Ó ṣí i sílẹ̀ fún owó tí àwọn awakọ̀ tí a ti fọwọ́sí bá gbé kalẹ̀",
  search_the_board: "Wá lórí pátákó ẹrù",
  a_million_and_up: "₦1m sókè",
  trailer_only: "Ọkọ̀ ńlá nìkan",
  ready_today: "Ó ṣetán lónìí",
  chain_note: "Ó so àwọn ẹrù ìpadàbọ̀ pọ̀ kí ọkọ̀ má bàa rìn ní òfìfo",
  two_part_loads_one_run: "Ẹrù méjì tí kò kún, ìrìn kan",
  runs_you_make_again: "Àwọn ìrìn tí o máa ń tún ṣe",
  nothing_on_the_board_for_that: "Kò sí nǹkan lórí pátákó fún ìyẹn",
  ranking_note: "A tò wọ́n lórí ohun tí ìrìn náà ń san, ìjìnnà tí o máa rìn ní òfìfo kí o tó dé ibẹ̀, àti iye ọ̀nà ìpadàbọ̀ tí ó bò.",
  your_trailer_is_free: "Ìrìn tí o bá rìn ní òfìfo jẹ́ epo, táyà àti ọjọ́ iṣẹ́ tí kò sí ẹni tí ó san.",
  stayed: 'ó lo àkókò',
  appearance_light: 'Ìmọ́lẹ̀',
  appearance_dark: 'Òkùnkùn',
  appearance_auto: 'Fúnra rẹ̀',
  arrival: 'Ìdé',
  not_enough_to_say_yet: 'Kò tíì tó láti sọ',
  estimated: 'Ìdíwọ̀n',
  to_go: 'ló kù',
  no_signal_stretches: 'láìsí sìgínàlì, a fi àwọ̀ eérú sàmì sí wọn',
  day_sunday: 'Àìkú',
  day_monday: 'Ajé',
  day_tuesday: 'Ìsẹ́gun',
  day_wednesday: 'Ọjọ́rú',
  day_thursday: 'Ọjọ́bọ̀',
  day_friday: 'Ẹtì',
  day_saturday: 'Àbámẹ́ta',
  next: "Ìtẹ̀lé",
  everything_released: "A ti tú gbogbo owó náà sílẹ̀.",
  condition_advance: "Ọkọ̀ náà dé ilé ìtọ́jú ẹrù, ìkó ẹrù sì bẹ̀rẹ̀.",
  condition_in_transit: "Ìrìn náà ń lọ, àwọn ibi tí a kọ sílẹ̀ sì ń dé fún wákàtí mẹ́fà.",
  condition_delivered: "A ti kó ẹ̀rí ìfiránṣẹ́: àwòrán, ìfọwọ́sí àti orúkọ.",
  condition_retention: "Ọjọ́ méje lẹ́yìn ìfiránṣẹ́ láìsí ẹ̀sùn kankan.",
  on_loading: "Nígbà ìkó ẹrù",
  on_delivery: "Nígbà ìfiránṣẹ́",
  held_back: "A dá dúró",
  agreed_fare: "Owó tí a fọwọ́sí",
  demurrage: "Owó ìdúró",
  commission: "Owó iṣẹ́ Backhaul",
  advance_paid: "Owó ìtẹ̀síwájú tí a ti san",
  due_to_carrier: "Ohun tí ó tọ́ sí ẹni tí ń gbé ẹrù",
  now: "báyìí",
  no_usable_positions_yet: "Kò tíì sí ibi tí a lè lò.",
  usable: "ṣeé lò.",
  dropped_imprecise: "fóònù kò lè sọ ibi tí ó wà",
  dropped_out_of_order: "ọjọ́ rẹ̀ ṣáájú ibi tó wà ṣáájú rẹ̀",
  dropped_jump: "ìfòfò tí kò sí ọkọ̀ tó lè ṣe",
  deviation_note: "Àyèwò rẹ̀ ni ìjìnnà tí ó kù sí ibi tí ó ń lọ, kì í ṣe ìjìnnà rẹ̀ sí ìlà tó tọ́. Ọ̀nà Léégọ̀s sí Kànò lè jìnnà kílómítà 90 sí ìlà yìí fún àwọn wákàtí, àti pé ìkìlọ̀ tó ń dún ní gbogbo ìrìn tó tọ́ jẹ́ ìkìlọ̀ tí kò sí ẹni tó ń kà.",
  waiting_note: "ìyẹn ni ohun tí a fi ń bèèrè owó ìdúró. A kò ka àkókò tí a lò ní ibi ìwọ̀n.",
  still_ahead_note: "ló kù sí iwájú. A ń wọn ìdé pẹ̀lú ìwọ̀n ilẹ̀ tí ibi kọ̀ọ̀kan ní, kì í ṣe ìjìnnà kan fún gbogbo ìrìn náà.",
  every_point_reached: "A dé gbogbo ibi tí ó wà lórí ọ̀nà náà.",
  pace_note: "Láti ọ̀nà dé ọ̀nà, pẹ̀lú gbogbo ìdúró. Kì í ṣe ìwọ̀n eré ọkọ̀ — ọkọ̀ tó ń sáré 80 tó sì ń lo wákàtí mẹ́sàn-án ní ibi àyẹ̀wò á ṣe nǹkan bí 35 ní ọjọ́ náà, òun ni nọ́mbà kejì tí a fi ń kọ ìdé.",
  stops_note: "ni gbogbo ìdúró papọ̀. Ìyẹn ni ohun tí a fi ń bèèrè owó ìdúró.",
  stops_overline: "Ìdúró",
  pace_over_the_trip: "Eré ìrìn náà lápapọ̀",
  peak: "ó ga jùlọ",
  shaded_no_signal: "A fi àwọ̀ ṣàmì sí ibi tí kò ti sí sìgínàlì",
  positions_all_usable: "ibi tí a kọ sílẹ̀, gbogbo wọn ṣeé lò.",
  positions: "ibi tí a kọ sílẹ̀",
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
  who_is_it_for: "Ọ bụ maka onye?",
  make_a_link: "Mepụta njikọ",
  making_the_link: "Na-emepụta…",
  link_not_made: "Emepụtaghị njikọ ahụ. Nwaa ọzọ.",
  the_new_link: "Njikọ ọhụrụ",
  shown_once_send_it_now: "Nke a bụ naanị oge a ga-egosi njikọ a. Zipu ya ugbu a — agaghị egosi ya ọzọ.",
  send_the_link: "Zipu ya",
  could_not_send_the_link: "Ọ pụghị. Njikọ ahụ ka dị n'elu — nwaa ọzọ.",
  hide_the_link: "Zoo ya",
  walkthrough_makes_no_links: "Ihe ngosi apụghị imepụta ezigbo njikọ. Ndị dị n'okpuru bụ ihe atụ.",
  walkthrough_signs_nothing_off: "Ihe ngosi apụghị ịbịanye aka na ihe ọ bụla, ya mere ọ dịghị ihe a ga-enyefe ebe a.",
  still_marked_unread: "Ọ ka na-egosi na a gụghị ya maka ndị ọzọ.",
  mark_it_cleared: "Gosi na edozila ya",
  clearing_it: "Na-edozi…",
  not_cleared: "Ọ ka mepere emepe. Nwaa ọzọ.",
  seal_the_proof: "Mechaa nke a",
  not_notifying: "Anaghị akọ",
  at_most_once_every: "naanị otu ugboro kwa",
  role_shipper: "onye nwe ngwaahịa",
  role_carrier: "onye na-ebu ibu",
  role_driver: "ọkwọ ụgbọ",
  push_not_configured: "Nsụgharị a enweghị ike ịnata ọkwa. Ọkwa ndị dị n’okpuru bụ ihe ọ ga-eziga.",
  push_refused: "Agbanyụọla ọkwa maka Backhaul, ya mere ọ dịghị ihe ga-eru ekwentị a.",
  no_position_to_rank_from: "Ọ dịghị ụgbọ akọọla ka ugbu a, ya mere edoghị nke a n’usoro dịka anya.",
  location_blocked: "Agbanyụọla ebe maka Backhaul. Anaghị edekọ njem gị — gbanye ya na Ntọala.",
  location_denied: "Backhaul chọrọ ebe ị nọ iji dekọọ njem a. Anaghị edekọ ihe ọ bụla ruo mgbe ị kwere.",
  notifications_missing: "Ma ọ bụrụ na enweghị ọkwa, ekwentị gị nwere ike ịkwụsị ndekọ n’azụ. Njem gị nwere ike inwe oghere.",
  tracking_not_available: "Ekwentị a enweghị ike idekọ njem. Jụọ ọfịs maka ekwentị nwere ike ime ya.",
  phone_is_holding_back: "Ekwentị gị na-egbochi Backhaul idekọ nke ọma. Lelee ntọala ebe na batrị.",
  open_settings: "Mepee Ntọala",
  allow_location: "Kwe ka e jiri ebe ị nọ",
  waiting_to_send: "na-echere iziga",
  walkthrough_unreached: "Nke a bụ ihe ngosi. Anyị enweghị ike iru sava ka anyị chọọ nke gị.",
  and_word: "na",
  needs_a_note: "ọ chọrọ ihe odide",
  it_is_still_there: "Ọ ka dị. Ekwentị a enweghị ike ịhụ ya ugbu a.",
  the_server_said_no: "Sava ekwenyeghị ịza",
  reading: "Na-agụ ya",
  told_and_under_dispute: "A gwara onye nwe ngwaahịa na onye na-ebu ibu, esemokwu adịkwala na njem ahụ.",
  told_keep_driving: "A gwara onye nwe ngwaahịa na onye na-ebu ibu. Nọgide na-anya ụgbọ mgbe ị nwere ike.",
  eta_stops_showing: "Agaghị egosi oge nrute a tụrụ anya ya ruo mgbe nke a gafere — atụmatụ n’akụkụ ụgbọ kwụsịrị bụ nkwenye na-emegiderịta onwe ya.",
  eta_stays_delay_visible: "Oge nrute a tụrụ anya ya ka dị, igbu oge ahụ dịkwa na njem ka onye ọ bụla hụ.",
  recorded_against_the_trip: "E dekọrọ ya na njem ahụ, ebe onye ọ bụla nọ na ya nwere ike ịhụ ya.",
  late: "Ọ bịara n’oge ọjọọ",
  alert_held: "E jidere ya",
  alert_not_sent: "Ezigaghị ya",
  alert_wakes_you: "Ọ na-akpọte gị",
  alert_notifies: "Ọ na-akọ gị",
  alert_in_the_app: "N’ime ngwa ahụ",
  simulate_losing_signal: "Mee ka a ga-asị na mgbama efuola",
  simulate_regaining_signal: "Mee ka a ga-asị na mgbama alọghachila",
  link_turned_off: "Agbanyụọla njikọ a",
  link_expired: "Njikọ a agwụla",
  ask_for_a_new_one: "Jụọ onye zitere ya maka nke ọhụrụ.",
  links_stop_working: "Njikọ na-akwụsị ịrụ ọrụ mgbe izu ole na ole gasịrị, ka ebe ụgbọ nọ ghara ịdị n’ihu ọha ruo mgbe ebighị ebi. Jụọ onye zitere ya maka nke ọhụrụ.",
  signature: "Mbinye aka",
  still_settles_note: "A ga-akwụ ụgwọ njem a. A ga-arụrịta ụka banyere ụkọ iche — ijide ụgwọ ahụ dum na-ata onye na-ebu ibu ahụhụ maka ọdịiche nke na-abụkarị nke ebe a na-ebu ibu.",
  nothing_owed_for_handover: "E nyefeghị ihe ọ bụla, ya mere ọ dịghị ụgwọ a ji maka nnyefe ahụ.",
  selected_tap_to_remove: "A họrọla ya. Pịa iji wepụ ya",
  tap_to_filter_by_this: "Pịa iji nyochaa site na nke a",
  on_file: 'Ọ dị na faịlụ',
  not_uploaded: 'Ebugoghị ya',
  document_identity: 'Njirimara gọọmentị',
  document_licence: 'Ikike ọkwọ ụgbọala',
  document_registration: 'Ndebanye aha ụlọ ọrụ',
  document_insurance: 'Mkpuchi ngwongwo n’ụzọ',
  more_completed_trips: 'njem emechara ọzọ',
  on_time_delivery: 'nnyefe n’oge',
  still_aboard: 'ka nọ n’ime ụgbọ',
  added_for_extra_stops: 'agbakwunyere maka nkwụsị ndị ọzọ',
  first_drop_is_delivery: 'Nkwụsị mbụ bụ nnyefe ngwaahịa; nke ọ bụla na-esote ya bụ mgbagharị ụzọ, nchere na akwụkwọ ọzọ.',
  delivered_out_of_order: 'e nyefere ya mgbe nkwụsị mbụ ka nọ n’ime ụgbọ.',
  hand_over_at: 'Nyefee na',
  km_by_road: 'kilomita n’okporo ụzọ',
  too_heavy_for_any_truck: 'tọn bụ ihe kachasị nke ụgbọ ọ bụla ebe a na-ebu n’otu ibu. Kewaa ya, ma ọ bụ bipụta ya dịka abụọ.',
  smallest_truck_that_carries_it: 'bụ ụgbọ kachasị nta nke na-ebu ya.',
  trips_completed: 'njem emechara',
  too_few_for_on_time: 'ha dị ole na ole maka ọnụọgụ oge',
  on_time: 'n’oge',
  days_ago_expired: 'ụbọchị kemgbe ọ gwụrụ',
  expires_in_days: 'ụbọchị tupu ọ gwụ',
  warned_days_ahead: 'ụbọchị ịdọ ndụ na ntị kama ozi n’ụtụtụ ụbọchị ọ gwụrụ — ịtụfu ọkwa n’etiti njem na-atụfu ọrụ e kwerelarị.',
  nothing_is_owed: 'Ọ dịghị onye ji ibe ya ụgwọ.',
  is_owed_and_both_can_see: 'ka ji ụgwọ, akụkụ abụọ ahụ nwekwara ike ịhụ ihe kpatara ya.',
  as_the_shipper: 'Dịka onye nwe ngwaahịa',
  as_the_carrier: 'Dịka onye na-ebu ibu',
  hours_of_the_bid_being_accepted: 'awa nke a nabatara ọnụahịa',
  one_sms_and_it_says_who: 'mkpụrụedemede — otu SMS, ọ na-ekwukwa onye o si n’aka ya. Njikọ na-enweghị nkọwa sitere na nọmba a na-amaghị ka a na-ehichapụ.',
  days_unless_you_turn_it_off: 'ụbọchị, ma ọ bụrụ na ị gbanyụọ ya n’oge.',
  under_a_day_left: 'Erughị otu ụbọchị',
  one_day_left: 'Otu ụbọchị fọdụrụ',
  does_not_expire: 'Ọ naghị agwụ',
  turned_off: 'Agbanyụọla ya',
  expired: 'Ọ gwụla',
  position_and_full_track: 'Ebe ọ nọ na ụzọ ahụ dum',
  position_only: 'Naanị ebe ọ nọ',
  turn_off_the_link_for: 'Gbanyụọ njikọ maka',
  km_of_empty_repositioning: 'kilomita nke njem tọgbọrọ chakoo bụ ihe kachasị a na-atụ aro. Karịa nke ahụ, mmanụ na ụbọchị e mefuru anaghị adịkarị ka ụgwọ njem ahụ.',
  of_the_trip_is_covered: 'nke njem ahụ ka nsochi kpuchiri.',
  between: 'n’etiti',
  and: 'na',
  asks_what_it_was_for: 'ka a na-ajụ ihe ọ bụ maka ya — ọ bụghị iji nyoo ya anya, kama n’ihi na nke ahụ bụ ihe ndekọ ọfịs na-ajụ mgbe otu izu gasịrị.',
  over_keep_it_short: 'karịrị — mee ya mkpirikpi, ma ọ bụ kpọọ.',
  written_in_a_dead_zone: 'E dere ya ebe enweghị mgbama · o rutere',
  of_the_truck_is_refused: 'nke ụgbọ ka a na-ajụ ọbụna mgbe ọ ga-abanye: ndị nwe ngwaahịa abụọ, akwụkwọ ụzọ abụọ na ohere igbu oge abụọ, maka trela nke ka bụ ikuku.',
  km_from_the_destination: 'kilomita site n’ebe ọ na-aga. E dekọrọ ya n’akwụkwọ ahụ.',
  metres_out: 'm pụọ',
  at_the_destination: 'Na',
  the_destination: 'ebe ọ na-aga',
  all_trucks_can_take_work: 'ụgbọ, nke ọ bụla nwekwara ike ịnara ọrụ',
  cannot_be_given_a_new_trip: 'enweghị ike inye njem ọhụrụ',
  no_signal_still_recording: 'Enweghị mgbama. Ka na-edekọ ebe ị nọ.',
  positions_saved_waiting: 'ebe e chekwara, na-echere iziga.',
  quiet_between: 'Ịdị jụụ n’etiti',
  held_is_not_dropped: 'Ihe ọ bụla e jidere adịghị efu — ọ na-abịa n’ụtụtụ dịka otu ahịrị.',
  still_to_come: 'ka na-abịa',
  demo_showing_link: 'Ihe ngosi · na-egosi njikọ',
  of_count: 'n’ime',
  add_a_photo_this_one_needs_it: 'Tinye foto — nke a chọrọ ya',
  photos_added: 'agbakwunyere',
  under_answers: 'N’okpuru',
  answers: 'azịza',
  optional: 'Ọ dịghị mkpa',
  track_a_trip: "Soro njem",
  arranged_anywhere: "Maka ibu i kwekọrịtara n'ebe ọzọ. Enweghị bọọdụ, enweghị ọnụahịa — naanị ụgbọala, a na-eso ya site ebe a.",
  where_it_loads: "Ebe a na-ebu ya",
  where_it_unloads: "Ebe a ga-ebudata ya",
  the_drivers_number: "Nọmba onye ọkwọ ụgbọala",
  the_carriers_number: "Nọmba onye nwe ụgbọala",
  the_shippers_number: "Nọmba onye nwe ngwongwo",
  who_is_on_it: "Onye nọ na ya",
  what_it_is_carrying: "Ihe ọ na-ebu",
  start_tracking_it: "Malite iso ya",
  starting_to_track: "Na-amalite…",
  could_not_start_tracking: "Emepeghị njem ahụ. E zigaghị onye ọ bụla ihe. Nwaa ọzọ.",
  not_a_number_this_can_reach: "Nke ahụ abụghị nọmba nke a nwere ike iru.",
  it_is_on_your_list_now: "Ọ dị na ndepụta njem gị ugbu a.",
  walkthrough_opens_no_trips: "Ihe ngosi apụghị imepe ezigbo njem. Banye iji mepe otu.",
  add_a_note: 'Tinye ihe odide',
  the_route: 'Ụzọ',
  the_cargo: 'Ngwaahịa',
  handover: 'Nnyefe ngwaahịa',
  what_went_wrong: 'Ihe na-agaghị nke ọma',
  and_also: 'Ọzọkwa',
  expiring: 'Na-agwụ',
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

  hand_over_the_note: 'Nyefee akwụkwọ ahụ',
  hand_over_once_signed_off: 'Ị nwere ike inyefe nke a mgbe e mechara ya.',
  could_not_hand_it_over: 'Ọ pụghị. Nwaa ọzọ.',

  utilisation: 'Otú e si eji ụgbọ ndị ahụ',
  your_fleet: 'Ụgbọ gị',
  walkthrough_figures: 'Ọnụọgụ ihe ngosi. A gbakọbeghị nke gị.',
  km_loaded: 'Nwere ibu',
  km_empty: 'Ọ tọgbọrọ chakoo',
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
  no_name_yet: "Enweghị aha ugbu a",
  answer_one_to_send: "Zaa otu tupu ị zipụ ya",
  answers_word: "azịza",
  how_did_they_do_title: "Kedu ka ha si mee ya?",
  review_sent: "E zipụla ya",
  posting: "Na-ebipụta…",
  posted: "E bipụtala ya",
  not_posted: "E bipụtaghị ya. Nwaa ọzọ.",
  of_the_trailer_used: "nke ụgbọ e ji mee ihe",
  was_word: "ọ bụ",
  of_the_km_paid_for: "nke kilomita e kwụrụ ụgwọ ya",
  more_than_running_home_empty: "karịa ịlaghachi n’ụlọ n’efu",
  km_empty_across_the_chain: "kilomita n’efu na njikọ ahụ dum.",
  loads_where_last_dropped: "Ọ na-ebu ebe e nyefere nke gara aga",
  km_empty_to_get_there: "kilomita n’efu iji rute ebe ahụ",
  already_carrying_this: "ọ na-ebubu nke a",
  nothing_to_chain: "Ọ dịbeghị ihe a ga-eji malite njikọ",
  recommended: "A tụrụ aro ya",
  cheapest: "Kacha ọnụ ala",
  completed_trips: "njem emechara",
  carriers_have_bid: "ndị na-ebu ibu enyela ọnụahịa",
  at_the_pickup_now: "Ọ nọ n’ebe a ga-ebuli ibu ugbu a",
  km_from_the_pickup: "kilomita site n’ebe a ga-ebuli ibu",
  award: "Nye ya ọrụ ahụ",
  no_bids_yet: "Enyebeghị ọnụahịa ọ bụla",
  no_loads_posted: "Ibipụtabeghị ibu ọ bụla.",
  of_that_is_your_own_money: "n’ime nke ahụ bụ ego gị, nke i mefuru n’ụzọ.",
  usually: "Mgbe niile",
  after_three_runs: "mgbe njem atọ gasịrị",
  runs_word: "njem",
  post_lane: "Bipụta ụzọ a",
  trucks_can_take_work: "ụgbọ nwere ike ịnara ọrụ",
  cannot_be_given_a_trip: "a pụghị inye ha njem ọhụrụ",
  on_file_tap_to_remove: "Ọ dị na faịlụ. Pịa iji wepụ ya",
  tap_to_upload: "Pịa iji bugoo ya",
  by_a_person: "site n’aka mmadụ",
  sending_the_report: "Na-eziga…",
  report_not_sent: "E zipụghị ya. E chekwara ya ebe a — nwaa ọzọ.",
  could_not_load: "Enweghị ike ibubata nke a",
  not_sent_yet: "E zipụghị ya. Nwaa ọzọ.",
  cannot_reach_the_server: "Enweghị ike iru Backhaul",
  your_trips_are_still_there: "Njem gị ka dị. Ekwentị a apụghị ịhụ ha ugbu a.",
  loading_your_trips: "A na-ebubata njem gị…",
  showing_the_walkthrough: "Nke a bụ ihe ngosi, ọ bụghị njem gị. Sava enweghị nke gị.",
  refusal_not_a_number: "Nke a adịghị ka nọmba ekwentị Naịjirịa.",
  refusal_too_many: "A rịọrọ ọtụtụ koodu. Nwaa ọzọ ma emesịa.",
  refusal_too_soon: "E zitere koodu ugbu a. Chere tupu ị rịọ nke ọzọ.",
  refusal_unknown: "A rịọghị koodu na nọmba a.",
  refusal_expired: "Koodu ahụ agwụla. Rịọ nke ọzọ.",
  refusal_exhausted: "A mehiere ọtụtụ ugboro. Rịọ koodu ọhụrụ.",
  refusal_used: "E jirila koodu ahụ mee ihe.",
  refusal_wrong: "Koodu ahụ ezighị ezi.",
  refusal_no_photos: "A chọrọ otu foto ọzọ.",
  refusal_no_signature: "A chọrọ mbinye aka.",
  refusal_no_name: "A chọrọ aha onye bịanyere aka.",
  refusal_needs_photo: "Ụdị akụkọ a chọrọ foto.",
  refusal_not_allowed: "Njem enweghị ike ịga otú ahụ site ebe ọ nọ.",
  refusal_terminal: "Njem a agwụla, ọ pụghịkwa ịgbanwe.",
  refusal_out_of_order: "Ụbọchị ya buru ihe e dekọrọ na mbụ ụzọ.",
  refusal_revoked: "A gbanyụọla njikọ a.",
  refusal_link_expired: "Njikọ a agwụla.",
  refusal_unknown_link: "Nke a abụghị njikọ anyị nyere.",
  refusal_unhandled: "Sava ahụ jụrụ, ngwa a enwebeghịkwa okwu maka ihe kpatara ya.",
  blocker_too_heavy: "Ọ dị arọ karịa ihe ụgbọ gị na-ebu.",
  blocker_wrong_class: "Onye nwe ngwaahịa rịọrọ ụdị ụgbọ dị iche.",
  blocker_expired: "Ibu a agafeela oge.",
  blocker_cannot_reach: "Ọ dị anya karịa ka a gaa n’efu ruo ebe ahụ.",
  km_empty_to_pickup: "kilomita n’efu ruo ebe a ga-ebuli ya",
  of_the_run_home: "kilomita nke ụzọ nlọghachi ọ na-ekpuchi",
  further_from_base: "kilomita site n’ebe obibi",
  neither_toward_nor_away: "ọ bụghị n’ebe obibi, ọ bụghịkwa site na ya",
  going_rate: "Ọnụahịa a na-akwụ",
  indicative: "atụmatụ",
  over_what_the_run_costs: "karịrị ihe njem ahụ na-efu.",
  loses_money: "Nke a na-efunahụ ego: dizel na ụgwọ nrụzi karịrị ụgwọ ahụ.",
  covers_the_trip_only: "Ọ na-ekpuchi njem ahụ, mana ọ zughị iji tinyeghachi ihe ọ bụla n’ụgbọ.",
  no_drops_on_this_trip: "Ọ dịghị ebe nnyefe na njem a.",
  all_drops_signed_for: "ebe nnyefe, e bịanyere aka na ha niile.",
  signed_for_next: "e bịanyere aka · nke ọzọ",
  loaded_pct: "nwere ibu",
  a_kilometre_driven: "maka kilomita ọ bụla a gara",
  legs_this_month: "njem n’ọnwa a",
  of_data_so_far: "nke data ruo ugbu a",
  of_your_airtime: "nke kaadị gị.",
  under_one_naira: "erughị ₦1",
  about_a_month_at_this_rate: "n’ọnwa n’ọnụego a.",
  no_loads_at_that_price: "Ọ dịghị ibu n’ọnụahịa ahụ. Nwaa ọnụọgụ dị ala.",
  no_loads_for_that_truck: "Ọ dịghị ibu maka ụgbọ ahụ. Nwaa ụdị ọzọ.",
  no_loads_ready_by_then: "Ọ dịghị ibu ga-adị njikere ka ọ na-erule mgbe ahụ. Nwaa ụbọchị na-esote.",
  no_loads_from_that_level: "Enwebeghị ibu site n’aka ndị nwe ngwaahịa nọ n’ọkwa ahụ.",
  nothing_matching: "Ọ dịghị ihe dabara na",
  no_loads_right_now: "Ọ dịghị ibu na bọọdụ ugbu a.",
  days_overdue: "ụbọchị gafere oge",
  due_today: "Taa ka ọ bụ",
  due_tomorrow: "Echi ka ọ bụ",
  due_in_days: "ụbọchị fọdụrụ",
  items_measured_by_tracker: "ihe, n’ime ha ka ngwaọrụ nsochi tụrụ",
  reported_late_count: "a kọrọ ha n’oge gara aga",
  hours_with_nothing: "awa nke e dekọghị ihe ọ bụla",
  nothing_recorded_on_trip: "E dekọghị ihe ọ bụla na njem a.",
  days_out_of_date: "ụbọchị gafere",
  never_uploaded: "ebugobeghị ya",
  days_left: "ụbọchị fọdụrụ",
  to_reach: "Iji rute",
  levy_police: "Ebe nlele ndị uwe ojii",
  levy_state_revenue: "Ụtụ isi steeti",
  levy_union: "Otu ndị ọkwọ ụgbọ",
  levy_weighbridge: "Ebe a na-atụ arọ",
  levy_park: "Ụtụ ebe ndọba ụgbọ",
  levy_ferry: "Ụgbọ mmiri",
  levy_other: "Nke ọzọ",
  paper_licence: "Ikike ụgbọ",
  paper_roadworthiness: "Akwụkwọ ike okporo ụzọ",
  paper_insurance: "Mkpuchi",
  paper_permit: "Ikike ibu ibu",
  tier_unverified: "A kwadobeghị ya",
  tier_verified: "A kwadoro ya",
  tier_business: "Azụmahịa",
  tier_trusted: "A tụkwasịrị ya obi",
  truck_pickup: "Obere ụgbọ",
  truck_canter: "Kanta",
  truck_15t: "Ụgbọ tọn 15",
  truck_30t: "Ụgbọ ukwu tọn 30",
  truck_lowbed: "Lowbed",
  standing_retired: "E wepụrụ ya",
  exception_short: "Ngwaahịa ezughị",
  exception_damaged: "Ngwaahịa mebiri",
  exception_refused: "Ha jụrụ ịnara ya",
  alert_signal_lost: "signal adịghị",
  alert_stalled: "ụgbọ na-adịghị aga",
  alert_deviating: "ụgbọ hapụrụ ụzọ",
  alert_late: "nnyefe na-egbu oge",
  alert_incident: "nsogbu a kọrọ",
  alert_duress: "onye ọkwọ ụgbọ nọ na nsogbu",
  alert_delivered: "nnyefe e bịanyere aka",
  alert_bid_received: "ọnụahịa ọhụrụ",
  alert_link_expiring: "njikọ nsochi na-achọ ịkwụsị",
  cadence_weekly: "Kwa izu",
  cadence_fortnightly: "Kwa izu abụọ",
  cadence_monthly: "Kwa ọnwa",
  cadence_ad_hoc: "Mgbe achọrọ ya",
  ask_arrived_to_load: "Ụgbọ ahụ ọ bịara mgbe o kwuru na ọ ga-abịa?",
  ask_reachable: "Ị nwere ike ịkpọtụrụ onye ọkwọ ụgbọ n’oge njem ahụ?",
  ask_cargo_intact: "Ngwaahịa ahụ ọ rutere otú ọ hapụrụ?",
  ask_no_extras: "Ọnụahịa e kwetara ka ị kwụrụ?",
  claim_arrived_to_load: "Ọ bịara ibu ibu n’oge",
  claim_reachable: "A pụrụ ịkpọtụrụ ya n’ụzọ",
  claim_cargo_intact: "Ngwaahịa rutere n’enweghị mmebi",
  claim_no_extras: "Ọ dịghị ụgwọ ọzọ karịrị nke e kwuru",
  where_the_truck_is_up_to: "Ebe ụgbọ ahụ ruru",
  every_drop_signed_note: "A bịanyere aka na nnyefe ọ bụla, ya mere njem ahụ nwere ike imechi. Iru adreesị ikpeazụ naanị ezughị.",
  out_of_order_card: "Ọ nọghị n’usoro",
  out_of_order_note: "E dekọrọ ya, a jụghị ya. Onye nnata mechiri ụlọ ahịa ya bụ ihe eziokwu — mana onye ọ bụla ga-agụ nke a ma emesịa na-eche na ọ bụ usoro e bulitere ha.",
  hand_over_here_button: "Nyefee ya ebe a",
  back_to_the_trip: "Laghachi na njem ahụ",
  what_this_does: "Ihe nke a na-eme",
  puts_under_dispute: "Nke a na-etinyekwa njem ahụ n’esemokwu, ka mmadụ lee ya anya kama ka mkpu banye na ndepụta.",
  no_need_to_type_where: "Ọ dịghị mkpa ka i pịnye ebe ị nọ.",
  anything_to_add: "Ihe ọ bụla ị ga-agbakwụnye",
  coming_round_again: "Ọ na-abịaghachi ọzọ",
  two_days_warning_note: "Ịdọ aka ná ntị ụbọchị abụọ, ka e bipụta ibu tupu ụbọchị ahụ kama n’ụbọchị ahụ — ibu e bipụtara n’ụtụtụ ụbọchị ọ ga-apụ na-agakwuru onye kacha nso, ọ bụghị onye kacha mma.",
  how_often: "Ugboro ole",
  lane_post_hint: "Ọ na-emeghe ya maka ọnụahịa ebe e dejuru nkọwa ụzọ a",
  post_this_run: "Bipụta njem a",
  no_pairs_on_the_board: "Ọ dịghị ibu abụọ dabara na bọọdụ",
  nothing_fits_together: "Ọ dịghị ihe dabara ọnụ n’otu ụgbọ taa.",
  pairs_note: "Ị na-anata ihe karịrị otu ụgwọ maka otu njem. Ọ dịghị onye na-emere onye ọzọ amara, ọ bụ ya mere ọ ji arụ ọrụ.",
  you_collect: "Ị ga-anata",
  wont_fit_together: "Ha agaghị adabakọ",
  what_is_it: "Gịnị ka ọ bụ",
  how_heavy_in_tonnes: "Ịdị arọ ya, na tọn",
  what_it_should_cost: "Ihe o kwesịrị ịdị",
  indicative_only: "Naanị atụmatụ. Ọnụahịa na-agbanwe na dizel, na oge afọ, na ụzọ ụgbọ ahụ na-agabu.",
  two_photos_note: "Ngwaahịa ahụ, na ebe ị nọ. Abụọ bụ nke kacha nta nke ga-eme ka nnyefe bụrụ ihe àmà — otu foto nke ngwaahịa nwere ike ịbụ nke e sere ebe ọ bụla.",
  where_it_was_captured: "Ebe e jidere ya",
  one_version_note: "Otu ahịrị ndị ahụ ka a na-etinye na PDF na ngwugwu ihe àmà. Otu ụdị akwụkwọ a dị, ọ bụghị atọ.",
  say_how_the_carrier_did: "Kwuo otu onye na-ebu ibu si mee",
  how_did_they_do: "Kedu ka ha si mee ya?",
  alerts_lede: "Injin isii nwere ike ịmepụta ihe kwesịrị ịma. Ọ dịghị nke ọ bụla n’ime ha na-ekpebi ma a ga-akwụsị gị — nke a na-eme ya, n’otu ebe.",
  at_what_time: "N’oge ole?",
  in_the_morning: "N’ụtụtụ",
  one_line_not_four_buzzes: "Otu ahịrị kama ụda anọ n’otu nkeji, nke na-adị ka mmebi kama nchịkọta.",
  top_of_the_ladder: "Elu ubube",
  nothing_left_to_prove: "Ọ dịghị ihe ọzọ ị ga-egosi. Nsogbu a kwadoro ga-ewedata otu ọkwa — ọ bụghị ndekọ dum.",
  tier_note: "Ọkwa abụghị ihe onye na-ebu ibu na-etinye. Ọ na-esi n’akwụkwọ ndị a na ndekọ nnyefe nke akụkụ ọ bụla na-apụghị idezi.",
  if_you_take_all_three: "Ọ bụrụ na ị were ha atọ niile",
  the_chain: "Njikọ njem ahụ",
  passed_over: "A gafere ha",
  four_questions_note: "Ajụjụ anọ, ị nwekwara ike ịmafe nke ọ bụla n’ime ha. Ọ dịghị akara ebe a — ihe ndị ọzọ nwe ngwaahịa na-ahụ bụ ugboro ole nke ọ bụla bụ eziokwu.",
  what_other_shippers_see: "Ihe ndị ọzọ nwe ngwaahịa ga-ahụ",
  send_the_review: "Zipu nyocha ahụ",
  bids_note: "E dobere ha n’ọnụahịa ma e jiri ya tụnyere nke kacha ọnụ ala, ndekọ onye na-ebu ibu, na ebe ha si n’ebe a ga-ebuli ibu dị anya. Onye na-enweghị ndekọ nọ n’ọkwa amaghị ama, ọ bụghị n’ọkwa ọjọọ.",
  assigns_the_load: "Ọ na-enye onye na-ebu ibu a ibu ahụ",
  spent_more_note: "I mefuola karịa ihe e nyere gị. Nke ahụ bụ nọmba ihuenyo a dịrị.",
  lane_middle_note: "Ozugbo njem zuru ezu gafere ụzọ a, etiti ọnụọgụgụ ndị a bụ ihe ụzọ ahụ na-efu n’ezie — nọmba onye na-ebu ibu chọrọ iji tụọ ọnụahịa nke ọ na-enwetụbeghị.",
  lapsed_paper_note: "Akwụkwọ nke gwụrụ mgbe ụgbọ nọ n’ụzọ anaghị ahapụ ya n’ụzọ. Ọ na-egbochi njem na-esote kama — nrụgide ahụ dịrị ụlọ ọrụ, ọ bụghị onye ọkwọ ụgbọ dị narị kilomita asatọ site n’ụlọ.",
  every_paper_in_date: "Akwụkwọ niile dị n’oge",
  the_pack: "Ngwugwu ihe àmà",
  measured_word: "A tụrụ ya",
  reported_word: "A kọrọ ya",
  reported_late_word: "A kọrọ ya n’oge gara aga",
  by_the_tracker: "site na ngwaọrụ nsochi",
  hours_after_the_fact: "awa mgbe ihe ahụ mesịrị",
  not_much_here: "Ọ dịghị ọtụtụ ihe ebe a. Nke ahụ bụ eziokwu banyere njem ahụ, ọ bụghị banyere okwu onye ọ bụla.",
  nothing_recorded: "E dekọghị ihe ọ bụla",
  hole_note: "Oghere dị na ndekọ bụ ihe akụkụ abụọ ga-atụ aka na ya, ya mere a kpọrọ ya aha kama ịhapụ ka a chọpụta ya.",
  in_the_order_it_happened: "N’usoro o si mee",
  one_more_return_leg: "Otu njem nlọghachi ọzọ",
  return_leg_note: "Ihe iju otu n’ime njem efu ndị ahụ gaara enweta, n’ọnụahịa gị onwe gị enwetagoro.",
  see_bids: "Lee ọnụahịa e nyere na ibu e bipụtara",
  see_who_is_bidding: "Lee onye na-enye ọnụahịa",
  verification_hint: "Ihe onye na-ebu ibu gosipụtara, na ihe fọdụrụ",
  vehicles_hint: "Ikike, akwụkwọ okporo ụzọ, mkpuchi na ikike, maka ụgbọ ọ bụla",
  alerts_hint: "Onye ka a na-agwa gịnị, na ihe e kwere ka ọ kpọtee gị",
  one_thing_wakes_you: "Naanị otu ihe ga-akpọte gị n’elekere atọ nke abalị. Ihe ndị ọzọ niile na-eche ruo elekere isii.",
  needs_a_look_head: "Ọ chọrọ nlele",
  nothing_needs_you: "Ọ dịghị ihe chọrọ gị",
  good_morning_note: "Ụgbọ niile na-aga ma na-ezite ozi. Otu a ka ụtụtụ ọma dị.",
  the_trip_is_cancelled: "Akagbuola njem ahụ",
  what_it_costs: "Ihe ọ ga-efu",
  left_of_the_fare: "Ihe fọdụrụ n’ụgwọ ahụ",
  counts_against_record: "A ga-agụ ya dị ka nsogbu na ndekọ onye na-ebu ibu",
  incident_costs_one_tier: "Nsogbu na-ewedata otu ọkwa, ọ bụghị ndekọ dum. Onye kwụsịrị onye nwe ngwaahịa n’ụzọ kwesịrị isiri ike ịkpọ, ọ bụghị ka a ghara ịkpọ ya ma ọlị.",
  finished: "Ọ gwụla",
  this_trip_is_done: "Njem a agwụla.",
  im_on_the_road: "Anọ m n’ụzọ",
  none_on_the_road_now: "ọ dịghị nke nọ n’ụzọ ugbu a.",
  trips_word: "njem",
  on_time_word: "n’oge",
  oldest_unpaid_waiting: "njem kacha ochie a na-akwụghị ụgwọ ya na-eche.",
  delivered_lower: "e nyefere ya",
  this_month: "Ọnwa a",
  what_you_are_owed: "Ihe ha ji gị",
  oldest_unpaid_note: "Ọ dị n’elu ndepụta dị n’okpuru, n’ihi na ọ bụ ya ka ị ga-ajụ maka ya.",
  every_trip_settled: "A kwụọla ụgwọ njem niile.",
  not_paid_yet: "A kwụbeghị ya",
  no_trips_yet_history: "Enwebeghị njem ọ bụla",
  history_empty_detail: "Njem ndị i mechara na ihe ha kwụrụ ga-egosi ebe a.",
  on_time_note: "A na-atụ nrute n’oge site na nrute e sochiri, ọ bụghị site n’akụkọ onye ọ bụla — gụnyere nke gị.",
  battery_low_note: "Batrị gị adịla ala, ya mere Backhaul na-elele obere ugboro ka ekwentị wee ruo njem ahụ.",
  hand_over_and_sign: "Nyefee ya ma bịanye aka",
  past_trips_and_earnings: "Njem gara aga gị na ego ị nwetara",
  nothing_more_to_do: "Ọ dịghịkwa ihe ọzọ ị ga-eme, a naghịkwa ekekọrịta ihe ọ bụla ọzọ.",
  delivered_word: "E nyefeela ya",
  accept_this_trip: "Nabata njem a",
  record_detail: "Ihe niile njem a dekọrọ, n’usoro o si mee",
  cancel_detail: "Ọ na-egosi ụgwọ nkagbu tupu ihe ọ bụla emee",
  open_delivery_document: "Mepee akwụkwọ nnyefe",
  delivery_document_detail: "Foto, mbinye aka na ebe e jidere ha",
  search_trips_label: "Chọọ njem",
  nothing_matches_that: "Ọ dịghị ihe dabara na nke ahụ",
  already_got_a_truck: "Ị nweelarị ụgbọ n’ụzọ? Malite ịsochi ya n’otu nkeji, ọbụna ma ị haziri ya ebe ọzọ.",
  opens_the_trip: "Ọ na-emeghe njem ahụ",
  show_next_link: "Gosi ọnọdụ njikọ nsochi na-esote",
  what_this_link_shows: "Ihe njikọ a na-egosi",
  where_it_is_and_arrival: "Ebe ụgbọ ahụ nọ, na mgbe o kwesịrị iru",
  link_does_not_expire: "Njikọ a anaghị akwụsị.",
  link_stops_today: "Njikọ a ga-akwụsị ọrụ taa.",
  link_stops_in_days: "ụbọchị tupu njikọ a akwụsị ọrụ.",
  sending_something_yourself: "Ị nwekwara ihe ị chọrọ izipu?",
  track_any_truck: "Ị nwere ike ịsochi ụgbọ ọ bụla otu a, ọbụna nke ị haziri ebe ọzọ. Onye na-ele anya adịghị mkpa ka ọ wụnye ihe ọ bụla.",
  position_and_arrival_only: "Naanị ebe ọ nọ na mgbe ọ ga-erute.",
  adds_the_full_track: "Ọ na-agbakwụnye ụzọ ahụ dum na ihe ngwaọrụ nsochi tụfuru na ya.",
  where_the_truck_is_now: "Ebe ụgbọ ahụ nọ ugbu a",
  when_it_should_arrive: "Mgbe o kwesịrị iru",
  everywhere_it_has_been: "Ebe niile ọ gafeworo",
  what_the_track_dropped: "Ihe a tụfuru n’ụzọ ahụ, na ihe kpatara ya",
  anybodys_phone_number: "Nọmba ekwentị onye ọ bụla",
  what_the_load_is_worth: "Uru ibu ahụ bara",
  links_on_this_trip: "Njikọ nsochi nke njem a",
  they_stop_seeing_it: "Ha agaghịkwa ahụ njem a",
  post: "Bipụta",
  clear_the_filter: "Hichapụ nzacha",
  loaded_the_whole_way: "Nwere ibu n’ụzọ dum",
  clear_the_search: "Hichapụ ọchụchọ",
  opens_to_bids: "Ọ na-emeghe ya maka ọnụahịa ndị na-ebu ibu a kwadoro",
  search_the_board: "Chọọ na bọọdụ ibu",
  a_million_and_up: "₦1m gbagoo",
  trailer_only: "Naanị ụgbọ ukwu",
  ready_today: "Ọ dị njikere taa",
  chain_note: "Ọ na-ejikọta ibu nlọghachi ka ụgbọ ghara ịga n’efu",
  two_part_loads_one_run: "Ibu abụọ na-ejubeghị, otu njem",
  runs_you_make_again: "Njem ị na-emeghachi",
  nothing_on_the_board_for_that: "Ọ dịghị ihe dị na bọọdụ maka nke ahụ",
  ranking_note: "E dobere ha n’ihi ihe njem ahụ na-akwụ, ebe ị ga-aga n’efu iji rute ya, na ole n’ime ụzọ nlọghachi ọ na-ekpuchi.",
  your_trailer_is_free: "Njem ị na-aga na-enweghị ibu bụ mmanụ, taya na ụbọchị ọrụ nke onye ọ bụla na-akwụghị ụgwọ ya.",
  stayed: 'ọ nọrọ',
  appearance_light: 'Ìhè',
  appearance_dark: 'Ọchịchịrị',
  appearance_auto: 'Onwe ya',
  arrival: 'Nrute',
  not_enough_to_say_yet: 'Ozi ezughị ikwu ya ugbu a',
  estimated: 'Atụmatụ',
  to_go: 'fọdụrụ',
  no_signal_stretches: 'na-enweghị signal, e ji ntụ ntụ akara ha',
  day_sunday: 'Ụbọchị Ụka',
  day_monday: 'Mọnde',
  day_tuesday: 'Tiuzdee',
  day_wednesday: 'Wenezdee',
  day_thursday: 'Tọọzdee',
  day_friday: 'Fraịdee',
  day_saturday: 'Satọdee',
  next: "Nke ọzọ",
  everything_released: "A hapụla ego ahụ dum.",
  condition_advance: "Ụgbọ ahụ rutere n’ụlọ nchekwa, ibubata ibu amalitekwala.",
  condition_in_transit: "Njem ahụ na-aga, ebe ndị e dekọrọ na-abịakwa ruo awa isii.",
  condition_delivered: "E jidere ihe àmà nnyefe: foto, mbinye aka na aha.",
  condition_retention: "Ụbọchị asaa mgbe e nyefechara ya na-enweghị mkpesa ọ bụla.",
  on_loading: "Mgbe a na-ebu ibu",
  on_delivery: "Mgbe e nyefere ya",
  held_back: "E jidere ya",
  agreed_fare: "Ụgwọ e kwetara",
  demurrage: "Ụgwọ oge nchere",
  commission: "Ọrụ Backhaul",
  advance_paid: "Ego e buru ụzọ kwụọ",
  due_to_carrier: "Ihe ruru onye na-ebu ibu",
  now: "ugbu a",
  no_usable_positions_yet: "Enwebeghị ebe e nwere ike iji ya mee ihe.",
  usable: "e nwere ike iji ha mee ihe.",
  dropped_imprecise: "ekwentị enweghị ike ịkọ ebe ọ nọ",
  dropped_out_of_order: "ụbọchị ya buru ebe bu ya ụzọ",
  dropped_jump: "ịwụli nke ọ dịghị ụgbọ nwere ike ime",
  deviation_note: "A na-atụ ya dịka ebe fọdụrụ ruo ebe ọ na-aga, ọ bụghị ka ọ dị anya site n’ahịrị kwụ ọtọ. Ụzọ Legos ruo Kano nwere ike ịdị kilomita 90 site n’ahịrị ahụ ruo ọtụtụ awa, mkpu a na-akụ na njem ọ bụla ziri ezi bụ mkpu ọ dịghị onye na-anụ.",
  waiting_note: "nke ahụ bụ ihe e ji arịọ ụgwọ oge nchere. A naghị agụta oge nọ n’ebe a na-atụ arọ.",
  still_ahead_note: "ka fọdụrụ n’ihu. A na-atụ nrute site n’obosara nke ebe ọ bụla, ọ bụghị otu ebe dị anya maka njem dum.",
  every_point_reached: "E rutere ebe niile dị n’ụzọ ahụ.",
  pace_note: "Site n’ọnụ ụzọ ruo ọnụ ụzọ, tinyere nkwụsị ọ bụla. Ọ bụghị ihe nlele ọsọ — ụgbọ na-aga 80 nke na-anọ awa itoolu n’ebe nlele na-eme ihe dịka 35 n’ụbọchị ahụ, ọ bụ nọmba nke abụọ ka e ji ewu nrute.",
  stops_note: "ka a kwụsịrị n’ọnụ ọgụgụ. Nke a bụ ihe e ji arịọ ụgwọ oge nchere.",
  stops_overline: "Nkwụsị",
  pace_over_the_trip: "Ọsọ njem ahụ n’ozuzu",
  peak: "kacha elu",
  shaded_no_signal: "E ji ntụ ntụ akara ebe signal na-adịghị",
  positions_all_usable: "ebe e dekọrọ, e nwere ike iji ha niile.",
  positions: "ebe e dekọrọ",
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
