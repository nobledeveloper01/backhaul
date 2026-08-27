namespace Backhaul.Domain.Access;

public enum AlertKind
{
    SignalLost,
    Stalled,
    Deviating,
    Late,
    Incident,
    Duress,
    Delivered,
    BidReceived,
    LinkExpiring,
}

public enum Audience
{
    Shipper,
    Carrier,
    Driver,
}

/// <summary>
/// How much this is allowed to interrupt.
/// </summary>
/// <remarks>
/// Three levels, and the top one is deliberately almost empty: if everything is
/// urgent, nothing is.
/// </remarks>
public enum Urgency
{
    /// <summary>Wakes a person. Overrides quiet hours.</summary>
    Urgent,

    /// <summary>A normal push. Held until quiet hours end.</summary>
    Push,

    /// <summary>Shows in the app. Never a notification.</summary>
    Quiet,
}

/// <summary>Who hears about one kind of thing, how loudly, and how often.</summary>
public sealed record AlertPolicy(
    AlertKind Kind,
    IReadOnlyList<Audience> To,
    Urgency Urgency,
    long RepeatAfterMs);

public abstract record Decision
{
    public sealed record Send(Urgency Urgency) : Decision;

    public sealed record Hold(string Reason) : Decision;
}

/// <summary>
/// Who hears about what, and how loudly.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/alerts.ts</c>. The policy is written out as a
/// table rather than derived, for the same reason the trip machine is: it is
/// the thing anyone arguing about notifications needs to read, and a rule
/// assembled from three functions is a rule nobody can check.
/// </remarks>
public static class Alerts
{
    private const long Hour = 60 * 60_000L;

    public static readonly IReadOnlyDictionary<AlertKind, AlertPolicy> Policy =
        new Dictionary<AlertKind, AlertPolicy>
        {
            // The tracker's own observations. Both go to the two people who
            // are not in the cab; telling a driver their signal dropped is
            // telling them what they can already see out of the window.
            [AlertKind.SignalLost] = new(
                AlertKind.SignalLost,
                [Audience.Shipper, Audience.Carrier],
                Urgency.Quiet,
                6 * Hour),

            [AlertKind.Stalled] = new(
                AlertKind.Stalled,
                [Audience.Shipper, Audience.Carrier],
                Urgency.Push,
                4 * Hour),

            [AlertKind.Deviating] = new(
                AlertKind.Deviating,
                [Audience.Shipper, Audience.Carrier],
                Urgency.Push,
                2 * Hour),

            // Once. A delivery does not become more late in a way that needs
            // saying twice, and the second one only teaches somebody to ignore
            // the first.
            [AlertKind.Late] = new(AlertKind.Late, [Audience.Shipper], Urgency.Push, 24 * Hour),

            [AlertKind.Incident] = new(
                AlertKind.Incident,
                [Audience.Shipper, Audience.Carrier],
                Urgency.Push,
                Hour),

            // The only urgent one, and the only one that reaches everybody.
            [AlertKind.Duress] = new(
                AlertKind.Duress,
                [Audience.Shipper, Audience.Carrier, Audience.Driver],
                Urgency.Urgent,
                5 * 60_000L),

            [AlertKind.Delivered] = new(
                AlertKind.Delivered,
                [Audience.Shipper, Audience.Carrier],
                Urgency.Push,
                24 * Hour),

            [AlertKind.BidReceived] = new(
                AlertKind.BidReceived,
                [Audience.Shipper],
                Urgency.Quiet,
                30 * 60_000L),

            [AlertKind.LinkExpiring] = new(
                AlertKind.LinkExpiring,
                [Audience.Shipper],
                Urgency.Quiet,
                24 * Hour),
        };

    /// <summary>Quiet hours, in whole hours of the reader's own day.</summary>
    public static readonly int QuietFromHour = 22;

    public static readonly int QuietToHour = 6;

    /// <summary>
    /// Whether a given hour is inside quiet hours.
    /// </summary>
    /// <remarks>
    /// Takes the hour rather than a date, so the caller has to have decided
    /// whose midnight it is. A shipper in Lagos and a driver in Kano share a
    /// timezone today; assuming that inside an engine is how it breaks the
    /// first time somebody ships from Accra.
    /// </remarks>
    public static bool IsQuietHour(int hour) => hour >= QuietFromHour || hour < QuietToHour;

