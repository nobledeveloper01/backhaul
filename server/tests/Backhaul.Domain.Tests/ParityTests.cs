using Backhaul.Domain.Access;
using Backhaul.Domain.Market;
using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Backhaul.Domain.Tracking;
using Backhaul.Domain.Trips;

namespace Backhaul.Domain.Tests;

/// <summary>
/// Holds the C# domain to the answers TypeScript gives.
/// </summary>
/// <remarks>
/// <para>
/// This suite is the whole mitigation for ADR-0005. Choosing .NET for the
/// server means every shared rule exists twice, in two languages, maintained
/// by two sets of edits — and two implementations of a demurrage rule is two
/// answers to give a shipper, with the second one surfacing only when somebody
/// disputes an invoice.
/// </para>
/// <para>
/// `packages/domain` is the source of truth. If a case here fails, the C# side
/// is wrong until proven otherwise.
/// </para>
/// </remarks>
public sealed class ParityTests
{
    private static readonly ParityFixtures F = Fixtures.Parity;

    private static TruckClass Truck(string wire) =>
        Trucks.FromWire(wire) ?? throw new InvalidOperationException($"unknown truck '{wire}'");

    private static TripState State(string wire) =>
        TripMachine.FromWire(wire) ?? throw new InvalidOperationException($"unknown state '{wire}'");

    private static Position ToPosition(FixRow row) =>
        new(row.Lat, row.Lon, row.Accuracy, row.At);

    // --- constants ---------------------------------------------------------

    // xUnit2000 wants the compile-time constant passed as `expected`. In this
    // suite it is the other way round on purpose: the fixture is the expected
    // value — TypeScript is the source of truth — and the C# constant is what
    // is being checked. Swapping them to satisfy the analyzer would make every
    // failure message here read backwards.
#pragma warning disable xUnit2000
    [Fact]
    public void Constants_match()
    {
        Assert.Equal(F.Constants.CommissionPct, Rates.CommissionPct);
        Assert.Equal(F.Constants.FreeWaitingMs, (long)Rates.FreeWaiting.TotalMilliseconds);
        Assert.Equal(F.Constants.MaxUsefulAccuracyM, Geo.MaxUsefulAccuracyM);
        Assert.Equal(F.Constants.MaxPlausibleSpeedMs, Geo.MaxPlausibleSpeedMs);
        Assert.Equal(F.Constants.SignalLostAfterMs, (long)Tracker.SignalLostAfter.TotalMilliseconds);
        Assert.Equal(F.Constants.StalledAfterMs, (long)Tracker.StalledAfter.TotalMilliseconds);
        Assert.Equal(F.Constants.StallRadiusM, Tracker.StallRadiusM);
    }
#pragma warning restore xUnit2000

    [Fact]
    public void Rate_tables_match()
    {
        foreach (var (wire, kobo) in F.Constants.RatePerKm)
        {
            Assert.Equal(kobo, Rates.PerKm[Truck(wire)].Value);
        }

        foreach (var (wire, kobo) in F.Constants.MinimumFare)
        {
            Assert.Equal(kobo, Rates.MinimumFare[Truck(wire)].Value);
        }

        // Not just that the listed ones agree — that neither side has a class
        // the other does not.
        Assert.Equal(Rates.PerKm.Count, F.Constants.RatePerKm.Count);
        Assert.Equal(Rates.MinimumFare.Count, F.Constants.MinimumFare.Count);
    }

    // --- the trip machine --------------------------------------------------

