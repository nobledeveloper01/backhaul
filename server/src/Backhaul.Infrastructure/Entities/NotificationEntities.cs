using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>A phone that has asked to be told things.</summary>
/// <remarks>
/// <para>
/// One row per install, keyed on the push token — a person with a work phone
/// and their own phone gets both, and a reinstall replaces its own row rather
/// than accumulating dead tokens next to it.
/// </para>
/// <para>
/// <b>The offset is here because quiet hours belong to the reader.</b> The
/// alerts *route* takes the local hour as a parameter, which works because
/// there is a client on the other end to ask. A dispatcher deciding at three in
/// the morning has nobody to ask, and assuming West Africa Time inside the
/// server is how this breaks the first time somebody ships from Accra. So the
/// app tells us its own offset when it registers, and we do the arithmetic.
/// </para>
/// </remarks>
public sealed class DeviceEntity
{
    /// <summary>The push token, which is also the identity of the install.</summary>
    [MaxLength(256)]
    public string Token { get; set; } = string.Empty;

    public Guid UserId { get; set; }

    /// <summary>ios or android. What decides which gateway a sender uses.</summary>
    [MaxLength(16)]
    public string Platform { get; set; } = string.Empty;

    /// <summary>Minutes east of UTC, as the phone reports it. Lagos is +60.</summary>
    public int UtcOffsetMinutes { get; set; }

    public DateTimeOffset RegisteredAt { get; set; }
}

/// <summary>That somebody was told a particular thing about a particular trip.</summary>
/// <remarks>
/// <para>
/// The only thing in the alerting path that is stored, and it stores a *send*
/// rather than a condition. Alerts themselves are derived on every read — a
/// stored alert is a stored copy of a condition, and a copy that drifts tells a
/// shipper a truck is stalled while they watch it move.
/// </para>
/// <para>
/// What this exists for is <c>repeatAfterMs</c>. Without a record of what went
/// out, a shipper on a northern corridor is told about the same coverage gap
/// every time the dispatcher runs, and then the alert that matters is one of
/// forty they ignored that day.
/// </para>
/// <para>
/// A held alert is deliberately <b>not</b> written here. Quiet hours hold
/// rather than drop, and the way that works is that nothing was recorded — so
/// the next run after six in the morning finds the condition still true and
/// still unsent.
/// </para>
/// </remarks>
public sealed class AlertSentEntity
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public Guid TripId { get; set; }

    /// <summary>signal_lost, stalled, incident, duress, delivered…</summary>
    [MaxLength(32)]
    public string Kind { get; set; } = string.Empty;

    public DateTimeOffset SentAt { get; set; }
}
