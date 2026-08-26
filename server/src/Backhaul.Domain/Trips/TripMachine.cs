namespace Backhaul.Domain.Trips;

/// <summary>Where a trip is. Mirrors <c>packages/domain/src/trip.ts</c>.</summary>
public enum TripState
{
    Open,
    Assigned,
    Loading,
    InTransit,
    SignalLost,
    Stalled,
    Arrived,
    Delivered,
    Disputed,
    Cancelled,
}

/// <summary>The trip state machine.</summary>
/// <remarks>
/// <para>
/// The edge set is written out rather than derived, exactly as in TypeScript,
/// so the parity fixture can assert the complete set and adding a transition
/// on one side fails a test on the other.
/// </para>
/// <para>
/// The server does not decide transitions — the device does, offline, and
/// posts them. What the server does is refuse to record one the machine does
/// not permit, because a client can be modified and a trip history is
/// evidence. See ADR-0003.
/// </para>
/// </remarks>
public static class TripMachine
{
    private static readonly Dictionary<TripState, TripState[]> AllowedMap = new()
    {
        [TripState.Open] = [TripState.Assigned, TripState.Cancelled],
        [TripState.Assigned] = [TripState.Loading, TripState.Cancelled, TripState.Disputed],
        [TripState.Loading] = [TripState.InTransit, TripState.Cancelled, TripState.Disputed],

        // The three transit states move freely between one another: the
        // conditions that distinguish them come and go on a Lagos–Kano
        // corridor several times a trip.
        [TripState.InTransit] = [TripState.SignalLost, TripState.Stalled, TripState.Arrived, TripState.Disputed],
        [TripState.SignalLost] = [TripState.InTransit, TripState.Stalled, TripState.Arrived, TripState.Disputed],
        [TripState.Stalled] = [TripState.InTransit, TripState.SignalLost, TripState.Arrived, TripState.Disputed],

        [TripState.Arrived] = [TripState.Delivered, TripState.Disputed],

        // A dispute resolves either way and is the only path out of one.
        // Resolution is a human decision recorded through this edge, never
        // inferred from tracking data — the reason a trip is disputed is that
        // the tracking data is being argued about.
        [TripState.Disputed] = [TripState.Delivered, TripState.Cancelled],

        [TripState.Delivered] = [],
        [TripState.Cancelled] = [],
    };

    private static readonly Dictionary<TripState, string> WireMap = new()
    {
        [TripState.Open] = "open",
        [TripState.Assigned] = "assigned",
        [TripState.Loading] = "loading",
        [TripState.InTransit] = "in_transit",
        [TripState.SignalLost] = "signal_lost",
        [TripState.Stalled] = "stalled",
        [TripState.Arrived] = "arrived",
        [TripState.Delivered] = "delivered",
        [TripState.Disputed] = "disputed",
        [TripState.Cancelled] = "cancelled",
    };

    private static readonly Dictionary<string, TripState> FromWireMap =
        WireMap.ToDictionary(pair => pair.Value, pair => pair.Key);

    public static IReadOnlyList<TripState> AllowedFrom(TripState state) => AllowedMap[state];

    public static bool CanTransition(TripState from, TripState to) =>
        AllowedMap[from].Contains(to);

    /// <summary>
    /// A state with no outgoing edges. Terminal by default is the safe
    /// direction to fail: a stuck trip gets noticed by a human within hours,
    /// while a wrongly-mobile one could mark undelivered goods as delivered.
    /// </summary>
    public static bool IsTerminal(TripState state) => AllowedMap[state].Length == 0;

    /// <summary>States in which the device should be capturing positions.</summary>
    /// <remarks>
    /// <see cref="TripState.SignalLost"/> is included on purpose: the phone
    /// keeps sampling and queueing even when nothing can be uploaded. Stopping
    /// capture when the network drops loses precisely the stretch of road
    /// nobody can account for afterwards. The server uses this to reject
    /// samples for a trip that should not be producing any.
    /// </remarks>
    public static bool ShouldTrack(TripState state) =>
        state is TripState.Loading or TripState.InTransit
            or TripState.SignalLost or TripState.Stalled;

    public static string ToWire(TripState state) => WireMap[state];

    public static TripState? FromWire(string wire) =>
        FromWireMap.TryGetValue(wire, out var state) ? state : null;

    public static IReadOnlyList<TripState> All { get; } = [.. WireMap.Keys];
}