    [Fact]
    public void The_edge_set_is_identical()
    {
        var expected = F.Trip.Transitions
            .Select(row => $"{row.From} -> {row.To}")
            .OrderBy(s => s, StringComparer.Ordinal)
            .ToList();

        var actual = TripMachine.All
            .SelectMany(
                from => TripMachine.AllowedFrom(from),
                (from, to) => $"{TripMachine.ToWire(from)} -> {TripMachine.ToWire(to)}")
            .OrderBy(s => s, StringComparer.Ordinal)
            .ToList();

        // Adding a transition on one side and not the other fails here, which
        // is the point: a new way for cargo to change hands should not be
        // possible to introduce by accident.
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Terminal_and_tracking_flags_are_identical()
    {
        Assert.Equal(F.Trip.States.Count, TripMachine.All.Count);

        foreach (var row in F.Trip.States)
        {
            var state = State(row.State);
            Assert.Equal(row.Terminal, TripMachine.IsTerminal(state));
            Assert.Equal(row.Tracks, TripMachine.ShouldTrack(state));
            Assert.Equal(row.SystemRaised, TripMachine.IsSystemRaised(state));
        }
    }

    [Fact]
    public void Refusals_agree_down_to_the_sentence()
    {
        foreach (var row in F.Trip.Refusals)
        {
            var history = row.History
                .Select(step => new TripEvent(State(step.State), step.At, TripActor.Driver))
                .ToList();

            var result = TripHistory.Apply(history, State(row.To), row.At, TripActor.Driver);

            if (row.Ok)
            {
                Assert.IsType<TransitionResult.Accepted>(result);
                continue;
            }

            var refused = Assert.IsType<TransitionResult.Refused>(result);
            Assert.Equal(row.Reason, Wire(refused.Reason));

            // The wording is fixture material, not an implementation detail:
            // these sentences are rendered to a driver at a loading bay, and
            // two servers refusing in different words is the sort of
            // difference nobody notices until a support call.
            Assert.Equal(row.Detail, refused.Detail);
        }
    }

    [Fact]
    public void Time_in_a_state_sums_the_same_way()
    {
        var history = BuildTimeInHistory();

        foreach (var row in F.Trip.TimeInCases)
        {
            var now = history[0].At.AddMinutes(row.NowMinutes);
            var actual = TripHistory.TimeIn(history, State(row.State), now);
            Assert.Equal(row.Ms, (long)actual.TotalMilliseconds);
        }
    }

    // --- pricing -----------------------------------------------------------

    [Theory]
    [MemberData(nameof(QuoteRows))]
    public void Quotes_match(QuoteRow row)
    {
        var quote = Quote.For(Truck(row.Truck), row.Metres);

        Assert.Equal(row.Mid, quote.Mid.Value);
        Assert.Equal(row.Low, quote.Low.Value);
        Assert.Equal(row.High, quote.High.Value);
        Assert.Equal(row.AtMinimum, quote.AtMinimum);
    }

    [Theory]
    [MemberData(nameof(DemurrageRows))]
    public void Demurrage_matches(DemurrageRow row)
    {
        var actual = Demurrage.For(Truck(row.Truck), TimeSpan.FromMilliseconds(row.WaitedMs));

        Assert.Equal(row.ChargeableHours, actual.ChargeableHours);
        Assert.Equal(row.Amount, actual.Amount.Value);
    }

    [Theory]
    [MemberData(nameof(SettlementRows))]
    public void Settlements_match(SettlementRow row)
    {
        var actual = Settlement.Of(
            Kobo.FromNaira(row.AgreedNaira),
            Kobo.FromNaira(row.DemurrageNaira),
            Kobo.FromNaira(row.AdvanceNaira));

        Assert.Equal(row.Agreed, actual.Agreed.Value);
        Assert.Equal(row.Demurrage, actual.Demurrage.Value);
        Assert.Equal(row.Gross, actual.Gross.Value);
        Assert.Equal(row.Commission, actual.Commission.Value);
        Assert.Equal(row.Advance, actual.Advance.Value);
        Assert.Equal(row.ToCarrier, actual.ToCarrier.Value);
    }

    [Theory]
    [MemberData(nameof(RoundingRows))]
    public void Percentages_round_the_same_way(RoundingRow row)
    {
        // The single most likely place these two implementations diverge:
        // .NET rounds midpoints to even unless told otherwise, JavaScript
        // rounds half up, and the correct answer is half away from zero. The
        // difference is one kobo, always in the same party's favour.
        Assert.Equal(row.Result, new Kobo(row.Amount).Percent(row.Pct).Value);
    }

    [Theory]
    [MemberData(nameof(ClassingRows))]
    public void Smallest_truck_for_a_load_matches(ClassingRow row)
    {
        var actual = Trucks.SmallestFor(row.Weight);
        Assert.Equal(row.Truck, actual is null ? null : Trucks.ToWire(actual.Value));
    }

    // --- geography and tracking -------------------------------------------

    [Theory]
    [MemberData(nameof(DistanceRows))]
    public void Distances_match_to_the_metre(DistanceRow row)
    {
        var from = Place(row.From);
        var to = Place(row.To);
        Assert.Equal(row.Metres, Geo.Distance(from, to));
    }

    [Theory]
    [MemberData(nameof(TrackRows))]
    public void Cleaning_a_track_matches(TrackRow row)
    {
        var cleaned = Geo.Clean(row.Fixes.Select(ToPosition).ToList());

        Assert.Equal(row.Kept, cleaned.Kept.Count);
        Assert.Equal(
            row.Dropped,
            cleaned.Dropped.Select(d => Wire(d.Problem)).ToList());
        Assert.Equal(row.Quality, Geo.FixQuality(cleaned), 10);
        Assert.Equal(row.DistanceMetres, Geo.DistanceTravelled(cleaned));
    }

    [Theory]
    [MemberData(nameof(ObservationRows))]
    public void Observations_match(ObservationRow row)
    {
        var fixes = row.Fixes.Select(ToPosition).ToList();

        var observation = Tracker.Observe(fixes, row.Now, row.AtWaypoint);
        Assert.Equal(row.Observation, Wire(observation));

        var silent = Tracker.SilentFor(fixes, row.Now);
        Assert.Equal(row.SilentForMs, silent is null ? null : (long)silent.Value.TotalMilliseconds);
    }

    // --- data --------------------------------------------------------------

    public static TheoryData<QuoteRow> QuoteRows() => Spread(F.Pricing.Quotes);

    public static TheoryData<DemurrageRow> DemurrageRows() => Spread(F.Pricing.Demurrages);

    public static TheoryData<SettlementRow> SettlementRows() => Spread(F.Pricing.Settlements);

    public static TheoryData<RoundingRow> RoundingRows() => Spread(F.Pricing.Roundings);

    public static TheoryData<ClassingRow> ClassingRows() => Spread(F.Pricing.Classing);

    public static TheoryData<DistanceRow> DistanceRows() => Spread(F.Tracking.Distances);

    public static TheoryData<TrackRow> TrackRows() => Spread(F.Tracking.Tracks);

    public static TheoryData<ObservationRow> ObservationRows() => Spread(F.Tracking.Observations);

    private static TheoryData<T> Spread<T>(IReadOnlyList<T> rows)
    {
        var data = new TheoryData<T>();
        foreach (var row in rows)
        {
            data.Add(row);
        }

        return data;
    }

    private static Position Place(string name)
    {
        // The same coordinates the generator used, keyed the same way. Kept
        // here rather than in the fixture because a fixture that carries both
        // the inputs and the expected outputs for a pure function is only
        // testing that JSON round-trips.
        var at = new DateTimeOffset(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);
        return name switch
        {
            "lagos" => new Position(6.455, 3.3841, 10, at),
            "ibadan" => new Position(7.3775, 3.947, 10, at),
            "abuja" => new Position(9.0765, 7.3986, 10, at),
            "kano" => new Position(12.0022, 8.592, 10, at),
            "maiduguri" => new Position(11.8311, 13.151, 10, at),
            _ => throw new InvalidOperationException($"unknown place '{name}'"),
        };
    }

    private static IReadOnlyList<TripEvent> BuildTimeInHistory()
    {
        var t0 = new DateTimeOffset(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);
        (TripState State, int Minutes)[] steps =
        [
            (TripState.Open, 0), (TripState.Assigned, 10), (TripState.Loading, 20),
            (TripState.InTransit, 60), (TripState.SignalLost, 120),
            (TripState.InTransit, 160), (TripState.SignalLost, 300),
            (TripState.InTransit, 325),
        ];

        return steps
            .Select(step => new TripEvent(step.State, t0.AddMinutes(step.Minutes), TripActor.Driver))
            .ToList();
    }

    [Fact]
    public void Both_sides_normalise_a_phone_number_the_same_way()
    {
        // A driver who signs in one way and back another way is two accounts
        // if the two sides disagree about what their number is.
        foreach (var row in Fixtures.Parity.Auth.Phones)
        {
            Assert.Equal(row.Normalised, Otp.NormalisePhone(row.Written));

            if (row.Normalised is not null)
            {
                Assert.Equal(row.Formatted, Otp.FormatPhone(row.Normalised));
            }
        }
    }

    [Fact]
    public void Both_sides_judge_a_code_the_same_way_and_say_the_same_words()
    {
        // The wording is asserted character for character, not just the
        // outcome: somebody who reads one sentence in the app and a different
        // one from the API concludes there is something wrong with their
        // account rather than with their typing.
        foreach (var row in Fixtures.Parity.Auth.Codes)
        {
            var challenge = row.Present
                ? new Challenge(
                    "+2348031234567",
                    row.Now.AddMinutes(-1),
                    row.ExpiresAt!.Value,
                    row.Attempts,
                    row.Consumed ? row.Now.AddMinutes(-1) : null)
                : null;

            var result = Otp.Check(challenge, row.Matches, row.Now);

            if (row.Ok)
            {
                Assert.IsType<CodeCheck.Accepted>(result);
                continue;
            }

            var refused = Assert.IsType<CodeCheck.Refused>(result);
            Assert.Equal(row.Reason, Wire(refused.Reason));
            Assert.Equal(row.Detail, refused.Detail);
        }
    }

    [Fact]
    public void Both_sides_find_the_same_visits_and_charge_the_same_waiting()
    {
        // The most financially consequential arithmetic here after settlement.
        // A visit measured to the last fix inside rather than the first
        // outside loses a whole sampling interval of chargeable time, every
        // visit — and the two implementations must not differ by a
        // millisecond.
        var route = new List<Waypoint>
        {
            new(Guid.Empty, "apapa", 6.45, 3.36, WaypointKind.Origin, 300),
            new(Guid.Empty, "jebba", 9.13, 4.83, WaypointKind.Checkpoint, 500),
            new(Guid.Empty, "kano", 12.0, 8.52, WaypointKind.Destination, 300),
        };

        foreach (var testCase in Fixtures.Parity.Waypoints.Cases)
        {
            var track = testCase.Fixes
                .Select(f => new Position(f.Lat, f.Lon, f.Accuracy, f.At))
                .ToList();

            var visits = Waypoints.Visits(track, route);

            Assert.Equal(testCase.Visits.Count, visits.Count);

            foreach (var (expected, actual) in testCase.Visits.Zip(visits))
            {
                Assert.Equal(expected.Waypoint, actual.Waypoint.Name);
                Assert.Equal(expected.Arrived, actual.Arrived);
                Assert.Equal(expected.Left, actual.Left);
                Assert.Equal(expected.DurationMs, actual.DurationMs);
                Assert.Equal(expected.Fixes, actual.Fixes);
            }

            Assert.Equal(testCase.ChargeableWaitingMs, Waypoints.ChargeableWaitingMs(visits));
        }
    }

    [Fact]
    public void Both_sides_treat_an_incident_the_same_way()
    {
        // A driver at a roadside does not classify their own emergency, so the
        // default severity is the answer — and an app and a server that
        // disagree about it produce two different trips from one report.
        foreach (var row in Fixtures.Parity.Incidents)
        {
            var kind = Incidents.FromWire(row.Kind);
            Assert.NotNull(kind);

            Assert.Equal(row.Severity, Incidents.ToWire(Incidents.DefaultSeverity(kind!.Value)));
            Assert.Equal(row.RaisesDispute, Incidents.RaisesDispute(kind.Value));
            Assert.Equal(row.NeedsPhoto, Incidents.NeedsPhoto(kind.Value));
        }
    }

    [Fact]
    public void Both_sides_seal_a_delivery_on_the_same_evidence_and_say_the_same_words()
    {
        // A driver standing in a market with a queue behind them, told one
        // thing by the app and another by the server, will conclude the app is
        // broken — and they will be right.
        foreach (var row in Fixtures.Parity.Pod.Cases)
        {
            var delivery = new Delivery(
                DateTimeOffset.UnixEpoch,
                [.. Enumerable.Range(0, row.Photos).Select(i => $"p{i}")],
                row.HasSignature ? new Signature(row.SignatureName!, "storekeeper", "s1") : null,
                null,
                string.Empty,
                null);

            var result = Pod.Seal(delivery);

            if (row.Ok)
            {
                Assert.IsType<PodResult.Sealed>(result);
                continue;
            }

            var refused = Assert.IsType<PodResult.Refused>(result);
            Assert.Equal(row.Reason, Pod.ToWire(refused.Reason));
            Assert.Equal(row.Detail, refused.Detail);
        }
    }

    [Fact]
    public void Both_sides_agree_which_exceptions_still_settle()
    {
        // A short delivery is a delivery. Holding the whole payment until a
        // quantity dispute resolves punishes a carrier for a discrepancy that
        // is usually the loading end's.
        foreach (var row in Fixtures.Parity.Pod.Exceptions)
        {
            var kind = Pod.ExceptionFromWire(row.Kind);
            Assert.NotNull(kind);

            var settles = Pod.SettlesDespite(new DeliveryException(kind!.Value, null, string.Empty));
            Assert.Equal(row.Settles, settles);
        }
    }

    [Fact]
    public void Both_sides_charge_the_same_for_extra_stops()
    {
        // The first drop is the delivery; every one after it is a detour, a
        // wait and a second set of papers. A trip with one drop costs what a
        // trip has always cost.
        Assert.Equal(Fixtures.Parity.Drops.PerDropKobo, Drops.PerDrop.Value);

        foreach (var row in Fixtures.Parity.Drops.Fees)
        {
            Assert.Equal(row.FeeKobo, Drops.Fee(row.Drops).Value);
        }
    }

    [Fact]
    public void Both_sides_put_a_carrier_on_the_same_rung()
    {
        // A tier decides which loads a carrier may bid on, so two sides that
        // disagree hand somebody work they cannot take — or refuse work they
        // can.
        foreach (var row in Fixtures.Parity.Trust.Cases)
        {
            var papers = new Papers(
                row.Documents.Identity,
                row.Documents.Licence,
                row.Documents.Registration,
                row.Documents.Insurance);

            var record = new TrackRecord(
                row.Record.TripsCompleted,
                row.Record.TripsPromised,
                row.Record.TripsOnTime,
                row.Record.Incidents);

            Assert.Equal(row.Tier, Trust.ToWire(Trust.TierOf(papers, record)));
            Assert.Equal(row.OnTimeRate, Trust.OnTimeRate(record));
        }
    }

    [Fact]
    public void Both_sides_assess_a_truck_the_same_way()
    {
        foreach (var row in Fixtures.Parity.Vehicles)
        {
            var expiries = row.Days.ToDictionary(
                entry => Vehicles.PaperFromWire(entry.Key)!.Value,
                entry => row.Now.AddDays(entry.Value));

            var assessment = Vehicles.Assess(expiries, null, row.Now);

            Assert.Equal(row.Standing, Vehicles.ToWire(assessment.Standing));
            Assert.Equal(row.MayCarry, Vehicles.MayCarry(assessment));

            Assert.Equal(
                row.Lapsed.Select(l => (l.Paper, l.Days)),
                assessment.Lapsed.Select(l => (Vehicles.ToWire(l.Paper), l.Days)));

            Assert.Equal(
                row.Expiring.Select(e => (e.Paper, e.Days)),
                assessment.Expiring.Select(e => (Vehicles.ToWire(e.Paper), e.Days)));

            Assert.Equal(
                row.Missing,
                assessment.Missing.Select(Vehicles.ToWire).OrderBy(p => p, StringComparer.Ordinal));
        }
    }

    private static string Wire(CodeRefusal reason) => reason switch
    {
        CodeRefusal.Unknown => "unknown",
        CodeRefusal.Expired => "expired",
        CodeRefusal.Exhausted => "exhausted",
        CodeRefusal.Used => "used",
        CodeRefusal.Wrong => "wrong",
        _ => throw new InvalidOperationException($"unmapped code refusal {reason}"),
    };

    private static string Wire(TransitionRefusal reason) => reason switch
    {
        TransitionRefusal.NotAllowed => "not_allowed",
        TransitionRefusal.Terminal => "terminal",
        TransitionRefusal.OutOfOrder => "out_of_order",
        _ => throw new InvalidOperationException($"unmapped refusal {reason}"),
    };

    private static string Wire(FixProblem problem) => problem switch
    {
        FixProblem.TooImprecise => "too_imprecise",
        FixProblem.OutOfOrder => "out_of_order",
        FixProblem.ImplausibleJump => "implausible_jump",
        _ => throw new InvalidOperationException($"unmapped problem {problem}"),
    };

    private static string Wire(Observation observation) => observation switch
    {
        Observation.Moving => "moving",
        Observation.Stopped => "stopped",
        Observation.Stalled => "stalled",
        Observation.Silent => "silent",
        Observation.Unknown => "unknown",
        _ => throw new InvalidOperationException($"unmapped observation {observation}"),
    };

    // --- escrow ------------------------------------------------------------

    [Fact]
    public void Both_sides_release_the_money_at_the_same_moments()
    {
        // A milestone that releases on one server and not the other is a
        // carrier who has been paid according to one screen and not according
        // to the other, on the same trip, on the same evidence.
        Assert.Equal(F.Escrow.RetentionDays, Escrow.RetentionDays);
        Assert.Equal(F.Escrow.InTransitMs, Escrow.InTransitMs);
        Assert.True(F.Escrow.SumsTo100);
        Assert.True(Escrow.SumsTo100());

        Assert.Equal(
            F.Escrow.Schedule.Select(m => (m.Kind, m.Pct, m.Condition)),
            Escrow.Schedule.Select(m => (EscrowKindWire(m.Kind), m.Pct, m.Condition)));

        var agreed = new Kobo(F.Escrow.AgreedKobo);

        foreach (var row in F.Escrow.Cases)
        {
            var conditions = new EscrowConditions(
                TripMachine.FromWire(row.State)
                    ?? throw new InvalidOperationException($"unknown state '{row.State}'"),
                row.MovingForMs,
                row.PodSealed,
                row.DeliveredAt,
                row.ExceptionRaised);

            var releases = Escrow.For(agreed, conditions, F.Escrow.NowIso);

            Assert.Equal(
                row.Releases.Select(r => (r.Kind, r.Pct, r.AmountKobo, r.Met)),
                releases.Select(r => (EscrowKindWire(r.Milestone.Kind), r.Milestone.Pct, r.Amount.Value, r.Met)));

            Assert.Equal(row.ReleasedKobo, Escrow.Released(releases).Value);
            Assert.Equal(row.HeldBackKobo, Escrow.HeldBack(agreed, releases).Value);

            var next = Escrow.NextRelease(releases);
            Assert.Equal(row.NextKind, next is null ? null : EscrowKindWire(next.Milestone.Kind));
            Assert.Equal(row.NextCondition, next?.Milestone.Condition);
        }
    }

    // --- cancellation ------------------------------------------------------

    [Fact]
    public void Both_sides_charge_the_same_to_call_a_trip_off()
    {
        // The sentence is asserted as tightly as the number. A cancellation
        // fee that arrives without an explanation is a fee somebody disputes,
        // and the explanation has to be the same one on both sides of the
        // transaction.
        Assert.Equal(F.Cancellation.GraceMs, Cancellation.GraceMs);

        var agreed = new Kobo(F.Cancellation.AgreedKobo);

        foreach (var row in F.Cancellation.Cases)
        {
            var by = row.By == "shipper" ? CancelledBy.Shipper : CancelledBy.Carrier;
            var state = TripMachine.FromWire(row.State)
                        ?? throw new InvalidOperationException($"unknown state '{row.State}'");

            var outcome = Cancellation.Cancel(
                by,
                state,
                agreed,
                F.Cancellation.AcceptedAtIso,
                F.Cancellation.AcceptedAtIso.AddMinutes(row.MinutesAfterAccepted));

            switch (outcome)
            {
                case CancelOutcome.Refused refused:
                    Assert.False(row.Ok, row.Name);
                    Assert.Equal(row.Reason, refused.Reason);
                    Assert.Equal(row.Detail, refused.Detail);
                    break;

                case CancelOutcome.Allowed allowed:
                    Assert.True(row.Ok, row.Name);
                    Assert.Equal(row.FeePct, allowed.FeePct);
                    Assert.Equal(row.FeeKobo, allowed.Fee.Value);
                    Assert.Equal(row.WithinGrace, allowed.WithinGrace);
                    Assert.Equal(row.Detail, allowed.Detail);
                    break;
            }

            Assert.Equal(row.CountsAgainstRecord, Cancellation.CountsAgainstRecord(by, state));
        }
    }

    // --- what the road costs -----------------------------------------------

    [Fact]
    public void Both_sides_cost_a_run_the_same_way()
    {
        // Litres are the figure a carrier checks against the pump receipt in
        // their pocket. A disagreement here is not a rounding argument.
        Assert.Equal(F.Costs.EmptyFuelFraction, CostModel.EmptyFuelFraction);
        Assert.Equal(F.Costs.FloorMargin, CostModel.FloorMargin);

        foreach (var row in F.Costs.Cases)
        {
            var input = new CostInput(
                Truck(row.Truck),
                row.LadenM,
                row.EmptyM,
                new Kobo(row.DieselPerLitreKobo),
                new Kobo(row.LeviesKobo),
                new Kobo(row.OtherKobo));

            var costs = CostModel.RunningCost(input);

            Assert.Equal(row.Litres, costs.Litres);
            Assert.Equal(row.FuelKobo, costs.Fuel.Value);
            Assert.Equal(row.RunningKobo, costs.Running.Value);
            Assert.Equal(row.TotalKobo, costs.Total.Value);
            Assert.Equal(row.WalkAwayBelowKobo, CostModel.WalkAwayBelow(input).Value);

            foreach (var offer in row.Offers)
            {
                var offered = new Kobo(offer.OfferedKobo);
                var found = CostModel.MarginOn(offered, input);
                var advice = CostModel.Advise(offered, input);

                Assert.Equal(offer.ProfitKobo, found.Profit.Value);
                // `Math.Floor(x + 0.5)`, not `Math.Round`. A losing offer has
                // a negative fraction, and the two languages disagree on a
                // negative half: JavaScript's `Math.round(-2.5)` is -2 and
                // .NET's away-from-zero is -3. The fixture was generated by
                // the first, so the assertion has to use the first.
                Assert.Equal(
                    offer.FractionPct,
                    found.Fraction is null ? null : (int?)Math.Floor(found.Fraction.Value * 1000 + 0.5));
                Assert.Equal(offer.Take, advice.Take);
                Assert.Equal(offer.Detail, advice.Detail);
            }
        }
    }

    // --- earnings ----------------------------------------------------------

    [Fact]
    public void Both_sides_add_up_a_driver_statement_the_same_way()
    {
        Assert.Equal(F.Earnings.MinimumTripsForPerKm, Earnings.MinimumTripsForPerKm);

        foreach (var row in F.Earnings.Cases)
        {
            var earnings = Enumerable.Range(0, row.Trips).Select(i => new Earning(
                Guid.Empty,
                "Lagos–Kano",
                row.FromIso.AddDays(i + 1),
                830_000,
                Kobo.FromNaira(180_000),
                Kobo.FromNaira(80_000),
                Kobo.FromNaira(i % 3 == 0 ? 95_000 : 60_000),
                i % 2 == 0 ? row.FromIso.AddDays(i + 5) : null)
            {
                // The fixture identifies trips by name rather than by id, so
                // the ordering assertion below can name the one that is wrong.
            }).ToList();

            var found = Earnings.Of(earnings, row.FromIso, row.ToIso);

            Assert.Equal(row.CountedTrips, found.Trips);
            Assert.Equal(row.DistanceM, found.DistanceM);
            Assert.Equal(row.EarnedKobo, found.Earned.Value);
            Assert.Equal(row.OutOfPocketKobo, found.OutOfPocket.Value);
            Assert.Equal(row.OutstandingKobo, found.Outstanding.Value);
            Assert.Equal(row.SettledKobo, found.Settled.Value);
            Assert.Equal(row.PerKilometreKobo, Earnings.PerKilometre(found)?.Value);
            Assert.Equal(row.LongestWaitMs, Earnings.LongestWaitMs(earnings, F.Earnings.NowIso));

            // Oldest first: the trip from six weeks ago is the one to ask
            // about, and a newest-first list puts it where nobody scrolls.
            Assert.Equal(
                row.UnpaidTripIds.Count,
                Earnings.Unpaid(earnings).Count);
        }
    }

    private static string EscrowKindWire(MilestoneKind kind) => kind switch
    {
        MilestoneKind.Advance => "advance",
        MilestoneKind.InTransit => "in_transit",
        MilestoneKind.Delivered => "delivered",
        MilestoneKind.Retention => "retention",
        _ => throw new InvalidOperationException($"unmapped milestone {kind}"),
    };


    // --- the load board ----------------------------------------------------

    [Fact]
    public void Both_sides_rank_the_same_loads_in_the_same_order()
    {
        // The ordering is the product. A server that ranks the same six loads
        // differently to the phone is a server telling a carrier to drive
        // somewhere else — and the sentence under each row is what a haulier
        // argues with, so it is asserted as tightly as the position.
        Assert.Equal(F.Matching.MaxDeadheadM, Matching.MaxDeadheadM);
        Assert.Equal(F.Matching.PremiumTolerance, Matching.PremiumTolerance);
        Assert.Equal(F.Matching.MinimumTripsForReliability, Matching.MinimumTripsForReliability);

        var now = F.Matching.NowIso;

        var loads = F.Matching.Loads
            .Select(row => new Load(
                Guid.Empty,
                At(row.OriginLat, row.OriginLon, now),
                At(row.DestinationLat, row.DestinationLon, now),
                row.WeightTonnes,
                Truck(row.Requires),
                row.OfferedKobo is { } kobo ? new Kobo(kobo) : null,
                row.ReadyByIso,
                row.ExpiresAtIso))
            .ToList();

        // The fixture identifies loads by name; the C# record has a Guid. The
        // index is the join, which is why the order of `Loads` is fixed.
        var names = F.Matching.Loads.Select(l => l.Id).ToList();

        foreach (var row in F.Matching.Carriers)
        {
            var lagos = At(6.4531, 3.3958, now);
            var ibadan = At(7.3775, 3.947, now);

            var carrier = new Carrier(
                row.Truck == "canter" ? lagos : ibadan,
                now,
                Truck(row.Truck),
                row.HasBase ? lagos : null);

            var ranked = Matching.RankLoads(carrier, loads, now);

            Assert.Equal(
                row.Ranked.Select(r => r.LoadId),
                ranked.Select(r => names[loads.IndexOf(r.Load)]));

            foreach (var (expected, actual) in row.Ranked.Zip(ranked))
            {
                Assert.Equal(expected.ScoreThousandths, (int)Math.Floor(actual.Score * 1000 + 0.5));
                Assert.Equal(expected.Blocked, actual.Blocked is null ? null : BlockerWire(actual.Blocked.Value));
                Assert.Equal(expected.DeadheadM, actual.DeadheadM);
                Assert.Equal(expected.ProgressHomeM, actual.ProgressHomeM);
                Assert.Equal(expected.Because, actual.Because);
            }
        }
    }

    [Fact]
    public void And_rank_the_same_bids_the_same_way()
    {
        // The cheapest bid is not the best bid, and this is where the product
        // either earns trust or loses it.
        var now = F.Matching.NowIso;
        var pickup = At(F.Matching.BidPickupLat, F.Matching.BidPickupLon, now);

        var bids = F.Matching.Bids
            .Select(row => new Bid(
                Guid.Empty,
                Guid.Empty,
                new Kobo(row.AmountKobo),
                row.TripsCompleted,
                row.TripsPromised,
                row.TripsOnTime,
                At(row.AtLat, row.AtLon, now),
                now))
            .ToList();

        var names = F.Matching.Bids.Select(b => b.Id).ToList();
        var ranked = Matching.RankBids(bids, pickup);

        Assert.Equal(
            F.Matching.RankedBids.Select(r => r.BidId),
            ranked.Select(r => names[bids.IndexOf(r.Bid)]));

        foreach (var (expected, actual) in F.Matching.RankedBids.Zip(ranked))
        {
            Assert.Equal(expected.ScoreThousandths, (int)Math.Floor(actual.Score * 1000 + 0.5));
            Assert.Equal(
                expected.ReliabilityThousandths,
                actual.Reliability is null ? null : (int?)Math.Floor(actual.Reliability.Value * 1000 + 0.5));
            Assert.Equal(expected.KmToPickup, actual.KmToPickup);
            Assert.Equal(expected.Because, actual.Because);
        }
    }

    private static Position At(double lat, double lon, DateTimeOffset now) => new(lat, lon, 10, now);

    private static string BlockerWire(Blocker blocked) => blocked switch
    {
        Blocker.TooHeavy => "too_heavy",
        Blocker.WrongClass => "wrong_class",
        Blocker.Expired => "expired",
        Blocker.CannotReach => "cannot_reach",
        _ => throw new InvalidOperationException($"unmapped blocker {blocked}"),
    };


    // --- chaining ----------------------------------------------------------

    [Fact]
    public void Both_sides_agree_which_legs_can_follow_which()
    {
        // A reason rather than a boolean, and the reason is asserted: a
        // carrier looking at a load that nearly fits needs to know which of
        // the two things is wrong, because the distance is something they
        // might accept and the timing is not.
        Assert.Equal(F.Chaining.MaxRepositionM, Chaining.MaxRepositionM);
        Assert.Equal(F.Chaining.RepositionSpeedMs, Chaining.RepositionSpeedMs);
        Assert.Equal(F.Chaining.ConnectionSlackMs, Chaining.ConnectionSlackMs);
        Assert.Equal(F.Chaining.MaxChainLegs, Chaining.MaxChainLegs);

        var start = ToLeg(F.Chaining.Start);
        var pool = F.Chaining.Pool.Select(ToLeg).ToList();
        var names = F.Chaining.Pool.Select(row => row.LoadId).ToList();

        foreach (var (expected, candidate) in F.Chaining.Fits.Zip(pool))
        {
            switch (Chaining.CanFollow(start, candidate))
            {
                case Fit.Ok ok:
                    Assert.True(expected.Ok, expected.LoadId);
                    Assert.Equal(expected.RepositionM, ok.RepositionM);
                    break;

                case Fit.No no:
                    Assert.False(expected.Ok, expected.LoadId);
                    Assert.Equal(expected.Reason, ChainRefusalWire(no.Reason));
                    Assert.Equal(expected.Detail, no.Detail);
                    break;
            }
        }

        var built = Chaining.Build(start, pool);
        var all = new List<string> { F.Chaining.Start.LoadId };
        all.AddRange(names);
        var legs = new List<ChainLeg> { start };
        legs.AddRange(pool);

        Assert.Equal(
            F.Chaining.Built.LegIds,
            built.Legs.Select(l => all[legs.IndexOf(l)]));

        Assert.Equal(F.Chaining.Built.DeadheadM, built.DeadheadM);
        Assert.Equal(F.Chaining.Built.LadenM, built.Laden);
        Assert.Equal(F.Chaining.Built.PaysKobo, built.Pays.Value);
        Assert.Equal(
            F.Chaining.Built.LadenFractionThousandths,
            (int)Math.Floor(Chaining.LadenFraction(built) * 1000 + 0.5));
    }

    // --- consolidation -----------------------------------------------------

    [Fact]
    public void Both_sides_agree_which_two_loads_can_share_a_truck()
    {
        Assert.Equal(F.Consolidation.PickupSpreadM, Consolidation.PickupSpreadM);
        Assert.Equal(F.Consolidation.DropSpreadM, Consolidation.DropSpreadM);
        Assert.Equal(F.Consolidation.ShipperDiscountPct, Consolidation.ShipperDiscountPct);
        Assert.Equal(
            F.Consolidation.MinimumFillThousandths,
            (int)Math.Floor(Consolidation.MinimumFill * 1000 + 0.5));

        var loads = F.Consolidation.Loads.Select(ToPairLoad).ToList();
        var names = F.Consolidation.Loads.Select(row => row.Id).ToList();

        var verdicts = new List<VerdictRow>();
        for (var i = 0; i < loads.Count; i++)
        {
            for (var j = i + 1; j < loads.Count; j++)
            {
                var expected = F.Consolidation.Verdicts[verdicts.Count];

                switch (Consolidation.CanShare(loads[i], loads[j], TruckClass.Trailer30t))
                {
                    case PairVerdict.Ok ok:
                        Assert.True(expected.Ok, $"{expected.A}+{expected.B}");
                        Assert.Equal(expected.FillThousandths, (int)Math.Floor(ok.Fill * 1000 + 0.5));
                        break;

                    case PairVerdict.No no:
                        Assert.False(expected.Ok, $"{expected.A}+{expected.B}");
                        Assert.Equal(expected.Reason, PairRefusalWire(no.Reason));
                        Assert.Equal(expected.Detail, no.Detail);
                        break;
                }

                verdicts.Add(expected);
            }
        }

        var found = Consolidation.Pairs(loads, TruckClass.Trailer30t);

        Assert.Equal(
            F.Consolidation.Pairs.Select(p => (p.A, p.B)),
            found.Select(p => (names[loads.IndexOf(p.A)], names[loads.IndexOf(p.B)])));

        foreach (var (expected, actual) in F.Consolidation.Pairs.Zip(found))
        {
            Assert.Equal(expected.FillThousandths, (int)Math.Floor(actual.Fill * 1000 + 0.5));
            Assert.Equal(expected.PaysAKobo, actual.PaysA.Value);
            Assert.Equal(expected.PaysBKobo, actual.PaysB.Value);
            Assert.Equal(expected.CarrierGetsKobo, actual.CarrierGets.Value);
        }
    }

    private static ChainLeg ToLeg(ChainLegRow row) => new(
        Guid.NewGuid(),
        new Position(row.FromLat, row.FromLon, 10, row.ReadyFromIso),
        new Position(row.ToLat, row.ToLon, 10, row.ReadyFromIso),
        row.FromName,
        row.ToName,
        row.ReadyFromIso,
        row.DeliverByIso,
        new Kobo(row.PaysKobo),
        row.DistanceM);

    private static PairLoad ToPairLoad(PairLoadRow row) => new(
        Guid.NewGuid(),
        "Lagos",
        "Kano",
        "Cement",
        row.WeightKg,
        new Kobo(row.OfferedKobo),
        row.ReadyFromIso,
        Trucks.FromWire(row.TruckClass) ?? TruckClass.Trailer30t,
        "verified",
        row.OriginLat,
        row.OriginLon,
        row.DestinationLat,
        row.DestinationLon);

    private static string ChainRefusalWire(ChainRefusal reason) => reason switch
    {
        ChainRefusal.TooFar => "too_far",
        ChainRefusal.TooTight => "too_tight",
        ChainRefusal.WrongOrder => "wrong_order",
        _ => throw new InvalidOperationException($"unmapped refusal {reason}"),
    };

    private static string PairRefusalWire(PairRefusal reason) => reason switch
    {
        PairRefusal.TooHeavy => "too_heavy",
        PairRefusal.PickupsTooFar => "pickups_too_far",
        PairRefusal.DropsTooFar => "drops_too_far",
        PairRefusal.WrongTruck => "wrong_truck",
        PairRefusal.TooEmpty => "too_empty",
        _ => throw new InvalidOperationException($"unmapped refusal {reason}"),
    };


    // --- the dispute pack --------------------------------------------------

    [Fact]
    public void Both_sides_assemble_the_same_evidence_into_the_same_pack()
    {
        // These cases exist because a rendered pack was read, not because a
        // test failed: a continuously covered trip reported nine holes
        // totalling fifty-one hours. Two rules came out of that, and both are
        // pinned here — a run of fixes covers the time it spans, and only
        // positions constitute coverage.
        Assert.Equal(F.Dispute.LateAfterMs, Dispute.LateAfterMs);
        Assert.Equal(F.Dispute.GapMs, Dispute.GapMs);
        Assert.Equal(F.Dispute.MinimumCoveredMs, Dispute.MinimumCoveredMs);

        foreach (var row in F.Dispute.Cases)
        {
            var pack = Dispute.Assemble(
                Guid.Empty,
                row.Items.Select(ToEvidence).ToList(),
                F.Dispute.AssembledAtIso);

            Assert.Equal(row.ItemCount, pack.Items.Count);
            Assert.Equal(row.Weights, pack.Items.Select(i => WeightWire(i.Weight)));
            Assert.Equal(row.CoveredMs, pack.CoveredMs);
            Assert.Equal(row.Describe, Dispute.Describe(pack));
            Assert.Equal(row.Thin, Dispute.IsThin(pack));

            Assert.Equal(
                row.Gaps.Select(g => (g.FromIso, g.ToIso, g.Ms)),
                pack.Gaps.Select(g => (g.From, g.To, g.Ms)));

            foreach (var (wire, count) in row.Counts)
            {
                Assert.Equal(count, pack.Counts[WeightFromWire(wire)]);
            }
        }
    }

    private static Evidence ToEvidence(EvidenceRow row) => new(
        KindFromWire(row.Kind),
        row.AtIso,
        row.UntilIso,
        row.ReceivedAtIso,
        row.Summary,
        SourceFromWire(row.Source));

    private static EvidenceKind KindFromWire(string wire) => wire switch
    {
        "trip_event" => EvidenceKind.TripEvent,
        "position" => EvidenceKind.Position,
        "discarded_position" => EvidenceKind.DiscardedPosition,
        "message" => EvidenceKind.Message,
        "incident" => EvidenceKind.Incident,
        "photo" => EvidenceKind.Photo,
        "signature" => EvidenceKind.Signature,
        "waypoint_visit" => EvidenceKind.WaypointVisit,
        "share_link" => EvidenceKind.ShareLink,
        _ => throw new InvalidOperationException($"unknown evidence kind '{wire}'"),
    };

    private static EvidenceSource SourceFromWire(string wire) => wire switch
    {
        "shipper" => EvidenceSource.Shipper,
        "carrier" => EvidenceSource.Carrier,
        "driver" => EvidenceSource.Driver,
        "system" => EvidenceSource.System,
        _ => throw new InvalidOperationException($"unknown source '{wire}'"),
    };

    private static string WeightWire(Weight weight) => weight switch
    {
        Weight.Measured => "measured",
        Weight.Attested => "attested",
        Weight.LateAttested => "late_attested",
        _ => throw new InvalidOperationException($"unmapped weight {weight}"),
    };

    private static Weight WeightFromWire(string wire) => wire switch
    {
        "measured" => Weight.Measured,
        "attested" => Weight.Attested,
        "late_attested" => Weight.LateAttested,
        _ => throw new InvalidOperationException($"unknown weight '{wire}'"),
    };


    // --- deviation ---------------------------------------------------------

    [Fact]
    public void Both_sides_decide_the_same_way_whether_a_truck_is_off_course()
    {
        // This engine was written as cross-track distance first and thrown
        // away: the Lagos–Kano road is up to 90 km off the straight line for
        // hours, so that version fired on every trip that went the right way.
        // The cases pin the replacement — progress against the *closest* the
        // truck has been inside the window, not the first fix in it.
        Assert.Equal(F.Deviation.DeviationM, Deviation.DeviationM);
        Assert.Equal(F.Deviation.WindowMs, Deviation.DeviationWindowMs);

        var destination = new Position(
            F.Deviation.DestinationLat,
            F.Deviation.DestinationLon,
            10,
            F.Deviation.NowIso);

        foreach (var row in F.Deviation.Cases)
        {
            var track = row.Fixes
                .Select(fix => new Position(fix.Lat, fix.Lon, 10, fix.AtIso))
                .ToList();

            var verdict = Deviation.Of(track, destination, F.Deviation.NowIso);

            switch (verdict)
            {
                case DeviationVerdict.OnCourse:
                    Assert.Equal("on_course", row.Kind);
                    break;

                case DeviationVerdict.Unknown unknown:
                    Assert.Equal("unknown", row.Kind);
                    Assert.Equal(row.Detail, unknown.Detail);
                    break;

                case DeviationVerdict.Deviating deviating:
                    Assert.Equal("deviating", row.Kind);
                    Assert.Equal(row.Detail, deviating.Detail);
                    Assert.Equal(row.FurtherM, deviating.FurtherM);
                    Assert.Equal(row.SinceMs, deviating.SinceMs);
                    break;
            }
        }
    }


    // --- ratings -----------------------------------------------------------

    [Fact]
    public void Both_sides_count_a_record_the_same_way_and_neither_averages_it()
    {
        // Counts, never a percentage. "2 of 2" and "34 of 34" are the same
        // fraction and not the same evidence, so the pair of numbers is what
        // is pinned rather than a ratio either side could compute differently.
        Assert.Equal(F.Ratings.ReviewWindowDays, Ratings.ReviewWindowDays);
        Assert.Equal(F.Ratings.MinimumAnswers, Ratings.MinimumAnswers);

        Assert.Equal(
            F.Ratings.CarrierClaims,
            Ratings.CarrierClaims.Select(Ratings.CarrierWire));

        Assert.Equal(
            F.Ratings.ShipperClaims,
            Ratings.ShipperClaims.Select(Ratings.ShipperWire));

        Assert.Equal(
            F.Ratings.ShipperLabels,
            Ratings.ShipperClaims.Select(Ratings.LabelShipper));

        var reviews = F.Ratings.Reviews
            .Select(row => new Review(Guid.Empty, DateTimeOffset.UnixEpoch, row.Answers, string.Empty))
            .ToList();

        var tallies = Ratings.Tallies(reviews, F.Ratings.CarrierClaims);

        foreach (var (expected, actual) in F.Ratings.Tallies.Zip(tallies))
        {
            Assert.Equal(expected.Claim, actual.Claim);
            Assert.Equal(expected.Yes, actual.Yes);
            // A missing answer is missing, not a no — this is the assertion
            // that would break if either side started counting blanks.
            Assert.Equal(expected.Asked, actual.Asked);
            Assert.Equal(expected.WorthShowing, Ratings.WorthShowing(actual));
        }

        Assert.Equal(
            F.Ratings.Tallies.Select(t => t.Label),
            Ratings.CarrierClaims.Select(Ratings.LabelCarrier));
    }

    [Fact]
    public void And_close_the_review_window_at_the_same_moment()
    {
        var delivered = new DateTimeOffset(2026, 3, 1, 9, 0, 0, TimeSpan.Zero);

        foreach (var row in F.Ratings.Windows)
        {
            Assert.Equal(row.Reviewable, Ratings.Reviewable(delivered, delivered.AddDays(row.Days)));
        }
    }


    // --- utilisation ---------------------------------------------------------

    [Fact]
    public void Both_sides_measure_how_much_of_a_fleet_s_driving_is_paid_for()
    {
        // The number the product exists to move, so both sides must agree on
        // it to the kobo. The cases that earn their place are the degenerate
        // ones: no legs at all must be 0% rather than NaN, and a fleet that
        // never runs empty has no return leg to be worth anything — a
        // projection there would be the pitch inventing its own evidence.
        Assert.Equal(F.Utilisation.MinimumLegs, Domain.Fleet.Utilisation.MinimumLegs);

        foreach (var row in F.Utilisation.Cases)
        {
            var legs = row.Legs
                .Select(one => new Domain.Fleet.Leg(one.Metres, one.Loaded, new Kobo(one.EarnedKobo)))
                .ToList();

            var result = Domain.Fleet.Utilisation.Of(legs);

            Assert.Equal(row.LoadedMetres, result.LoadedMetres);
            Assert.Equal(row.EmptyMetres, result.EmptyMetres);
            Assert.Equal(row.TotalMetres, result.TotalMetres);
            Assert.Equal(row.Ratio, result.Ratio);
            Assert.Equal(row.EarnedKobo, result.Earned.Value);
            Assert.Equal(row.PerKmDrivenKobo, result.PerKmDriven.Value);
            Assert.Equal(row.LegCount, result.Legs);

            // The words too. "50% loaded" against "50.0% loaded" is the kind
            // of difference only a rendered screen shows.
            Assert.Equal(row.RatioLabel, Domain.Fleet.Utilisation.DescribeRatio(result));
            Assert.Equal(row.RateLabel, Domain.Fleet.Utilisation.DescribeRate(result));

            Assert.Equal(
                row.WorthOfOneReturnLegKobo,
                Domain.Fleet.Utilisation.WorthOfOneReturnLeg(result, row.AverageLegMetres)?.Value);
        }
    }


    // --- lanes -------------------------------------------------------------

    [Fact]
    public void Both_sides_price_a_lane_from_its_last_six_runs_and_say_the_same_words()
    {
        // The median is the whole reason this engine exists — a mean over two
        // years anchors a shipper to a number that stopped being true, and one
        // panic-priced trip during a fuel shortage would drag it for a year.
        // The sentence is asserted too: "Due tomorrow" against "Due in 1 days"
        // is the kind of difference only a rendered screen shows.
        Assert.Equal(F.Lanes.DueWarningMs, Lanes.DueWarningMs);
        Assert.Equal(F.Lanes.RecentRuns, Lanes.RecentRuns);
        Assert.Equal(F.Lanes.MinimumRunsForTypical, Lanes.MinimumRunsForTypical);
        Assert.Equal(F.Lanes.UnusualFraction, Lanes.UnusualFraction);

        var now = F.Lanes.NowIso;

        foreach (var row in F.Lanes.Cases)
        {
            var lane = LaneFor(row, now);

            Assert.Equal(row.DueInMs, Lanes.DueIn(lane, now));
            Assert.Equal(row.Due, Lanes.IsDue(lane, now));
            Assert.Equal(row.TypicalKobo, Lanes.TypicalPrice(lane)?.Value);
            Assert.Equal(row.DescribeDue, Lanes.DescribeDue(lane, now));
            Assert.Equal(row.DescribeCadence, Lanes.DescribeCadence(lane.Cadence));

            if (Lanes.TypicalPrice(lane) is not { } typical) continue;

            Assert.Equal(
                row.UnusualAtHalf,
                Lanes.IsUnusual(lane, new Kobo((long)Math.Floor(typical.Value * 0.5 + 0.5))));

            // Ten per cent over is inside the quarter either way, and stays
            // inside it: a shipper with a reason is not blocked or nagged.
            Assert.Equal(
                row.UnusualAtTenOver,
                Lanes.IsUnusual(lane, new Kobo((long)Math.Floor(typical.Value * 1.1 + 0.5))));
        }
    }

    private static Lane LaneFor(LaneRow row, DateTimeOffset now)
    {
        // The fixture stores the shape of the history rather than its values,
        // so the amounts are rebuilt here in the same order the emitter used.
        var history = row.Runs switch
        {
            0 => new List<Kobo>(),
            2 => [Kobo.FromNaira(2_200_000), Kobo.FromNaira(2_240_000)],
            8 =>
            [
                Kobo.FromNaira(9_000_000), Kobo.FromNaira(9_000_000),
                Kobo.FromNaira(2_000_000), Kobo.FromNaira(2_100_000),
                Kobo.FromNaira(2_200_000), Kobo.FromNaira(2_300_000),
                Kobo.FromNaira(2_400_000), Kobo.FromNaira(2_500_000),
            ],
            _ =>
            [
                Kobo.FromNaira(2_200_000), Kobo.FromNaira(2_240_000), Kobo.FromNaira(2_100_000),
            ],
        };

        // Derived from the answer the fixture already holds, so the two sides
        // are given the same last-run date without restating it.
        DateTimeOffset? lastRun = row.DueInMs is { } dueIn
            ? now.AddMilliseconds(dueIn - Lanes.CadenceMs[Lanes.FromWire(row.Cadence)!.Value])
            : row.Cadence == "ad_hoc" ? now.AddDays(-40) : null;

        return new Lane(
            Guid.Empty,
            Guid.Empty,
            "Apapa to Kano",
            "Lagos",
            "Kano",
            "Cement",
            28_000,
            TruckClass.Trailer30t,
            Lanes.FromWire(row.Cadence)!.Value,
            history,
            lastRun);
    }


    // --- alerts ------------------------------------------------------------

    [Fact]
    public void Both_sides_hold_the_same_notification_policy()
    {
        // The whole table, not a sample of it. Two servers with different
        // ideas of who hears about a duress alarm is the worst disagreement
        // this product could have.
        Assert.Equal(F.Alerts.QuietFromHour, Alerts.QuietFromHour);
        Assert.Equal(F.Alerts.QuietToHour, Alerts.QuietToHour);

        foreach (var row in F.Alerts.Policy)
        {
            var kind = Alerts.FromWire(row.Kind)
                       ?? throw new InvalidOperationException($"unknown alert '{row.Kind}'");
            var policy = Alerts.Policy[kind];

            Assert.Equal(row.To, policy.To.Select(Alerts.AudienceWire));
            Assert.Equal(row.Urgency, Alerts.UrgencyWire(policy.Urgency));
            Assert.Equal(row.RepeatAfterMs, policy.RepeatAfterMs);
            Assert.Equal(row.Describe, Alerts.Describe(kind));
        }

        // Every kind on both sides, not merely every kind the fixture happens
        // to list — a mirror that quietly dropped one would still pass above.
        Assert.Equal(F.Alerts.Policy.Count, Alerts.Policy.Count);
    }

    [Fact]
    public void And_agree_on_every_hour_of_the_night()
    {
        foreach (var row in F.Alerts.QuietHours)
        {
            Assert.Equal(row.Quiet, Alerts.IsQuietHour(row.Hour));
        }
    }

    [Fact]
    public void And_decide_the_same_way_for_every_kind_audience_and_hour()
    {
        foreach (var row in F.Alerts.Decisions)
        {
            var kind = Alerts.FromWire(row.Kind)!.Value;
            var to = row.To switch
            {
                "shipper" => Audience.Shipper,
                "carrier" => Audience.Carrier,
                _ => Audience.Driver,
            };

            DateTimeOffset? lastSent = row.SentMinutesAgo is { } minutes
                ? F.Alerts.NowIso.AddMinutes(-minutes)
                : null;

            var decision = Alerts.Decide(kind, to, row.LocalHour, lastSent, F.Alerts.NowIso);

            switch (decision)
            {
                case Decision.Send send:
                    Assert.True(row.Send, $"{row.Kind}/{row.To}/{row.When}");
                    Assert.Equal(row.Urgency, Alerts.UrgencyWire(send.Urgency));
                    break;

                case Decision.Hold hold:
                    Assert.False(row.Send, $"{row.Kind}/{row.To}/{row.When}");
                    Assert.Equal(row.Reason, hold.Reason);
                    break;
            }
        }
    }

    [Fact]
    public void And_write_the_same_overnight_summary()
    {
        // Four buzzes in a minute at 06:00 reads as a malfunction rather than
        // as a summary. One sentence, and both sides write it the same way.
        foreach (var row in F.Alerts.Digests)
        {
            var held = row.Held.Select(wire => Alerts.FromWire(wire)!.Value).ToList();
            Assert.Equal(row.Digest, Alerts.Digest(held));
        }
    }


    // --- search ------------------------------------------------------------

    [Fact]
    public void Both_sides_find_the_same_trip_from_the_same_typing()
    {
        // The flattening is the whole engine. Three people write the same
        // plate as `T-12345`, `T 12345` and `t12345`, and a search that finds
        // none of them is a search nobody uses twice.
        var trips = F.Search.Trips
            .Select(row => new TripSummary(
                Guid.Empty,
                row.Reference,
                TripMachine.FromWire(row.State)!.Value,
                row.Origin,
                row.Destination,
                row.Cargo,
                row.TruckPlate,
                row.DriverName,
                row.StartedAtIso,
                row.HasOpenIncident,
                row.IsLate))
            .ToList();

        var names = F.Search.Trips.Select(row => row.Id).ToList();

        foreach (var row in F.Search.TripFilters)
        {
            var filter = new TripFilter(
                row.Text,
                row.States.Select(wire => TripMachine.FromWire(wire)!.Value).ToList(),
                row.OnlyLate,
                row.OnlyWithIncidents,
                row.SinceIso,
                row.UntilIso);

            var matched = Search.FilterTrips(trips, filter);

            Assert.Equal(row.Matched, matched.Select(t => names[trips.IndexOf(t)]));
            Assert.Equal(row.Filtering, Search.IsFiltering(filter));

            // The sentence, character for character. It is what a shipper
            // reads above a list that is not all of their trips.
            Assert.Equal(row.Describe, Search.DescribeTripFilter(filter));
        }
    }

    [Fact]
    public void And_the_same_loads_from_the_same_filter()
    {
        var loads = F.Search.Loads
            .Select(row => new LoadSummary(
                Guid.Empty,
                row.Origin,
                row.Destination,
                row.Cargo,
                row.WeightKg,
                new Kobo(row.OfferedKobo),
                row.ReadyFromIso,
                Truck(row.TruckClass),
                row.ShipperTier))
            .ToList();

        var names = F.Search.Loads.Select(row => row.Id).ToList();

        foreach (var row in F.Search.LoadFilters)
        {
            var filter = new LoadFilter(
                row.Text,
                row.TruckClasses.Select(Truck).ToList(),
                row.MinimumOfferKobo is { } kobo ? new Kobo(kobo) : null,
                row.ReadyBeforeIso,
                row.Tiers);

            var matched = Search.FilterLoads(loads, filter);

            Assert.Equal(row.Matched, matched.Select(l => names[loads.IndexOf(l)]));

            // Names the narrowest condition rather than saying "no results":
            // the useful next action is to relax *that one*.
            Assert.Equal(row.WhyNothing, Search.WhyNothing(filter));
        }
    }

}
