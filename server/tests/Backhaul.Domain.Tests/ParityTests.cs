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
}
