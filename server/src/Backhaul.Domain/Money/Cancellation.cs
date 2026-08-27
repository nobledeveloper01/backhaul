using Backhaul.Domain.Trips;

namespace Backhaul.Domain.Money;

public enum CancelledBy
{
    Shipper,
    Carrier,
}

/// <summary>What cancelling costs, or why it cannot be done.</summary>
public abstract record CancelOutcome
{
    public sealed record Refused(string Reason, string Detail) : CancelOutcome;

    public sealed record Allowed(int FeePct, Kobo Fee, bool WithinGrace, string Detail) : CancelOutcome;
}

/// <summary>
/// Who pays when a trip does not happen.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/cancellation.ts</c>, wording included — the
/// sentence is the thing both parties argue about, and two servers giving the
/// same refusal in different words is a support call nobody can close.
/// </remarks>
public static class Cancellation
{
    /// <summary>
    /// Free-cancellation window after a bid is accepted.
    /// </summary>
    /// <remarks>
    /// Two hours. Long enough for either side to discover the mistake they
    /// made accepting, short enough that it is not a way to hold a truck for
    /// the morning while shopping around.
    /// </remarks>
    public static readonly long GraceMs = 2 * 60 * 60_000L;

    public static readonly IReadOnlyDictionary<TripState, int> ShipperFeePct =
        new Dictionary<TripState, int>
        {
            [TripState.Assigned] = 0,
            [TripState.Loading] = 50,
            [TripState.InTransit] = 100,
        };

    public static readonly IReadOnlyDictionary<TripState, int> CarrierFeePct =
        new Dictionary<TripState, int>
        {
            [TripState.Assigned] = 20,
            [TripState.Loading] = 50,
            [TripState.InTransit] = 100,
        };

    public static CancelOutcome Cancel(
        CancelledBy by,
        TripState state,
        Kobo agreed,
        DateTimeOffset acceptedAt,
        DateTimeOffset now)
    {
        if (state is TripState.Delivered or TripState.Cancelled)
        {
            return new CancelOutcome.Refused(
                "terminal",
                $"This trip is already {TripMachine.ToWire(state)} and cannot be cancelled.");
        }

        var withinGrace = (now - acceptedAt).TotalMilliseconds <= GraceMs;

        // The grace period covers the stage where nothing has happened yet,
        // and only that stage. A truck already at the depot is a truck whose
        // day is spent, however recently the bid was accepted.
        if (withinGrace && state == TripState.Assigned)
        {
            return new CancelOutcome.Allowed(
                0,
                Kobo.Zero,
                true,
                "Nothing to pay — this was cancelled within two hours of being accepted.");
        }

        var table = by == CancelledBy.Shipper ? ShipperFeePct : CarrierFeePct;
        var feePct = table.TryGetValue(state, out var pct) ? pct : 0;

        return new CancelOutcome.Allowed(feePct, agreed.Percent(feePct), withinGrace, Explain(by, state, feePct));
    }

    private static string Explain(CancelledBy by, TripState state, int feePct)
    {
        if (feePct == 0) return "Nothing to pay at this stage.";

        var stage = state switch
        {
            TripState.Loading => "the truck was at the depot",
            TripState.InTransit => "the load was already on the road",
            _ => "the truck had been assigned",
        };

        return by == CancelledBy.Shipper
            ? $"{feePct}% of the fare, because {stage}."
            : $"{feePct}% of the fare, paid to the shipper, because {stage}.";
    }

    /// <summary>
    /// Whether a no-show counts against the carrier's record.
    /// </summary>
    /// <remarks>
    /// Only for the carrier: a shipper cancelling their own load is not
    /// somebody else's risk. It feeds the trust ladder as an incident, which
    /// costs one tier — a carrier who lets somebody down should be harder to
    /// book, not unbookable.
    /// </remarks>
    public static bool CountsAgainstRecord(CancelledBy by, TripState state) =>
        by == CancelledBy.Carrier && state != TripState.Open;
}
