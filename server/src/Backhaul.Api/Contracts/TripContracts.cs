using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class OpenTripRequest
{
    /// <summary>Who carries it, by phone number.</summary>
    /// <remarks>
    /// <para>
    /// <b>Supply the two parties you are not.</b> Your own slot is filled from
    /// your token, so a shipper sends <c>driverPhone</c> and
    /// <c>carrierPhone</c> and leaves <c>shipperPhone</c> out; sending your own
    /// is refused rather than ignored, because a number that disagrees with
    /// your token is a mistake somebody needs to see.
    /// </para>
    /// <para>
    /// Numbers rather than identifiers, because that is what somebody who
    /// agreed a load on WhatsApp actually has. A number with no account behind
    /// it gets one, holding the number and nothing else until its owner signs
    /// in. The response is the same either way — this endpoint will not tell
    /// you whether a number is already known, and no endpoint will. See
    /// ADR-0016.
    /// </para>
    /// <para>
    /// The three parties are fixed when the trip opens and are what every
    /// later read is filtered against. "The carrier who employs this driver"
    /// changes over time; who could see a trip in March is a fact about March.
    /// See ADR-0008.
    /// </para>
    /// </remarks>
    /// <example>08031234567</example>
    [MaxLength(20)]
    public string? DriverPhone { get; set; }

    /// <summary>Who owns the truck, by phone number.</summary>
    [MaxLength(20)]
    public string? CarrierPhone { get; set; }

    /// <summary>Who owns the goods, by phone number.</summary>
    [MaxLength(20)]
    public string? ShipperPhone { get; set; }

    /// <summary>Where it loads. "Lagos", not a coordinate.</summary>
    /// <example>Lagos</example>
    [Required]
    [MaxLength(80)]
    public string Origin { get; set; } = string.Empty;

    /// <summary>Where it unloads.</summary>
    /// <example>Kano</example>
    [Required]
    [MaxLength(80)]
    public string Destination { get; set; } = string.Empty;

    [Required]
    public DateTimeOffset At { get; set; }

    /// <summary>shipper, carrier, driver or system.</summary>
    /// <example>shipper</example>
    [Required]
    [RegularExpression("^(shipper|carrier|driver|system)$")]
    public string Actor { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Note { get; set; }
}

public sealed class TripEventRequest
{
    /// <summary>
    /// The state to move to. The server holds the same machine the device does
    /// and refuses a transition it does not permit — a client can be modified,
    /// and a trip history is evidence.
    /// </summary>
    /// <example>in_transit</example>
    [Required]
    [RegularExpression(
        "^(open|assigned|loading|in_transit|signal_lost|stalled|arrived|delivered|disputed|cancelled)$")]
    public string State { get; set; } = string.Empty;

    [Required]
    public DateTimeOffset At { get; set; }

    /// <example>driver</example>
    [Required]
    [RegularExpression("^(shipper|carrier|driver|system)$")]
    public string Actor { get; set; } = string.Empty;

    /// <summary>Shown verbatim in a dispute pack.</summary>
    [MaxLength(500)]
    public string? Note { get; set; }
}

public sealed class TripEventResponse
{
    public string State { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }

    public string Actor { get; set; } = string.Empty;

    public string? Note { get; set; }
}

public sealed class TripResponse
{
    public Guid Id { get; set; }

    public string Origin { get; set; } = string.Empty;

    public string Destination { get; set; } = string.Empty;

    public string State { get; set; } = string.Empty;

    /// <summary>
    /// The three parties, by id.
    /// </summary>
    /// <remarks>
    /// Ids, and only to the three of them — this response is behind the same
    /// query filter every other trip read is, so a stranger never sees it.
    /// They are here because a party needs to reach the others' records:
    /// a shipper reviewing a carrier has to name which carrier, and an id is
    /// the only handle that is stable and carries nothing about anybody.
    ///
    /// A share link's view is a different response and carries none of this.
    /// See ADR-0010.
    /// </remarks>
    public Guid DriverId { get; set; }

    public Guid CarrierId { get; set; }

    public Guid ShipperId { get; set; }

    /// <summary>Whether the device should be recording positions right now.</summary>
    public bool Tracking { get; set; }

    /// <summary>
    /// Where the trip may go next. Sent so a client renders the actions the
    /// machine actually permits rather than its own idea of them.
    /// </summary>
    public List<string> AllowedNext { get; set; } = [];

    public List<TripEventResponse> History { get; set; } = [];
}

/// <summary>
/// One trip on a list.
/// </summary>
/// <remarks>
/// No history. A list renders a corridor, a state and an age; loading a
/// three-day trip's events to draw one line of it is what makes a list of
/// twenty trips slow enough that nobody opens it twice.
/// </remarks>
public sealed class TripSummaryResponse
{
    public Guid Id { get; set; }

    public string Origin { get; set; } = string.Empty;

    public string Destination { get; set; } = string.Empty;

    public string State { get; set; } = string.Empty;

    public bool Tracking { get; set; }

    public DateTimeOffset StartedAt { get; set; }

    /// <summary>When a position last arrived, or null if none ever has.</summary>
    /// <remarks>
    /// Null is not the same as "a long time ago", and a list that renders it as
    /// one has told a shipper their truck went quiet when it never started.
    /// </remarks>
    public DateTimeOffset? LastSeenAt { get; set; }

    public bool HasOpenIncident { get; set; }
}

/// <summary>A refusal, in the machine's own words.</summary>
public sealed class RefusalResponse
{
    /// <summary>Written to be shown to a driver at a loading bay, not logged.</summary>
    public string Message { get; set; } = string.Empty;

    /// <summary>not_allowed, terminal or out_of_order.</summary>
    public string Refusal { get; set; } = string.Empty;
}
