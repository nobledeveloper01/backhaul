namespace Backhaul.Domain.Trips;

public enum TripActor
{
    Shipper,
    Carrier,
    Driver,
    System,
}

/// <summary>One entry in a trip's append-only history.</summary>
public sealed record TripEvent(TripState State, DateTimeOffset At, TripActor Actor, string? Note = null);

/// <summary>Why a transition was refused.</summary>
public enum TransitionRefusal
{
    /// <summary>The edge does not exist.</summary>
    NotAllowed,

    /// <summary>The trip is already finished.</summary>
    Terminal,

    /// <summary>The event is dated before the one preceding it.</summary>
    OutOfOrder,
}

public abstract record TransitionResult
{
    private TransitionResult()
    {
    }

    public sealed record Accepted(TripEvent Event) : TransitionResult;

    public sealed record Refused(TransitionRefusal Reason, string Detail) : TransitionResult;
}

public static class TripHistory
{
    public static TripState? Current(IReadOnlyList<TripEvent> history) =>
        history.Count == 0 ? null : history[^1].State;

    /// <summary>Applies a transition, or explains why not.</summary>
    /// <remarks>
    /// A result rather than an exception. The client that posted this has to
    /// show a driver standing at a loading bay something useful, and a stack
    /// trace is not something you can render.
    /// </remarks>
    public static TransitionResult Apply(
        IReadOnlyList<TripEvent> history,
        TripState to,
        DateTimeOffset at,
        TripActor actor,
        string? note = null)
    {
        if (history.Count == 0)
        {
            return to == TripState.Open
                ? new TransitionResult.Accepted(new TripEvent(to, at, actor, note))
                : new TransitionResult.Refused(
                    TransitionRefusal.NotAllowed,
                    $"A trip starts as 'open', not '{TripMachine.ToWire(to)}'.");
        }

        var current = history[^1];

        if (TripMachine.IsTerminal(current.State))
        {
            return new TransitionResult.Refused(
                TransitionRefusal.Terminal,
                $"This trip is already {TripMachine.ToWire(current.State)} and cannot change again.");
        }

        // The one hard refusal. An event dated before the one preceding it
        // corrupts every duration derived from the history — time in transit,
        // time stalled, time to delivery — and those end up on an invoice.
        //
        // Two events at the same instant are allowed: a phone with a coarse
        // clock is not a corrupted history, and refusing it strands real trips.
        if (at < current.At)
        {
            return new TransitionResult.Refused(
                TransitionRefusal.OutOfOrder,
                $"That is dated before the trip's last event ({Iso.Utc(current.At)}), and " +
                "accepting it would corrupt every duration on the trip.");
        }

        if (!TripMachine.CanTransition(current.State, to))
        {
            return new TransitionResult.Refused(
                TransitionRefusal.NotAllowed,
                $"A trip cannot go from '{TripMachine.ToWire(current.State)}' to " +
                $"'{TripMachine.ToWire(to)}'.");
        }

        return new TransitionResult.Accepted(new TripEvent(to, at, actor, note));
    }

    /// <summary>
    /// How long the trip has spent in a state, across every visit to it.
    /// </summary>
    /// <remarks>
    /// Summed across visits rather than measured from first entry: a truck on
    /// this corridor enters and leaves <see cref="TripState.SignalLost"/>
    /// repeatedly, and the figure that matters is total time unaccounted for,
    /// not time since it first went quiet.
    /// </remarks>
    public static TimeSpan TimeIn(
        IReadOnlyList<TripEvent> history,
        TripState state,
        DateTimeOffset now)
    {
        var total = TimeSpan.Zero;
        for (var i = 0; i < history.Count; i++)
        {
            if (history[i].State != state)
            {
                continue;
            }

            var end = i + 1 < history.Count ? history[i + 1].At : now;
            var span = end - history[i].At;
            if (span > TimeSpan.Zero)
            {
                total += span;
            }
        }

        return total;
    }
}