    /// <summary>
    /// Whether to send this, now, to this person.
    /// </summary>
    /// <remarks>
    /// A <c>quiet</c> alert never becomes a notification, so quiet hours do not
    /// apply to it — it is already not going to wake anybody. A <c>push</c>
    /// inside quiet hours is held rather than dropped: the condition is still
    /// true in the morning, and dropping it silently is how a shipper finds out
    /// about a stall at noon.
    /// </remarks>
    public static Decision Decide(
        AlertKind kind,
        Audience to,
        int localHour,
        DateTimeOffset? lastSentAt,
        DateTimeOffset now)
    {
        var policy = Policy[kind];

        if (!policy.To.Contains(to)) return new Decision.Hold("wrong_audience");

        if (lastSentAt is { } last && (now - last).TotalMilliseconds < policy.RepeatAfterMs)
        {
            return new Decision.Hold("too_soon");
        }

        if (policy.Urgency == Urgency.Push && IsQuietHour(localHour))
        {
            return new Decision.Hold("quiet_hours");
        }

        return new Decision.Send(policy.Urgency);
    }

    /// <summary>
    /// Everything held back overnight, as one message.
    /// </summary>
    /// <remarks>
    /// The alternative — releasing four held notifications at 06:00 — is four
    /// buzzes in a minute, which reads as a malfunction rather than as a
    /// summary.
    /// </remarks>
    public static string? Digest(IReadOnlyList<AlertKind> held)
    {
        if (held.Count == 0) return null;

        var counted = new Dictionary<AlertKind, int>();
        var order = new List<AlertKind>();

        foreach (var kind in held)
        {
            if (!counted.ContainsKey(kind))
            {
                counted[kind] = 0;
                order.Add(kind);
            }

            counted[kind]++;
        }

        var parts = order
            .Select(kind => counted[kind] == 1 ? Describe(kind) : $"{Describe(kind)} ({counted[kind]})")
            .ToList();

        return parts.Count == 1
            ? $"Overnight: {parts[0]}."
            : $"Overnight: {string.Join(", ", parts.Take(parts.Count - 1))} and {parts[^1]}.";
    }

    /// <summary>Plain words. Never a state name with an underscore in it.</summary>
    public static string Describe(AlertKind kind) => kind switch
    {
        AlertKind.SignalLost => "no signal",
        AlertKind.Stalled => "a truck not moving",
        AlertKind.Deviating => "a truck off course",
        AlertKind.Late => "a delivery running late",
        AlertKind.Incident => "a problem reported",
        AlertKind.Duress => "a driver in trouble",
        AlertKind.Delivered => "a delivery signed for",
        AlertKind.BidReceived => "a new bid",
        AlertKind.LinkExpiring => "a tracking link about to expire",
        _ => throw new InvalidOperationException($"unmapped alert {kind}"),
    };

    public static string ToWire(AlertKind kind) => kind switch
    {
        AlertKind.SignalLost => "signal_lost",
        AlertKind.Stalled => "stalled",
        AlertKind.Deviating => "deviating",
        AlertKind.Late => "late",
        AlertKind.Incident => "incident",
        AlertKind.Duress => "duress",
        AlertKind.Delivered => "delivered",
        AlertKind.BidReceived => "bid_received",
        AlertKind.LinkExpiring => "link_expiring",
        _ => throw new InvalidOperationException($"unmapped alert {kind}"),
    };

    public static AlertKind? FromWire(string wire) => wire switch
    {
        "signal_lost" => AlertKind.SignalLost,
        "stalled" => AlertKind.Stalled,
        "deviating" => AlertKind.Deviating,
        "late" => AlertKind.Late,
        "incident" => AlertKind.Incident,
        "duress" => AlertKind.Duress,
        "delivered" => AlertKind.Delivered,
        "bid_received" => AlertKind.BidReceived,
        "link_expiring" => AlertKind.LinkExpiring,
        _ => null,
    };

    public static string UrgencyWire(Urgency urgency) => urgency switch
    {
        Urgency.Urgent => "urgent",
        Urgency.Push => "push",
        Urgency.Quiet => "quiet",
        _ => throw new InvalidOperationException($"unmapped urgency {urgency}"),
    };

    public static string AudienceWire(Audience audience) => audience switch
    {
        Audience.Shipper => "shipper",
        Audience.Carrier => "carrier",
        Audience.Driver => "driver",
        _ => throw new InvalidOperationException($"unmapped audience {audience}"),
    };
}
